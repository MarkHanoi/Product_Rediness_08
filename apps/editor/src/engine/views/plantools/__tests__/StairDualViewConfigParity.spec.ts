/**
 * §FIX-STAIR-3D-CONFIG-DEAF — dual-view parity for the stair sketch.
 *
 * C11 (element creation pipeline). `activateStairSketchSurfaces()` arms BOTH the plan
 * tool and the 3D sketch handler in parallel, so the canvas under the pointer decides
 * which one authors the stair (§FIX-STAIR-DUAL-VIEW-ACTIVATION). That fix is only
 * sound if the two surfaces then produce the SAME stair — otherwise "whichever canvas
 * the pointer happened to be over" becomes a silent input to the result.
 *
 * They did not. `StairPathPlanToolHandler` resolves its config from
 * `ctx.stairConfig ?? getStairToolConfig()` — the StairToolConfigStore, whose own
 * header names it "THE SINGLE SOURCE OF TRUTH … EVERY creation path — plan, 3D,
 * path-tool, batch, AI — inherits it by construction". `StairPath3DToolHandler`
 * hard-coded `width: 1.2` and passed no `typeId` at all. `StairSetupPanel.onConfirm`
 * and the ribbon both WRITE the architect's shape / width / type into that store (see
 * `BimService`), so the 3D sketch path discarded a choice the user had just made — the
 * exact L-243 P2 defect, reappearing on the surface that post-dates its fix.
 *
 * These specs pin the parity at the seam that matters: the `StairPathToolController`
 * config each handler constructs. Before the fix, cases (1) and (2) fail.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Static, not dynamic-in-hook: the mocked module's first load transforms the whole
// geometry-stair graph and blew the 10 s hook timeout. `vi.mock` is hoisted above this
// import, so these bindings are the mocked module's — which spreads the real module, so
// the config store here is the genuine one.
import {
    setStairToolConfig,
    resetStairToolConfig,
} from '@pryzm/geometry-stair';
import { StairPath3DToolHandler } from '../StairPath3DToolHandler';

/** Captured `StairPathToolController` configs, newest last. */
const captured: Record<string, any>[] = [];

vi.mock('@pryzm/geometry-stair', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        // Replace ONLY the controller — the config store, the vertical-span resolver and
        // DEFAULT_STOREY_HEIGHT stay real, so this test exercises the handler's actual
        // config resolution rather than a re-implementation of it.
        StairPathToolController: class {
            constructor(config: Record<string, any>) { captured.push(config); }
            activate() { /* no-op */ }
            deactivate() { /* no-op */ }
            destroy() { /* no-op */ }
        },
    };
});

const LEVELS = [
    { id: 'L0', name: 'Ground', elevation: 0,   height: 3 },
    { id: 'L1', name: 'First',  elevation: 3,   height: 3 },
];

function activate3D(): Record<string, any> {
    const canvas = document.createElement('canvas');
    const handler = new StairPath3DToolHandler({
        getWorld: () => ({
            camera:   { three: {} as never },
            scene:    { three: {} as never },
            renderer: { three: { domElement: canvas } },
        }),
        commandManager: { execute: () => { /* no-op */ } },
        getActiveLevelId: () => 'L0',
        getLevels: () => LEVELS,
    });

    const ok = handler.activate('L');
    expect(ok, '3D handler declined to activate — the parity seam was never reached').toBe(true);
    handler.deactivate();
    return captured[captured.length - 1];
}

describe('stair dual-view parity — the 3D sketch honours StairToolConfigStore', () => {
    beforeEach(() => {
        captured.length = 0;
        resetStairToolConfig();
    });

    afterEach(() => {
        resetStairToolConfig();
    });

    it('(1) carries the architect\'s chosen WIDTH into the 3D sketch', () => {
        // Exactly what StairSetupPanel.onConfirm / the ribbon publish.
        setStairToolConfig({ width: 1.65 });

        const cfg = activate3D();
        // Before the fix this was the hard-coded 1.2 — the user's 1.65 m stair came out
        // at the default width with no warning.
        expect(cfg.width).toBe(1.65);
    });

    it('(2) carries the chosen stair TYPE into the 3D sketch', () => {
        setStairToolConfig({ typeId: 'steel-open-riser' });

        const cfg = activate3D();
        // Before the fix `typeId` was never passed, so a 3D-sketched stair was always
        // untyped and inherited none of its type's defaults.
        expect(cfg.typeId).toBe('steel-open-riser');
    });

    it('(3) falls back to the 1.2 m default when the architect chose no width', () => {
        const cfg = activate3D();
        expect(cfg.width).toBe(1.2);
        expect(cfg.typeId).toBeUndefined();
    });

    it('(4) the explicit ribbon shape still wins over the stored shape', () => {
        setStairToolConfig({ shape: 'U' });

        // activate3D() passes 'L' — the click that caused this activation.
        const cfg = activate3D();
        expect(cfg.initialShape).toBe('L');
    });

    it('(5) surfaces an invalid solve instead of swallowing it (plan-handler parity)', () => {
        const cfg = activate3D();
        // StairPathPlanToolHandler wires `onInvalid` to a toast; the 3D handler used to
        // pass nothing, so an unsolvable sketch died in the console and the architect
        // saw a tool that simply did nothing.
        expect(typeof cfg.onInvalid).toBe('function');
        expect(() => cfg.onInvalid('height is zero')).not.toThrow();
    });

    it('(6) both surfaces resolve their span through the SAME chokepoint', () => {
        // Not a re-implementation check: the levels the 3D handler resolves must be the
        // pair `resolveStairVerticalSpan` yields for the active level, which is the
        // function StairPathPlanToolHandler also calls (ADR-0098).
        const cfg = activate3D();
        expect(cfg.baseLevelId).toBe('L0');
        expect(cfg.topLevelId).toBe('L1');
        expect(cfg.baseLevelElevation).toBe(0);
        expect(cfg.topLevelElevation).toBe(3);
    });
});
