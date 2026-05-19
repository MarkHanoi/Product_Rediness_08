/**
 * @file src/rendering/pipeline/SSGIPass.ts
 *
 * Phase 3 — Ambient Occlusion + GI pass (SSGINode + Denoise, Three.js r183).
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-3, Steps 3.1–3.3):
 *  - Implements ambient occlusion using SSGINode and a DenoiseNode pass.
 *  - The AI denoiser eliminates AO flicker from SSGI's raw output.
 *  - Compositing formula (from migration spec §3.3):
 *      final = (scene × AO) + (zone + diffuse × GI)
 *
 * r183 upgrade notes (Phase B):
 *  B2 — GTAONode → SSGINode:
 *    SSGINode.js ships in Three.js r183. It replaces GTAONode and adds:
 *      aoIntensity: 1.5 (AO intensity multiplier — no equivalent in r175)
 *      backfaceLighting: 0.5 (light bleeds through thin surfaces)
 *      sliceCount, stepCount (per-slice AO control)
 *      useScreenSpaceSampling, useLinearThickness
 *    AO is packed into the ALPHA channel (SSGINode), not RGB (GTAONode).
 *    Remap before denoiser: vec4(giTexture.a, giTexture.a, giTexture.a, float(1))
 *
 *  B3 — MRT normal input restored:
 *    r175 bug: compound TSL nodes passed as normalNode were not re-parameterised
 *    per offset UV, corrupting the hemisphere integral. Fix was to pass null.
 *    r183 ships sample((uv) => ...) which correctly re-parameterises the inner
 *    lookup. MRT normals are now used: smoother AO at polygon boundaries.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No semantic state mutations.
 */

import * as THREE from '../three-re-export';
import type { PassNode, TSLNode } from '../tsl-types';

// ── Quality parameters ────────────────────────────────────────────────────

/**
 * SSGINode quality settings — aligned with Pascal reference (post-processing.tsx SSGI_PARAMS).
 * All values match Pascal exactly.
 */
export interface SSGIQualityParams {
    /** Search radius in world units. Pascal: 1.0 */
    radius:                 number;
    /** Assumed surface thickness. Pascal: 0.5 */
    thickness:              number;
    /** Exponential step distance factor (replaces distanceExponent). Pascal: 1.5 */
    expFactor:              number;
    /** Number of AO slices per pixel. Pascal: 1 */
    sliceCount:             number;
    /** Steps per slice. Pascal: 4 */
    stepCount:              number;
    /** AO intensity multiplier — darkens corners. Pascal: 1.5 */
    aoIntensity:            number;
    /** Light that bleeds through thin surfaces. Pascal: 0.5 */
    backfaceLighting:       number;
    /** Denoiser sample radius. Pascal: 4 */
    denoiseRadius:          number;
    /** Indirect GI intensity. Pascal: 0 (enable after QA). */
    giIntensity:            number;
    /** Use linear thickness distribution. Pascal: false */
    useLinearThickness:     boolean;
    /** Use screen-space sampling. Pascal: true */
    useScreenSpaceSampling: boolean;
    /** Internal temporal filtering in SSGI (separate from TRAA). Pascal: false */
    useTemporalFiltering:   boolean;
}

export const DEFAULT_SSGI_PARAMS: Readonly<SSGIQualityParams> = {
    radius:                 1.0,
    thickness:              0.5,
    expFactor:              1.5,
    sliceCount:             1,
    stepCount:              4,
    aoIntensity:            1.5,
    backfaceLighting:       0.5,
    denoiseRadius:          4,
    giIntensity:            0,
    useLinearThickness:     false,
    useScreenSpaceSampling: true,
    useTemporalFiltering:   false,
};

// ── SSGIPass result ───────────────────────────────────────────────────────

