// A.7.b (Phase A · Sprint 2) — L3 SiteModelStore.
//
// Reactive wrapper around the L0 `SiteModel` schema shipped in A.7.a
// (`@pryzm/schemas/site/index.ts`). One instance per runtime session
// (constructed by `composeRuntime`). Idempotent disposal.
//
// Per [C19 §3.1] — one `SiteModel` per project (or `null` when no project
// is open). Subscribable; resolution helpers delegate to the current
// snapshot. Mutation surface is intentionally MINIMAL — `set(site)` is
// the only write path; real `site.*` commands per C16 land in A.7.c and
// will call `set()` after running their own validation.
//
// Cross-schema invariants (containment, FAR, edge-classification length,
// polygon-immutability hash per C19 §2.7) are NOT enforced here yet —
// those guards ship in A.7.d. The store accepts whatever `SiteModel`
// passes the L0 Zod schema; the L3 command handler is responsible for
// the cross-element checks.
//
// Layer rules:
//   - L3 — wraps an L0 schema. Imports ONLY from `@pryzm/schemas` (L0).
//     No THREE, no DOM, no other @pryzm packages.
//   - Per C13 §3.8 isolation: `reset()` is the canonical project-switch
//     hook. `composeRuntime()` wires it to `runtime.projectContext.set()`.
//
// References:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §3 (Stores)
//   - docs/03-execution/plans/master-execution-tracker.md A.7.b

import type {
    SiteModel,
    BuildingFootprint,
    ContextBuilding,
    Parcel,
    SiteLocation,
} from '@pryzm/schemas';

/**
 * L3 reactive store for the canonical SiteModel. One per runtime.
 *
 * Subscription model mirrors the existing `FamilyRegistryStore` /
 * `ApartmentParametersStore` pattern — a coarse-grained
 * `subscribe(() => void)` that fires after every state change.
 */
export class SiteModelStore {
    private _site: SiteModel | null = null;
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    /** Returns the current `SiteModel` or `null` when no project is open. */
    getSite(): SiteModel | null {
        return this._site;
    }

    /** Returns the parcel boundary polygon or `null` when no site is set. */
    getParcelBoundary(): Parcel['boundary'] | null {
        return this._site?.parcel.boundary ?? null;
    }

    /** Returns the BuildingFootprint or `null` when not yet authored. */
    getFootprint(): BuildingFootprint | null {
        return this._site?.footprint ?? null;
    }

    /** Returns the immutable array of `ContextBuilding`s for the current site. */
    getContextBuildings(): readonly ContextBuilding[] {
        return this._site?.contextBuildings ?? [];
    }

    /** Returns the site's geographic origin (lat/lon/elev/true-north/CRS). */
    getLocation(): SiteLocation | null {
        return this._site?.location ?? null;
    }

    // ── Write API ──────────────────────────────────────────────────────────
    //
    // Per [C19 §1.2] external callers MUST route through the `site.*`
    // command surface (A.7.c). `set()` is package-internal for command
    // handlers; the visibility-level enforcement is by convention until
    // the C13 `check-site-no-direct-writes.ts` CI gate ships.

    /**
     * Replace the current SiteModel snapshot. Fires every subscribed
     * listener AFTER the assignment if the reference changed. No-op when
     * `next === current`. No-op after `dispose()` (warn-soft).
     *
     * Per [C19 §1.1] there is exactly one SiteModel per Project; the
     * caller is responsible for ensuring `next.projectId` matches the
     * runtime's active project (the L3 command handler validates this).
     */
    set(next: SiteModel | null): void {
        if (this._disposed) {
            console.warn('[SiteModelStore] set() after dispose — ignored');
            return;
        }
        if (this._site === next) return;
        this._site = next;
        this._notify();
    }

    /**
     * Clear the SiteModel — used by the C13 project-switch reset hook.
     * Per [C19 §1.13] the SiteModelStore joins the C13 reset list so a
     * Project A's parcel polygon never renders against Project B's
     * BuildingFootprint. Wired in `composeRuntime()` to
     * `runtime.projectContext.set()`.
     */
    reset(): void {
        this.set(null);
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    /**
     * Subscribe to coarse mutation notifications. Returns an unsubscribe
     * disposer (idempotent). Listeners that throw are caught + warned so
     * a rogue subscriber cannot stall the fan-out (matches the pattern
     * in `FamilyRegistryStore`).
     */
    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /**
     * Idempotent. Clears every listener and freezes future mutations
     * into no-ops (with a one-line warn). Constructed-once-per-runtime
     * semantics match the `familyRegistryStore` lifecycle.
     */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._site = null;
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (e) {
                console.warn('[SiteModelStore] listener threw:', e);
            }
        }
    }
}
