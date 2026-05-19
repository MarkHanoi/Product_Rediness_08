/**
 * @file src/rendering/pipeline/TRAAPass.ts
 *
 * Phase 4 — Temporal Reprojection Anti-Aliasing (TRAA) colour filter.
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-4, Step 4.1):
 *  - Replaces hardware MSAA (disabled in createRenderer, antialias: false).
 *  - Uses velocity vectors from the MRT ScenePass for reprojection.
 *  - Applied AFTER compositing (scene + AO + zones + outlines) as a colour filter.
 *
 * B4 — Three.js r183 upgrade:
 *  r175 shipped TRAAPassNode (traaPass) — a full scene re-render pass that owned
 *  the render loop and could not accept a composite colour input. It conflicted with
 *  MRT velocity attachments, throwing "Missing velocity output in MRT configuration".
 *
 *  r183 ships TRAANode (traa) — a colour-filter that takes any input colour node
 *  and returns a temporally-smoothed version. It slots cleanly into the existing
 *  PostProcessing/RenderPipeline pipeline after SSGI compositing.
 *
 *  This file now implements the r183 colour-filter pattern exactly matching
 *  Pascal post-processing.tsx lines 265–271.
 *
 * Why TRAA over MSAA:
 *  - MSAA: 4× per-pixel samples → 4× fill-rate cost.
 *  - TRAA: velocity-buffer reprojection → near-zero per-frame cost.
 *  - TRAA quality improves over time as temporal history accumulates.
 *  - TRAA handles transparency correctly (MSAA does not).
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No semantic state mutations.
 */

import type * as THREE from '../three-re-export';
import type { TSLNode } from '../tsl-types';

// ── TRAAFilterResult ──────────────────────────────────────────────────────

export interface TRAAFilterResult {
    /**
     * The TRAA-smoothed colour output (RGB node).
     * Blend with the pre-TRAA composite via the hasGeometry mask:
     *   colorSource = mix(composite.rgb, traaRgb, hasGeometry)
     *
     * Background pixels (depth=1, hasGeometry=0) use composite directly —
     * passing depth=1 into TRAA would output black for those pixels.
     */
    traaRgb: TSLNode;
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates the r183 TRAA colour filter.
 *
 * Wraps the compositeNode (scene + AO + outlines) in a TRAANode that uses
 * velocity vectors for temporal reprojection. The result is temporally smooth
 * edges with near-zero per-frame GPU cost.
 *
 * Matches Pascal post-processing.tsx lines 265–271:
 *   const traaOutput = traa(compositeWithOutlines, scenePassDepth, scenePassVelocity, camera)
 *   const traaRgb = (traaOutput as any).rgb
 *
 * @param compositeNode     — The colour input to smooth (scene + AO + outlines).
 * @param scenePassDepth    — Depth texture node from the MRT ScenePass.
 * @param scenePassVelocity — Velocity texture node from the MRT ScenePass.
 * @param camera            — The Three.js camera.
 * @returns `{ traaRgb }` — Temporally-smoothed RGB node.
 */
export async function createTRAAFilter(
    compositeNode: TSLNode,
    scenePassDepth: TSLNode,
    scenePassVelocity: TSLNode,
    camera: THREE.Camera,
): Promise<TRAAFilterResult> {
    const tsl = (globalThis as any).__PRYZM_TSL__;
    if (!tsl) throw new Error('[TRAAPass] TSL not loaded.');

    // r183 API: traa(compositeNode, depthNode, velocityNode, camera)
    // Import path: three/examples/jsm/tsl/display/TRAANode.js (r183 — NOT three/addons)
    const { traa } = await import(
        /* @vite-ignore */
        'three/examples/jsm/tsl/display/TRAANode.js'
    ) as { traa: (composite: unknown, depth: unknown, velocity: unknown, camera: unknown) => any };

    const traaOutput = traa(compositeNode, scenePassDepth, scenePassVelocity, camera);

    return { traaRgb: (traaOutput as any).rgb };
}
