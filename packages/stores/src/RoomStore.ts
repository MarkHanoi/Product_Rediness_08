// A.23.b.2 (Phase A · Sprint 2) — L3 aggregate Room store (C20).
//
// ⚠ GE-04 (measured 2026-08-14) — DEPRECATED-AS-NAMED, unwired-as-built.
// This class was one of THREE named `RoomStore`. The one shipping paths
// execute is `packages/room-topology/src/RoomStore.ts` (module singleton,
// storeRegistry key `'room'`, `window.roomStore`, typed into the command
// surface at packages/command-registry/src/types.ts). THIS store's runtime
// slot — `runtime.stores.roomStore`, constructed by composeRuntime — has
// ZERO readers anywhere in the repo, and its room.* aggregate handlers
// (../aggregate-commands/room*.ts) are invoked only by packages/stores'
// own tests. It is authored-but-unwired: the A.23.c room.* command surface
// never reached a bus.
//
// It is renamed `AggregateRoomStore` (deprecated `RoomStore` alias below
// keeps composeRuntime / runtime-composer types / the tests compiling) so
// the canonical name has exactly one owner. Whether the C20 aggregate Room
// concept should live on as its own store or collapse onto the winner's
// RoomData is a CONTRACT decision (aggregates/Room carries `apartmentId`,
// which RoomData does not) — that call needs an ADR, not a silent pick
// (C73 §3.7). Until then: no new consumers of this store.
//
// Original A.23.b.2 notes — reactive wrapper around the L0 aggregate
// `Room` schema (A.23.a). Per [C20 §1.4] cross-store invariants (enforced
// by room.* commands in A.23.c, NOT by this store):
//   - When apartmentId is non-null, Room.levelId MUST equal
//     Apartment(apartmentId).levelId
//   - apartmentId may be null for public-corridor / plant-room /
//     lift-lobby rooms (the C20 §2.4 nullable-widening is scheduled
//     here but Room.apartmentId is currently REQUIRED at the L0
//     schema — see Room.ts header note)
//
// The store does per-row schema validity only.

import type {
    Room,
    RoomId,
    LevelId,
    ApartmentId,
} from '@pryzm/schemas/aggregates';

export class AggregateRoomStore {
    private readonly _byId = new Map<RoomId, Room>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    get(id: RoomId): Room | undefined {
        return this._byId.get(id);
    }

    has(id: RoomId): boolean {
        return this._byId.has(id);
    }

    size(): number {
        return this._byId.size;
    }

    /** All Rooms. Sort: levelId asc, then name asc (case-insensitive). */
    list(): readonly Room[] {
        return Array.from(this._byId.values()).sort((a, b) => {
            if (a.levelId !== b.levelId) {
                return a.levelId < b.levelId ? -1 : 1;
            }
            const an = a.name.toLowerCase();
            const bn = b.name.toLowerCase();
            return an < bn ? -1 : an > bn ? 1 : 0;
        });
    }

    /** Rooms on one Level. */
    listForLevel(levelId: LevelId): readonly Room[] {
        return this.list().filter((r) => r.levelId === levelId);
    }

    /** Rooms belonging to one Apartment (excludes apartmentId=null /
     *  public-corridor rooms — see RoomStore §1.4). */
    listForApartment(apartmentId: ApartmentId): readonly Room[] {
        return this.list().filter((r) => r.apartmentId === apartmentId);
    }

    // ── Write API ──────────────────────────────────────────────────────────

    add(room: Room): void {
        if (this._disposed) {
            console.warn('[RoomStore] add() after dispose — ignored');
            return;
        }
        if (this._byId.has(room.id as RoomId)) {
            throw new Error(
                `RoomStore: Room '${room.id}' already exists — call update() to modify`,
            );
        }
        this._byId.set(room.id as RoomId, room);
        this._notify();
    }

    update(room: Room): void {
        if (this._disposed) {
            console.warn('[RoomStore] update() after dispose — ignored');
            return;
        }
        if (!this._byId.has(room.id as RoomId)) {
            throw new Error(
                `RoomStore: cannot update unknown Room '${room.id}'`,
            );
        }
        this._byId.set(room.id as RoomId, room);
        this._notify();
    }

    remove(id: RoomId): void {
        if (this._disposed) {
            console.warn('[RoomStore] remove() after dispose — ignored');
            return;
        }
        if (this._byId.delete(id)) this._notify();
    }

    /** Cascade-remove all Rooms belonging to an Apartment. Used by
     *  the apartment.delete command per [C20 §4]. Returns the count
     *  of Rooms removed. */
    removeForApartment(apartmentId: ApartmentId): number {
        if (this._disposed) {
            console.warn(
                '[RoomStore] removeForApartment() after dispose — ignored',
            );
            return 0;
        }
        let count = 0;
        for (const [id, room] of this._byId) {
            if (room.apartmentId === apartmentId) {
                this._byId.delete(id);
                count += 1;
            }
        }
        if (count > 0) this._notify();
        return count;
    }

    reset(): void {
        if (this._disposed) return;
        if (this._byId.size === 0) return;
        this._byId.clear();
        this._notify();
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._byId.clear();
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (err) {
                console.warn('[RoomStore] listener threw:', err);
            }
        }
    }
}

/**
 * @deprecated GE-04 transitional alias — `RoomStore` is the canonical name of
 * `packages/room-topology/src/RoomStore.ts`, the store shipping paths execute.
 * THIS class is the unwired C20 aggregate row store; call it
 * `AggregateRoomStore`. The alias survives only so composeRuntime,
 * runtime-composer's types and packages/stores' tests compile until the
 * C20-aggregate ADR (see file header) lands.
 */
export { AggregateRoomStore as RoomStore };
