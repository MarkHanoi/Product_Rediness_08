// §SITE-SCOPE (L-645 re-opened 2026-09-07; C12 §13.1 / §13.4; ADR-0382 D1/D8) — the WRITE PATH for
// `SiteModel.scope`, and the parcel FLOOR the slider may not go below.
//
// ⭐ WHY THIS IS ITS OWN LEAF AND NOT A FUNCTION IN `siteDispatch.ts`.
// It is re-exported from there — `dispatchSiteScope` is the `dispatchSiteTrueNorth` shape and
// belongs in that family — but the CALLER is `SiteAuthoringPaneShell`, an `engine/views`
// composition module, and `siteDispatch.ts` is 9,400 lines whose graph reaches the geospatial
// fetchers and the zoning solvers. That module's own header records the cost measured the last
// time an engine module imported it for one function: *"pulling `siteDispatch`'s graph for a
// two-field runtime read is expensive enough to make a real `await import(...)` of a dependent
// panel exceed a 120 s budget under vitest"* (§LINK-ACTIVE-PID-EXTRACT, L-3160), and the fix that
// time was exactly this — move the function to a leaf and re-export it. Same defect, same remedy,
// applied before it bites rather than after.
//
// This module imports `@pryzm/stores` (the pure handler), `@pryzm/schemas` (the type) and this
// app's own `siteScope.ts` (the floor arithmetic). Nothing else.

import { siteSetScope, type SiteModelStore } from '@pryzm/stores';
import type { SiteScope, SiteScopeShape } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { minimumScopeContainingRing, scopeOuterRadiusM } from '../geospatial/siteScope';

/** The runtime the write goes through — passed explicitly, or the app's one global. */
function liveRuntime(rt?: PryzmRuntime | null): PryzmRuntime | null {
    if (rt) return rt;
    return typeof window !== 'undefined'
        ? ((window.runtime as unknown as PryzmRuntime | undefined) ?? null)
        : null;
}

/**
 * §SITE-SCOPE (C12 §13.1 / §13.4; ADR-0382 D1/D8) — write the 3D-Site SCOPE.
 *
 * The scope slider's RELEASE calls this, and nothing else writes `SiteModel.scope` (P6: commands
 * are the only mutation path). It is the `dispatchSiteTrueNorth` shape verbatim — the pure handler
 * against the store, a soft-reject logged, the domain event emitted on the runtime bus — because a
 * second dispatch idiom for one more field is how two rival scope TYPES happened on the very day
 * this feature was designed (AUDIT §0).
 *
 * `site.scope-changed` IS the reload trigger: `CesiumViewport` subscribes to it and runs
 * `syncScopeFromStore(true)` → `setContextScope`, which reloads every layer by SWAPPING and never
 * blanking (C12 §13.4, pinned by `siteScopeSwapNeverBlank.spec.ts`).
 *
 * ⛔ NOT AN UNDO ENTRY (ADR-0382 D8). The scope is a persisted VIEW-EXTENT fact, like the split
 * fraction and the camera; a Ctrl-Z after a slide must undo the last MODEL edit, not the slab size.
 * That is why this runs the handler directly rather than routing through the undoable command path
 * — stated so it reads as a decision rather than as an omission the next lane "fixes".
 *
 * @param scope `null` CLEARS the authored value; the product default then resolves at read time.
 * @returns `true` only when the value was written AND the event emitted. `false` is a REFUSAL the
 *          caller must surface — the slider paints "could not be saved … the view is unchanged"
 *          off it, because reporting a slab size the project does not hold is the failure-vs-empty
 *          conflation in its UI form.
 */
export function dispatchSiteScope(
    rt: PryzmRuntime | null | undefined,
    scope: SiteScope | null,
): boolean {
    const runtime = liveRuntime(rt);
    const store = runtime?.siteModelStore as SiteModelStore | undefined;
    if (!store) {
        console.warn('[gis][site-scope] dispatchSiteScope: no site store — open a project first.');
        return false;
    }
    const site = store.getSite();
    if (!site) {
        console.warn('[gis][site-scope] dispatchSiteScope: no Site — geolocate the site first.');
        return false;
    }
    const res = siteSetScope({ siteId: site.id, scope }, store);
    if (!res.ok) {
        console.warn('[gis][site-scope] site.setScope soft-reject:', res.reason, res.message);
        runtime?.events?.emit('pryzm:toast', { message: `Scope not saved: ${res.message}`, severity: 'error' });
        return false;
    }
    console.log(
        '[gis][site-scope] §SITE-SCOPE — SiteModel.scope written → ' +
            (scope === null
                ? 'cleared (the product default resolves at read time)'
                : scope.shape === 'circle'
                  ? `circle r=${Math.round(scope.radiusM)} m`
                  : `rectangle ${Math.round(scope.halfWidthM * 2)} × ${Math.round(scope.halfDepthM * 2)} m`) +
            ' — emitting site.scope-changed (the context reload; not an undo entry, ADR-0382 D8).',
    );
    runtime?.events?.emit('site.scope-changed', res.event);
    return true;
}

/**
 * §SITE-SCOPE (ADR-0382 D8) — the slider's FLOOR: the smallest circumscribing radius that still
 * contains the committed parcel with `marginM` of clearance. The slab may never be drawn tighter
 * than the plot it exists to present.
 *
 * ⚠ READ FROM THE STORE, NOT FROM THE RENDER. `parcel.boundary.polygon` is already scene-XZ metres
 * — the frame `minimumScopeContainingRing` expects (C19 §1.4) — so no projection happens here and
 * no second copy of the ring is made.
 *
 * ⛔ `null` means NO FLOOR IS KNOWN (no site, or no boundary drawn yet), which is a different fact
 * from a floor of zero and must never be reported as one: a zero floor would let the slider claim
 * a 0 m slab is legal.
 */
export function siteScopeFloorRadiusM(
    rt: PryzmRuntime | null | undefined,
    shape: SiteScopeShape = 'rectangle',
    marginM = 25,
): number | null {
    try {
        const store = liveRuntime(rt)?.siteModelStore as SiteModelStore | undefined;
        const ring = store?.getSite()?.parcel?.boundary?.polygon;
        if (!Array.isArray(ring) || ring.length < 3) return null;
        const minimum = minimumScopeContainingRing(ring, marginM, shape);
        return minimum ? scopeOuterRadiusM(minimum) : null;
    } catch {
        // A malformed ring is not a reason to refuse the whole control — it is a reason to have no
        // floor, which is what the measured range already gives.
        return null;
    }
}
