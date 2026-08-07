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
    return rpm;
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

    it('performs exactly ONE full reconstruction, then stops attempting it', () => {
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));

        rpm.render(0.016);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);

        // The fault re-fires on a later frame; the pipeline was nulled by the first
        // failure, so re-arm it exactly as a rebuild would have.
        rpm._hasPipelineError = false;
        rpm._renderPipeline = { render: () => { throw new Error(SET_INDEX_BUFFER_FAILURE); }, dispose: () => {} };
        rpm.render(0.016);

        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1); // no second attempt
    });

    it('a recurrence fails LOUDLY (phase=error) instead of leaving a silently blocked scene', () => {
        const rpm = armFailingPipeline(new Error(SET_INDEX_BUFFER_FAILURE));
        const states: string[] = [];
        rpm.onStateChange = (s: any) => states.push(s.phase);

        rpm.render(0.016);
        expect(rpm.status.phase).not.toBe('error'); // first: reconstruct, stay quiet

        rpm._hasPipelineError = false;
        rpm._renderPipeline = { render: () => { throw new Error(SET_INDEX_BUFFER_FAILURE); }, dispose: () => {} };
        rpm.render(0.016);

        expect(rpm.status.phase).toBe('error');
        expect(states).toContain('error'); // the crash guard is actually told
    });

    it('"Destroyed texture used in a submit" takes the same non-retry path', () => {
        const rpm = armFailingPipeline(new Error('Destroyed texture [ShadowDepthTexture] used in a submit'));
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
