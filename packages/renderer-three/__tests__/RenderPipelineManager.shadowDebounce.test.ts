// §PERF-PHASE2 — shadow-rebuild debounce timing tests for RenderPipelineManager.
//
// Context: on project LOAD, PascalSceneLighting calls scheduleShadowRebuild() once
// per new mesh in a single `bim-*-added` event burst (~88×). The debounce window was
// a hard-coded 16 ms — short enough that the timer re-armed and FIRED several times
// mid-load, each fire disposing/recreating the ShadowDepthTexture (the "Destroyed
// texture used in a submit" race) and running a full pipeline rebuild longtask.
//
// Raising the window to 100 ms (SHADOW_REBUILD_DEBOUNCE_MS) coalesces a load burst
// into ONE rebuild after the burst settles. These tests pin:
//   (1) a burst of N schedules within the window → exactly ONE rebuild;
//   (2) the rebuild fires only AFTER the new (100 ms) window, not the old 16 ms;
//   (3) the in-flight latch (§#47) still routes a schedule during a rebuild into a
//       single queued follow-up.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** Force the manager into the active-WebGPU state without a real GPU, and replace
 *  the private _rebuildPipeline with a counting spy so we can observe debounce fires
 *  without building a real TSL pipeline. */
function armManager(rpm: RenderPipelineManager): { rebuildSpy: ReturnType<typeof vi.fn> } {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    const rebuildSpy = vi.fn();
    // _rebuildPipeline is the normal (non-SSGI-contaminated) debounce target.
    (rpm as unknown as { _rebuildPipeline: () => void })._rebuildPipeline = rebuildSpy;
    return { rebuildSpy };
}

describe('RenderPipelineManager shadow-rebuild debounce (§PERF-PHASE2, 100 ms)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('coalesces a load burst of 88 schedules into exactly ONE rebuild', () => {
        const rpm = new RenderPipelineManager();
        const { rebuildSpy } = armManager(rpm);

        // Simulate the project-load burst: 88 rapid schedules within ~5 ms.
        for (let i = 0; i < 88; i++) {
            rpm.scheduleShadowRebuild();
            vi.advanceTimersByTime(0); // microtask-ish; well under the debounce window
        }
        // Nothing has fired yet — the window has not elapsed.
        expect(rebuildSpy).not.toHaveBeenCalled();

        // Let the debounce window elapse.
        vi.advanceTimersByTime(100);
        expect(rebuildSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire at the OLD 16 ms window — only after the new 100 ms window', () => {
        const rpm = new RenderPipelineManager();
        const { rebuildSpy } = armManager(rpm);

        rpm.scheduleShadowRebuild();

        // Old window: would have fired at 16 ms. New window must NOT.
        vi.advanceTimersByTime(16);
        expect(rebuildSpy).not.toHaveBeenCalled();

        // Just before the new window closes.
        vi.advanceTimersByTime(83); // total 99 ms
        expect(rebuildSpy).not.toHaveBeenCalled();

        // Window closes at 100 ms.
        vi.advanceTimersByTime(1); // total 100 ms
        expect(rebuildSpy).toHaveBeenCalledTimes(1);
    });

    it('re-arms the window on each schedule (trailing-edge debounce)', () => {
        const rpm = new RenderPipelineManager();
        const { rebuildSpy } = armManager(rpm);

        rpm.scheduleShadowRebuild();
        vi.advanceTimersByTime(80);          // 80 ms into the first window
        rpm.scheduleShadowRebuild();          // re-arms — window restarts
        vi.advanceTimersByTime(80);          // 80 ms into the SECOND window (160 ms total)
        expect(rebuildSpy).not.toHaveBeenCalled(); // would have fired at 100 ms if not re-armed
        vi.advanceTimersByTime(20);          // close the second window (100 ms since re-arm)
        expect(rebuildSpy).toHaveBeenCalledTimes(1);
    });

    it('§#47 latch: a schedule DURING an in-flight rebuild defers to one follow-up', () => {
        const rpm = new RenderPipelineManager();
        // Mark a rebuild in flight: scheduleShadowRebuild must NOT arm a fresh timer.
        (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
        (rpm as unknown as { _rebuildInFlight: boolean })._rebuildInFlight = true;

        rpm.scheduleShadowRebuild();
        // No new timer armed while in flight; instead the queued-follow-up latch is set.
        expect((rpm as unknown as { _rebuildQueuedAfterFlight: boolean })._rebuildQueuedAfterFlight).toBe(true);
    });

    it('§FIX-SHADOW-REBUILD-LATCH-ASYNC: the in-flight latch spans the ASYNC rebuild — ' +
       'a schedule during the async window coalesces into ONE follow-up (no second concurrent rebuild)',
    async () => {
        // Real timers: this test drives the actual debounce window + real microtasks so the
        // async in-flight window is observable end-to-end.
        vi.useRealTimers();

        const rpm = new RenderPipelineManager();
        const priv = rpm as unknown as {
            _webGpuActive: boolean;
            _rebuildPipeline: () => Promise<void>;
            _rebuildInFlight: boolean;
            _rebuildQueuedAfterFlight: boolean;
        };
        priv._webGpuActive = true;

        // Replace _rebuildPipeline with a DEFERRED promise we resolve by hand, so the async
        // rebuild window is explicit: while pending, the latch MUST stay in-flight.
        let calls = 0;
        let resolveActive: (() => void) | null = null;
        priv._rebuildPipeline = () => {
            calls++;
            return new Promise<void>((res) => { resolveActive = () => res(); });
        };

        const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // First schedule → after the 100 ms debounce the async rebuild starts and STAYS
        // in-flight until we resolve it.
        rpm.scheduleShadowRebuild();
        await settle(150);
        expect(calls).toBe(1);
        expect(priv._rebuildInFlight).toBe(true);

        // A schedule arriving DURING the async window must coalesce (set the follow-up latch),
        // NOT arm a fresh timer / start a second concurrent rebuild.
        rpm.scheduleShadowRebuild();
        expect(priv._rebuildQueuedAfterFlight).toBe(true);
        expect(calls).toBe(1);

        // Completing the async rebuild clears the latch and drains exactly ONE follow-up.
        resolveActive?.();
        await settle(0);
        expect(priv._rebuildInFlight).toBe(false);
        await settle(150); // let the single follow-up's debounce elapse
        expect(calls).toBe(2);
    }, 10_000);

    it('is inert when WebGPU is not active (no timer, no rebuild)', () => {
        const rpm = new RenderPipelineManager();
        const rebuildSpy = vi.fn();
        (rpm as unknown as { _rebuildPipeline: () => void })._rebuildPipeline = rebuildSpy;
        // _webGpuActive is false (default) → early return.
        rpm.scheduleShadowRebuild();
        vi.advanceTimersByTime(1000);
        expect(rebuildSpy).not.toHaveBeenCalled();
    });
});
