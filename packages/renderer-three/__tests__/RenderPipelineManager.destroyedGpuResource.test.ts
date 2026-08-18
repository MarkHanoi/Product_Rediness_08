/**
 * §GPU-RESOURCE-LIFETIME (ADR-0281) — the pipeline-failure path for a
 * DESTROYED/DANGLING GPU resource.
 *
 * FOUNDER EVIDENCE (2026-08-06, WebGPU backend, sofa CHANGE_FURNITURE_TYPE):
 *
 *   [RenderPipelineManager] PIPELINE_FAILURE reason="Failed to execute
 *     'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not of type
 *     'GPUBuffer'." retryCount=0
 *   [RenderPipelineManager] Scheduling rebuild (attempt 1/3, backoff 500ms)
 *   … scene stays dead; thumbnails blank; user forced a manual WebGL fallback.
 *
 * The retry could never work: the damage is in the RENDERER's per-attribute /
 * per-render-object bookkeeping, and the retry ladder rebuilds the POST-FX
 * PIPELINE. A retry that cannot succeed is worse than a hard failure — the user
 * waits instead of being told.
 *
 * What these tests pin:
 *   1. a destroyed-resource failure never enters the retry ladder;
 *   2. it gets exactly ONE genuine reconstruction attempt;
 *   3. a recurrence fails LOUDLY (phase='error' → the crash guard tells the user)
 *      rather than looping silently;
 *   4. the OTHER failure classes are untouched.
 *
 * Plus the frame-boundary contract: render() drains the deferred GPU-release
 * queue before it encodes anything (C04 §2 — the frame owner owns the boundary).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { scheduleGpuRelease, pendingGpuReleaseCount, drainGpuReleaseQueue } from '../src/safeDispose.js';

const SET_INDEX_BUFFER_FAILURE =
    "Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'.";

/** WebGPU-shaped renderer stub with a healthy, non-zero backing store. */
function fakeWebGpuRenderer(): any {
    return {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
        setClearAlpha: () => { /* noop */ },
        setClearColor: () => { /* noop */ },
    };
}

/** Arm an RPM so that render() reaches `renderPipeline.render()` and throws `err`. */
function armFailingPipeline(err: Error) {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = fakeWebGpuRenderer();
    rpm._scene        = { traverse: () => { /* noop */ } };
    rpm._camera       = {};
    rpm._renderPipeline = { render: () => { throw err; }, dispose: () => { /* noop */ } };
    // Observe the reconstruction without running real GPU work. NOTE this stubs
    // _rebuildPipeline, NOT onProjectSwitch: onProjectSwitch explicitly DEFERS the
    // pipeline rebuild to onProjectLoaded(), so recovering through it would log a
    // confident recovery and leave the viewport dark forever — the founder symptom.
    rpm._rebuildPipeline = vi.fn(async () => { /* noop */ });
    rpm.onProjectSwitch  = vi.fn();
    // §L-966 — the LARGER repair (`recoverFromRenderFailure`) does two things a
    // bare `_rebuildPipeline()` cannot: re-own the light-owned shadow maps and
    // reset the compiled node-builder caches. Stub + observe them separately so
    // these tests can distinguish "the BLIND rebuild was refused" (the ADR-0299
    // invariant) from "no repair was attempted at all" (the L-966 defect).
    rpm._recreateLightOwnedShadowMaps = vi.fn();
    rpm._resetCompiledNodeStates      = vi.fn();
    rpm._safeDisposeRenderPipeline    = vi.fn();
    return rpm;
}

/**
 * §L-966 — re-arm a pipeline that the previous failure nulled, so the SAME fault
 * can re-fire on a later frame. Mirrors what a (failed) rebuild would have left
 * behind: a live pipeline object whose render() still throws.
 */
async function refaultOnALaterFrame(rpm: any, err: Error): Promise<void> {
    // §L930-SUBMIT-PAUSE-DEPTH — a recovery holds the submit gate CLOSED across its
    // whole teardown/rebuild window and pops it in a `.finally()`, i.e. on a
    // microtask. Without this flush the next `render()` would early-return at the
    // pause gate and the fault would never re-report — the test would "pass" by
    // measuring a viewport that was never asked to draw. (That gate is also why a
    // recovery in flight cannot itself generate new fault reports in production.)
    await Promise.resolve();
    await Promise.resolve();
    rpm._hasPipelineError = false;
    rpm._renderPipeline   = { render: () => { throw err; }, dispose: () => { /* noop */ } };
    rpm.render(0.016);
}

