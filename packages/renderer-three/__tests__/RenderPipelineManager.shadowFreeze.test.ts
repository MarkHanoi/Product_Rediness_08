// §FIX-SHADOW-MIDSUBMIT-DESTROY (founder L-25) — the §PERF-NAV-LOD nav lever must
// suppress the shadow PASS WITHOUT ever destroying the ShadowDepthTexture.
//
// Regression: the nav-LOD gate used to clear `keyLight.castShadow` during camera
// motion. On the WebGPU backend, clearing castShadow makes THREE destroy the
// light's ShadowDepthTexture inside the next rp.render() — while the previous
// frame's command buffer (referencing it) is still in flight on the GPU queue →
// "Destroyed texture [ShadowDepthTexture] used in a submit" → device-loss → black
// 3D. Rapid mouse motion thrashed that destroy/realloc every few frames.
//
// The fix FREEZES the shadow map (renderer.shadowMap.autoUpdate = false) instead of
// tearing it down: THREE reuses the existing texture and skips the shadow-caster
// re-render — nothing is allocated, reallocated, or destroyed. These tests pin:
//   (1) suppress(true)  → shadowMap.autoUpdate = false, NO dispose/destroy call;
//   (2) suppress(false) → autoUpdate = true + needsUpdate = true (refresh once);
//   (3) idempotent (repeat calls do not re-touch the map);
//   (4) it freezes on the WebGL fallback TOO — see the inverted case at the bottom;
//   (5) §NAV-SHADOW-NEVER-DOWNGRADES-QUALITY (L-3311) — the freeze must never reduce
//       what is DRAWN. Founder, 2026-08-22: "please don't compromise graphics."
//       three r183 WebGLShadowMap.render() opens with TWO separate guards:
//           if ( scope.enabled === false ) return;                                  ← shadows OFF
//           if ( scope.autoUpdate === false && scope.needsUpdate === false ) return; ← this fix
//       Only the SECOND is touched. The depth texture stays bound and every material
//       keeps sampling it, so shadows remain on screen at full resolution — they are
//       not recomputed while the camera moves, which is a different thing from being
//       turned down. The case below pins that distinction so no future "optimisation"
//       can quietly reach for `enabled`, `castShadow`, or `mapSize` under this name.

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake renderer.shadowMap that records every mutation + any dispose/destroy. */
function makeFakeRenderer() {
    const disposeSpy = vi.fn();
    const destroySpy = vi.fn();
    const shadowMap = {
        autoUpdate: true,
        needsUpdate: false,
        // Quality-bearing fields. NOTHING in the freeze path may write these.
        enabled: true,
        type: 'PCFSoftShadowMap',
        mapSize: { width: 2048, height: 2048 },
        // If the code ever tried to tear the map down, these would fire — they MUST NOT.
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

describe('RenderPipelineManager.setShadowPassSuppressed (§FIX-SHADOW-MIDSUBMIT-DESTROY)', () => {
    it('freezes the shadow map on suppress(true) WITHOUT disposing/destroying it', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowPassSuppressed(true);

        expect(shadowMap.autoUpdate).toBe(false); // frozen — no re-render of the pass
        // The guarantee: no shadow texture is ever destroyed within the frame.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('resumes + refreshes once on suppress(false)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowPassSuppressed(true);
        rpm.setShadowPassSuppressed(false);

        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true); // one refresh against the settled scene
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('is idempotent — a repeated suppress(true) does not re-touch the map', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowPassSuppressed(true);
        shadowMap.autoUpdate = false;
        // Sentinel: mutate needsUpdate so we can detect an unexpected second write.
        shadowMap.needsUpdate = false;
        rpm.setShadowPassSuppressed(true); // no-op — already suppressed

        expect(shadowMap.needsUpdate).toBe(false); // untouched by the second call
    });

    // ⚠ INVERTED 2026-08-22, §NAV-SHADOW-CAMERA-CANNOT-CHANGE-IT (L-3310).
    //
    // This case used to be titled *"is inert when WebGPU is not active (WebGL fallback
    // owns its shadowMap)"* and asserted `autoUpdate === true` after a suppress call. It
    // was not testing a requirement — it was PINNING a belief the repository had already
    // measured as false: three r183's classic `WebGLShadowMap` reads the per-light
    // autoUpdate flags too (WebGLShadowMap.js:95 and :170), which is why L-1480 removed
    // the identical gate from `_applyShadowFreezeState` in the same class.
    //
    // ⭐ It is kept, inverted, rather than deleted. A green test standing guard over a
    // defect is worth more as a record of how the defect survived than as a deletion: the
    // belief has now cost three separate bugs, and this file voted for it each time.
    it('freezes on the WebGL fallback TOO — the per-light flags are read there as well', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        // _webGpuActive stays false (default) — this IS the WebGL fallback, and it is the
        // backend `autoWebGLHeavyScene` forces a heavy scene onto, i.e. exactly the case
        // the nav freeze exists for.
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };

        rpm.setShadowPassSuppressed(true);
        expect(shadowMap.autoUpdate).toBe(false);

        // …and thawing resumes it and asks for exactly one refresh against the settled
        // scene, so a frozen map can never outlive the motion that froze it.
        rpm.setShadowPassSuppressed(false);
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);
    });

    it('§NAV-SHADOW-NEVER-DOWNGRADES-QUALITY (L-3311) — freezing changes what is RECOMPUTED, never what is DRAWN', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };

        rpm.setShadowPassSuppressed(true);   // camera drag begins

        // ⭐ THE WHOLE POINT. `enabled` is the flag that turns shadows OFF; the freeze
        // must never touch it, or "faster navigation" silently becomes "no shadows".
        expect(shadowMap.enabled, 'the freeze turned shadows OFF — this is a quality regression, not a perf win').toBe(true);
        // Resolution and filtering are quality settings. A freeze is not a tier drop.
        expect(shadowMap.mapSize).toEqual({ width: 2048, height: 2048 });
        expect(shadowMap.type).toBe('PCFSoftShadowMap');
        // And the texture the materials sample must still exist (§FIX-SHADOW-MIDSUBMIT-DESTROY).
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();

        // Only this one flag moved.
        expect(shadowMap.autoUpdate).toBe(false);

        rpm.setShadowPassSuppressed(false);  // camera settles
        expect(shadowMap.enabled).toBe(true);
        expect(shadowMap.mapSize).toEqual({ width: 2048, height: 2048 });
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true);
    });
});
