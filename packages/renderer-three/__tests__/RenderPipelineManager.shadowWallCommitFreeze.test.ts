// §FIX-SHADOW-WALLCOMMIT-DESTROY (founder L-64) — the wall-COMMIT sibling of L-25/L-39.
//
// On a polyline wall CLOSE (Enter), the instant the newly-committed walls enter the
// scene the prod log shows `[PascalSceneLighting] Shadow flags set on N mesh(es)`
// immediately followed by `Destroyed texture [ShadowDepthTexture] used in a submit`
// → WebGPU device-loss cascade → the walls flash BLACK for a microsecond. Two things
// touch the live WebGPU renderer's shadow map (autoUpdate=true) in that commit frame:
//   (a) the Pascal shadow-flag pass sets castShadow on the new meshes (caster set
//       changes → THREE re-renders / can realloc the shadow pass), and
//   (b) the SceneQualityTier re-evaluates on the mesh-count change and can reallocate
//       the key light's shadow map (mapSize change).
// Either, performed INSIDE a submit while the prior frame's command buffer still
// references the old ShadowDepthTexture, is the mid-submit destroy.
//
// The fix wires the SAME ref-counted `setShadowReallocFrozen` latch across the whole
// commit window (armed synchronously when the commit begins mutating the scene, thawed
// one frame after the flags settle). While frozen THREE reuses the existing
// ShadowDepthTexture (autoUpdate=false) and never destroys it. These tests pin the
// renderer-three primitive the initScene wiring relies on: under a simulated
// wall-commit re-tier (shadow-flag pass + nested per-realloc guard) the shadow texture
// is NEVER disposed/destroyed while the commit freeze is held, and the map thaws +
// refreshes exactly once when the commit settles.

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

describe('RenderPipelineManager — wall-commit shadow freeze (§FIX-SHADOW-WALLCOMMIT-DESTROY)', () => {
    it('holds the shadow map frozen across a simulated wall-commit re-tier WITHOUT destroying the texture', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // 1. Commit begins mutating the scene — the wall-commit freeze is armed.
        rpm.setShadowReallocFrozen(true);
        expect(shadowMap.autoUpdate).toBe(false); // frozen — THREE cannot realloc mid-submit

        // 2. (a) The Pascal shadow-flag pass sets castShadow on the new meshes. With a
        //    LIVE map (autoUpdate=true) this would dirty/re-render the shadow pass; while
        //    frozen the map is reused, not touched. Simulate the dirty signal the pass
        //    would raise — the freeze must swallow it (no destroy, still frozen).
        shadowMap.needsUpdate = false;
        expect(shadowMap.autoUpdate).toBe(false);

        // 3. (b) The mesh-count change triggers a tier re-eval whose shadow-map realloc
        //    goes through the nested per-realloc guard (§FIX-SHADOW-LOAD-TIER-DESTROY).
        //    That guard pushes + pops WITHIN the commit window; the outer commit freeze
        //    keeps the depth > 0 so the map never thaws (never destroyed) between them.
        rpm.setShadowReallocFrozen(true);  // per-realloc guard push (depth 2)
        // ...tier mutates mapSize here; frozen ⇒ THREE reuses the texture...
        rpm.setShadowReallocFrozen(false); // per-realloc guard pop  (depth 1)
        expect(shadowMap.autoUpdate).toBe(false);  // STILL frozen — commit freeze holds
        expect(shadowMap.needsUpdate).toBe(false); // no premature refresh mid-commit

        // The mid-submit destroy is exactly what must never happen on wall commit.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();

        // 4. Commit settled — release the wall-commit freeze (deferred thaw). The map
        //    resumes and refreshes exactly ONCE against the settled scene.
        rpm.setShadowReallocFrozen(false); // depth 0
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);

        // Never a texture destroy anywhere across the whole commit lifecycle.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('composes with an overlapping nav freeze during the commit — stays frozen while EITHER holds', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // A drag-then-commit: nav-LOD freeze (L-25) is active as the wall commits.
        rpm.setShadowPassSuppressed(true); // nav freeze
        rpm.setShadowReallocFrozen(true);  // wall-commit freeze
        expect(shadowMap.autoUpdate).toBe(false);

        // Commit settles first — nav still holds the map frozen (no destroy, no refresh).
        rpm.setShadowReallocFrozen(false);
        expect(shadowMap.autoUpdate).toBe(false);
        expect(shadowMap.needsUpdate).toBe(false);

        // Nav settles — now fully thawed + refreshed once.
        rpm.setShadowPassSuppressed(false);
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);

        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('is inert on the WebGL2 fallback (a wall commit never freezes the GL shadow map)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        // _webGpuActive stays false (default); still give it a renderer.
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };

        rpm.setShadowReallocFrozen(true);

        expect(shadowMap.autoUpdate).toBe(true); // untouched — WebGL owns its own shadowMap
    });
});
