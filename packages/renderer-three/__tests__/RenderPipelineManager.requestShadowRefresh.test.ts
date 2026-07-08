// §FIX-WEBGPU-GROUND-SHADOW-DEVICE-LOSS (founder L-197) — the FREEZE-AWARE refresh that
// closes the regression L-171 introduced.
//
// L-171 (§FIX-GROUND-SHADOW-WEBGPU-RECEIVE) re-rendered the ground shadow after the key
// light was re-driven by poking `renderer.shadowMap.needsUpdate = true` DIRECTLY. That
// refit fires on geometry-settle — the SAME window the tier escalates to `cinematic` and
// the L-25/L-39/ADR-0111 freeze latch holds `autoUpdate=false` to keep the shadow map
// quiet during the mapSize realloc. Because `needsUpdate` OVERRIDES `autoUpdate=false`
// (THREE renders a shadow map when `autoUpdate || needsUpdate`), the direct poke DEFEATED
// the freeze: it forced the shadow depth pass mid-realloc/mid-submit, destroying+recreating
// the ShadowDepthTexture while the WebGPU queue still referenced it → "Destroyed texture
// [ShadowDepthTexture] used in a submit" ×hundreds → device loss → the ground shadow died.
//
// requestShadowRefresh() routes that refresh through the manager so it is freeze-aware.
// These tests pin the guarantee that closes the crash:
//   (1) when a freeze latch is active (load / tier realloc / nav), refresh is a NO-OP —
//       needsUpdate is NOT forced (the deferred thaw refreshes the settled scene instead);
//   (2) on a genuinely idle scene (no freeze) it DOES set needsUpdate — L-171's intent kept;
//   (3) it never disposes/destroys the shadow texture;
//   (4) it is inert when shadows are OFF (enabled=false — survival tier / safe-mode).

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake renderer.shadowMap that records every mutation + any dispose/destroy. */
function makeFakeRenderer(enabled = true) {
    const disposeSpy = vi.fn();
    const destroySpy = vi.fn();
    const shadowMap = {
        enabled,
        autoUpdate: true,
        needsUpdate: false,
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

describe('RenderPipelineManager.requestShadowRefresh (§FIX-WEBGPU-GROUND-SHADOW-DEVICE-LOSS)', () => {
    it('NO-OPs while a realloc/load freeze holds the map frozen (the crash guard)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // Tier escalation / project load holds the shadow map frozen (autoUpdate=false).
        rpm.setShadowReallocFrozen(true);
        expect(shadowMap.autoUpdate).toBe(false);

        // The L-171 geometry-settle refit fires INSIDE that freeze window. Before the fix
        // it forced needsUpdate=true here → shadow pass ran mid-realloc → device loss.
        rpm.requestShadowRefresh();

        // Must NOT force a refresh while frozen — needsUpdate stays false, no destroy.
        expect(shadowMap.needsUpdate).toBe(false);
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();

        // And the deferred thaw (last freeze release) still refreshes the settled scene,
        // so L-171's "re-render the shadow after the caster moved" intent is preserved.
        rpm.setShadowReallocFrozen(false);
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);
    });

    it('NO-OPs while the nav (pass-suppressed) freeze is active', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowPassSuppressed(true); // nav freeze
        expect(shadowMap.autoUpdate).toBe(false);

        rpm.requestShadowRefresh();
        expect(shadowMap.needsUpdate).toBe(false); // never forced mid-freeze
    });

    it('DOES refresh on a genuinely idle scene (no freeze) — L-171 intent preserved', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // Nothing frozen (settled scene, the case L-171 actually needed).
        rpm.requestShadowRefresh();

        expect(shadowMap.needsUpdate).toBe(true); // one depth re-render into the EXISTING texture
        expect(shadowMap.autoUpdate).toBe(true);  // never touches autoUpdate itself
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled(); // never a mapSize realloc / texture destroy
    });

    it('is inert when shadows are OFF (enabled=false — survival tier / safe-mode)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer(false); // shadowMap.enabled = false
        armWebGpu(rpm, { shadowMap });

        rpm.requestShadowRefresh();
        expect(shadowMap.needsUpdate).toBe(false); // respected the deliberate OFF
    });

    it('refreshes on the WebGL fallback (no freeze lane there) — matches L-171 WebGL behaviour', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        // _webGpuActive stays false (WebGL fallback owns its own shadowMap; never frozen).
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };

        rpm.requestShadowRefresh();
        expect(shadowMap.needsUpdate).toBe(true);
    });
});
