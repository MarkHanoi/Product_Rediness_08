/**
 * ActivePlanDrawingRef — DOC-5.2
 *
 * A lightweight mutable pointer to the currently mounted TechnicalDrawing.
 *
 * ─── THIS IS NOT A PRYZM STORE ────────────────────────────────────────────────
 * - Not registered in StoreRegistry.
 * - Does not participate in undo/redo.
 * - Not serialised / not persisted to project file.
 * - Purely a rendering-layer cross-reference — analogous to ElementRegistry.
 *
 * Contract compliance:
 *   §01 §5 — The TechnicalDrawing (which wraps a THREE.Group) is held here
 *             only as a rendering-layer reference; not exposed to the Command system.
 *   §02 §6.1 — Tools may read from this to query geometry for snapping;
 *               they may NOT write to it or modify the drawing.
 *
 * Write access — there are two mutually-exclusive plan-render paths, partitioned by
 * which renderer is active, so exactly one owner writes this ref at any time:
 *
 *   1. ViewController._mountDrawing() / ._unmountDrawing() — owns the ref for the
 *      3D-scene-mounted TechnicalDrawing overlay path. NOTE: _mountDrawing()
 *      early-returns to a Canvas2D branch (skipping scene.add) when the
 *      PlanViewManager is active, deferring the ref's lifecycle to it (below).
 *   2. PlanViewManager — owns the ref across the Canvas2D plan-view lifecycle:
 *      it SETS the ref when a (warm or freshly projected) drawing becomes ready
 *      and CLEARS it on deactivate / level-switch / projection invalidation /
 *      failure fallback. This is by design, not a rogue writer: ViewController
 *      abdicates the ref for the Canvas2D path, so PlanViewManager must manage it.
 *
 * (§FIX-STAIR-PLAN-ROUTING-VIEWSTATE, L-217 — header corrected to match code; the
 * two paths never run simultaneously, preserving a single-active-writer invariant.)
 *
 * Read access:  Tool layer (PlanView2DSnapService query) only.
 */

import type * as OBC from '@thatopen/components';

export interface ActivePlanDrawingRef {
    /** The currently mounted TechnicalDrawing, or null when no plan view is active. */
    drawing: OBC.TechnicalDrawing | null;
}

export const activePlanDrawingRef: ActivePlanDrawingRef = {
    drawing: null,
};
