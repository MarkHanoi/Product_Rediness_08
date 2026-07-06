/**
 * ViewScope — DOC-1 unified per-view-type drawing semantics.
 *
 * §FIX-ELEVATION-POCHE / §FIX-ELEVATION-SCOPE (L-119 / L-120 P4).
 *
 * The documentation pipeline used to scatter `viewType === 'elevation'` /
 * `viewType === 'section'` / `isPlanLike` checks across EdgeProjectorService,
 * PlanViewCanvas, NativeElementMeshExporter, VGSceneApplicator, ViewController …
 * Those ad-hoc branches drifted out of sync — most damagingly, elevations routed
 * their façade silhouette to the `A-WALL:cut` layer (a CUT concept) and the plan
 * poché-fill pass then painted the whole façade solid black (L-119).
 *
 * `ViewScope` is the single, pure classifier that answers "what kind of
 * technical drawing is this view?" — every subsystem reads the SAME answer:
 *
 *   • `poche`          — solid cut fills are rendered (plan / section CUT views).
 *   • `cut`            — the view has a section CUT → emit `:cut` linework + poché.
 *   • `depthProjected` — orthographic depth projection (elevation / section).
 *   • `planFamily`     — top-down plan-family view (plan / rcp / structural / detail).
 *
 * The crucial invariant: an ELEVATION has `cut: false, poche: false` — it is a
 * pure projection of a face and must emit ONLY `:proj` / `:beyond` linework.
 *
 * Contract compliance:
 *   §05 — Pure data classifier. No DOM, no THREE, no I/O, no store reads.
 *   C04 / DOC-1 — rendering/scheduling: the projection + canvas layers derive
 *                 their cut/poché behaviour from this one function.
 *
 * P8 note: this is a pure, deterministic, hot-path classifier (called per
 * projection layer and per canvas render). It follows the same "pure style
 * classifier, no span" precedent as `PenWeightTable.penZoneFromFlags` /
 * `categoryFromFlags` — instrumenting it would flood traces and violate the C10
 * perf budget. Side-effecting exported functions in this lane (e.g.
 * `ViewDependencyTracker.forceReproject`) carry the OTel spans.
 */

import type { ViewType } from './ViewDefinitionTypes';
import { PLAN_VIEW_TYPES } from './ViewDefinitionTypes';

export interface ViewScope {
    /** Solid cut fills (poché) are rendered for this view. */
    poche: boolean;
    /**
     * The view has a section CUT plane whose intersection is drawn as heavy
     * `:cut` linework and (when poché is on) filled. FALSE for elevations —
     * they have no cut, only projection.
     */
    cut: boolean;
    /** Orthographic depth-projected drawing (elevation / section). */
    depthProjected: boolean;
    /** Top-down plan-family view (plan / ceiling-plan / structural-plan / detail). */
    planFamily: boolean;
}

/** Plan-family view types for scope purposes — PLAN_VIEW_TYPES plus `detail`
 *  (a callout is an enlarged plan region and shares plan cut/poché semantics). */
const _PLAN_FAMILY_TYPES: ReadonlySet<string> = new Set<string>([
    ...PLAN_VIEW_TYPES,
    'detail',
]);

const _ELEVATION_SCOPE: ViewScope = Object.freeze({
    poche: false, cut: false, depthProjected: true, planFamily: false,
});
const _SECTION_SCOPE: ViewScope = Object.freeze({
    poche: true, cut: true, depthProjected: true, planFamily: false,
});
const _PLAN_SCOPE: ViewScope = Object.freeze({
    poche: true, cut: true, depthProjected: false, planFamily: true,
});
const _NON_TECHNICAL_SCOPE: ViewScope = Object.freeze({
    poche: false, cut: false, depthProjected: false, planFamily: false,
});

/**
 * Resolve the unified drawing scope for a view type.
 *
 * @param viewType  The `ViewDefinition.viewType` (tolerates `undefined` /
 *                  unknown strings → treated as a non-technical view).
 */
export function resolveViewScope(viewType: ViewType | string | undefined): ViewScope {
    const vt = viewType ?? 'plan';
    // Elevation — pure orthographic projection of a face: NO cut, NO poché.
    if (vt === 'elevation') return _ELEVATION_SCOPE;
    // Section — a cut through the model: cut linework + poché.
    if (vt === 'section') return _SECTION_SCOPE;
    // Plan-family — top-down cut + poché.
    if (_PLAN_FAMILY_TYPES.has(vt)) return _PLAN_SCOPE;
    // 3d / analysis / drafting / legend / render / walkthrough — no technical cut.
    return _NON_TECHNICAL_SCOPE;
}