export interface SSGIPassResult {
    /**
     * Denoised ambient occlusion scalar node (range [0, 1]).
     * Use: `sceneColor.mul(ao)` to darken occluded surfaces.
     */
    ao: TSLNode;
    /**
     * Indirect GI colour contribution node.
     * Use: `diffuse.mul(gi)` to add indirect bounce light.
     */
    gi: TSLNode;
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates the SSGINode ambient occlusion + AI denoiser pass (Three.js r183).
 *
 * B2: Uses SSGINode (r183) instead of GTAONode (r175).
 *   - AO packed in alpha channel — remapped to RGB before DenoiseNode.
 *   - Full parameter set: sliceCount, stepCount, aoIntensity, backfaceLighting.
 *
 * B3: Restores MRT normal input via UV-parameterised sample() lambda.
 *   - sample((uv) => colorToDirection(scenePassNormal.sample(uv))) correctly
 *     re-parameterises the inner lookup per offset UV in r183.
 *   - Eliminates the depth-reconstruction fallback (null normalNode) from r175.
 *
 * Matches Pascal post-processing.tsx exactly (lines 158–190).
 *
 * @param scenePass — The MRT scene pass (ScenePass.ts).
 * @param camera    — The Three.js PerspectiveCamera.
 * @param params    — Optional quality overrides; defaults to DEFAULT_SSGI_PARAMS.
 * @returns `{ ao, gi }` TSL nodes for the compositing formula.
 */
export async function createSSGIPass(
    scenePass: PassNode,
    camera: THREE.Camera,
    params: Partial<SSGIQualityParams> = {},
): Promise<SSGIPassResult> {
    const tsl = (globalThis as any).__PRYZM_TSL__;
    if (!tsl) throw new Error('[SSGIPass] TSL not loaded. Call initTSL() before createSSGIPass().');

    const { vec3, vec4, float, sample, colorToDirection } = tsl;

    const q: SSGIQualityParams = { ...DEFAULT_SSGI_PARAMS, ...params };

    // ── MRT texture nodes ──────────────────────────────────────────────────
    const scenePassColor  = scenePass.getTextureNode('output');
    const scenePassDepth  = scenePass.getTextureNode('depth');
    const scenePassNormal = scenePass.getTextureNode('normal');

    // B3 — UV-parameterised normal sampling (r183 API).
    // sample((uv) => ...) re-parameterises the inner colorToDirection lookup per
    // offset UV — exactly matching Pascal post-processing.tsx lines 158–160.
    const sceneNormal = sample((uv: unknown) =>
        colorToDirection((scenePassNormal as any).sample(uv))
    );

    // ── SSGINode pass (B2) ─────────────────────────────────────────────────
    // r183 API: ssgi(scenePassColor, scenePassDepth, sceneNormal, camera)
    // Import path: three/examples/jsm/tsl/display/SSGINode.js (r183 — NOT three/addons)
    const { ssgi } = await import(
        /* @vite-ignore */
        'three/examples/jsm/tsl/display/SSGINode.js'
    ) as { ssgi: (color: unknown, depth: unknown, normal: unknown, camera: unknown) => any };

    const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);

    // Apply all quality parameters — exact Pascal values (SSGI_PARAMS in post-processing.tsx)
    giPass.sliceCount.value             = q.sliceCount;
    giPass.stepCount.value              = q.stepCount;
    giPass.radius.value                 = q.radius;
    giPass.expFactor.value              = q.expFactor;
    giPass.thickness.value              = q.thickness;
    giPass.backfaceLighting.value       = q.backfaceLighting;
    giPass.aoIntensity.value            = q.aoIntensity;
    giPass.giIntensity.value            = q.giIntensity;
    giPass.useLinearThickness.value     = q.useLinearThickness;
    giPass.useScreenSpaceSampling.value = q.useScreenSpaceSampling;
    giPass.useTemporalFiltering         = q.useTemporalFiltering;

    // ── AO channel remap (B2 — critical) ──────────────────────────────────
    // SSGINode packs AO into the ALPHA channel (.a), unlike GTAONode which used RGB.
    // DenoiseNode only denoises RGB, so remap alpha → RGB before denoising.
    // Matches Pascal post-processing.tsx line 184:
    //   const aoAsRgb = vec4(giTexture.a, giTexture.a, giTexture.a, float(1))
    const giTexture = (giPass as any).getTextureNode();
    const aoAsRgb = vec4(giTexture.a, giTexture.a, giTexture.a, float(1));

    // ── Denoise pass ───────────────────────────────────────────────────────
    // Denoiser now receives MRT normals (sceneNormal) instead of null.
    // Matches Pascal post-processing.tsx line 185.
    const { denoise } = await import(
        /* @vite-ignore */
        'three/examples/jsm/tsl/display/DenoiseNode.js'
    ) as { denoise: (tex: unknown, depth: unknown, normal: unknown, camera: unknown) => any };

    const denoisePass = denoise(aoAsRgb, scenePassDepth, sceneNormal, camera);
    denoisePass.index.value  = 0;
    denoisePass.radius.value = q.denoiseRadius;

    // ── Compositing nodes ──────────────────────────────────────────────────
    // AO scalar from denoised pass (.r — denoised RGB all same value after remap).
    // Matches Pascal post-processing.tsx line 190: const ao = (denoisePass as any).r
    const aoNode: TSLNode = (denoisePass as any).r;

    // GI colour contribution from SSGINode (.rgb).
    // Matches Pascal post-processing.tsx line 189: const gi = giPass.rgb
    const giNode: TSLNode = q.giIntensity > 0
        ? (giPass as any).rgb
        : vec3(0);

    return { ao: aoNode, gi: giNode };
}
