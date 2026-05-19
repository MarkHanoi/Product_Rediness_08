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
 * Write access: ViewController._mountDrawing() and ._unmountDrawing() only.
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
