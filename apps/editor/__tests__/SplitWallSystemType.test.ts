// @vitest-environment happy-dom
//
// §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — a wall drawn in the SPLIT-view plan pane must carry
// the selected (layered / Interior) system type, exactly like the MAIN plan view — not
// come out PLAIN (systemTypeId=none).
//
// Root: the selection lived ONLY on the transient `window.wallTool` instance, which "can be
// a null/stale reference in some layout paths" (the split-view flow) → the handler read
// `window.wallTool.getSystemTypeId()` → undefined → `wall.create` dispatched systemTypeId=none
// → CreateWallCommand built a plain wall. The fix stores the selection in a stable,
// surface-independent module (`activeWallSystemType`) that both plan surfaces read at
// dispatch. This suite proves the WallPlanToolHandler (the shared split + main plan tool)
// threads the type from that store even when `window.wallTool` is unavailable.
//
// Scope: tool→command dispatch threading of systemTypeId. Does NOT touch wall geometry math.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallPlanToolHandler } from '../src/engine/views/plantools/WallPlanToolHandler';
import { setActiveWallSystemTypeId } from '../src/engine/views/plantools/activeWallSystemType';
import type { PlanToolDrawContext, WorldPoint } from '../src/engine/views/plantools/PlanToolHandler';

function makeCtx(): PlanToolDrawContext {
    const overlay = document.createElement('canvas');
    overlay.width = 800; overlay.height = 600;
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
        viewDef: { id: 'plan-1', spatial: { levelId: 'L0' } } as never,
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
    // Layered type catalogue — the picked Interior type resolves to a 0.1 m total thickness.
    (window as any).wallSystemTypeStore = { getTotalThickness: (id: string) => (id === 'wt-interior-partition' ? 0.1 : undefined) };
    setActiveWallSystemTypeId(undefined); // clean module-level store per test
});

afterEach(() => {
    setActiveWallSystemTypeId(undefined);
    delete (window as any).runtime;
    delete (window as any).wallModePicker;
    delete (window as any).wallTool;
    delete (window as any).wallSystemTypeStore;
    delete (window as any).__pryzmInitComplete;
    vi.restoreAllMocks();
});

describe('§FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — split plan pane threads the selected layered type', () => {
    it('threads the active Interior/layered systemTypeId even when window.wallTool is unavailable (the split stale-ref case)', () => {
        // Reproduces the split-view path: no usable window.wallTool, but the user picked
        // an Interior layered type (recorded in the stable store by the pre-draw picker).
        expect((window as any).wallTool).toBeUndefined();
        setActiveWallSystemTypeId('wt-interior-partition');

        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(A);
        handler.onClick(B);

        expect(executeCommand).toHaveBeenCalledTimes(1);
        const [cmd, payload] = executeCommand.mock.calls[0];
        expect(cmd).toBe('wall.create');
        // The layered composition reaches CreateWallCommand — NOT a plain wall.
        expect(payload.systemTypeId).toBe('wt-interior-partition');
        // Thickness resolved from the layered type's catalogue total (0.1 m), not the 0.2 default.
        expect(payload.thickness).toBeCloseTo(0.1, 6);

        handler.deactivate();
    });

    it('falls back to window.wallTool selection when the store was never written (MAIN-view backward-compat)', () => {
        (window as any).wallTool = { getSystemTypeId: () => 'wt-interior-partition' };
        // store intentionally left unset (undefined)

        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(A);
        handler.onClick(B);

        const [, payload] = executeCommand.mock.calls[0];
        expect(payload.systemTypeId).toBe('wt-interior-partition');

        handler.deactivate();
    });

    it('omits systemTypeId (Plain Wall) when nothing is selected on either source', () => {
        // No store, no wallTool → Plain Wall, default thickness.
        const handler = new WallPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(A);
        handler.onClick(B);

        const [, payload] = executeCommand.mock.calls[0];
        expect('systemTypeId' in payload).toBe(false);
        expect(payload.thickness).toBeCloseTo(0.2, 6);

        handler.deactivate();
    });
});
