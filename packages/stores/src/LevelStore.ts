// A.23.b.1 (Phase A · Sprint 2) — L3 LevelStore.
//
// Reactive wrapper around the L0 `Level` schema (A.23.a). Holds the
// per-Building floor levels (signed levelNumber: -1, -2 basement; 0
// ground; 1, 2 upper).
//
// Per [C20 §1.2] within a single Building:
//   - levelNumber UNIQUE
//   - elevation UNIQUE
//   - elevation monotonically increases with levelNumber (-1 < 0 < 1 …)
//   - zero-or-one Level may have isActive=true
//
// The store enforces per-row schema validity + provides query helpers
// the command surface (A.23.c) uses to check the cross-row invariants
// BEFORE commit. The store does NOT auto-reject violations — that's
// the command's job (so the user sees a meaningful error message).
//
// Per [C13 §3.8] isolation: `reset()` is the project-switch hook.

import type {
    Level,
    LevelId,
    BuildingId,
} from '@pryzm/schemas/aggregates';

/**
 * L3 reactive store for the C20 Level aggregate. One instance per
 * runtime. Idempotent disposal.
 */
export class LevelStore {
    private readonly _byId = new Map<LevelId, Level>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    get(id: LevelId): Level | undefined {
        return this._byId.get(id);
    }

    has(id: LevelId): boolean {
        return this._byId.has(id);
    }

    size(): number {
        return this._byId.size;
    }

    /** All Levels, sorted by `elevation` ascending. Stable across calls
     *  given the same state. Reference-level filter is the caller's job. */
    list(): readonly Level[] {
        return Array.from(this._byId.values()).sort(
            (a, b) => a.elevation - b.elevation,
        );
    }

    /** Levels belonging to one Building, sorted by elevation asc. */
    listForBuilding(buildingId: BuildingId): readonly Level[] {
        return this.list().filter((l) => l.buildingId === buildingId);
    }

    /** The currently-active Level (per [C20 §1.2] there is zero or one
     *  active Level per Building). Returns undefined when no Level is
     *  active or no Level exists. The cross-Building "exactly one
     *  active globally" check is the L5 ProjectContext's job. */
    activeForBuilding(buildingId: BuildingId): Level | undefined {
        return this.listForBuilding(buildingId).find((l) => l.isActive);
    }

    /** Returns the Level with the given (buildingId, levelNumber) tuple,
     *  if one exists. Per [C20 §1.2] this is UNIQUE. */
    findByNumber(
        buildingId: BuildingId,
        levelNumber: number,
    ): Level | undefined {
        return this.listForBuilding(buildingId).find(
            (l) => l.levelNumber === levelNumber,
        );
    }

    /** Returns the Level with the given (buildingId, elevation) tuple,
     *  if one exists. Per [C20 §1.2] this is UNIQUE. The match uses
     *  exact float equality — callers must round consistently. */
    findByElevation(
        buildingId: BuildingId,
        elevation: number,
    ): Level | undefined {
        return this.listForBuilding(buildingId).find(
            (l) => l.elevation === elevation,
        );
    }

    // ── Write API ──────────────────────────────────────────────────────────

    add(level: Level): void {
        if (this._disposed) {
            console.warn('[LevelStore] add() after dispose — ignored');
            return;
        }
        if (this._byId.has(level.id as LevelId)) {
            throw new Error(
                `LevelStore: Level '${level.id}' already exists — call update() to modify`,
            );
        }
        this._byId.set(level.id as LevelId, level);
        this._notify();
    }

    update(level: Level): void {
        if (this._disposed) {
            console.warn('[LevelStore] update() after dispose — ignored');
            return;
        }
        if (!this._byId.has(level.id as LevelId)) {
            throw new Error(
                `LevelStore: cannot update unknown Level '${level.id}'`,
            );
        }
        this._byId.set(level.id as LevelId, level);
        this._notify();
    }

    remove(id: LevelId): void {
        if (this._disposed) {
            console.warn('[LevelStore] remove() after dispose — ignored');
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
                console.warn('[LevelStore] listener threw:', err);
            }
        }
    }
}
