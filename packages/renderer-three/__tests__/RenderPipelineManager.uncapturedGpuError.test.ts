/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297) — the SILENT half of the fault class.
 *
 * FOUNDER EVIDENCE (2026-08-06/07, WebGPU backend, build 096e12b4). A project was
 * opened in a fresh session; geometry rendered correctly for about a second, then
 * the 3D viewport went WHITE. Elements were still present and still selectable —
 * only not displayed. Switching the renderer to WebGL restored everything:
 *
 *   [RenderPipelineManager] SHADOW_REBUILD_COMPLETE elapsed=1105.7ms
 *   [PascalSceneLighting] Shadow flags set on 206 mesh(es)
 *   500× Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 *        - While calling [Queue].Submit([[CommandBuffer from CommandEncoder …]])
 *
 * ⚠ THE POINT OF THIS SUITE: that fault NEVER tripped `PIPELINE_FAILURE`.
 *
 * ADR-0297 classified destroyed-resource faults that surface as a JS THROW out of
 * `render()` — which is what `setIndexBuffer … not of type 'GPUBuffer'` does,
 * because a bad JS argument throws a TypeError synchronously. A WebGPU VALIDATION
 * error inside an already-recorded command buffer does not throw and does not
 * reject: it is delivered to the device's `uncapturederror` event. `render()`
 * returned normally, nothing was classified, `phase` never left `phase4`, the
 * crash guard was never told — and the user got a blank viewport with NO ERROR AT
 * ALL. That is exactly the outcome ADR-0297 was written to abolish, reached by a
 * route the ADR did not consider.
 *
 * What these tests pin:
 *   1. the device's `uncapturederror` channel IS subscribed (detection does not
 *      depend on the fault happening to throw);
 *   2. a destroyed-resource validation error is classified and drives the SAME
 *      one-reconstruction policy as the thrown path;
 *   3. a FLOOD (500 of them from one shadow rebuild) drives ONE action, not 500;
 *   4. a recurrence after the reconstruction fails LOUDLY (phase='error') instead
 *      of leaving a silent white viewport;
 *   5. an uncaptured error that is NOT a lifetime fault does not hijack the
 *      resource-lifetime recovery path;
 *   6. the listener follows the live device across a swap / device-loss recovery.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

const DESTROYED_SHADOW_TEXTURE =
    'Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. ' +
    '- While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])';

// A destroyed resource the render pipeline DOES own, and therefore CAN replace.
//
// The channel mechanisms below (flood coalescing, device-swap re-subscription, the
// one-reconstruction latch) are about the CHANNEL, not the resource kind, so they use
// this fixture. They previously used DESTROYED_SHADOW_TEXTURE, which made them
// incidentally depend on shadow resources being reconstructible — they are not
// (§RECOVERY-MUST-REFUSE below), so the fixture, not the mechanism, was wrong.
const DESTROYED_PIPELINE_TEXTURE =
    'Destroyed texture [Texture "ssgiColor"] used in a submit. ' +
    '- While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])';

/** Minimal EventTarget-shaped GPUDevice double. */
class FakeGpuDevice {
    listeners = new Map<string, Set<(ev: unknown) => void>>();
    addEventListener(type: string, fn: (ev: unknown) => void): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: (ev: unknown) => void): void {
        this.listeners.get(type)?.delete(fn);
    }
    /** Deliver an uncaptured validation error exactly as the browser would. */
    emit(message: string): void {
        for (const fn of this.listeners.get('uncapturederror') ?? []) {
            fn({ error: { message } });
        }
    }
    get uncapturedCount(): number {
        return this.listeners.get('uncapturederror')?.size ?? 0;
    }
}

/**
 * An RPM wired to a fake WebGPU device, with `_rebuildPipeline` observable.
 * NOTE the stub is `_rebuildPipeline`, NOT `onProjectSwitch` — ADR-0297 forbids
 * routing this class of recovery through `onProjectSwitch()`.
 */
function armWithDevice(device: FakeGpuDevice) {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer = {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true, device },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
    };
    rpm._rebuildPipeline = vi.fn(async () => { /* noop */ });
    rpm.onProjectSwitch  = vi.fn();
    rpm._attachUncapturedGpuErrorListener();
    return rpm;
}

