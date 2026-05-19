/**
 * @file packages/render-pipeline/src/ScenePass.ts
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
 *
 * Extracted from src/engine/subsystems/rendering/pipeline/ via strangler-fig (A16-T1).
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { PassNode } from '@pryzm/renderer-three';

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
export function createScenePass(scene: THREE.Scene, camera: THREE.Camera): PassNode {
    const tsl = (globalThis as any).__PRYZM_TSL__;

    if (!tsl) {
        throw new Error('[ScenePass] TSL module not loaded. Call initTSL() before createScenePass().');
    }

    const { pass, mrt, output, diffuseColor, normalView, directionToColor, velocity } = tsl;

    const scenePass: PassNode = pass(scene, camera);

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

    return scenePass;
}
