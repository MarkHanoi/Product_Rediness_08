/**
 * @vitest-environment happy-dom
 *
 * §FIX-STAIR-DUAL-VIEW-ACTIVATION — plan/3D focus arbitration.
 *
 * With plan AND 3D armed in parallel (the L-63x fix at
 * `activateStairSketchSurfaces`), the pane the pointer is over must own the sketch.
 * `SvpPlanToolOverlay` already broadcasts exactly that on mouseenter/mouseleave
 * (`svp:tool-focus` / `svp:tool-blur`), and `PlanViewToolOverlay` already consumes
 * the same pair to pause/resume. `StairPath3DToolHandler` now consumes it verbatim.
 *
 * This matters concretely: `StairPathToolController` mounts singleton DOM by id
 * (`#spt-param-panel`, `#spt-hud-bar`, `#spt-run-info`), so two live controllers
 * would collide. These tests pin "at most one live sketch, and 3D comes back".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StairPath3DToolHandler } from '../src/engine/views/plantools/StairPath3DToolHandler';

type Listener = (payload: unknown) => void;

function installEventBus() {
    const subs = new Map<string, Set<Listener>>();
    const bus = {
        on(topic: string, fn: Listener) {
            const set = subs.get(topic) ?? new Set<Listener>();
            set.add(fn);
            subs.set(topic, set);
            return { dispose: () => set.delete(fn) };
        },
        emit(topic: string, payload: unknown) {
            for (const fn of subs.get(topic) ?? []) fn(payload);
        },
    };
    (window as unknown as { runtime?: unknown }).runtime = { events: bus };
    return bus;
}

describe('StairPath3DToolHandler — plan/3D focus arbitration', () => {
    let handler: StairPath3DToolHandler;
    let bus: ReturnType<typeof installEventBus>;
    let activateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        bus = installEventBus();
        handler = new StairPath3DToolHandler({
            getWorld: () => null,          // forces activate() to decline cheaply
            commandManager: { execute: vi.fn() },
            getActiveLevelId: () => 'l0',
            getLevels: () => [{ id: 'l0', elevation: 0 }, { id: 'l1', elevation: 3 }],
        });
        activateSpy = vi.spyOn(handler, 'activate');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('suspendForPlanFocus() is a no-op when no sketch is live (never restores stale state)', () => {
        handler.suspendForPlanFocus();
        expect(handler.suspendedForPlanFocus).toBe(false);
        expect(handler.active).toBe(false);
    });

    it('resumeAfterPlanBlur() is a no-op when not suspended (no phantom re-arm)', () => {
        handler.resumeAfterPlanBlur();
        expect(activateSpy).not.toHaveBeenCalled();
    });

    it('a suspended handler re-arms with the SAME shape when the plan pane blurs', () => {
        // Simulate a live sketch: the handler was armed for an L stair.
        (handler as unknown as { _ctrl: unknown; _shape: string })._ctrl = { deactivate() {}, destroy() {} };
        (handler as unknown as { _shape: string })._shape = 'L';

        handler.suspendForPlanFocus();
        expect(handler.suspendedForPlanFocus).toBe(true);
        expect(handler.active).toBe(false);        // exactly one live controller

        handler.resumeAfterPlanBlur();
        expect(handler.suspendedForPlanFocus).toBe(false);
        expect(activateSpy).toHaveBeenCalledWith('L');
    });

    it('the split-view focus/blur broadcast drives the arbitration once bound', () => {
        (handler as unknown as { _ctrl: unknown })._ctrl = { deactivate() {}, destroy() {} };
        (handler as unknown as { _shape: string })._shape = 'U';
        (handler as unknown as { _bindPlanFocusArbitration(): void })._bindPlanFocusArbitration();

        bus.emit('svp:tool-focus', {});
        expect(handler.suspendedForPlanFocus).toBe(true);

        bus.emit('svp:tool-blur', {});
        expect(activateSpy).toHaveBeenCalledWith('U');
    });

    it('deactivate() unbinds the arbitration so a dead handler is never resurrected', () => {
        (handler as unknown as { _ctrl: unknown })._ctrl = { deactivate() {}, destroy() {} };
        (handler as unknown as { _bindPlanFocusArbitration(): void })._bindPlanFocusArbitration();

        handler.deactivate();
        activateSpy.mockClear();

        bus.emit('svp:tool-focus', {});
        bus.emit('svp:tool-blur', {});
        expect(activateSpy).not.toHaveBeenCalled();
        expect(handler.suspendedForPlanFocus).toBe(false);
    });

    it('deactivate() only clears window.stairPathTool when it still OWNS it', () => {
        const foreign = { state: 'idle' };
        (window as unknown as { stairPathTool?: unknown }).stairPathTool = foreign;
        (handler as unknown as { _publishedApi: unknown })._publishedApi = { state: 'idle' };

        handler.deactivate();

        // The plan handler's relay survives a 3D teardown.
        expect((window as unknown as { stairPathTool?: unknown }).stairPathTool).toBe(foreign);
    });
});
