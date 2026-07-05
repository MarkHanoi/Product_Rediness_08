// @vitest-environment happy-dom
//
// §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — the ContextualEditBar element tools
// (Move / Copy-place / Align) must work IDENTICALLY in the MAIN plan view
// (PlanViewToolOverlay) and the SPLIT-view plan pane (SvpPlanToolOverlay).
//
// The founder repro: select a window → ContextualEditBar 'Move' → the MoveTool commits
// MOVE_WINDOW in the MAIN plan view but did nothing in the SPLIT pane, because the bar
// routed `setActiveTool('move')` only to the main overlay and the SVP overlay had no
// setActiveTool. This suite pins the fix:
//   Part A — BOTH overlays expose setActiveTool + isAttached and activate the SAME handler
//            (from the shared planToolHandlerRegistry) when driven programmatically.
//   Part B — the MovePlanToolHandler that both overlays run is canvas-agnostic: moving a
//            selected window commits the SAME command (window.setOffset / MOVE_WINDOW)
//            regardless of which surface drove it.
//
// Scope: overlay setActiveTool/isAttached parity + the move-command path. Does NOT touch
// wall JOIN geometry (sole-wall lane).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanViewToolOverlay } from '../src/engine/views/PlanViewToolOverlay';
import { SvpPlanToolOverlay } from '../src/engine/views/SvpPlanToolOverlay';
import { MovePlanToolHandler } from '../src/engine/views/plantools/MovePlanToolHandler';
import type { PlanToolDrawContext, WorldPoint } from '../src/engine/views/plantools/PlanToolHandler';

// ── Part A: both overlays share the setActiveTool + isAttached API ──────────────
describe('§FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — main + split overlays expose the same element-tool API', () => {
    type OverlayLike = {
        _active: boolean;
        _activeTool: string;
        _activeHandler: unknown;
        _activateHandler: (tool: string) => void;
        isAttached(): boolean;
        setActiveTool(tool: string): void;
    };

    function harness(ov: OverlayLike) {
        // The fake handler carries a no-op `deactivate` so the overlay's own
        // `_deactivateHandler()` (which calls `_activeHandler?.deactivate()`) is safe
        // when we later switch the tool to 'none'.
        const activateSpy = vi.fn((tool: string) => { ov._activeHandler = { __tool: tool, deactivate: () => {} }; });
        ov._activateHandler = activateSpy as never;
        return activateSpy;
    }

    for (const [label, make] of [
        ['PlanViewToolOverlay (main)', () => new PlanViewToolOverlay() as unknown as OverlayLike],
        ['SvpPlanToolOverlay (split)', () => new SvpPlanToolOverlay() as unknown as OverlayLike],
    ] as const) {
        describe(label, () => {
            it('isAttached() reflects the attach state', () => {
                const ov = make();
                ov._active = false;
                expect(ov.isAttached()).toBe(false);
                ov._active = true;
                expect(ov.isAttached()).toBe(true);
            });

            it('setActiveTool("move") activates the move handler; setActiveTool("none") deactivates', () => {
                const ov = make();
                ov._active = true;
                ov._activeTool = 'none';
                ov._activeHandler = null;
                const activateSpy = harness(ov);

                ov.setActiveTool('move');
                expect(ov._activeTool).toBe('move');
                expect(activateSpy).toHaveBeenCalledWith('move');
                expect(ov._activeHandler).not.toBeNull();

                ov.setActiveTool('none');
                expect(ov._activeTool).toBe('none');
                // 'none' must NOT activate a handler (only deactivate).
                expect(activateSpy).toHaveBeenCalledTimes(1);
            });

            it('setActiveTool is a no-op when the overlay is not attached (caller routes to the active surface)', () => {
                const ov = make();
                ov._active = false;
                ov._activeHandler = null;
                const activateSpy = harness(ov);

                ov.setActiveTool('move');
                expect(activateSpy).not.toHaveBeenCalled();
            });
        });
    }
});

// ── Part B: the move handler commits the same command regardless of surface ─────
describe('§FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — moving a window commits window.setOffset (MOVE_WINDOW) on either surface', () => {
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

    let executeCommand: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        executeCommand = vi.fn(() => ({ catch: () => {} }));
        (window as any).runtime = { bus: { executeCommand } };
        // Selection = a window element (userData.id + elementType) — as ContextualEditBar 'Move' sets up.
        (window as any).selectionManager = {
            selectedObject: { userData: { id: 'window-1', elementType: 'window' }, parent: null },
        };
        // Host wall (0,0)→(4,0) with the hosted window at offset 1 m, width 1 m.
        const wall = { id: 'wall-1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] };
        const win = { id: 'window-1', wallId: 'wall-1', offset: 1, width: 1 };
        (window as any).wallStore = {
            getById:  (id: string) => (id === 'wall-1' ? wall : undefined),
            getWindow:(id: string) => (id === 'window-1' ? win : undefined),
            getDoor:  () => undefined,
        };
    });

    afterEach(() => {
        delete (window as any).runtime;
        delete (window as any).selectionManager;
        delete (window as any).wallStore;
        vi.restoreAllMocks();
    });

    it('two-click move of the selected window dispatches window.setOffset with the new offset', () => {
        const handler = new MovePlanToolHandler();
        handler.activate(makeCtx());          // reads the window selection

        const origin: WorldPoint = { worldX: 1, worldZ: 0 }; // where the window sits
        const dest:   WorldPoint = { worldX: 2, worldZ: 0 }; // slide +1 m along the wall
        handler.onClick(origin);              // set origin
        handler.onClick(dest);                // set destination → commit

        const call = executeCommand.mock.calls.find((c) => c[0] === 'window.setOffset');
        expect(call, 'expected a window.setOffset dispatch').toBeDefined();
        const payload = call![1] as { windowId: string; newOffset: number; prevOffset: number };
        expect(payload.windowId).toBe('window-1');
        expect(payload.prevOffset).toBeCloseTo(1, 6);
        expect(payload.newOffset).toBeCloseTo(2, 6);   // offset moved 1 → 2 (delta projected on the wall)

        handler.deactivate();
    });
});
