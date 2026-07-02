// §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — the LOAD-time sibling of L-25.
//
// On project open the SceneQualityTier escalates to `cinematic` and
// ShadowQualityUpgrader.setLevel() reallocates the Pascal key light's shadow map
// 512→2048. With the live WebGPU renderer's `shadowMap.autoUpdate === true`, THREE
// performs that realloc INSIDE a render/submit while the rAF loop is still draining
// command buffers that reference the old ShadowDepthTexture → "Destroyed texture
// [ShadowDepthTexture] used in a submit" ×hundreds → device loss → the whole app
// freezes on the last frame. The existing §SHADOW-DEVICE-LOSS-FIX setTimeout(0)
// covered the upgrader's explicit .dispose() but NOT THREE's own in-render realloc.
//
// setShadowReallocFrozen(frozen) FREEZES the shadow map (autoUpdate=false) so THREE
// cannot touch it while the resolution changes; the caller thaws deferred so the one
// regen lands on an idle frame. It is REF-COUNTED (nested realloc guards + the whole-
// load freeze compose) and shares one applier with the nav freeze. These tests pin:
//   (1) frozen(true)  → autoUpdate=false, NEVER a dispose/destroy on the shadow map;
//   (2) ref-count: nested freeze thaws only when the LAST source releases, and the
//       final release refreshes once (needsUpdate=true);
//   (3) composition with setShadowPassSuppressed (nav) — the map stays frozen while
//       EITHER source is active;
//   (4) inert when WebGPU is not active (WebGL fallback owns its own shadowMap).

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake renderer.shadowMap that records every mutation + any dispose/destroy. */
function makeFakeRenderer() {
    const disposeSpy = vi.fn();
    const destroySpy = vi.fn();
    const shadowMap = {
        autoUpdate: true,
        needsUpdate: false,
        // A mid-submit shadow-texture destroy is exactly the crash — these MUST NOT fire.
        dispose: disposeSpy,
        map: { dispose: destroySpy, destroy: destroySpy },
    };
    return { shadowMap, disposeSpy, destroySpy };
}

/** Force the manager into active-WebGPU state with a fake renderer, no real GPU. */
function armWebGpu(rpm: RenderPipelineManager, renderer: unknown): void {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    (rpm as unknown as { _renderer: unknown })._renderer = renderer;
}

describe('RenderPipelineManager.setShadowReallocFrozen (§FIX-SHADOW-LOAD-TIER-DESTROY)', () => {
    it('freezes the shadow map on frozen(true) WITHOUT disposing/destroying it', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowReallocFrozen(true);

        expect(shadowMap.autoUpdate).toBe(false); // frozen — THREE cannot realloc mid-submit
        // The load-time crash was a destroy-in-submit; the freeze must never destroy.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('is ref-counted — nested freezes thaw only on the LAST release, refreshing once', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // The whole-load freeze + a per-realloc guard both push.
        rpm.setShadowReallocFrozen(true);  // depth 1
        rpm.setShadowReallocFrozen(true);  // depth 2
        expect(shadowMap.autoUpdate).toBe(false);

        // First release — still one source holding it frozen.
        rpm.setShadowReallocFrozen(false); // depth 1
        expect(shadowMap.autoUpdate).toBe(false);
        expect(shadowMap.needsUpdate).toBe(false); // not thawed yet — no refresh

        // Last release — resume + refresh exactly once against the settled scene.
        rpm.setShadowReallocFrozen(false); // depth 0
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);

        // A surplus pop must not underflow into a spurious thaw/refresh.
        shadowMap.needsUpdate = false;
        rpm.setShadowReallocFrozen(false); // depth already 0 — no-op
        expect(shadowMap.needsUpdate).toBe(false);

        // Never a texture destroy anywhere in the realloc lifecycle.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('composes with the nav freeze — stays frozen while EITHER source is active', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowPassSuppressed(true);   // nav freeze
        rpm.setShadowReallocFrozen(true);    // realloc/load freeze
        expect(shadowMap.autoUpdate).toBe(false);

        // Release the realloc source — nav still holds the map frozen.
        rpm.setShadowReallocFrozen(false);
        expect(shadowMap.autoUpdate).toBe(false);
        expect(shadowMap.needsUpdate).toBe(false); // no premature refresh

        // Release nav — now fully thawed + refreshed once.
        rpm.setShadowPassSuppressed(false);
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);
    });

    it('is inert when WebGPU is not active (WebGL fallback owns its shadowMap)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        // _webGpuActive stays false (default); still give it a renderer.
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };

        rpm.setShadowReallocFrozen(true);

        expect(shadowMap.autoUpdate).toBe(true); // untouched — early return
    });
});
