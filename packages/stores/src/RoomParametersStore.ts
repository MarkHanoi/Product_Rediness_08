// RoomParametersStore — D-α-1 (BIM 2/3 §6).
//
// Sibling to ApartmentParametersStore — same pattern, scoped to per-room
// L0 records. Indexed by room id; carries `apartmentId` as a foreign key
// so panels can filter by apartment.
//
// Schema source: `@pryzm/schemas/apartment` → `RoomParameters` (D-α-0).

import { Store } from './Store.js';
import { RoomParameters } from '@pryzm/schemas/apartment';
import type { RoomParameters as RoomParametersType } from '@pryzm/schemas/apartment';

export class RoomParametersStore extends Store<RoomParametersType> {
    private _listeners = new Set<() => void>();

    constructor() { super('roomParameters'); }

    /** Bootstrap or replace a room's parameter record. Schema-validates;
     *  returns true on success, false on schema failure. */
    setRoom(p: RoomParametersType): boolean {
        const parsed = RoomParameters.safeParse(p);
        if (!parsed.success) {
            console.warn('[RoomParametersStore] rejected — schema:', parsed.error.message);
            return false;
        }
        this.state.set(parsed.data.id, Object.freeze(parsed.data));
        this._notify();
        return true;
    }

    /** Bulk set — useful for the executor's post-build bootstrap of every
     *  generated room at once. Per-room schema validation; rooms that fail
     *  validation are skipped (and logged). Returns the count actually set. */
    setMany(rooms: readonly RoomParametersType[]): number {
        let set = 0;
        for (const r of rooms) {
            const parsed = RoomParameters.safeParse(r);
            if (!parsed.success) {
                console.warn('[RoomParametersStore] rejected — schema:', parsed.error.message);
                continue;
            }
            this.state.set(parsed.data.id, Object.freeze(parsed.data));
            set++;
        }
        if (set > 0) this._notify();
        return set;
    }

    getRoom(id: string): RoomParametersType | undefined {
        return this.state.get(id);
    }

    /**
     * D-α-2 (2026-05-30) — patch-merge update for `room.updateParameter`.
     * Same shape as ApartmentParametersStore.updateApartment.
     */
    updateRoom(
        id: string,
        patch: Record<string, unknown>,
    ): { ok: true; prior: RoomParametersType }
       | { ok: false; reason: 'not-found' }
       | { ok: false; reason: 'invalid'; detail: string } {
        const prior = this.state.get(id);
        if (!prior) return { ok: false, reason: 'not-found' };
        const { id: _ignored, ...editable } = patch;
        const merged = { ...prior, ...editable, id: prior.id };
        const parsed = RoomParameters.safeParse(merged);
        if (!parsed.success) {
            return { ok: false, reason: 'invalid', detail: parsed.error.message };
        }
        this.state.set(parsed.data.id, Object.freeze(parsed.data));
        this._notify();
        return { ok: true, prior };
    }

    /** Every room owned by a given apartment. */
    forApartment(apartmentId: string): readonly RoomParametersType[] {
        const out: RoomParametersType[] = [];
        for (const r of this.state.values()) {
            if (r.apartmentId === apartmentId) out.push(r);
        }
        return out;
    }

    /** Every room record in the store (across apartments). */
    list(): readonly RoomParametersType[] {
        return [...this.state.values()];
    }

    /** Remove one room. */
    remove(id: string): void {
        if (this.state.delete(id)) this._notify();
    }

    /** Remove every room owned by an apartment (e.g. on apartment delete). */
    removeForApartment(apartmentId: string): number {
        let removed = 0;
        for (const [id, r] of [...this.state.entries()]) {
            if (r.apartmentId === apartmentId) {
                this.state.delete(id);
                removed++;
            }
        }
        if (removed > 0) this._notify();
        return removed;
    }

    clear(): void {
        if (this.state.size === 0) return;
        this.state.clear();
        this._notify();
    }

    // ── Subscription ───────────────────────────────────────────────────────

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try { l(); } catch (e) { console.warn('[RoomParametersStore] listener threw:', e); }
        }
    }
}

/** Process-wide singleton. */
export const roomParametersStore = new RoomParametersStore();
