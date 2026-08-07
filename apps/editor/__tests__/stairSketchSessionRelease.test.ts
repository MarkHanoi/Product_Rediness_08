// @vitest-environment happy-dom
/**
 * §FIX-STAIR-SKETCH-SESSION-LEAK — the founder's "I can't do anything" lock.
 *
 * THE REPORT (live build, after curved creation started working): "I can create the
 * round stair nicely now" — and then the screen locks. The log shows the acquire with
 * no matching release, and the handler still eating clicks long after the commit:
 *
 *     [Stair] §STAIR-CONTROLS-OFF   camera-controls disabled while sketching
 *     [Stair] §STAIR-SELECTION-OFF  SelectionManager disabled while sketching
 *     [StairPathToolController] Curved stair committed: 17 steps, sweep=-82.2°
 *     [Stair] §STAIR-CLICK at (10.30, 11.65) state= idle      ← after the commit
 *     [Stair] §STAIR-POINT-SET state= idle                    ← repeats forever
 *
 * ROOT CAUSE: `StairPathToolController._finishCurved()` was a hand-rolled copy of
 * `_finish()` that stopped one line short — it never called `onComplete`. The 3D
 * handler's ENTIRE teardown (restore camera-controls, restore SelectionManager,
 * unbind the capture-phase pointer listeners) hung off `onComplete`/`onCancel`, so a
 * successful CURVED commit left the viewport permanently input-dead. The straight
 * path called `onComplete` on its last line, outside any `finally`, so a throwing
 * `commandManager.execute()` reproduced the identical lock there.
 *
 * THE INVARIANT THESE TESTS PIN: the release is owned by the controller's
 * `deactivate()` — the ONE choke point every terminal path already funnels through —
 * via `onDeactivate`, not by any per-exit-path callback. A future exit path cannot
 * reintroduce this, because a session that has not deactivated has not ended.
 *
 * Before the fix, test (1) fails: `ctrl.deactivate()` alone restored nothing.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { StairPath3DToolHandler } from '../src/engine/views/plantools/StairPath3DToolHandler';

// happy-dom ships no Canvas2D; the sketch overlay/HUD only need a context object.
beforeAll(() => {
    const ctx2d = new Proxy({}, { get: () => () => undefined });
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext =
        () => ctx2d;
});

interface Harness {
    handler: StairPath3DToolHandler;
    canvas: HTMLCanvasElement;
    controls: { enabled: boolean };
    selection: { enabled: boolean; setEnabled(v: boolean): void };
}

function makeHarness(): Harness {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    // Camera-controls start ENABLED — the state the sketch must give back.
    const controls = { enabled: true };
    const selection = {
        enabled: true,
        setEnabled(v: boolean) { this.enabled = v; },
    };
    (window as unknown as { selectionManager?: unknown }).selectionManager = selection;

    const world = {
        camera:   { three: { projectionMatrix: {}, matrixWorldInverse: {} }, controls },
        scene:    { three: {} },
        renderer: { three: { domElement: canvas } },
    };

    const handler = new StairPath3DToolHandler({
        getWorld:          () => world as never,
        commandManager:    { execute: () => {} },
        getActiveLevelId:  () => 'level:0',
        getLevels:         () => [
            { id: 'level:0', name: 'Level 0', elevation: 0 },
            { id: 'level:1', name: 'Level 1', elevation: 3 },
        ],
    });

    return { handler, canvas, controls, selection };
}

/** The controller's own `deactivate()` — exactly what a commit calls. */
function controllerSelfDeactivate(): void {
    (window as unknown as { stairPathTool?: { deactivate(): void } }).stairPathTool?.deactivate();
}

describe('§FIX-STAIR-SKETCH-SESSION-LEAK — a sketch session always gives the viewport back', () => {
    let h: Harness;

    beforeEach(() => { h = makeHarness(); });
    afterEach(() => {
        h.handler.deactivate();
        h.canvas.remove();
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
        delete (window as unknown as { stairPathTool?: unknown }).stairPathTool;
    });

    it('suspends camera-controls and SelectionManager while sketching', () => {
        expect(h.handler.activate('C')).toBe(true);
        expect(h.controls.enabled).toBe(false);     // §STAIR-CONTROLS-OFF
        expect(h.selection.enabled).toBe(false);    // §STAIR-SELECTION-OFF
    });

    it('(1) THE LOCK: the controller ending its own session releases both — the commit path', () => {
        h.handler.activate('C');
        expect(h.controls.enabled).toBe(false);

        // This is precisely what `_commit()` does: `this.deactivate()`. It does NOT
        // go through onComplete — which is how the curved commit escaped teardown.
        controllerSelfDeactivate();

        expect(h.controls.enabled).toBe(true);      // §STAIR-CONTROLS-ON
        expect(h.selection.enabled).toBe(true);     // §STAIR-SELECTION-ON
    });

    it('(2) the handler detaches: a click after the session no longer reaches the sketch', () => {
        h.handler.activate('C');
        controllerSelfDeactivate();

        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        h.canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        const sawStairClick = spy.mock.calls.some(
            (args) => typeof args[0] === 'string' && args[0].includes('§STAIR-CLICK'),
        );
        spy.mockRestore();

        // The founder's log was this line repeating with `state= idle` forever.
        expect(sawStairClick).toBe(false);
    });

    it('(3) the click is no longer swallowed — preventDefault/stopPropagation are gone', () => {
        h.handler.activate('C');
        controllerSelfDeactivate();

        const ev = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
        h.canvas.dispatchEvent(ev);
        // While sketching the capture-phase listener calls preventDefault(); once the
        // session is released nothing may claim the gesture (that claim is what left
        // the user with no camera and no selection).
        expect(ev.defaultPrevented).toBe(false);
    });

    it('(4) an explicit deactivate() releases too (cancel/Escape — anti-regression)', () => {
        h.handler.activate('C');
        h.handler.deactivate();
        expect(h.controls.enabled).toBe(true);
        expect(h.selection.enabled).toBe(true);
    });

    it('(5) release is idempotent and restores the PRE-sketch state, not a hard-coded true', () => {
        h.controls.enabled = false;        // camera already disabled by another tool
        h.selection.setEnabled(false);

        h.handler.activate('C');
        controllerSelfDeactivate();
        h.handler.deactivate();            // double release must not flip anything on

        expect(h.controls.enabled).toBe(false);
        expect(h.selection.enabled).toBe(false);
    });

    it('(6) re-activating leaves exactly one live session (no stacked suspensions)', () => {
        h.handler.activate('C');
        h.handler.activate('I');           // re-entrancy: activate() deactivates first
        h.handler.deactivate();
        expect(h.controls.enabled).toBe(true);
        expect(h.selection.enabled).toBe(true);
    });
});
