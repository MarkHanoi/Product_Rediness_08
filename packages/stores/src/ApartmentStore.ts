// A.23.b.2 (Phase A · Sprint 2) — L3 ApartmentStore.
//
// Reactive wrapper around the L0 `Apartment` schema (A.23.a). Per
// [C20 §1.3] an Apartment lives on a SINGLE Level today (multi-Level
// deferred to C20.2). Per [C20 §1.5] `parameters.id` MUST equal
// `Apartment.id` — the L3 command handler enforces this on every
// add/update.
//
// Cross-store invariants enforced by the apartment.* commands (A.23.c):
//   - levelId references an existing Level (LevelStore lookup)
//   - buildingId === Level(levelId).buildingId
//   - unitNumber unique within Building
//
// The store does per-row schema validity only.

import type {
    Apartment,
    ApartmentId,
    LevelId,
    BuildingId,
} from '@pryzm/schemas/aggregates';

export class ApartmentStore {
    private readonly _byId = new Map<ApartmentId, Apartment>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    get(id: ApartmentId): Apartment | undefined {
        return this._byId.get(id);
    }

    has(id: ApartmentId): boolean {
        return this._byId.has(id);
    }

    size(): number {
        return this._byId.size;
    }

    /** All Apartments. Sort: buildingId asc, then unitNumber asc
     *  (natural inspect-tree order). Stable across calls. */
    list(): readonly Apartment[] {
        return Array.from(this._byId.values()).sort((a, b) => {
            if (a.buildingId !== b.buildingId) {
                return a.buildingId < b.buildingId ? -1 : 1;
            }
            return a.unitNumber < b.unitNumber
                ? -1
                : a.unitNumber > b.unitNumber
                ? 1
                : 0;
        });
    }

    /** Apartments on one Level. */
    listForLevel(levelId: LevelId): readonly Apartment[] {
        return this.list().filter((a) => a.levelId === levelId);
    }

    /** Apartments in one Building. Used by the unit-number uniqueness
     *  check (A.23.c) — Apartments span Levels but unitNumber is
     *  unique across the entire Building. */
    listForBuilding(buildingId: BuildingId): readonly Apartment[] {
        return this.list().filter((a) => a.buildingId === buildingId);
    }

    /** Lookup by (buildingId, unitNumber). Returns undefined on miss.
     *  Per [C20 §1.3] unitNumber is unique within Building. */
    findByUnitNumber(
        buildingId: BuildingId,
        unitNumber: string,
    ): Apartment | undefined {
        return this.listForBuilding(buildingId).find(
            (a) => a.unitNumber === unitNumber,
        );
    }

    // ── Write API ──────────────────────────────────────────────────────────

    add(apartment: Apartment): void {
        if (this._disposed) {
            console.warn('[ApartmentStore] add() after dispose — ignored');
            return;
        }
        if (this._byId.has(apartment.id as ApartmentId)) {
            throw new Error(
                `ApartmentStore: Apartment '${apartment.id}' already exists — call update() to modify`,
            );
        }
        this._byId.set(apartment.id as ApartmentId, apartment);
        this._notify();
    }

    update(apartment: Apartment): void {
        if (this._disposed) {
            console.warn('[ApartmentStore] update() after dispose — ignored');
            return;
        }
        if (!this._byId.has(apartment.id as ApartmentId)) {
            throw new Error(
                `ApartmentStore: cannot update unknown Apartment '${apartment.id}'`,
            );
        }
        this._byId.set(apartment.id as ApartmentId, apartment);
        this._notify();
    }

    remove(id: ApartmentId): void {
        if (this._disposed) {
            console.warn('[ApartmentStore] remove() after dispose — ignored');
            return;
        }
        if (this._byId.delete(id)) this._notify();
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
                console.warn('[ApartmentStore] listener threw:', err);
            }
        }
    }
}
