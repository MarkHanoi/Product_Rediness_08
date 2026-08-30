// ReseatWallAnchoredElementsCommand — the ONE write path a wall-anchored element
// moves through when its host wall / curtain wall transforms (ADR-0374, §GRAPH115).
//
// Dispatched by WallAnchorDependencyTracker with `{ source: 'STRUCTURAL_CASCADE' }`
// synchronously inside the host command's execution frame, so it lands in the
// gesture's `structuralChildren` and one wall move stays ONE Ctrl+Z
// (C16 §8.6 / §L-874-ONE-UNDO — the FinishHostDependencyTracker pattern exactly).
//
// C16 B-8 discipline: per-item pre-mutation snapshot, VERIFY BY RE-READING the
// authority after every write, `success = landed === attempted`, both numbers on
// failure. It deliberately does NOT rely on CommandManager.createSnapshot():
// that table has a measured `plumbing` hole (C84 EI-7d) — the command owns its
// own snapshots and restores them verbatim in undo() (C84 EI-7).
//
// C84 EI-7a honesty: `affectedStores` is computed per instance from the exact
// family set the payload writes — never a superset.

import { trace, type Tracer } from '@opentelemetry/api';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { DOMEventBus } from '@pryzm/event-bus';
import type { WallAnchor } from './WallAnchor';

const _bus = new DOMEventBus();

// P8 / C10 §2 — the write path carries ≥ 1 OTel span. Same tracer idiom as
// `DeleteElementsBatchCommand.ts` / `moveReweldPreflight.ts` in this package
// (C84 EI-9: one tracer authority per package, not a second wrapper).
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export type WallAnchorFamily = 'plumbing' | 'furniture';

export interface WallAnchorReseatItem {
    readonly family: WallAnchorFamily;
    readonly id: string;
    readonly op: 'reseat' | 'detach';
    /** op 'reseat': the new world pose (y is preserved from the record). */
    readonly x?: number;
    readonly z?: number;
    readonly yaw?: number;
    /** op 'detach': the printed reason (STALE_ANCHOR divergence, host removed…). */
    readonly reason?: string;
}

export interface ReseatWallAnchoredElementsPayload {
    readonly hostId: string;
    readonly cause: 'host-moved' | 'host-removed';
    readonly items: readonly WallAnchorReseatItem[];
}

interface AnchoredRecordLike {
    id: string;
    position?: { x: number; y: number; z: number; clone?: () => { x: number; y: number; z: number } };
    rotation?: { x?: number; y?: number; z?: number; _x?: number; _y?: number; _z?: number; order?: string; clone?: () => unknown };
    startPoint?: { x: number; y: number; z: number };
    cornerPoint?: { x: number; y: number; z: number };
    endPoint?: { x: number; y: number; z: number };
    wallAnchor?: WallAnchor;
    [k: string]: unknown;
}

interface AnchoredStoreLike {
    get(id: string): AnchoredRecordLike | undefined;
    add?(rec: AnchoredRecordLike): void;
    update?(id: string, rec: AnchoredRecordLike): void;
}

/** Defensive pose read — furniture rotation may be a DTO or a THREE.Euler. */
export function readAnchoredElementYaw(rec: AnchoredRecordLike): number {
    const r = rec.rotation as { y?: number; _y?: number } | undefined;
    if (!r) return 0;
    return typeof r.y === 'number' ? r.y : (typeof r._y === 'number' ? r._y : 0);
}

/** Rigid 2-D transform of an attached point (start/corner/end) through the reseat. */
function transformAttachedPoint(
    p: { x: number; y: number; z: number },
    oldPose: { x: number; z: number; yaw: number },
    newPose: { x: number; z: number; yaw: number },
): { x: number; y: number; z: number } {
    const dYaw = newPose.yaw - oldPose.yaw;
    const cos = Math.cos(dYaw);
    const sin = Math.sin(dYaw);
    const rx = p.x - oldPose.x;
    const rz = p.z - oldPose.z;
    // Rotation about world Y by dYaw in the Euler(0,yaw,0) convention:
    // a direction (x, z) rotates to (x·cos + z·sin, −x·sin + z·cos).
    return {
        x: newPose.x + rx * cos + rz * sin,
        y: p.y,
        z: newPose.z - rx * sin + rz * cos,
    };
}

