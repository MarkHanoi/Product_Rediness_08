/**
 * stairSketchRouting — §FIX-STAIR-PLAN-ROUTING-VIEWSTATE (L-217)
 *
 * Pure decision helper for the stair-creation pipeline (C11): decide whether the
 * stair footprint should be authored via the 3D sketch handler
 * (SPEC-STAIR-3D-CREATION #101, `StairPath3DToolHandler`) or the plan / legacy
 * plan-tool path (`StairPathPlanToolHandler` / `toolManager.activateStairPath`).
 *
 * ─── Why this exists ──────────────────────────────────────────────────────────
 * The routing decision MUST be made on the AUTHORITATIVE view mode
 * (`ViewController.viewMode`), never on snap availability. The prior guard asked
 * `planView2DCreationMode.isInPlanView(camera)` — a predicate that answers "is a
 * 2D snap drawing mounted?" (orthographic camera AND a `TechnicalDrawing`), NOT
 * "is the active view a plan view?". Whenever the drawing was absent (e.g. right
 * after a split-view / plan teardown nulls `activePlanDrawingRef`) that guard
 * mis-concluded "3D" over an orthographic plan camera and bound the 3D sketch
 * handler, so nothing was created.
 *
 * ─── Which modes host a stair sketch ──────────────────────────────────────────
 * A stair footprint is authored on a HORIZONTAL plane:
 *   - `'3D'`                              → 3D sketch handler (perspective view).
 *   - `'Top'` | `'Ceiling'` | `'ceiling-plan'`
 *                                          → top-down plan; author via the plan
 *                                            tool handlers (horizontal plane is
 *                                            valid). These return `false` here.
 *   - `'Front'` | `'Back'` | `'Left'` | `'Right'`
 *                                          → vertical elevation / section views.
 *                                            A horizontal footprint cannot be
 *                                            drawn here, so we must NOT bind the
 *                                            3D handler over their camera (that is
 *                                            the exact regression class). They
 *                                            return `false` and fall through to
 *                                            the plan / legacy path, which a future
 *                                            guard may block outright — out of
 *                                            scope for L-217.
 *
 * The 3D sketch handler is therefore bound for the `'3D'` view ONLY.
 *
 * `cameraIsPerspective` is a fallback signal consulted ONLY when the view mode is
 * unavailable (e.g. the ViewController is not yet reachable): a perspective camera
 * is unambiguously the 3D view. When the view mode is known it is authoritative
 * and the camera is ignored — note elevation presets also use a perspective
 * projection (ViewController snaps the camera to a named direction), so the camera
 * alone cannot distinguish 3D from an elevation; only the view mode can.
 */

import type { ViewMode } from '@pryzm/core-app-model';

/**
 * @param viewMode            The authoritative active view mode from
 *                            `ViewController.viewMode` / `.currentMode`, or
 *                            `undefined` when the ViewController is unreachable.
 * @param cameraIsPerspective Fallback signal (`camera.isPerspectiveCamera`) used
 *                            only when `viewMode` is `undefined`.
 * @returns `true` when the stair should be sketched via the 3D handler.
 */
export function shouldSketchStairIn3D(
    viewMode: ViewMode | undefined,
    cameraIsPerspective: boolean,
): boolean {
    if (viewMode !== undefined) return viewMode === '3D';
    // View mode unknown (exceptional): fall back to the camera. A perspective
    // camera is the 3D view in the common case.
    return cameraIsPerspective;
}
