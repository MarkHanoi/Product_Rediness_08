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
 * ⚠ CORRECTED §ELEVATION-POCHE-IS-INTENT-DECLARED (L-1601). This read: "The crucial
 * invariant: an ELEVATION has `cut: false, poche: false` — it is a pure projection of
 * a face and must emit ONLY `:proj` / `:beyond` linework." The SECOND half had already
 * been false for months: §ELEV-LINEWEIGHT (L-182) makes EdgeProjectorService emit a
 * `:cut` layer for elevations too, for geometry the elevation plane is drawn THROUGH,
 * so the heavy cut pen can establish the weight hierarchy. An elevation therefore has
 * a cut band; what it does NOT have is an unconditional solid fill for it. `poche` is
 * now true for elevation and gated by `pocheRequiresExplicitIntent` — read that
 * field's doc, it carries the L-119 history the flat `false` was standing in for.
 *
 * Contract compliance:
 *   §05 — Pure data classifier. No DOM, no THREE, no I/O, no store reads.
 *   C04 / DOC-1 — rendering/scheduling: the projection + canvas layers derive
 *                 their cut/poché behaviour from this one function.
 *
 * P8 note: this is a pure, deterministic, hot-path classifier (called per
 * projection layer and per canvas render). It follows the same "pure style
 * classifier, no span" precedent as `DrawingZone.drawingZoneFromLayerName` /
 * `categoryFromFlags` — instrumenting it would flood traces and violate the C10
 * perf budget. Side-effecting exported functions in this lane (e.g.
 * `ViewDependencyTracker.forceReproject`) carry the OTel spans.
 */

import type { ViewType } from './ViewDefinitionTypes';
import { PLAN_VIEW_TYPES } from './ViewDefinitionTypes';
import type { OcclusionDisposition, BeyondLineStyle } from '../drawing/DrawingZone';

export interface ViewScope {
    /** Solid cut fills (poché) are rendered for this view. */
    poche: boolean;
    /**
     * §ELEVATION-POCHE-IS-INTENT-DECLARED (L-1601) — when true, this view pochés ONLY
     * where the bound INTENT explicitly declares a cut fill for (viewType × category).
     * The `ISO_CUT_LAYER_TO_POCHE_FILL` default and the VG template seed are NOT
     * fallbacks here; absent an explicit intent fill, nothing is painted.
     *
     * This is what makes elevation poché safe. §FIX-ELEVATION-POCHE (L-119) disabled it
     * outright because it "painted every façade cut layer solid black over the
     * linework" — that black is `POCHE_CONSTRUCTION_DOCS_FILL` / the ISO default
     * arriving as a FALLBACK for a band that, at the time, held the whole façade.
     * §ELEV-LINEWEIGHT (L-182) later narrowed the elevation `:cut` band to "only
     * geometry the plane actually slices", but the poché gate was never revisited —
     * so the founder's elevation CUT fill setting had nothing to drive.
     *
     * Requiring an EXPLICIT intent fill means the L-119 failure cannot recur by
     * default: an elevation whose intent declares no cut fill paints exactly what it
     * paints today, byte for byte. The user's own decision is the only thing that can
     * turn it on — which is precisely what the founder asked for.
     */
    pocheRequiresExplicitIntent: boolean;
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
    /**
     * §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) / C09 §4.6.5 — what this view does with a span
     * the occlusion engine has PROVED is behind a solid.
     *
     *   • `'remove'` — do not draw it. The plan / section convention: the slab does not show
     *     through the wall.
     *   • `'demote'` — reclassify it to the `hidden` zone and draw it on the DASHED
     *     hidden-line pen. The elevation convention (L-190).
     *
     * Both are legitimate drafting conventions, and C09 §4.6.5 is explicit that **which one
     * applies is a property of the VIEW'S INTENT, not a `viewType ===` branch buried inside
     * an occluder**. It lives here — on the one classifier every consumer already reads —
     * precisely so that `HiddenLineRemoval` does not have to know what an elevation is.
     *
     * (The remaining cell, recorded honestly rather than faked: a per-VIEW override of this
     * default — a plan that wants hidden lines shown dashed rather than removed — needs a
     * field on `ViewDefinition` and is not yet plumbed. The TYPE is here and the engine
     * already honours whatever it is handed; only the user-facing switch is missing.)
     */
    occlusionDisposition: OcclusionDisposition;

    /**
     * §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) / C09 §4.6.4d — how this view draws the `beyond`
     * zone: geometry PAST the cut plane that is DELIBERATELY SHOWN.
     *
     *   • `'solid'`  — PLAN. The founder's canonical case: a stair's lower run is shown, lighter,
     *     and it is NOT behind anything. **Unchanged by L-290 and asserted explicitly** — a fix
     *     that silently dashed plan would re-open the exact bug L-277 closed.
     *   • `'dashed'` — ELEVATION and SECTION, at the founder's explicit instruction. This is the
     *     override clause his own spec carries (*"never dashed, unless explicitly overridden"*),
     *     and it lives HERE — as per-view-type INTENT DATA on the one classifier every consumer
     *     already reads — rather than as an `if (isElevation)` inside a renderer. Same shape,
     *     same file, same reasoning as `occlusionDisposition` above (L-279).
     *
     * IT DOES NOT RE-OPEN L-277. That bug was dashing by DISTANCE: far-but-VISIBLE geometry drawn
     * as if something were in front of it, because depth and occlusion shared one bucket. The
     * buckets are still separate; this is a deliberate, view-scoped STYLE, chosen by the user.
     *
     * *** AND IT IS ONLY SAFE BECAUSE `beyond` AND `hidden` ARE NOW TELLABLE APART. *** They carry
     * the SAME WIDTH (0.09 mm) and differ by DASH — so `beyond` dashes with the LONG
     * `BEYOND_DASH_PX` [8,4] and `hidden` keeps the fine `HIDDEN_DASH_PX` [4,3]. Dash it without
     * that separation and the drawing GAINS A DASH AND LOSES A DISTINCTION: a stair's lower run
     * would read exactly like a pipe behind a wall, in precisely the views he asked for.
     */
    beyondLineStyle: BeyondLineStyle;
}

