// §FIX-DISPOSE-USEDTIMES-DEVICE — pipeline-dispose device-boundary guard tests.
//
// ROOT (L-203 / L-153, the WebGPU `usedTimes` device-loss cascade):
//   RenderPipeline.dispose() fans out to NodeManager.delete(renderObject), which reads
//   `this.get(renderObject).nodeBuilderState.usedTimes`. After a backend swap / device-
//   loss recovery, `this._renderer` (and its NodeManager) is a DIFFERENT GPUDevice than
//   the one the pipeline was built against, so `this.get(staleRenderObject)` is undefined
//   → `undefined.usedTimes` throws → device-loss cascade.
//
// The fix records the device each pipeline was built against and, in
// `_safeDisposeRenderPipeline`, SKIPS THREE's teardown when that device is no longer the
// renderer's current device (the old device's GPU resources are already reclaimed). Only
// a SAME-device rebuild actually calls dispose(); a residual same-device `usedTimes` throw
// there is still swallowed non-fatally. These tests pin all three behaviours without a
// live GPU by driving the private members directly (the test owns the instance).

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake GPUDevice-like token — identity is all the guard compares. */
function fakeDevice(tag: string): unknown {
  return { __device: tag };
}

/** A renderer whose WebGPU backend exposes `device`. */
function rendererWithDevice(device: unknown): any {
  return { isWebGPURenderer: true, backend: { isWebGPUBackend: true, device } };
}

function makeRpm(): any {
  return new RenderPipelineManager() as any;
}

describe('RenderPipelineManager._safeDisposeRenderPipeline — device-boundary guard', () => {
  it('DISPOSES normally when the pipeline was built against the renderer\'s CURRENT device', () => {
    const device = fakeDevice('A');
    const rpm = makeRpm();
    const dispose = vi.fn();

    rpm._renderer = rendererWithDevice(device);
    rpm._renderPipeline = { dispose };
    rpm._renderPipelineDevice = device; // same device → same-session rebuild

    rpm._safeDisposeRenderPipeline();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('SKIPS dispose() across a device boundary (built device !== live device) — no throw, ref dropped', () => {
    const oldDevice = fakeDevice('old');
    const newDevice = fakeDevice('new');
    const rpm = makeRpm();
    // If this were ever called it would throw the exact NodeManager usedTimes TypeError.
    const dispose = vi.fn(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
    });

    // Renderer is now the NEW device; the pipeline was built against the OLD one.
    rpm._renderer = rendererWithDevice(newDevice);
    rpm._renderPipeline = { dispose };
    rpm._renderPipelineDevice = oldDevice;

    expect(() => rpm._safeDisposeRenderPipeline()).not.toThrow();
    // The cross-device teardown must NOT be invoked (that is the whole point).
    expect(dispose).not.toHaveBeenCalled();
    // The stale device marker is cleared so the next build re-records fresh.
    expect(rpm._renderPipelineDevice).toBeNull();
  });

  it('SWALLOWS a residual SAME-device usedTimes throw (stays non-fatal)', () => {
    const device = fakeDevice('same');
    const rpm = makeRpm();
    const dispose = vi.fn(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
    });

    rpm._renderer = rendererWithDevice(device);
    rpm._renderPipeline = { dispose };
    rpm._renderPipelineDevice = device; // SAME device → dispose is attempted…

    // …and the usedTimes throw is swallowed (non-fatal), so recovery/rebuild continues.
    expect(() => rpm._safeDisposeRenderPipeline()).not.toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('DISPOSES when there is no device info on either side (WebGL2 fallback path)', () => {
    // The WebGL2 fallback owns no GPUDevice → both sides null → not a device boundary,
    // so a normal dispose runs (WebGL disposal never throws usedTimes anyway).
    const rpm = makeRpm();
    const dispose = vi.fn();
    rpm._renderer = { isWebGPURenderer: true, backend: { isWebGPUBackend: false } }; // no device
    rpm._renderPipeline = { dispose };
    rpm._renderPipelineDevice = null;

    rpm._safeDisposeRenderPipeline();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there is no pipeline', () => {
    const rpm = makeRpm();
    rpm._renderPipeline = null;
    expect(() => rpm._safeDisposeRenderPipeline()).not.toThrow();
  });
});