describe('RenderPipelineManager — destroyed GPU resources that never throw (§GPU-RESOURCE-LIFETIME)', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;
    let log: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn  = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
        error = vi.spyOn(console, 'error').mockImplementation(() => { /* quiet */ });
        log   = vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => { warn.mockRestore(); error.mockRestore(); log.mockRestore(); });

    it('subscribes to the device uncapturederror channel (detection is not throw-dependent)', () => {
        const device = new FakeGpuDevice();
        armWithDevice(device);
        // TOOTH: before this change nothing listened, so the founder's 500 validation
        // errors were printed by the browser and observed by nobody in the product.
        expect(device.uncapturedCount).toBe(1);
    });

    it("the founder's ShadowDepthTexture failure is CLASSIFIED and REFUSED (not reconstructed)", () => {
        // ⚠ SUPERSEDES the original ADR-0297 expectation ("drives ONE reconstruction").
        // On the founder's P0 (167 elements / 145 walls / 4 levels / 445 meshes) that
        // reconstruction ran and the fault recurred immediately, twice. It could never
        // have worked: a light's LightShadow.map is owned by the LIGHT and reallocated
        // by THREE's shadow pass — it is unreachable from _rebuildPipeline(). Per
        // ADR-0299 §RECOVERY-MUST-REFUSE, a repair that cannot perform what its name
        // promises must decline instead of burning a multi-second rebuild first.
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);

        device.emit(DESTROYED_SHADOW_TEXTURE);

        expect(rpm._rebuildPipeline).not.toHaveBeenCalled();
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
        // The user is told immediately rather than after a wasted rebuild.
        expect(rpm.status.phase).toBe('error');
    });

    it('a destroyed PIPELINE-owned texture still earns its ONE reconstruction', () => {
        // The refusal is scoped to resources we do not own — it must not disarm the
        // ADR-0297 recovery for the ones we do.
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);

        device.emit(DESTROYED_PIPELINE_TEXTURE);

        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
        expect(rpm.status.phase).not.toBe('error');
    });

    it('a FLOOD of 500 validation errors drives ONE action, not 500', () => {
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);

        for (let i = 0; i < 500; i++) device.emit(DESTROYED_PIPELINE_TEXTURE);

        // 500 reconstructions would be a worse outage than the fault they answer.
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('a RECURRENCE after the reconstruction fails loudly instead of staying white', () => {
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);

        device.emit(DESTROYED_PIPELINE_TEXTURE);        // window 1 → one reconstruction
        // A genuinely LATER occurrence (a new window), not another line of the same
        // flood — this is what "it happened again after we repaired it" looks like.
        rpm._destroyedResourceWindowStart = Date.now() - 10_000;
        device.emit(DESTROYED_PIPELINE_TEXTURE);        // window 2 → recurrence

        expect(rpm.status.phase).toBe('error');
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('a non-lifetime uncaptured error does NOT hijack the resource-lifetime path', () => {
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);

        device.emit('Bind group layout entry 0 is not compatible with the pipeline layout.');

        expect(rpm._rebuildPipeline).not.toHaveBeenCalled();
        expect(rpm.status.phase).not.toBe('error');
        // It is still surfaced — an uncaptured WebGPU error is never nothing.
        expect(warn).toHaveBeenCalled();
    });

    it('the listener follows the live device across a device swap (device-loss recovery)', () => {
        const first  = new FakeGpuDevice();
        const rpm    = armWithDevice(first);
        const second = new FakeGpuDevice();

        rpm._renderer.backend.device = second;
        rpm._attachUncapturedGpuErrorListener();

        // Superseded device released, new device subscribed — no double-reporting and
        // no blind spot after a recovery.
        expect(first.uncapturedCount).toBe(0);
        expect(second.uncapturedCount).toBe(1);

        second.emit(DESTROYED_PIPELINE_TEXTURE);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('re-attaching for the SAME device is idempotent (no duplicate subscriptions)', () => {
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);
        rpm._attachUncapturedGpuErrorListener();
        rpm._attachUncapturedGpuErrorListener();
        expect(device.uncapturedCount).toBe(1);
    });
});

describe('RenderPipelineManager.recoverFromRenderFailure — the PUBLIC recovery lever', () => {
    let log: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ }); });
    afterEach(() => { log.mockRestore(); });

    it('drives a REAL pipeline rebuild and never onProjectSwitch()', () => {
        const rpm = armWithDevice(new FakeGpuDevice());

        expect(rpm.recoverFromRenderFailure()).toBe(true);

        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
        // ADR-0297 Consequences, verbatim: recovery for this class MUST use
        // _rebuildPipeline(), NEVER onProjectSwitch() — which defers the rebuild to
        // onProjectLoaded() and leaves the viewport permanently dark.
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
    });

    it('clears the one-reconstruction latch so a repaired scene can recover again', () => {
        const device = new FakeGpuDevice();
        const rpm = armWithDevice(device);

        device.emit(DESTROYED_PIPELINE_TEXTURE);
        expect(rpm._gpuResourceResetAttempted).toBe(true);

        rpm.recoverFromRenderFailure();

        expect(rpm._gpuResourceResetAttempted).toBe(false);
        expect(rpm._retryCount).toBe(0);
    });

    it('returns FALSE when there is nothing to rebuild, so callers do not claim a phantom recovery', () => {
        const rpm = armWithDevice(new FakeGpuDevice());
        rpm._webGpuActive = false;

        expect(rpm.recoverFromRenderFailure()).toBe(false);
        expect(rpm._rebuildPipeline).not.toHaveBeenCalled();
    });
});