export class ReseatWallAnchoredElementsCommand implements Command {
    readonly affectedStores: ReadonlyArray<string>;
    readonly id: string;
    readonly type = CommandType.RESEAT_WALL_ANCHORED;
    readonly timestamp: number;
    targetIds: string[];

    /** Pre-mutation records, in execute order — undo restores them in reverse. */
    private snapshots: Array<{ family: WallAnchorFamily; record: AnchoredRecordLike }> = [];

    constructor(private readonly payload: ReseatWallAnchoredElementsPayload) {
        this.id = `cmd-reseat-anchored-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = payload.items.map((i) => i.id);
        // C84 EI-7 — declared set == measured write set, computed from the payload.
        this.affectedStores = [...new Set(payload.items.map((i) => i.family))];
    }

    private storeFor(context: CommandContext, family: WallAnchorFamily): AnchoredStoreLike | undefined {
        const stores = context.stores as unknown as Record<string, AnchoredStoreLike | undefined>;
        return family === 'plumbing' ? stores.plumbingStore : stores.furnitureStore;
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (this.payload.items.length === 0) return { ok: false, reason: 'No anchored elements to reseat' };
        for (const item of this.payload.items) {
            const store = this.storeFor(context, item.family);
            if (!store) return { ok: false, reason: `${item.family}Store not available` };
            if (!store.get(item.id)) return { ok: false, reason: `${item.family} element '${item.id}' not found` };
            if (item.op === 'reseat' && (typeof item.x !== 'number' || typeof item.z !== 'number' || typeof item.yaw !== 'number')) {
                return { ok: false, reason: `reseat item '${item.id}' is missing its target pose` };
            }
        }
        return { ok: true };
    }

    /** One family write + the events its builders listen on. */
    private writeRecord(context: CommandContext, family: WallAnchorFamily, rec: AnchoredRecordLike): void {
        const store = this.storeFor(context, family);
        if (!store) return;
        if (family === 'plumbing') {
            store.add?.(rec); // PlumbingStore.add is a documented upsert (MovePlumbingCommand precedent)
            _bus.emit('bim-plumbing-updated', { id: rec.id });
            const builder = (window as { plumbingFragmentBuilder?: { updateFixture?: (r: unknown) => void } }).plumbingFragmentBuilder;
            builder?.updateFixture?.(rec);
        } else {
            store.update?.(rec.id, rec); // FurnitureStore.update dispatches bim-furniture-updated itself
            _bus.emit('bim-furniture-updated', { id: rec.id });
        }
    }

    private snapshotOf(rec: AnchoredRecordLike): AnchoredRecordLike {
        return {
            ...rec,
            ...(rec.position ? { position: rec.position.clone ? rec.position.clone() : { ...rec.position } } : {}),
            ...(rec.rotation ? { rotation: (rec.rotation.clone ? rec.rotation.clone() : { ...rec.rotation }) as AnchoredRecordLike['rotation'] } : {}),
            ...(rec.startPoint ? { startPoint: { ...rec.startPoint } } : {}),
            ...(rec.cornerPoint ? { cornerPoint: { ...rec.cornerPoint } } : {}),
            ...(rec.endPoint ? { endPoint: { ...rec.endPoint } } : {}),
        };
    }

    execute(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.attachment.reseatWallAnchored', (span) => {
            try {
                span.setAttribute('pryzm.anchor.hostId', this.payload.hostId);
                span.setAttribute('pryzm.anchor.cause', this.payload.cause);
                span.setAttribute('pryzm.anchor.items', this.payload.items.length);
                const r = this._execute(context);
                // `success` is `landed === attempted` (C16 B-8). Emitting it as its
                // own attribute keeps "nothing to reseat" readable apart from
                // "a write did not land" in the trace, which is the whole point.
                span.setAttribute('pryzm.anchor.success', r.success);
                return r;
            } finally {
                span.end();
            }
        });
    }

    private _execute(context: CommandContext): CommandResult {
        this.snapshots = [];
        const info: string[] = [];
        let attempted = 0;
        let landed = 0;

        for (const item of this.payload.items) {
            attempted++;
            const store = this.storeFor(context, item.family);
            const rec = store?.get(item.id);
            if (!store || !rec) {
                info.push(`${item.family} '${item.id}' vanished before the reseat — skipped`);
                continue;
            }
            this.snapshots.push({ family: item.family, record: this.snapshotOf(rec) });

            let next: AnchoredRecordLike;
            if (item.op === 'detach') {
                next = { ...rec, wallAnchor: undefined };
                info.push(`${item.family} '${item.id}' DETACHED from '${this.payload.hostId}' (${item.reason ?? this.payload.cause})`);
            } else {
                const oldPose = {
                    x: rec.position?.x ?? 0,
                    z: rec.position?.z ?? 0,
                    yaw: readAnchoredElementYaw(rec),
                };
                const newPose = { x: item.x!, z: item.z!, yaw: item.yaw! };
                // position: keep Y (the seating datum is orthogonal to the anchor);
                // clone class instances rather than minting new ones (P2 — no THREE import here).
                const position = rec.position
                    ? Object.assign(rec.position.clone ? rec.position.clone() : { ...rec.position }, { x: newPose.x, z: newPose.z })
                    : { x: newPose.x, y: 0, z: newPose.z };
                // Rotation: a live THREE.Euler keeps its setter (`y` writes `_y`); a
                // structuredClone'd one (PlumbingStore.add clones) is a plain
                // `{_x,_y,_z,_order}` whose `y` is GONE and whose next `Euler.copy()`
                // reads `_y` — so both spellings are written when the private one exists.
                const rotBase = (rec.rotation
                    ? (rec.rotation.clone ? rec.rotation.clone() : { ...rec.rotation })
                    : { x: 0, y: 0, z: 0 }) as Record<string, unknown>;
                rotBase.y = newPose.yaw;
                if ('_y' in rotBase) rotBase._y = newPose.yaw;
                const rotation = rotBase;
                next = {
                    ...rec,
                    position: position as AnchoredRecordLike['position'],
                    rotation: rotation as AnchoredRecordLike['rotation'],
                    ...(rec.startPoint ? { startPoint: transformAttachedPoint(rec.startPoint, oldPose, newPose) } : {}),
                    ...(rec.cornerPoint ? { cornerPoint: transformAttachedPoint(rec.cornerPoint, oldPose, newPose) } : {}),
                    ...(rec.endPoint ? { endPoint: transformAttachedPoint(rec.endPoint, oldPose, newPose) } : {}),
                };
            }

            this.writeRecord(context, item.family, next);

            // C16 B-8 — VERIFY BY RE-READING. A store that silently no-ops on an
            // unknown id must not be reported as a landed write.
            const back = store.get(item.id);
            const ok = item.op === 'detach'
                ? !!back && back.wallAnchor === undefined
                : !!back && Math.abs((back.position?.x ?? NaN) - item.x!) < 1e-6 && Math.abs((back.position?.z ?? NaN) - item.z!) < 1e-6;
            if (ok) landed++;
            else info.push(`${item.family} '${item.id}': write did NOT land (re-read disagrees)`);
        }

        const success = landed === attempted;
        if (!success) info.unshift(`reseat landed ${landed} of ${attempted} — the failures are listed`);
        return { success, affectedElementIds: this.payload.items.map((i) => i.id), ...(info.length ? { info } : {}) };
    }

    undo(context: CommandContext): CommandResult {
        const info: string[] = [];
        let attempted = 0;
        let landed = 0;
        for (let i = this.snapshots.length - 1; i >= 0; i--) {
            const { family, record } = this.snapshots[i]!;
            attempted++;
            const store = this.storeFor(context, family);
            if (!store) { info.push(`${family}Store unavailable during undo for '${record.id}'`); continue; }
            this.writeRecord(context, family, record);
            const back = store.get(record.id);
            if (back && Math.abs((back.position?.x ?? NaN) - (record.position?.x ?? NaN)) < 1e-6) landed++;
            else info.push(`${family} '${record.id}': undo restore did NOT land`);
        }
        const success = landed === attempted;
        return { success, affectedElementIds: this.snapshots.map((s) => s.record.id), ...(info.length ? { info } : {}) };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as unknown as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
