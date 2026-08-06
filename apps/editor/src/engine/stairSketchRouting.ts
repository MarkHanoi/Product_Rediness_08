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

import { trace } from '@opentelemetry/api';
import type { ViewMode } from '@pryzm/core-app-model';

const _tracer = trace.getTracer('@pryzm/editor.stair-sketch-routing', '0.1.0');

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

/**
 * ─── §FIX-STAIR-DUAL-VIEW-ACTIVATION ─────────────────────────────────────────
 *
 * The surfaces a stair-tool activation must arm. C11 §element-creation pipeline.
 *
 * `shouldSketchStairIn3D` answers "does a 3D viewport host the sketch?". It was
 * being used as an EXCLUSIVE router — when the answer was "yes", `BimService`
 * returned WITHOUT arming the plan-tool path — and that is the regression the
 * founder reported: in the default split-view layout (3D main viewport + plan
 * pane) the authoritative `ViewController.currentMode` is `'3D'`, so the plan
 * pane could never author a stair even though `StairPathPlanToolHandler` was
 * fully authored and registered. Authored, but UNREACHABLE.
 *
 * Every healthy element tool arms BOTH surfaces in parallel — see
 * `PlanViewToolOverlay.attach()` ("the 3D placement tools that are armed in
 * parallel", L-129) and `BimService.activateWallTool`, which simply calls
 * `toolManager.activateWall()` while `WallTool` binds the 3D canvas. Whichever
 * canvas the pointer is over receives the interaction. The stair now does the
 * same, through the ONE `CreateStairCommand` both handlers already dispatch (C03
 * — one serialisable/undoable creation path, stable element id).
 *
 * The plan arm is unconditional: `ToolManager.activateStairPath()` only sets the
 * active-tool state and notifies; overlays that are not attached (3D full-screen)
 * simply no-op. The 3D arm stays gated on `shouldSketchStairIn3D` so we never
 * bind the 3D sketch over an elevation/section camera (the L-217 regression class)
 * and never disable camera-controls + SelectionManager for a hidden viewport.
 */
export interface StairSketchSurfaces {
    /** Arm the 3D sketch handler. Returns true when it took ownership. */
    arm3D(shape?: 'I' | 'L' | 'U'): boolean;
    /** Arm the plan-tool path (ToolManager → every attached plan surface). Returns true when reachable. */
    armPlan(shape?: 'I' | 'L' | 'U'): boolean;
    /** Legacy modal route, used only when NEITHER surface could be armed. */
    fallback(shape: 'I' | 'L' | 'U'): void;
}

export interface StairSketchActivation {
    armed3D: boolean;
    armedPlan: boolean;
    usedFallback: boolean;
}

/**
 * The single stair-tool activation chokepoint. Arms every surface that can host
 * the sketch for the current layout, so the view UNDER THE CURSOR decides which
 * handler receives the interaction rather than a pre-committed global guess.
 *
 * P8: emits `pryzm.stair.activate_sketch_surfaces`.
 */
export function activateStairSketchSurfaces(
    viewMode: ViewMode | undefined,
    cameraIsPerspective: boolean,
    surfaces: StairSketchSurfaces,
    shape?: 'I' | 'L' | 'U',
): StairSketchActivation {
    return _tracer.startActiveSpan('pryzm.stair.activate_sketch_surfaces', (span) => {
        try {
            const wants3D = shouldSketchStairIn3D(viewMode, cameraIsPerspective);
            span.setAttribute('pryzm.stair.view_mode', viewMode ?? 'unknown');
            span.setAttribute('pryzm.stair.wants_3d', wants3D);

            const armed3D = wants3D ? surfaces.arm3D(shape) === true : false;
            // ALWAYS arm the plan path — this is the fix. A 3D viewport being on
            // screen does not mean the architect is drawing in it.
            const armedPlan = surfaces.armPlan(shape) === true;

            const usedFallback = !armed3D && !armedPlan;
            if (usedFallback) surfaces.fallback(shape ?? 'I');

            span.setAttribute('pryzm.stair.armed_3d', armed3D);
            span.setAttribute('pryzm.stair.armed_plan', armedPlan);
            span.setAttribute('pryzm.stair.used_fallback', usedFallback);
            return { armed3D, armedPlan, usedFallback };
        } catch (err) {
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    });
}