describe('RenderPipelineManager — destroyed-GPU-resource failures never ride the retry ladder', () => {
    beforeEach(() => { vi.useFakeTimers(); drainGpuReleaseQueue(); });
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); drainGpuReleaseQueue(); });

    it("the founder's setIndexBuffer failure does NOT schedule a retry", () => {
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));

        rpm.render(0.016);

        // Previously: retryCount 1/3 + a 500ms setTimeout rebuild that could not help.
        expect(rpm.status.retryCount).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reconstructs through _rebuildPipeline, NOT onProjectSwitch (which defers the rebuild)', () => {
        // REGRESSION GUARD for a silent-darkness failure mode found mid-fix. The
        // habitual "soft recovery" lever, onProjectSwitch(), reconciles size and
        // schedules a shadow rebuild but deliberately leaves the pipeline rebuild to
        // onProjectLoaded() ("Pipeline rebuild is intentionally deferred…"). By this
        // point render() has already set _hasPipelineError=true and nulled
        // _renderPipeline, so recovering via onProjectSwitch() would print a confident
        // recovery message and leave render() early-returning forever: a permanently
        // dark viewport with NO error. That presents as "nothing happened", which is
        // the exact defect class this whole fix exists to eliminate — so its absence
        // is asserted here rather than trusted to inspection.
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));

        rpm.render(0.016);

        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('performs exactly ONE BLIND reconstruction — a recurrence escalates, never repeats it', async () => {
        // §L-966 — the ADR-0281 invariant is unchanged and is what the first two
        // assertions pin: the BLIND `_rebuildPipeline()` (post-FX graph only) is
        // spent exactly ONCE, because a second one would repair nothing the first
        // did not. What changed is what happens AFTER: the recurrence no longer
        // falls straight into a dead viewport, it escalates to the strictly LARGER
        // repair (light-owned shadow maps + compiled node caches), which the blind
        // rebuild provably cannot reach.
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));

        rpm.render(0.016);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
        // Negative on the SAME expression: attempt 1 really was the BLIND rebuild.
        expect(rpm._recreateLightOwnedShadowMaps).not.toHaveBeenCalled();

        await refaultOnALaterFrame(rpm, new Error(SET_INDEX_BUFFER_FAILURE));

        // No SECOND blind reconstruction: the `_gpuResourceResetAttempted` latch is
        // NOT reopened by the automatic path (only a human's "Reload viewport" may
        // reopen it). The second rebuild is the recovery's, and it is preceded by
        // the two repairs a blind rebuild cannot perform.
        expect(rpm._recreateLightOwnedShadowMaps).toHaveBeenCalledTimes(1);
        expect(rpm._resetCompiledNodeStates).toHaveBeenCalledTimes(1);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(2);
    });

    it('a recurrence fails LOUDLY (phase=error) once the bounded recovery budget is spent', async () => {
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));
        const states: string[] = [];
        rpm.onStateChange = (s: any) => states.push(s.phase);

        rpm.render(0.016);
        expect(rpm.status.phase).not.toBe('error'); // 1: the one blind reconstruction

        await refaultOnALaterFrame(rpm, new Error(SET_INDEX_BUFFER_FAILURE));
        expect(rpm.status.phase).not.toBe('error'); // 2: auto-recovery 1 of 2

        await refaultOnALaterFrame(rpm, new Error(SET_INDEX_BUFFER_FAILURE));
        expect(rpm.status.phase).not.toBe('error'); // 3: auto-recovery 2 of 2

        // 4: the budget (MAX_AUTO_RECOVERY_ATTEMPTS = 2) is spent. The whole point
        // of the bound — it stops here rather than spinning, and the user is told.
        await refaultOnALaterFrame(rpm, new Error(SET_INDEX_BUFFER_FAILURE));
        expect(rpm.status.phase).toBe('error');
        expect(states).toContain('error'); // the crash guard is actually told

        // §L-966 — and it is told WHAT died, not a synthetic "retries exhausted".
        expect(rpm.status.lastError).not.toBeNull();
        expect(rpm.status.lastError.message).toContain('GPU resource was released');

        // Bounded total work: 1 blind reconstruction + 2 recoveries. Never a loop.
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(3);
    });

    it('a destroyed NON-shadow texture takes the same non-retry path', () => {
        // NOTE the deliberate non-shadow label. A *ShadowDepthTexture* is handled by
        // §RECOVERY-MUST-REFUSE below (refused outright, because a light-owned shadow
        // map cannot be replaced by a pipeline rebuild); a pipeline-owned target CAN
        // be, so it still earns its one reconstruction.
        const rpm = armFailingPipeline(new Error('Destroyed texture [Texture "ssgiColor"] used in a submit'));
        rpm.render(0.016);
        expect(rpm.status.retryCount).toBe(0);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('an UNRELATED render failure still uses the retry ladder (no behaviour regression)', () => {
        const rpm = armFailingPipeline(new Error('some transient pass failure'));

        rpm.render(0.016);

        expect(rpm.status.retryCount).toBe(1);
        expect(vi.getTimerCount()).toBe(1); // the 500ms backoff rebuild is still armed
        expect(rpm._rebuildPipeline).not.toHaveBeenCalled(); // the ladder's own setTimeout owns it
    });
});

