// A.23.b.1 (Phase A · Sprint 2) — L3 BuildingStore.
//
// Reactive wrapper around the L0 `Building` schema (A.23.a). Per
// [C20 §1.1] there is ONE Building per Project today (multi-Building
// deferred to C20.1; the schema reserves the `ordinal` slot). The
// store accepts the canonical Map-of-one pattern via `add` / `update`
// / `remove`, but every check is keyed by `id` so the C20.1 multi-
// Building extension drops in without rewriting consumers.
//
// L3-layer: imports ONLY from @pryzm/schemas (L0). Cross-store
// invariants (eg Level.buildingId MUST point at an existing Building)
// are the COMMAND handler's job per [C20 §1.1] + P6. The store enforces
// per-row schema validity only.
//
// Per [C13 §3.8] isolation: `reset()` is the canonical project-switch
// hook (composeRuntime wires it to projectContext.set()).

import type { Building, BuildingId } from '@pryzm/schemas/aggregates';

/**
 * L3 reactive store for the C20 Building aggregate. One instance per
 * runtime session (constructed by composeRuntime). Idempotent disposal.
 */
export class BuildingStore {
    private readonly _byId = new Map<BuildingId, Building>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    /** Lookup a Building by id; returns undefined when absent. */
    get(id: BuildingId): Building | undefined {
        return this._byId.get(id);
    }

    /** Snapshot of all registered Buildings. Order: by `ordinal` asc
     *  then `createdAt` asc (stable across calls given same state).
     *  Per [C20 §2.1] `ordinal` reserves the C20.1 multi-Building
     *  display-order slot; single-Building today always reads as a
     *  one-element list. */
    list(): readonly Building[] {
        return Array.from(this._byId.values()).sort((a, b) => {
            if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
            return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
        });
    }

    /** True iff a Building is registered under `id`. */
    has(id: BuildingId): boolean {
        return this._byId.has(id);
    }

    /** Returns the FIRST registered Building (or undefined). Useful in
     *  single-Building mode (today) where consumers just want "THE
     *  Building" without a full list scan. */
    first(): Building | undefined {
        const it = this._byId.values().next();
        return it.done ? undefined : it.value;
    }

    /** Number of registered Buildings. */
    size(): number {
        return this._byId.size;
    }

    // ── Write API ──────────────────────────────────────────────────────────
    //
    // Mutation surface: `add` / `update` / `remove`. Per [P6] external
    // callers MUST route through the `building.*` command surface
    // (A.23.c); these are package-internal for the command handlers.

    /**
     * Add a Building. Throws if the id is already registered — the
     * command handler should call `update` for re-add semantics.
     */
    add(building: Building): void {
        if (this._disposed) {
            console.warn('[BuildingStore] add() after dispose — ignored');
            return;
        }
        if (this._byId.has(building.id as BuildingId)) {
            throw new Error(
                `BuildingStore: Building '${building.id}' already exists — call update() to modify`,
            );
        }
        this._byId.set(building.id as BuildingId, building);
        this._notify();
    }

    /**
     * Update an existing Building. Throws if the id is unknown — the
     * command handler should call `add` for missing rows. Per [C20
     * §1.5] field-level partial updates flow through this method
     * with `{ ...prior, ...patch }` semantics; the caller composes.
     */
    update(building: Building): void {
        if (this._disposed) {
            console.warn('[BuildingStore] update() after dispose — ignored');
            return;
        }
        if (!this._byId.has(building.id as BuildingId)) {
            throw new Error(
                `BuildingStore: cannot update unknown Building '${building.id}'`,
            );
        }
        this._byId.set(building.id as BuildingId, building);
        this._notify();
    }

    /**
     * Remove a Building by id. No-op when the id is absent (silent on
     * delete-missing — the command handler is responsible for surfacing
     * "no Building" to the UI).
     */
    remove(id: BuildingId): void {
        if (this._disposed) {
            console.warn('[BuildingStore] remove() after dispose — ignored');
            return;
        }
        if (this._byId.delete(id)) this._notify();
    }

    /**
     * Clear all Buildings — used by the C13 project-switch reset hook.
     * Empty-reset is a no-op (does NOT fire listeners).
     */
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

    /** Idempotent. Clears listeners + freezes writes into no-ops. */
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
                console.warn('[BuildingStore] listener threw:', err);
            }
        }
    }
}
