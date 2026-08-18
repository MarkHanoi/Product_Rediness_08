/**
 * @file packages/core-app-model/src/rendering/NeutralStudioEnvironment.ts
 * @description §FEAT-PASCAL-METAL-ENV (L-967) — the reflectance source the Pascal
 *              lighting path gives to `scene.environment`, so metals are not black.
 *
 * ## WHY THIS EXISTS AT ALL
 *
 * `metalness: 0.9` (C100 `aluminium-brushed-dark`) is a near-fully-metallic PBR
 * surface: its diffuse albedo is `color × (1 − metalness)` = 10 % of an already dark
 * `#474d52`, and everything else it shows is REFLECTED. `PascalSceneLighting` set
 * `scene.environment = null` on purpose, so there was nothing to reflect and EVERY
 * high-metalness material in the product rendered black — walls, columns, beams,
 * handrails, furniture. Curtain wall is only where the founder first pointed a metal
 * at a large flat face.
 *
 * ## WHY NOT `ProceduralSkyService` / `HDRIEnvironmentManager` — THEY ALREADY EXIST
 *
 * Both were considered FIRST and both are the right tool for a DIFFERENT job. Each
 * builds its environment with `THREE.PMREMGenerator`, which is **constructed against a
 * renderer** and returns that renderer's render-target texture:
 *
 *   • `ProceduralSkyService.activate(scene, renderer)` → `new THREE.PMREMGenerator(renderer)`
 *   • `HDRIEnvironmentManager` → the same, from an `.hdr`
 *
 * A live backend swap (`webgpu` ⇄ `webgl-fallback`, which the founder's own log shows
 * happening inside one session, together with `§RETIRE-RENDERER-DETACHES-LISTENERS old
 * renderer retired`) RETIRES that renderer and takes its GPU resources with it. A
 * PMREM render-target left on `scene.environment` across such a swap is a texture the
 * NEW renderer does not own — so metals would go black again on the next device loss,
 * and the founder would see an INTERMITTENT bug, which is worse than a consistent one.
 *
 * This module therefore hands `scene.environment` a plain **equirectangular
 * `DataTexture`** — CPU-side pixels, owned by nobody. Three PMREMs it *per renderer*,
 * internally and lazily:
 *
 *   • WebGL2  — `WebGLCubeUVMaps.get()` builds a CubeUV map from an
 *               `EquirectangularReflectionMapping` texture inside the renderer's cache.
 *   • WebGPU  — `EnvironmentNode.setup()` → `this._getPMREMNodeCache( builder.renderer )`
 *               → `pmremTexture( value )`, a cache **keyed on the renderer**.
 *
 * Because the cache is per-renderer and the SOURCE is renderer-independent, the new
 * renderer regenerates its own PMREM on the first frame after a swap. That is the
 * property this file exists to buy, and it is the one property a PMREM-based provider
 * cannot offer. It is not a rival environment PROVIDER: it owns no lifecycle, no
 * slot arbitration and no visible sky mesh — it is a texture factory (C84 EI-9/EI-10).
 *
 * Both real providers still win when they activate: `ProceduralSkyService` and
 * `HDRIEnvironmentManager` save `scene.environment` on activate and restore it on
 * deactivate, so they overwrite this baseline and hand it back. No coordination code
 * is needed and none is added.
 *
 * ## NORMALISATION — WHY `environmentIntensity` IS READABLE AS A NUMBER
 *
 * The texture is scaled so its **mean radiance over the sphere is exactly 1.0** in
 * linear light. `scene.environmentIntensity = X` therefore means literally "the metal
 * sees an average environment radiance of X". Without this the intensity sweep in
 * `PascalSceneLighting.metalEnvironment.test.ts` would be numbers about an arbitrary
 * texture rather than about light.
 */

import * as THREE from '@pryzm/renderer-three/three';

/** Equirect width. 64×32 is ample: PMREM's roughness mips destroy detail anyway. */
const ENV_W = 64;
/** Equirect height. */
const ENV_H = 32;

/**
 * The three bands, as LINEAR radiance BEFORE normalisation (relative values only —
 * the unit-mean rescale below fixes the absolute level).
 *
 * Deliberately neutral, slightly cool above and warm-dark below, which is what an
 * overcast exterior or a soft studio actually looks like. It is NOT a sky: a saturated
 * blue zenith would tint every metal in the product blue, and the founder asked to see
 * METAL colours, not a sky's colour reflected in them.
 */