describe('RenderPipelineManager.render — the frame boundary drains deferred GPU releases', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    it('releases queued resources at the top of the frame', () => {
        const rpm = new RenderPipelineManager() as any;
        rpm._renderer = fakeWebGpuRenderer();
        const geo = { isBufferGeometry: true, dispose: vi.fn() };

        scheduleGpuRelease(geo as any);
        expect(pendingGpuReleaseCount()).toBe(1);

        rpm.render(0.016);

        expect(geo.dispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('drains even on a frame the manager declines to submit (zero-size viewport)', () => {
        const rpm = new RenderPipelineManager() as any;
        rpm._renderer = {
            ...fakeWebGpuRenderer(),
            getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(0, 0); return t; } return { x: 0, y: 0 }; },
        };
        const geo = { isBufferGeometry: true, dispose: vi.fn() };
        scheduleGpuRelease(geo as any);

        rpm.render(0.016);

        // The queue must not grow unbounded while the pane is collapsed / suspended.
        expect(geo.dispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });
});

// ── §RECOVERY-MUST-REFUSE (ADR-0299) applied to our own recovery ────────────
//
// FOUNDER P0 (project: 167 elements, 145 walls, 4 levels, 445 meshes):
//   §GPU-RESOURCE-LIFETIME destroyed/dangling GPU resource reached the GPU
//     (GPUDevice.uncapturederror: "Destroyed texture [Texture "ShadowDepthTexture"]
//      used in a submit. — While calling [Queue].Submit(…)")
//     — Performing ONE immediate reconstruction …
//   … RECURRED after a full reconstruction — unrecoverable. phase=error
//
// The reconstruction was honest but WASTEFUL: a light's LightShadow.map is owned by
// the LIGHT and reallocated by THREE's shadow pass — it is unreachable from
// _rebuildPipeline(). The user paid a multi-second rebuild before being told.

describe('RenderPipelineManager — refuses a repair it cannot perform (shadow resources)', () => {
    beforeEach(() => { vi.useFakeTimers(); drainGpuReleaseQueue(); });
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); drainGpuReleaseQueue(); });

    const SHADOW_FAILURE =
        'Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. ' +
        '- While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])';

    it('never burns a BLIND reconstruction on a destroyed shadow depth target', () => {
        // §RECOVERY-MUST-REFUSE is UNWEAKENED. The refusal was, and remains, of the
        // BLIND `_rebuildPipeline()`: a light-owned LightShadow.map is not reachable
        // from a post-FX rebuild, so spending one on this fault costs multi-seconds
        // and repairs nothing.
        //
        // §L-966 — what the refusal never justified was attempting NOTHING. The
        // repair that CAN reach a light-owned map re-owns it FIRST and only then
        // rebuilds, so the ORDER below is the whole distinction: a rebuild preceded
        // by the re-own is the recovery; a rebuild without it is the refused repair.
        const rpm = armFailingPipeline(new Error(SHADOW_FAILURE));

        rpm.render(0.016);

        const reownOrder  = rpm._recreateLightOwnedShadowMaps.mock.invocationCallOrder[0];
        const rebuildOrder = rpm._rebuildPipeline.mock.invocationCallOrder[0];
        expect(reownOrder).toBeLessThan(rebuildOrder);
        expect(rpm._resetCompiledNodeStates).toHaveBeenCalledTimes(1);

        // Still no soft-recovery-through-a-lifecycle-lever, and still no retry ladder.
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
        expect(rpm.status.retryCount).toBe(0);
    });

    it('fails loudly once the bounded recovery budget is spent — never after a WASTED blind rebuild', async () => {
        const rpm = armFailingPipeline(new Error(SHADOW_FAILURE));
        const states: string[] = [];
        rpm.onStateChange = (s: any) => states.push(s.phase);

        rpm.render(0.016);                                        // auto-recovery 1 of 2
        expect(rpm.status.phase).not.toBe('error');
        await refaultOnALaterFrame(rpm, new Error(SHADOW_FAILURE));     // auto-recovery 2 of 2
        expect(rpm.status.phase).not.toBe('error');

        await refaultOnALaterFrame(rpm, new Error(SHADOW_FAILURE));     // budget spent
        expect(rpm.status.phase).toBe('error');
        expect(states).toContain('error');

        // The bound is what makes the auto-wiring safe: exactly two recoveries, then
        // it stops. An unbounded recover→same-fault→recover cycle would pin the GPU.
        expect(rpm._recreateLightOwnedShadowMaps).toHaveBeenCalledTimes(2);

        // And the user is told WHAT died — a refusal that explains itself.
        expect(rpm.status.lastError.message).toContain('ShadowDepthTexture');
    });

    it('still reconstructs for a NON-shadow destroyed resource (refusal is scoped)', () => {
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));
        rpm.render(0.016);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
        expect(rpm.status.phase).not.toBe('error');
    });
});
