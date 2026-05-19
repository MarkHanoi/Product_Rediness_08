/**
 * @file src/rendering/pipeline/ZonePass.ts
 *
 * Phase 2 — Zone Layer Pass.
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-2, Step 2.2):
 *  - Renders only the Zone layer (Three.js Layer 2) into a separate pass.
 *  - Zones must NOT contaminate the SSGI normal/depth buffers from ScenePass.
 *  - Zone geometry lives in VisibilityGovernance (VGSceneApplicator),
 *    which places zone meshes on Layer 2.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No semantic state mutations.
 *
 * Layer conventions — precisely match the editor (editor/packages/viewer/src/lib/layers.ts):
 *   SCENE_LAYER = 0  — All normal BIM geometry (walls, slabs, columns, etc.)
 *   ZONE_LAYER  = 2  — Zones only (VGGovernanceStore / VGSceneApplicator)
 *
 * Layer setup — precisely matches the editor (post-processing.tsx lines 66–71):
 *   const l = new Layers()
 *   l.enable(ZONE_LAYER)    // enable layer 2
 *   l.disable(SCENE_LAYER)  // disable layer 0 (default layer, enabled by default)
 *
 * The zone pass is composited OVER the scene pass in the final output node
 * (see RenderPipelineManager §compositing).
 */

import * as THREE from '../three-re-export';
import type { PassNode } from '../tsl-types';

// ── Layer constants (match editor: editor/packages/viewer/src/lib/layers.ts) ──

/** Three.js layer index for all normal BIM geometry. */
export const SCENE_LAYER = 0 as const;

/** Three.js layer index for zone-only geometry (VGGovernanceStore). */
export const ZONE_LAYER  = 2 as const;

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates the zone layer render pass.
 *
 * Only objects on ZONE_LAYER (2) are rendered.  SCENE_LAYER (0) geometry is
 * excluded so zone transparency compositing works correctly without SSGI
 * contamination.
 *
 * Layer setup mirrors the editor exactly:
 *   new Layers() → layer 0 enabled by default
 *   enable(ZONE_LAYER)   → also enable layer 2
 *   disable(SCENE_LAYER) → remove layer 0
 *
 * @param scene  — The Three.js scene shared with ScenePass.
 * @param camera — The same camera used by ScenePass.
 * @returns A PassNode restricted to ZONE_LAYER.
 */
export function createZonePass(scene: THREE.Scene, camera: THREE.Camera): PassNode {
    const tsl = (globalThis as any).__PRYZM_TSL__;

    if (!tsl) {
        throw new Error('[ZonePass] TSL module not loaded. Call initTSL() before createZonePass().');
    }

    const { pass } = tsl;

    // Mirror editor pattern exactly (post-processing.tsx lines 66–71):
    //   const l = new Layers()
    //   l.enable(ZONE_LAYER)
    //   l.disable(SCENE_LAYER)
    const zoneLayers = new THREE.Layers();
    zoneLayers.enable(ZONE_LAYER);
    zoneLayers.disable(SCENE_LAYER);

    const zonePass: PassNode = pass(scene, camera);
    zonePass.setLayers(zoneLayers);

    return zonePass;
}
