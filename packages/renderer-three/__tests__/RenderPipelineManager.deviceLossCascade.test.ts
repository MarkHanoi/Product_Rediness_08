// §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (founder L-231) — the heavy-residential recurrence
// of the 40-storey office device-loss cascade.
//
// On a heavy 6-storey scene (~1492 shadow casters) the shadow-rebuild path destroyed the
// `ShadowDepthTexture` mid-submit → "Destroyed texture [ShadowDepthTexture] used in a submit"
// ×N → WebGPU device loss → dead Cesium globe. Two linked renderer-side defects:
//
//   (A) The freeze latches wrote `renderer.shadowMap.autoUpdate`, which is INERT on the WebGPU
//       node path (C04 §SHADOW rule 10 — `ShadowNode.updateBefore()` gates on the PER-LIGHT
//       `light.shadow.autoUpdate` / `.needsUpdate`). So every "freeze" was a no-op against the
//       real WebGPU shadow pass and the depth texture kept reallocating mid-submit.
//   (B) `scheduleShadowRebuild`'s normal path left `_hasPipelineError=false` for the whole ~6 s
//       async rebuild, so the rAF loop kept SUBMITTING frames while the pipeline was disposed /
//       the shadow map reallocated (C04 §SHADOW rule 7: "never dispose or rebuild the pipeline
//       off-frame"). The rebuild is now guarded: submits are paused AND the map is frozen for
//       the rebuild's duration, thawing deferred past the in-flight submit (ADR-0111).
//
// These tests pin: the per-light freeze (A), and the submit-pause invariant during a rebuild (B)
// — the ADR-0111 "no shadow texture destroyed within the frame it is submitted" guarantee.

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake key directional light whose per-light shadow flags we can inspect. */
function makeKeyLight() {
    return {
        isDirectionalLight: true,
        castShadow: true,
        shadow: { autoUpdate: true, needsUpdate: false },
    };
}

/** A fake scene whose traverse yields the given objects (mirrors THREE.Scene.traverse). */
function makeScene(objects: unknown[]) {
    return { traverse: (cb: (o: unknown) => void) => objects.forEach(cb) };
}

/** A fake renderer.shadowMap that records any dispose/destroy (the mid-submit crash). */
function makeShadowMap() {
    const disposeSpy = vi.fn();
    const destroySpy = vi.fn();
    return {
        shadowMap: {
            autoUpdate: true,
            needsUpdate: false,
            dispose: disposeSpy,
            map: { dispose: destroySpy, destroy: destroySpy },
        },
        disposeSpy,
        destroySpy,
    };
}

function armWebGpu(rpm: RenderPipelineManager, renderer: unknown, scene: unknown): void {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    (rpm as unknown as { _renderer: unknown })._renderer = renderer;
    (rpm as unknown as { _scene: unknown })._scene = scene;
}

describe('RenderPipelineManager §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE — per-light shadow freeze (C04 §SHADOW rule 10)', () => {
    it('freezes the PER-LIGHT light.shadow.autoUpdate, not just renderer.shadowMap (the WebGPU-effective flag)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeShadowMap();
        const light = makeKeyLight();
        armWebGpu(rpm, { shadowMap }, makeScene([light]));

        rpm.setShadowReallocFrozen(true);

        // The renderer-level flag is inert on WebGPU — the per-light flag is what the ShadowNode
        // gates on, so THAT is the one that must go false for the freeze to actually stop the pass.
        expect(light.shadow.autoUpdate).toBe(false);
        expect(shadowMap.autoUpdate).toBe(false); // still asserted for the WebGL2 fallback path
        // A freeze must NEVER destroy the shadow texture (ADR-0111).
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('thaws the per-light flag and requests one refresh on the LAST release', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeShadowMap();
        const light = makeKeyLight();
        armWebGpu(rpm, { shadowMap }, makeScene([light]));

        rpm.setShadowReallocFrozen(true);
        expect(light.shadow.autoUpdate).toBe(false);
        expect(light.shadow.needsUpdate).toBe(false); // never mid-freeze (would force a depth pass)

        rpm.setShadowReallocFrozen(false);
        expect(light.shadow.autoUpdate).toBe(true);
        expect(light.shadow.needsUpdate).toBe(true); // one regen against the settled scene
    });

    it('leaves the per-light flag untouched on the WebGL2 fallback (not WebGPU)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeShadowMap();
        const light = makeKeyLight();
        // _webGpuActive stays false (default).
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };
        (rpm as unknown as { _scene: unknown })._scene = makeScene([light]);

        rpm.setShadowReallocFrozen(true);

        expect(light.shadow.autoUpdate).toBe(true); // untouched — WebGL2 owns its own shadowMap
    });
});

describe('RenderPipelineManager §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE — no submit during a shadow rebuild (ADR-0111)', () => {
    it('render() does NOT submit rp.render() while a shadow rebuild is in flight', () => {
        const rpm = new RenderPipelineManager();
        const renderSpy = vi.fn();
        (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
        (rpm as unknown as { _renderer: unknown })._renderer = { setClearAlpha: vi.fn() };
        (rpm as unknown as { _renderPipeline: unknown })._renderPipeline = { render: renderSpy };

        // Rebuild in flight → the guard must skip the submit (no ShadowDepthTexture can be
        // destroyed "in a submit" because there is no submit).
        (rpm as unknown as { _shadowRebuildPaused: boolean })._shadowRebuildPaused = true;
        rpm.render();
        expect(renderSpy).not.toHaveBeenCalled();

        // Rebuild settled → normal submits resume.
        (rpm as unknown as { _shadowRebuildPaused: boolean })._shadowRebuildPaused = false;
        rpm.render();
        expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('scheduleShadowRebuild pauses submits + freezes the map for the async window, then resumes + thaws deferred', async () => {
        vi.useRealTimers();
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeShadowMap();
        const light = makeKeyLight();
        armWebGpu(rpm, { shadowMap }, makeScene([light]));

        const priv = rpm as unknown as {
            _rebuildPipeline: () => Promise<void>;
            _shadowRebuildPaused: boolean;
            _shadowReallocFreezeDepth: number;
        };

        // Deferred rebuild we resolve by hand so the in-flight window is observable.
        let resolveActive: (() => void) | null = null;
        priv._rebuildPipeline = () => new Promise<void>((res) => { resolveActive = () => res(); });

        const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

        rpm.scheduleShadowRebuild();
        await settle(150); // debounce (100 ms) elapses → rebuild starts and stays in flight

        // DURING the rebuild: submits paused AND the shadow map frozen (per-light + renderer).
        expect(priv._shadowRebuildPaused).toBe(true);
        expect(priv._shadowReallocFreezeDepth).toBeGreaterThan(0);
        expect(light.shadow.autoUpdate).toBe(false);

        // Complete the rebuild.
        resolveActive?.();
        await settle(0);
        // Submits resume immediately; the shadow thaw is DEFERRED one macrotask past the submit.
        expect(priv._shadowRebuildPaused).toBe(false);
        await settle(0);
        expect(priv._shadowReallocFreezeDepth).toBe(0);
        expect(light.shadow.autoUpdate).toBe(true); // thawed against the settled scene

        // The whole rebuild lifecycle never destroyed the shadow texture (ADR-0111).
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    }, 10_000);
});
