/**
 * planProjectionDecision — should a plan driver PROJECT this view, or BLANK it?
 *
 * §PLAN-SYMBOL-ONLY-STOREY (L-13310) · C114 §10 (plan leg) · C04 §3.3 / DOC-1.4 · C84 EI-9.
 *
 * Founder, 2026-09-11: *"the envelopes (no matter if created on plan view or 3d view) dont render
 * on plan view - they should!"*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS EXISTS: FIVE DRIVERS ASKED "IS THERE ANYTHING TO PROJECT?" OF THE WRONG INPUTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `initScene._reprojectView`, `PlanViewManager._ensureProjection`,
 * `PlanViewManager._reprojectActiveViewDoubleBuffered`,
 * `PlanViewManager._ensureProjectionForSplitView` and `ViewController.requestBackgroundProjection`
 * each skipped `EdgeProjectorService.project()` when the OBC models, the native mesh groups and
 * the IFC/Rhino scene groups were all empty. That is right for a family drawn FROM A MESH and
 * wrong for a family drawn by a SYMBOL INJECTOR, which contributes no group at all: a committed
 * space envelope is never a native group (`NativeElementMeshExporter.exportForView` skips any id
 * with no `elementRegistry` root, and the prism registers none), so on a storey holding only
 * envelopes — every storey *Create all blocks* adds — `project()` never ran, the injector inside
 * it (`spaceEnvelopePlanSymbolBuilder.inject`) was never called, and the plan was BLANKED.
 *
 * ⛔ THE FIX IS NOT TO REGISTER THE PRISM AS A NATIVE ROOT. `exportForView` would then edge-project
 * the prism's faces as well, drawing the A-AREA outline twice. The symbol is already the family's
 * plan representation; the drivers only had to stop refusing to run it.
 *
 * ⭐ ONE DECISION, FIVE CALLERS. A sixth copy of the guard would re-open the defect in whichever
 * driver the founder happens to be looking at ([[same-rule-two-implementations]]).
 *
 * PURE apart from the one live read of the installed plan reader — no THREE of its own, no DOM.
 */

import {
    SPACE_ENVELOPE_PLAN_VIEW_TYPES,
    spaceEnvelopePlanSymbolBuilder,
} from '../SpaceEnvelopePlanSymbolBuilder';

/** `'blank'` ⇒ the correct content is NOTHING (the drivers invalidate). */
export type PlanProjectionDecision = 'project' | 'blank';

/** How many inputs of each SOURCE the driver collected for this view. */
export interface PlanProjectionSources {
    readonly models: number;
    readonly nativeGroups: number;
    readonly ifcSceneGroups: number;
}

/** The fields of a view this decision reads. Structural, so every driver's view type fits. */
export interface PlanProjectionView {
    readonly viewType: string;
    readonly spatial?: { readonly levelId?: string | null } | null;
}

/**
 * Does this view carry content that ONLY a symbol injector draws — today, committed space
 * envelopes on its storey? Reads the installed plan reader LIVE (never a snapshot), through
 * `planLinework`, the exact producer `inject()` emits from, so "the driver ran" and "the injector
 * had something to draw" cannot disagree.
 */
export function hasPlanSymbolOnlyContent(view: PlanProjectionView): boolean {
    if (!SPACE_ENVELOPE_PLAN_VIEW_TYPES.has(view.viewType)) return false;
    const levelId = view.spatial?.levelId;
    if (typeof levelId !== 'string' || levelId.length === 0) return false;
    try {
        return spaceEnvelopePlanSymbolBuilder.planLinework(levelId).linework.length > 0;
    } catch (err) {
        // A reader that throws must not take a plan down — but it is not "nothing to draw".
        console.warn('[planProjectionDecision] §PLAN-SYMBOL-ONLY-STOREY plan reader threw (non-fatal):', err);
        return false;
    }
}

/**
 * The ONE project-or-blank answer every plan driver asks before `EdgeProjectorService.project()`.
 * Any collected source ⇒ project. None ⇒ project only when a symbol injector has content here.
 */
export function decidePlanProjection(
    view: PlanProjectionView,
    sources: PlanProjectionSources,
): PlanProjectionDecision {
    if (sources.models > 0 || sources.nativeGroups > 0 || sources.ifcSceneGroups > 0) return 'project';
    return hasPlanSymbolOnlyContent(view) ? 'project' : 'blank';
}
