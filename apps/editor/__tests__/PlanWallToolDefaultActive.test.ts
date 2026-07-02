// @vitest-environment happy-dom
//
// §FIX-PLAN-WALLTOOL-DEFAULT-ACTIVE (L-28) — the plan-view wall tool must be
// active-by-default with the DEFAULT (Plain Wall) type pre-applied, exactly like
// the 3D wall tool: pressing WA / activating the tool arms the draw handler
// immediately and the FIRST pointer-down on the plan canvas sets the first wall
// point — NO "Apply" click on the wall-type picker is required first.
//
// The founder's L-28 defect was that the plan "Select Wall Type" pre-draw panel
// (with its prominent Apply button + "Choose a type, then click on the canvas to
// draw" copy) made it appear an Apply was REQUIRED before drawing. In reality the
// handler was always armed; only the copy gated. This test locks in the real
// contract: activate → first click registers the start point → subsequent click
// commits a Plain Wall (no systemTypeId, default thickness 0.2) with no Apply.
//
// Scope: WallPlanToolHandler arming + first-point registration + default-type
// commit. Does NOT touch WallTool.ts / WallAlignmentGuide.ts / join geometry.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallPlanToolHandler } from '../src/engine/views/plantools/WallPlanToolHandler';
import type { PlanToolDrawContext, WorldPoint } from '../src/engine/views/plantools/PlanToolHandler';

// ── Minimal PlanToolDrawContext scaffold ───────────────────────────────────────
function makeCtx(): PlanToolDrawContext {
    const overlay = document.createElement('canvas');
    overlay.width = 800;
    overlay.height = 600;
    // happy-dom does not implement a real Canvas2D backend, so getContext('2d')
    // returns null. The handler only issues fire-and-forget draw calls during
    // preview/clear — none of them are load-bearing for this test — so a no-op
    // 2D-context stub is sufficient and keeps the test backend-free.
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
        get(_t, prop) {
            if (prop === 'measureText') return () => ({ width: 0 });
            if (prop === 'canvas') return overlay;
            // Any drawing property/method → return a no-op fn; reads return the fn too,
            // which is harmless because the handler only calls or assigns these.
            return () => undefined;
        },
        set() { return true; },
    });

    // planCanvas only needs the projection helpers the handler calls during preview.
    const planCanvas = {
        worldToScreen: (x: number, z: number) => ({ sx: x, sy: z }),
        screenToWorld: (sx: number, sy: number) => ({ worldX: sx, worldZ: sy }),
        getPixelsPerUnit: () => 50,
    };

    return {
        overlayCanvas: overlay,
        baseCanvas: overlay,
        ctx,
        planCanvas: planCanvas as never,
        interaction: {} as never,
        viewDef: { id: 'plan-1', spatial: { levelId: 'level-ground' } } as never,
        dpr: 1,
        viewPlane: {} as never,
        commandManager: undefined as never,
        wallStore: undefined as never,
        runtime: undefined,
        activeOpeningTool: undefined,
    } as PlanToolDrawContext;
}

const A: WorldPoint = { worldX: 0, worldZ: 0 };
const B: WorldPoint = { worldX: 5, worldZ: 0 };

let executeCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
    executeCommand = vi.fn(() => ({ catch: () => {} }));
    // The bus the handler dispatches wall.create through (§P2.1 bus-only path).
    (window as any).runtime = { bus: { executeCommand } };
    // Mode picker defaults to 'linear' (continuous straight) — provided so the
    // handler reads a real mode instead of relying only on the ?? fallback.
    (window as any).wallModePicker = { getActiveMode: () => 'linear' };
    // §R3-SENTINEL guard in the overlay is not exercised here (we drive the handler
    // directly), but keep the init flag truthy for parity with the live path.
    (window as any).__pryzmInitComplete = true;
});

afterEach(() => {
    delete (window as any).runtime;
    delete (window as any).wallModePicker;
    delete (window as any).wallTool;
    delete (window as any).__pryzmInitComplete;
    vi.restoreAllMocks();
});

describe('§FIX-PLAN-WALLTOOL-DEFAULT-ACTIVE (L-28) — plan wall tool armed by default', () => {
    it('registers the first point on the very first click with NO Apply / no type set', () => {
        // No window.wallTool and no setSystemTypeId call — i.e. the user did NOT
        // click Apply on the pre-draw panel. This is the exact scenario L-28 says
        // must "just work" (default Plain Wall), matching the 3D tool.
        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());

        // Idle before any click.
        expect(handler.hasActiveStroke()).toBe(false);

        // First pointer-down → sets the polyline start point (no commit yet).
        handler.onClick(A);
        expect(handler.hasActiveStroke()).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();

        handler.deactivate();
    });

    it('commits a Plain Wall (default type, thickness 0.2) with no Apply click', () => {
        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());

        handler.onClick(A); // start point
        handler.onClick(B); // second click → commit segment A→B

        expect(executeCommand).toHaveBeenCalledTimes(1);
        const [cmd, payload] = executeCommand.mock.calls[0];
        expect(cmd).toBe('wall.create');
        // Default type = Plain Wall ⇒ systemTypeId is OMITTED from the payload.
        expect('systemTypeId' in payload).toBe(false);
        // Matches the 3D default the founder cited: thickness 0.2.
        expect(payload.thickness).toBeCloseTo(0.2, 6);
        expect(payload.levelId).toBe('level-ground');

        handler.deactivate();
    });

    it('honours a mid-session type switch WITHOUT blocking the initial draw', () => {
        // The type picker stays live (apply-on-change). Switching type sets it on the
        // canonical wall tool; the NEXT committed segment carries it. The initial draw
        // was never blocked on this.
        (window as any).wallTool = {
            _id: undefined as string | undefined,
            getSystemTypeId() { return this._id; },
            setSystemTypeId(id: string | undefined) { this._id = id; },
        };

        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());

        handler.onClick(A); // start immediately — no Apply needed
        expect(handler.hasActiveStroke()).toBe(true);

        // User switches type mid-session (picker apply-on-change → setSystemTypeId).
        (window as any).wallTool.setSystemTypeId('wt-concrete-200');
        handler.onClick(B); // commit the segment with the switched type

        const [, payload] = executeCommand.mock.calls[0];
        expect(payload.systemTypeId).toBe('wt-concrete-200');

        handler.deactivate();
    });
});