const ZENITH = [0.92, 0.95, 1.00] as const;
const HORIZON = [1.00, 0.99, 0.96] as const;
const GROUND = [0.34, 0.32, 0.30] as const;

let _cached: THREE.DataTexture | null = null;

/**
 * Builds (once, then cached) the neutral studio environment texture.
 *
 * The returned texture is a process-wide singleton on purpose: three caches its PMREM
 * per (renderer × source texture), so handing every scene the SAME source means one
 * PMREM per renderer rather than one per scene.
 *
 * @returns an equirect `DataTexture` ready to assign to `scene.environment`.
 */
export function getNeutralStudioEnvironment(): THREE.DataTexture {
    if (_cached) return _cached;

    const data = new Uint16Array(ENV_W * ENV_H * 4);
    const rgb = new Float64Array(ENV_W * ENV_H * 3);

    // ── 1. Paint the bands ────────────────────────────────────────────────────
    // v = 0 is the +Y pole (up) in three's equirect convention, v = 1 is −Y (down).
    for (let y = 0; y < ENV_H; y++) {
        // Pixel-centre latitude; theta 0 = zenith, PI = nadir.
        const theta = ((y + 0.5) / ENV_H) * Math.PI;
        const cosT = Math.cos(theta);            // +1 up … −1 down
        // Squared falloff keeps the horizon soft, so a mirror-smooth metal
        // (roughness 0, e.g. `special-mirror-silver`) shows no hard seam.
        const t = cosT * cosT;
        const target = cosT >= 0 ? ZENITH : GROUND;
        const r = HORIZON[0] + (target[0] - HORIZON[0]) * t;
        const g = HORIZON[1] + (target[1] - HORIZON[1]) * t;
        const b = HORIZON[2] + (target[2] - HORIZON[2]) * t;
        for (let x = 0; x < ENV_W; x++) {
            const i = (y * ENV_W + x) * 3;
            rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b;
        }
    }

    // ── 2. Normalise to a solid-angle-weighted mean radiance of exactly 1.0 ───
    // Equirect rows subtend sin(theta) dtheta dphi, so an unweighted average would
    // over-count the poles and make `environmentIntensity` mean something different
    // from what the sweep measured.
    let sum = 0;
    let wSum = 0;
    for (let y = 0; y < ENV_H; y++) {
        const theta = ((y + 0.5) / ENV_H) * Math.PI;
        const w = Math.sin(theta);
        for (let x = 0; x < ENV_W; x++) {
            const i = (y * ENV_W + x) * 3;
            sum += w * (0.2126 * rgb[i]! + 0.7152 * rgb[i + 1]! + 0.0722 * rgb[i + 2]!);
            wSum += w;
        }
    }
    const scale = wSum > 0 && sum > 0 ? wSum / sum : 1;

    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let p = 0; p < ENV_W * ENV_H; p++) {
        data[p * 4 + 0] = toHalf(rgb[p * 3 + 0]! * scale);
        data[p * 4 + 1] = toHalf(rgb[p * 3 + 1]! * scale);
        data[p * 4 + 2] = toHalf(rgb[p * 3 + 2]! * scale);
        data[p * 4 + 3] = toHalf(1);
    }

    // HalfFloat, not Float32: WebGPU does not guarantee `rgba32float` is FILTERABLE,
    // and PMREM filters. `rgba16float` is filterable on both backends.
    const tex = new THREE.DataTexture(
        data, ENV_W, ENV_H, THREE.RGBAFormat, THREE.HalfFloatType,
    );
    tex.name = 'pryzm-neutral-studio-env';
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;   // already linear radiance
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;              // longitude wraps
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;

    _cached = tex;
    return tex;
}

/**
 * True when `tex` is the neutral studio baseline — i.e. nobody else has claimed
 * `scene.environment`. Used by `PascalSceneLighting` so it never disposes or
 * overwrites a REAL provider's environment.
 */
export function isNeutralStudioEnvironment(tex: THREE.Texture | null | undefined): boolean {
    return !!tex && tex === _cached;
}

/**
 * TEST SEAM ONLY — drops the cached singleton so a suite can assert the builder's
 * output independently of call order. Never call this from product code: the PMREM
 * caches on both backends are keyed by texture identity, so replacing the singleton
 * at runtime would force every live renderer to re-bake.
 */
export function __resetNeutralStudioEnvironmentForTests(): void {
    _cached?.dispose();
    _cached = null;
}
