// NeutralStudioEnvironment.test.ts
// §FEAT-PASCAL-METAL-ENV (L-967) — the invariants that make `PASCAL_ENV_INTENSITY = 1.0`
// a MEASUREMENT rather than a number somebody liked.
//
// WHAT THIS FILE IS FOR. The intensity sweep that chose 1.0 assumes two things about this
// texture, and if either silently drifts the sweep stops applying while every assertion
// about it keeps passing:
//
//   1. The environment's mean radiance is EXACTLY 1.0, so `environmentIntensity` is
//      readable as "the radiance a metal sees". Change the bands, drop the solid-angle
//      weighting, or swap the format, and 1.0 quietly means something else — the metals
//      go dark or blow out and nothing here would have complained.
//   2. This baseline NEVER stomps a real environment provider. `ProceduralSkyService`
//      warns in its own header that it is "mutually exclusive with RealtimeLightingService
//      (both set scene.environment)". There were already three writers of that one slot
//      before this file added a fourth; a fourth that overwrites unconditionally is the
//      defect, not the fix.
//
// The rendered-pixel half of L-967 — that a metalness-0.9 panel is BLACK before and reads
// as its catalogue colour after, through the real `CurtainWallInstanceManager` and the
// real `STANDARD_MATERIAL_LIBRARY` — lives in
// `packages/geometry-curtain-wall/__tests__/L967MetalPanelIsNotBlack.test.ts`, because
// that is where the instance manager is. Arm 3 below is the same claim pinned HERE too,
// at the scene layer, so a change to `PascalSceneLighting` alone cannot go green in this
// package while the panel goes black in the other.
//
// ⚠ MEASURED RED FIRST. With `scene.environment = null` restored in
// `PascalSceneLighting.apply()` — the one line the fix changed, and nothing else — the
// curtain-wall suite goes 9 failed / 3 passed and arm 3 below fails. It is not a control
// that cannot fail.

import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    getNeutralStudioEnvironment,
    isNeutralStudioEnvironment,
    __resetNeutralStudioEnvironmentForTests,
} from './NeutralStudioEnvironment';
import { PascalSceneLighting, PASCAL_ENV_INTENSITY } from './PascalSceneLighting';

beforeEach(() => {
    // The builder memoises a process-wide singleton, so without this the second test in
    // this file would assert against the first test's texture and an identity claim could
    // pass for the wrong reason.
    __resetNeutralStudioEnvironmentForTests();
});

