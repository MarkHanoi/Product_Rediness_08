/**
 * §FIX-STAIR-PLAN-ROUTING-VIEWSTATE (L-217) — stair-creation plan-vs-3D routing.
 *
 * Pins the DECISION that `BimService.activateStairPathTool` makes via
 * `shouldSketchStairIn3D`: the 3D sketch handler (SPEC-STAIR-3D-CREATION #101) is
 * bound for the perspective '3D' view ONLY. Every plan-like mode authors the stair
 * footprint on the plan tool handlers instead.
 *
 * The regression this guards: routing used to consult
 * `planView2DCreationMode.isInPlanView(camera)` — a snap-availability predicate
 * (orthographic camera AND a mounted TechnicalDrawing). When the drawing was absent
 * (e.g. right after a split-view / plan teardown nulls `activePlanDrawingRef`) an
 * orthographic plan view mis-routed to the 3D handler and nothing was created.
 * `shouldSketchStairIn3D` consults the AUTHORITATIVE view mode and never the
 * drawing ref, so the outcome is independent of snap/drawing state.
 */
import { describe, it, expect } from 'vitest';
import { shouldSketchStairIn3D } from '../src/engine/stairSketchRouting';

describe('shouldSketchStairIn3D — plan-vs-3D stair routing (L-217)', () => {
    it('routes the perspective 3D view to the 3D sketch handler', () => {
        // SPEC-STAIR-3D-CREATION #101 must keep working.
        expect(shouldSketchStairIn3D('3D', true)).toBe(true);
    });

    it('routes an orthographic plan view (Top) to the plan handler — THE regression', () => {
        // The camera is orthographic and NO drawing is mounted; the old predicate
        // would have concluded "3D". View-mode routing keeps it on the plan path.
        expect(shouldSketchStairIn3D('Top', false)).toBe(false);
    });

    it('keeps Top on the plan path regardless of the (unread) snap/drawing state', () => {
        // The decision does not consult activePlanDrawingRef, so a split-view teardown
        // that nulls the drawing ref cannot strand the main plan view in 3D-routing.
        // Both camera-flag values yield the same plan-path decision for 'Top'.
        expect(shouldSketchStairIn3D('Top', true)).toBe(false);
        expect(shouldSketchStairIn3D('Top', false)).toBe(false);
    });

    it('treats the ceiling-plan family as plan-like (horizontal footprint)', () => {
        expect(shouldSketchStairIn3D('Ceiling', false)).toBe(false);
        expect(shouldSketchStairIn3D('ceiling-plan', false)).toBe(false);
    });

    it('does NOT bind the 3D handler over an orthographic-projection elevation/section view', () => {
        // Front/Back/Left/Right are not plan views and cannot host a horizontal
        // footprint; the 3D handler must not be bound there. They fall through to
        // the plan / legacy path (a future guard may block stair creation outright).
        for (const mode of ['Front', 'Back', 'Left', 'Right'] as const) {
            expect(shouldSketchStairIn3D(mode, false)).toBe(false);
        }
    });

    it('falls back to the camera type only when the view mode is unavailable', () => {
        // ViewController unreachable (undefined view mode): a perspective camera is
        // the 3D view; an orthographic camera is not.
        expect(shouldSketchStairIn3D(undefined, true)).toBe(true);
        expect(shouldSketchStairIn3D(undefined, false)).toBe(false);
    });
});
