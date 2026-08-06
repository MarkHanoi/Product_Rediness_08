/**
 * §FIX-STAIR-DUAL-VIEW-ACTIVATION — C11 element-creation pipeline / C03 (one command path).
 *
 * The founder's regression: stair creation used to work in PLAN view; after the 3D
 * sketch handler landed (b930270b `stair-path 3D tool`, hardened by a39b1f0e which
 * removed the 3D handler's "two pre-existing levels" decline) it worked ONLY in 3D.
 *
 * Root cause: `BimService.activateStairPathTool` treated `shouldSketchStairIn3D()` as
 * an EXCLUSIVE router — when the answer was "3D" it returned WITHOUT ever arming the
 * plan-tool path. In the founder's default layout (split view: 3D main viewport + plan
 * pane) the authoritative `ViewController.currentMode` is '3D', so the plan pane could
 * never author a stair. `StairPathPlanToolHandler` was fully authored and registered in
 * `planToolHandlerRegistry` — authored, but UNREACHABLE.
 *
 * Every healthy element tool arms BOTH surfaces in parallel (PlanViewToolOverlay.attach()
 * — "the 3D placement tools that are armed in parallel"; `activateWallTool` just calls
 * `toolManager.activateWall()` while WallTool binds the 3D canvas), and the canvas under
 * the pointer decides who receives the interaction. These tests pin that contract at the
 * one chokepoint `activateStairSketchSurfaces()`, which `BimService.activateStairPathTool`
 * now delegates to.
 *
 * Before the fix these fail: case (a) and case (c) never call `armPlan`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ViewMode } from '@pryzm/core-app-model';
import { activateStairSketchSurfaces, shouldSketchStairIn3D } from '../src/engine/stairSketchRouting';

function surfaces(opts: { arm3DResult?: boolean; armPlanResult?: boolean } = {}) {
    const arm3D    = vi.fn(() => opts.arm3DResult    ?? true);
    const armPlan  = vi.fn(() => opts.armPlanResult  ?? true);
    const fallback = vi.fn();
    return { arm3D, armPlan, fallback };
}

describe('stair dual-view activation — plan AND 3D must both arm (C11)', () => {
    it('(a) SPLIT VIEW OPEN (3D main viewport + plan pane): BOTH surfaces arm', () => {
        // In split view the ViewController mode is '3D' — the plan pane is a SECONDARY
        // surface and never changes `currentMode`. This is the exact founder layout.
        const s = surfaces();
        const r = activateStairSketchSurfaces('3D' as ViewMode, true, s, 'L');

        expect(s.arm3D).toHaveBeenCalledWith('L');       // anti-regression: 3D still armed
        expect(s.armPlan).toHaveBeenCalledWith('L');     // THE FIX: plan pane reachable
        expect(r).toEqual({ armed3D: true, armedPlan: true, usedFallback: false });
        expect(s.fallback).not.toHaveBeenCalled();
    });

    it('(b) PLAN VIEW ALONE, full screen: the plan path arms and the 3D handler does NOT', () => {
        const s = surfaces();
        const r = activateStairSketchSurfaces('Top' as ViewMode, false, s, 'I');

        expect(s.arm3D).not.toHaveBeenCalled();
        expect(s.armPlan).toHaveBeenCalledWith('I');
        expect(r).toEqual({ armed3D: false, armedPlan: true, usedFallback: false });
    });

    it('(c) 3D VIEW ALONE, full screen: the 3D handler arms (anti-regression)', () => {
        const s = surfaces();
        const r = activateStairSketchSurfaces('3D' as ViewMode, true, s, 'U');

        expect(s.arm3D).toHaveBeenCalledWith('U');
        expect(r.armed3D).toBe(true);
        // Arming plan is a no-op when no plan surface is attached (both overlays bail
        // in `_activateHandler` / `setActiveTool` when `!this._active`), and it is what
        // makes the split-view case work — so it is unconditional.
        expect(s.armPlan).toHaveBeenCalledWith('U');
    });

    it('ceiling-plan / Ceiling modes route to the plan path, never the 3D sketch', () => {
        for (const mode of ['Ceiling', 'ceiling-plan'] as ViewMode[]) {
            const s = surfaces();
            activateStairSketchSurfaces(mode, false, s, 'L');
            expect(s.arm3D, mode).not.toHaveBeenCalled();
            expect(s.armPlan, mode).toHaveBeenCalledWith('L');
        }
    });

    it('elevation/section modes never bind the 3D sketch over their camera (L-217 class)', () => {
        for (const mode of ['Front', 'Back', 'Left', 'Right'] as ViewMode[]) {
            const s = surfaces();
            // Elevation presets also use a PERSPECTIVE camera — the camera alone cannot
            // distinguish them from 3D, only the view mode can.
            activateStairSketchSurfaces(mode, true, s, 'I');
            expect(s.arm3D, mode).not.toHaveBeenCalled();
            expect(s.armPlan, mode).toHaveBeenCalledWith('I');
        }
    });

    it('a DECLINED 3D activation still leaves the plan path armed — no dead end', () => {
        const s = surfaces({ arm3DResult: false });
        const r = activateStairSketchSurfaces('3D' as ViewMode, true, s, 'I');

        expect(s.arm3D).toHaveBeenCalled();
        expect(s.armPlan).toHaveBeenCalled();
        expect(r).toEqual({ armed3D: false, armedPlan: true, usedFallback: false });
        expect(s.fallback).not.toHaveBeenCalled();
    });

    it('falls back to the legacy modal ONLY when neither surface could be armed', () => {
        const s = surfaces({ arm3DResult: false, armPlanResult: false });
        const r = activateStairSketchSurfaces('3D' as ViewMode, true, s, 'L');

        expect(r.usedFallback).toBe(true);
        expect(s.fallback).toHaveBeenCalledWith('L');
    });

    it('unknown view mode + perspective camera still arms 3D (documented fallback signal)', () => {
        const s = surfaces();
        activateStairSketchSurfaces(undefined, true, s, 'I');
        expect(s.arm3D).toHaveBeenCalled();
        expect(s.armPlan).toHaveBeenCalled();

        const s2 = surfaces();
        activateStairSketchSurfaces(undefined, false, s2, 'I');
        expect(s2.arm3D).not.toHaveBeenCalled();
        expect(s2.armPlan).toHaveBeenCalled();
    });

    it('the 3D gate predicate itself is unchanged (L-217 contract still holds)', () => {
        expect(shouldSketchStairIn3D('3D' as ViewMode, true)).toBe(true);
        expect(shouldSketchStairIn3D('Top' as ViewMode, true)).toBe(false);
    });
});