describe('§FEAT-PASCAL-METAL-ENV (L-967) — NeutralStudioEnvironment', () => {

    // ═══ ARM 1 — the unit-mean claim, recomputed from the emitted pixels ═══════
    it('has a solid-angle-weighted mean radiance of EXACTLY 1.0 — this is what makes 1.0 portable', () => {
        const tex = getNeutralStudioEnvironment();
        const data = tex.image.data as Uint16Array;
        const w = tex.image.width;
        const h = tex.image.height;
        expect(data).toBeInstanceOf(Uint16Array);
        expect(data.length).toBe(w * h * 4);

        // Decode the half-floats that were actually WRITTEN, not the doubles they came
        // from. If the encode step were dropped or the format changed, this reads the
        // difference — computing from the source array would not.
        const fromHalf = THREE.DataUtils.fromHalfFloat;
        let weighted = 0;
        let weight = 0;
        for (let y = 0; y < h; y++) {
            // Equirect rows subtend sin(theta) dtheta dphi. Dropping this weight
            // over-counts the poles, which is precisely the mistake that would make the
            // measured intensity disagree with the swept one.
            const theta = ((y + 0.5) / h) * Math.PI;
            const sa = Math.sin(theta);
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const lum =
                    0.2126 * fromHalf(data[i]!) +
                    0.7152 * fromHalf(data[i + 1]!) +
                    0.0722 * fromHalf(data[i + 2]!);
                weighted += sa * lum;
                weight += sa;
            }
        }
        const mean = weighted / weight;

        // Half-float carries ~3 decimal digits near 1.0 (eps ≈ 9.8e-4), so 2e-3 is a
        // tolerance the FORMAT imposes, not one chosen to make the test pass.
        expect(mean).toBeGreaterThan(1 - 2e-3);
        expect(mean).toBeLessThan(1 + 2e-3);

        // And the weighting genuinely matters here — an UNWEIGHTED mean of this texture
        // is a different number, so arm 1 would be vacuous if the bands were flat.
        let flat = 0;
        for (let p = 0; p < w * h; p++) {
            flat += 0.2126 * fromHalf(data[p * 4]!) +
                0.7152 * fromHalf(data[p * 4 + 1]!) +
                0.0722 * fromHalf(data[p * 4 + 2]!);
        }
        expect(Math.abs(flat / (w * h) - 1)).toBeGreaterThan(0.01);
    });

    it('is renderer-independent by construction — the property a PMREM output cannot have', () => {
        const tex = getNeutralStudioEnvironment();
        // Both backends auto-PMREM a source texture per renderer and BOTH branch on
        // exactly this mapping: WebGL via `WebGLCubeUVMaps.get()`, WebGPU via
        // `EnvironmentNode.setup() -> _getPMREMNodeCache( builder.renderer )`. A
        // PMREMGenerator output would instead be one retired renderer's render target.
        expect(tex.mapping).toBe(THREE.EquirectangularReflectionMapping);
        expect((tex as { isRenderTargetTexture?: boolean }).isRenderTargetTexture).toBeFalsy();
        expect(tex.isDataTexture).toBe(true);
        // rgba16float, not rgba32float: WebGPU does not guarantee 32-bit float textures
        // are FILTERABLE, and PMREM filters. Asserting the type pins that reasoning.
        expect(tex.type).toBe(THREE.HalfFloatType);
        expect(tex.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    });

    // ═══ ARM 3 — non-black is the real bug, pinned at the scene layer ══════════
    it('a metalness-0.9 surface is NOT near-black once Pascal lighting has run', () => {
        // The analytic step the sweep actually used, and the honest reason it is the
        // proxy: the deciding quantity for a metal is its INDIRECT SPECULAR term, which
        // three computes as `radiance * (specularColor * fab.x + F90 * fab.y)` with
        // `radiance = environmentIntensity * L_env`. Every other term in the shader is
        // multiplied by a diffuse albedo of `color * (1 - metalness)` — 10 % of an
        // already dark #474d52 — which is exactly why the panel was black. So the env
        // specular term IS the subject; asserting it is asserting the bug.
        //
        // The full tone-mapped display-byte version of this same measurement, through the
        // real instance manager, is in L967MetalPanelIsNotBlack.test.ts. This arm is
        // deliberately the weaker-but-local one, and says so rather than claiming parity.
        const scene = new THREE.Scene();
        new PascalSceneLighting().apply(scene);

        const albedo = new THREE.Color('#474d52');            // aluminium-brushed-dark
        const metalness = 0.9;
        const roughness = 0.24;

        const envRadiance = scene.environment ? (scene.environmentIntensity ?? 1) : 0;
        // three's DFGApprox at normal incidence.
        const c0 = [-1, -0.0275, -0.572, 0.022];
        const c1 = [1, 0.0425, 1.04, -0.04];
        const r = c0.map((v, i) => roughness * v + c1[i]!);
        const a004 = Math.min(r[0]! * r[0]!, Math.pow(2, -9.28 * 1)) * r[0]! + r[1]!;
        const fabX = a004 * -1.04 + r[2]!;
        const fabY = a004 * 1.04 + r[3]!;

        const specColor = 0.04 * (1 - metalness) + albedo.g * metalness;
        const envSpecular = envRadiance * (specColor * fabX + fabY);
        // Diffuse floor: what the surface has WITHOUT any environment, from the 3 Pascal
        // directionals + ambient. This is the number that made it black.
        const diffuseFloor = albedo.g * (1 - metalness);

        // THE CLAIM. The reflected term must dominate the diffuse floor — i.e. the metal
        // is showing its reflection, which is what a metal IS.
        expect(envRadiance).toBeGreaterThan(0);
        expect(envSpecular).toBeGreaterThan(diffuseFloor);
        // Non-vacuity: with the pre-fix scene state the SAME expression is exactly zero.
        scene.environment = null;
        const preFix = (scene.environment ? (scene.environmentIntensity ?? 1) : 0) *
            (specColor * fabX + fabY);
        expect(preFix).toBe(0);
    });

    it('applies the MEASURED intensity, not three\'s default-by-accident', () => {
        const scene = new THREE.Scene();
        new PascalSceneLighting().apply(scene);
        expect(scene.environment).toBe(getNeutralStudioEnvironment());
        expect(scene.environmentIntensity).toBe(PASCAL_ENV_INTENSITY);
        // 1.0 coincides with three's default for `environmentIntensity`, which is exactly
        // how a chosen value gets mistaken for an unset one later. The LEVEL lives in the
        // texture's unit-mean normalisation (arm 1), so this is a dim environment — an
        // HDRI at 1.0 would be 5-50x brighter. Pin the constant so the coincidence is
        // recorded as deliberate.
        expect(PASCAL_ENV_INTENSITY).toBe(1.0);
    });

    // ═══ ARM 4 — the provider guard ═══════════════════════════════════════════
    describe('never stomps a REAL environment provider', () => {
        it('isNeutralStudioEnvironment is false for a foreign texture and for null', () => {
            getNeutralStudioEnvironment();      // mint the singleton first
            const foreign = new THREE.DataTexture(new Uint8Array(4), 1, 1);
            foreign.name = 'some-hdri-pmrem';
            expect(isNeutralStudioEnvironment(foreign)).toBe(false);
            expect(isNeutralStudioEnvironment(null)).toBe(false);
            expect(isNeutralStudioEnvironment(undefined)).toBe(false);
            expect(isNeutralStudioEnvironment(getNeutralStudioEnvironment())).toBe(true);
        });

        it('a STALE baseline from before a reset is no longer recognised', () => {
            // Identity, not name-matching. A previous singleton must not be mistaken for
            // the live one, or a reset would leave a texture nobody can claim or release.
            const stale = getNeutralStudioEnvironment();
            __resetNeutralStudioEnvironmentForTests();
            const fresh = getNeutralStudioEnvironment();
            expect(fresh).not.toBe(stale);
            expect(isNeutralStudioEnvironment(stale)).toBe(false);
            expect(isNeutralStudioEnvironment(fresh)).toBe(true);
        });

        it('apply() LEAVES a provider\'s environment in place instead of overwriting it', () => {
            // The three-writers-of-one-slot problem. `ProceduralSkyService` and
            // `HDRIEnvironmentManager` both bake a PMREM into scene.environment and both
            // save/restore around it. If this baseline overwrote them, the sky would go
            // dark the moment Pascal lighting re-applied.
            const scene = new THREE.Scene();
            const providerEnv = new THREE.DataTexture(new Uint8Array(4), 1, 1);
            providerEnv.name = 'procedural-sky-pmrem';
            scene.environment = providerEnv;
            scene.environmentIntensity = 0.42;

            new PascalSceneLighting().apply(scene);

            expect(scene.environment).toBe(providerEnv);
            expect(scene.environment).not.toBe(getNeutralStudioEnvironment());
            expect(scene.environmentIntensity).toBe(0.42);
        });

        it('but DOES claim the slot when nobody owns it — which is the Phase 5 path, always', () => {
            // `initScene` passes `hdriPresetId: 'none'` whenever the WebGPU renderer is
            // active, so on the founder's path there is never an incumbent. This is the
            // branch that actually ships, and the previous test would pass vacuously if
            // apply() had simply stopped touching the slot at all.
            const scene = new THREE.Scene();
            expect(scene.environment).toBeNull();
            new PascalSceneLighting().apply(scene);
            expect(scene.environment).toBe(getNeutralStudioEnvironment());
        });

        it('dispose() hands the slot back exactly as it found it', () => {
            const scene = new THREE.Scene();
            const lighting = new PascalSceneLighting();
            lighting.apply(scene);
            expect(scene.environment).toBeTruthy();

            lighting.dispose();
            expect(scene.environment).toBeNull();
            // The singleton is shared by every scene, so dispose() must DROP it, never
            // dispose it — a disposed singleton would black out every other live scene.
            expect(isNeutralStudioEnvironment(getNeutralStudioEnvironment())).toBe(true);
            expect((getNeutralStudioEnvironment().image.data as Uint16Array).length)
                .toBeGreaterThan(0);
        });
    });
});