/** Plan-family view types for scope purposes — PLAN_VIEW_TYPES plus `detail`
 *  (a callout is an enlarged plan region and shares plan cut/poché semantics). */
const _PLAN_FAMILY_TYPES: ReadonlySet<string> = new Set<string>([
    ...PLAN_VIEW_TYPES,
    'detail',
]);

const _ELEVATION_SCOPE: ViewScope = Object.freeze({
    // §ELEVATION-POCHE-IS-INTENT-DECLARED (L-1601) — `poche` is now TRUE, but gated:
    // see `pocheRequiresExplicitIntent`. `cut` stays FALSE — it selects
    // EdgeProjectorService's SECTION routing branch, and the elevation branch (L-182)
    // already emits its own `:cut` linework for geometry the plane genuinely slices.
    poche: true, pocheRequiresExplicitIntent: true, cut: false, depthProjected: true, planFamily: false,
    // L-190: set-back geometry on a façade reads DASHED, not deleted — the viewer wants to
    // see the recessed wing behind the front plane.
    occlusionDisposition: 'demote' as const,
    // L-290 (founder, explicit): an elevation's receding geometry reads DASHED.
    beyondLineStyle: 'dashed' as const,
});
const _SECTION_SCOPE: ViewScope = Object.freeze({
    poche: true, pocheRequiresExplicitIntent: false, cut: true, depthProjected: true, planFamily: false,
    occlusionDisposition: 'remove' as const,
    // L-290 (founder, explicit): a section's geometry behind the cut plane reads DASHED.
    beyondLineStyle: 'dashed' as const,
});
const _PLAN_SCOPE: ViewScope = Object.freeze({
    poche: true, pocheRequiresExplicitIntent: false, cut: true, depthProjected: false, planFamily: true,
    occlusionDisposition: 'remove' as const,
    // L-290: PLAN KEEPS BEYOND SOLID. The founder's stair — its lower run is DELIBERATELY SHOWN
    // and is not behind anything. This line is L-277, and L-290 must not touch it.
    beyondLineStyle: 'solid' as const,
});
const _NON_TECHNICAL_SCOPE: ViewScope = Object.freeze({
    poche: false, pocheRequiresExplicitIntent: false, cut: false, depthProjected: false, planFamily: false,
    occlusionDisposition: 'remove' as const,
    beyondLineStyle: 'solid' as const,
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

/**
 * §FEAT-VIEW-OCCLUSION-DISPOSITION (L-279) — resolve what happens to an OCCLUDED line
 * for a SPECIFIC view. Closes the first open cell of C09 §4.6.7.
 *
 * PRECEDENCE — instance beats type beats default, the same shape as every other resolver
 * in this codebase (C11 §3, and `resolveWindowDimensions` / `resolveEffectiveDetailLevel`
 * before it):
 *
 *     the VIEW's own `output.occlusionDisposition`   (an explicit act of intent, P7)
 *       → the view TYPE's default on `ViewScope`     (elevation 'demote', plan/section 'remove')
 *
 * `undefined` on the view means "I have no opinion" — and the ONLY correct reading of that
 * is to inherit the type default, so a view that has never been touched behaves EXACTLY as
 * it does today. A resolver that silently substituted its own preference here would be the
 * `DetailLevelResolver` bug again (it re-forked `DEFAULT_DETAIL_LEVEL = 'medium'` against
 * the schema's `'fine'`, and the two disagreed for months).
 *
 * This function is the ONE place the choice is made. The projector must not read
 * `scope.occlusionDisposition` directly any more — if it does, a per-view override is
 * silently ignored, and the user's setting becomes a lie.
 */
export function resolveOcclusionDisposition(
    viewOutput: { occlusionDisposition?: OcclusionDisposition } | undefined,
    scope: ViewScope,
): OcclusionDisposition {
    return viewOutput?.occlusionDisposition ?? scope.occlusionDisposition;
}

/**
 * §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) — resolve how a SPECIFIC view draws the `beyond` zone.
 *
 * PRECEDENCE — instance beats type beats default, the SAME shape as `resolveOcclusionDisposition`
 * above (and `resolveWindowDimensions` / `resolveEffectiveDetailLevel` before it). This is not a
 * new mechanism; L-279 built the channel and L-290 reuses it, which is the whole point:
 *
 *     the VIEW's own `output.beyondLineStyle`   (an explicit act of intent, P7)
 *       → the view TYPE's default on `ViewScope` (elevation/section 'dashed', plan 'solid')
 *
 * `undefined` on the view means "I have no opinion", and the only correct reading of that is to
 * inherit the type default — so a view nobody has touched behaves exactly as its type says.
 *
 * This function is the ONE place the choice is made. A renderer that reads
 * `scope.beyondLineStyle` directly silently ignores the per-view override, and the user's
 * setting becomes a lie.
 */
export function resolveBeyondLineStyle(
    viewOutput: { beyondLineStyle?: BeyondLineStyle } | undefined,
    scope: ViewScope,
): BeyondLineStyle {
    return viewOutput?.beyondLineStyle ?? scope.beyondLineStyle;
}
