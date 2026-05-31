// ApartmentParameterPropagator — D-α-3 P2 (BIM 2/3 §6 — propagation engine, integration slice).
//
// Bridges the L0 parameter stores (ApartmentParametersStore + RoomParametersStore)
// to the pure `recomputeImpact` resolver shipped in P1
// (`packages/ai-host/src/workflows/apartmentLayout/solver/recomputeImpact.ts`).
//
// Wiring layer (composeRuntime / editor) constructs ONE propagator per session:
//
//     const prop = new ApartmentParameterPropagator(
//         apartmentParametersStore,
//         roomParametersStore,
//         recomputeImpact,        // injected — no ai-host runtime coupling here
//     );
//     const unsub = prop.subscribe(e => {
//         // surface on the event bus, kick the rebalance job, etc.
//     });
//     // ... on teardown ...
//     unsub(); prop.dispose();
//
// Design notes:
//   • Resolver INJECTED via constructor so this module stays free of an
//     ai-host runtime dep at the type level too (only structural types).
//   • Subscribes to BOTH stores. On every store-notify, diffs the current
//     snapshot against the internally maintained `lastSeen` map and emits
//     one PropagationEvent per detected change.
//   • Listener errors swallowed (loud-fail-soft) consistent with the Store
//     pattern in this package.
//   • Resolver throws → caught + warned; propagator keeps running.
//
// Pure: no I/O, no THREE, no DOM, no random.

import type { ApartmentParametersStore } from './ApartmentParametersStore.js';
import type { RoomParametersStore } from './RoomParametersStore.js';

// ── Public surface ──────────────────────────────────────────────────────────

export interface PropagationEvent {
    readonly apartmentId: string;
    readonly change: {
        readonly path: string;
        readonly priorValue: unknown;
        readonly newValue: unknown;
    };
    readonly impact: {
        readonly affectedRoomIds: readonly string[];
        readonly affectedFields: readonly string[];
    };
}

/** Structural mirror of `recomputeImpact` (kept loose so the wiring layer can
 *  inject the real one from `@pryzm/ai-host` without a runtime dep here). */
export type ImpactResolver = (
    change: {
        readonly apartmentId: string;
        readonly path: string;
        readonly priorValue: unknown;
        readonly newValue: unknown;
    },
    state: {
        readonly apartment: unknown;
        readonly rooms: readonly unknown[];
    },
) => {
    readonly affectedRoomIds: readonly string[];
    readonly affectedFields: readonly string[];
};

type Snapshot = Record<string, unknown>;

/** Value-equality for snapshot fields. Primitives via Object.is; for plain
 *  objects (e.g. ParameterEnvelope `{ value, min, max }`) a one-level
 *  structural compare suffices — the schema does not nest more deeply. */
function fieldEquals(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if (!Object.is((a as Snapshot)[k], (b as Snapshot)[k])) return false;
    }
    return true;
}

export class ApartmentParameterPropagator {
    private readonly _listeners = new Set<(e: PropagationEvent) => void>();
    private readonly _disposers: Array<() => void> = [];
    private readonly _lastApt = new Map<string, Snapshot>();
    private readonly _lastRoom = new Map<string, Snapshot>();
    private _disposed = false;

    constructor(
        private readonly apartmentStore: ApartmentParametersStore,
        private readonly roomStore: RoomParametersStore,
        private readonly resolver: ImpactResolver,
    ) {
        // Seed baseline so the first store-notify diffs against the current state.
        this._reseed();
        this._disposers.push(this.apartmentStore.subscribe(() => this._onApartmentChange()));
        this._disposers.push(this.roomStore.subscribe(() => this._onRoomChange()));
    }

    subscribe(listener: (e: PropagationEvent) => void): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        for (const d of this._disposers) {
            try { d(); } catch (e) { console.warn('[ApartmentParameterPropagator] disposer threw:', e); }
        }
        this._disposers.length = 0;
        this._listeners.clear();
        this._lastApt.clear();
        this._lastRoom.clear();
    }

    // ── Internals ─────────────────────────────────────────────────────────

    private _reseed(): void {
        for (const a of this.apartmentStore.list()) {
            this._lastApt.set(a.id, { ...(a as Snapshot) });
        }
        for (const r of this.roomStore.list()) {
            this._lastRoom.set(r.id, { ...(r as Snapshot) });
        }
    }

    private _onApartmentChange(): void {
        if (this._disposed) return;
        const seen = new Set<string>();
        for (const apt of this.apartmentStore.list()) {
            seen.add(apt.id);
            const prior = this._lastApt.get(apt.id);
            const next = apt as unknown as Snapshot;
            if (!prior) { this._lastApt.set(apt.id, { ...next }); continue; }
            for (const k of Object.keys(next)) {
                if (k === 'id') continue;
                if (!fieldEquals(prior[k], next[k])) {
                    this._emit(apt.id, `apartment.${k}`, prior[k], next[k]);
                }
            }
            this._lastApt.set(apt.id, { ...next });
        }
        // Drop snapshots for apartments that disappeared.
        for (const id of [...this._lastApt.keys()]) if (!seen.has(id)) this._lastApt.delete(id);
    }

    private _onRoomChange(): void {
        if (this._disposed) return;
        const seen = new Set<string>();
        for (const room of this.roomStore.list()) {
            seen.add(room.id);
            const prior = this._lastRoom.get(room.id);
            const next = room as unknown as Snapshot;
            if (!prior) { this._lastRoom.set(room.id, { ...next }); continue; }
            for (const k of Object.keys(next)) {
                if (k === 'id' || k === 'apartmentId') continue;
                if (!fieldEquals(prior[k], next[k])) {
                    const aptId = (next.apartmentId as string) ?? '';
                    this._emit(aptId, `rooms.${room.id}.${k}`, prior[k], next[k]);
                }
            }
            this._lastRoom.set(room.id, { ...next });
        }
        for (const id of [...this._lastRoom.keys()]) if (!seen.has(id)) this._lastRoom.delete(id);
    }

    private _emit(apartmentId: string, path: string, priorValue: unknown, newValue: unknown): void {
        let impact: { affectedRoomIds: readonly string[]; affectedFields: readonly string[] };
        try {
            const apartment = this.apartmentStore.getApartment(apartmentId);
            const rooms = this.roomStore.list();
            if (!apartment) return;        // no apartment → no impact context, skip
            impact = this.resolver(
                { apartmentId, path, priorValue, newValue },
                { apartment, rooms },
            );
        } catch (e) {
            console.warn('[ApartmentParameterPropagator] resolver threw:', e);
            return;
        }
        if (impact.affectedRoomIds.length === 0 && impact.affectedFields.length === 0) return;

        const event: PropagationEvent = Object.freeze({
            apartmentId,
            change: Object.freeze({ path, priorValue, newValue }),
            impact: Object.freeze({
                affectedRoomIds: Object.freeze([...impact.affectedRoomIds]),
                affectedFields: Object.freeze([...impact.affectedFields]),
            }),
        });
        for (const l of this._listeners) {
            try { l(event); } catch (err) { console.warn('[ApartmentParameterPropagator] listener threw:', err); }
        }
    }
}
