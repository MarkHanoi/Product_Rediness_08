// @vitest-environment happy-dom
//
// §FIX-PLAN-WALL-TYPE-IGNORED (L-41) — a wall drawn in PLAN view must COMMIT with the
// picker-selected system type: the chosen `systemTypeId` AND that type's resolved
// thickness (read from the SAME catalogue the pre-draw picker is populated from,
// window.wallSystemTypeStore). Before this fix the plan handler always dispatched
// WALL_DEFAULT_THICKNESS and relied on the wall.create handler to override it from
// systemTypeId — but the authoritative handler's catalogue does not match the picker's,
// so the override no-oped and every typed plan wall was stored at the default 0.2 m
// ("Plain Wall"). Resolving the thickness at the plan commit makes the stored wall
// correct for every view, independent of handler/catalogue wiring.
//
// Scope: WallPlanToolHandler._commitWall thickness resolution. Does NOT touch
// WallTool.ts / join geometry / the command handler.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallPlanToolHandler } from '../src/engine/views/plantools/WallPlanToolHandler';
import type { PlanToolDrawContext, WorldPoint } from '../src/engine/views/plantools/PlanToolHandler';

// ── Minimal PlanToolDrawContext scaffold (mirrors PlanWallToolDefaultActive.test.ts) ──
function makeCtx(): PlanToolDrawContext {
    const overlay = document.createElement('canvas');
    overlay.width = 800;
    overlay.height = 600;
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
        get(_t, prop) {
            if (prop === 'measureText') return () => ({ width: 0 });
            if (prop === 'canvas') return overlay;
            return () => undefined;
        },
        set() { return true; },
    });
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
    (window as any).runtime = { bus: { executeCommand } };
    (window as any).wallModePicker = { getActiveMode: () => 'linear' };
    (window as any).__pryzmInitComplete = true;
});

afterEach(() => {
    delete (window as any).runtime;
    delete (window as any).wallModePicker;
    delete (window as any).wallTool;
    delete (window as any).wallSystemTypeStore;
    delete (window as any).__pryzmInitComplete;
    vi.restoreAllMocks();
});

describe('§FIX-PLAN-WALL-TYPE-IGNORED (L-41) — plan wall commits the picked type + thickness', () => {
    it('commits the SELECTED type id AND its resolved thickness (not the default)', () => {
        // The picker wrote the chosen type to the canonical window.wallTool; the type's
        // dimensions live in window.wallSystemTypeStore (the store the picker dropdown reads).
        (window as any).wallTool = {
            getSystemTypeId() { return 'wt-interior-partition'; },
            setSystemTypeId() { /* no-op for this test */ },
        };
        (window as any).wallSystemTypeStore = {
            // Interior partition = 100 mm, distinct from the 200 mm placeholder default.
            getTotalThickness: (id: string) => (id === 'wt-interior-partition' ? 0.1 : null),
        };

        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(A); // start point
        handler.onClick(B); // commit A→B

        expect(executeCommand).toHaveBeenCalledTimes(1);
        const [cmd, payload] = executeCommand.mock.calls[0];
        expect(cmd).toBe('wall.create');
        // The picked type is carried…
        expect(payload.systemTypeId).toBe('wt-interior-partition');
        // …and the STORED thickness is the type's, not WALL_DEFAULT_THICKNESS (0.2).
        expect(payload.thickness).toBeCloseTo(0.1, 6);

        handler.deactivate();
    });

    it('falls back to the default thickness when no type is selected (L-28 default intact)', () => {
        // No systemTypeId set → helper returns WALL_DEFAULT_THICKNESS; systemTypeId omitted.
        (window as any).wallTool = {
            getSystemTypeId() { return undefined; },
            setSystemTypeId() { /* no-op */ },
        };
        (window as any).wallSystemTypeStore = {
            getTotalThickness: () => null,
        };

        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(A);
        handler.onClick(B);

        const [, payload] = executeCommand.mock.calls[0];
        expect('systemTypeId' in payload).toBe(false);
        expect(payload.thickness).toBeCloseTo(0.2, 6);

        handler.deactivate();
    });

    it('falls back to the default thickness when the type is unknown to the catalogue', () => {
        // Guards the id-namespace-mismatch case: a picked id the store cannot resolve must
        // NOT store an invalid/zero thickness — it keeps the safe placeholder default while
        // still carrying the id for downstream type-keyed rendering.
        (window as any).wallTool = {
            getSystemTypeId() { return 'wt-does-not-exist'; },
            setSystemTypeId() { /* no-op */ },
        };
        (window as any).wallSystemTypeStore = {
            getTotalThickness: () => null,
        };

        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(A);
        handler.onClick(B);

        const [, payload] = executeCommand.mock.calls[0];
        expect(payload.systemTypeId).toBe('wt-does-not-exist');
        expect(payload.thickness).toBeCloseTo(0.2, 6);

        handler.deactivate();
    });
});
