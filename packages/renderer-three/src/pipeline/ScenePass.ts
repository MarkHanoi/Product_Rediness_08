/**
 * @file src/rendering/pipeline/ScenePass.ts
 *
 * Phase 2 — MRT Scene Pass.
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-2, Step 2.1):
 *  - Creates a TSL PassNode that writes four textures per frame (MRT):
 *      • output       — Final rendered colour (RGBA, full-float)
 *      • diffuseColor — Albedo without lighting (UnsignedByteType; GI compositing)
 *      • normal       — View-space normals colour-encoded via directionToColor()
 *                       (UnsignedByteType; decoded in SSGIPass with colorToDirection())
 *      • velocity     — Screen-space motion vectors (TRAA)
 *
 *  Normal encoding — precisely matches the editor (post-processing.tsx):
 *    STORE:  `normal: directionToColor(normalView)`   ← here, in MRT
 *    DECODE: `colorToDirection(scenePassNormal.sample(uv))`  ← in SSGIPass (Phase 3)
 *
 *  Both diffuse and normal use UnsignedByteType (8-bit bandwidth saving).
 *  Editor lines 151–156 set UnsignedByteType for BOTH attachments.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No semantic state mutations.
 *  - Does NOT depend on any ElementStore.
 */

import * as THREE from '../three-re-export';
import type { PassNode } from '../tsl-types';

// ── MRT attachment names (string literals for getTexture / getTextureNode) ──

export const MRT_OUTPUT        = 'output'       as const;
export const MRT_DIFFUSE       = 'diffuseColor' as const;
export const MRT_NORMAL        = 'normal'       as const;
export const MRT_VELOCITY      = 'velocity'     as const;

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates the primary MRT scene render pass.
 *
 * Each call returns a fresh PassNode configured for four simultaneous outputs.
 * Call this once per renderer/pipeline lifecycle.
 *
 * @param scene  — The Three.js scene to render.
 * @param camera — The Three.js camera to render from.
 * @returns A configured PassNode with MRT attachments ready.
 */
export function createScenePass(
    scene: THREE.Scene,
    camera: THREE.Camera,
    /**
     * §FIX-WEBGPU-INVALID-PIPELINE-MRT (L-253) — build the G-buffer ONLY when something
     * actually consumes it. `true` when SSGI or TRAA is active; `false` otherwise.
     * Defaults to `false`: a caller that has not thought about it gets the SAFE pipeline.
     */
    needsGBuffer = false,
): PassNode {
    const tsl = (globalThis as any).__PRYZM_TSL__;

    if (!tsl) {
        throw new Error('[ScenePass] TSL module not loaded. Call initTSL() before createScenePass().');
    }

    const { pass, mrt, output, diffuseColor, normalView, directionToColor, velocity } = tsl;

    const scenePass: PassNode = pass(scene, camera);

    // ─── §FIX-WEBGPU-INVALID-PIPELINE-MRT (L-253) ────────────────────────────────────
    //
    // THE FOUNDER'S 3D SCENE STUTTER. THE GPU WAS NOT SLOW — IT WAS REJECTING EVERY FRAME.
    //
    // This pass used to declare the 4-target G-buffer UNCONDITIONALLY. But the extra three
    // targets exist for exactly two consumers — SSGI reads `diffuseColor` + `normal`, TRAA
    // reads `velocity` — and BOTH ARE OFF BY DEFAULT (the pipeline runs at phase 2/4 with
    // `SSGI: false | TRAA: false`). So on a normal session we declared three render targets
    // that nothing on earth read.
    //
    // That is not merely wasteful, it is INVALID. A material whose fragment stage does not
    // emit those outputs — a ShadowMaterial, a line/gizmo material, anything not authored as
    // a node material — leaves `targets[1]` with a non-zero write mask and no matching
    // fragment output. WebGPU rejects the pipeline, verbatim from the founder's console:
    //
    //   THREE.Color target has no corresponding fragment stage output but writeMask
    //   (ColorWriteMask::(Red|Green|Blue|Alpha)) is not zero.
    //     - While validating targets[1] framebuffer output.
    //     - While calling [Device].CreateRenderPipeline(...).
    //   [Invalid RenderPipeline "renderPipeline_RenderPipeline_383"] is invalid due to a
    //   previous error. - While encoding [RenderPassEncoder].SetPipeline(...).
    //   [Invalid CommandBuffer] ... - While calling [Queue].Submit(...)
    //
    // Every frame then encoded with an invalid pipeline and every submit was REJECTED,
    // flooding validation errors until the device gave up reporting them ("WebGPU: too many
    // warnings"). That is the stutter. It also explains the founder's own workaround exactly:
    // a live backend swap tears the pipeline down and rebuilds it, and the rebuilt one is
    // valid — so the scene goes smooth, which is why WebGL→WebGPU "fixed" it.
    //
    // The fix is not a workaround, it is the rule: DO NOT DECLARE RENDER TARGETS NOTHING
    // CONSUMES. With SSGI/TRAA off we render a single `output` target — valid for every
    // material in the scene, and 4 attachments of bandwidth cheaper. When SSGI or TRAA is
    // switched on, the caller asks for the G-buffer and the full MRT comes back.
    if (needsGBuffer) {
        // Write 4 textures per frame — the MRT configuration.
        // Normals are colour-encoded with directionToColor() to fit in UnsignedByteType.
        // The decoder (colorToDirection) is applied in SSGIPass (Phase 3) before
        // passing to the SSGI node — exactly matching the editor's pattern.
        scenePass.setMRT(mrt({
            [MRT_OUTPUT]:   output,
            [MRT_DIFFUSE]:  diffuseColor,
            [MRT_NORMAL]:   directionToColor(normalView),   // colour-encoded; decode with colorToDirection()
            [MRT_VELOCITY]: velocity,
        }));

        // Reduce bandwidth: both diffuse and normal encoded into 8-bit per channel.
        // Editor (post-processing.tsx lines 151–156) sets UnsignedByteType for both.
        const diffuseTexture = scenePass.getTexture(MRT_DIFFUSE);
        diffuseTexture.type = THREE.UnsignedByteType;

        const normalTexture = scenePass.getTexture(MRT_NORMAL);
        normalTexture.type = THREE.UnsignedByteType;
    }

    return scenePass;
}
