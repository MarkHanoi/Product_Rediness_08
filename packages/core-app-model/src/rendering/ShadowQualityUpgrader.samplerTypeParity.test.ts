/**
 * §FIX-SHADOW-SAMPLER-TYPE-PARITY — the shadow type this upgrader writes must be
 * one the installed three ACTUALLY COMPILES, or intended and actual diverge and
 * shaders bind the wrong sampler class.
 *
 * THE 216× FLOOD THIS PINS AGAINST (founder P0 session, 2026-08-07):
 *
 *   GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and
 *   sampler type (signed/unsigned/float/shadow)   ×216, then
 *   "WebGL: too many errors, no more errors will be reported"
 *
 * Mechanism (each step cited in the QUALITY_CONFIGS comment): PCFSoftShadowMap is
 * deprecated in three r183 AND absent from `shadowMapTypeDefines`, so a material
 * compiled while it is the live `renderer.shadowMap.type` gets
 * SHADOWMAP_TYPE_BASIC — a plain `sampler2D` — while the shadow depth texture is
 * allocated in comparison mode (COMPARE_REF_TO_TEXTURE) after the deprecation shim
 * silently substitutes PCF. The shim also defeats THREE's own type-change
 * recompile (`_previousType` starts at PCF), so the poisoned programs never heal.
 *
 * These tests assert PARITY: what we write is what three runs, with no
 * substitution window. They intentionally test through the PUBLIC api (apply /
 * setLevel), not by exporting QUALITY_CONFIGS.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, drainShadowMapReallocQueue } from '@pryzm/renderer-three';
import { ShadowQualityUpgrader, type ShadowQualityLevel } from './ShadowQualityUpgrader';

const LEVELS: ShadowQualityLevel[] = ['standard', 'high', 'ultra'];

/** Renderer stub — only what apply()/setLevel()/restore() touch. */
function fakeRenderer() {
    return {
        shadowMap: { type: THREE.PCFShadowMap, enabled: false },
    } as unknown as THREE.WebGLRenderer;
}

/** A scene with one shadow-casting light, as the real viewport has. */
function sceneWithLight() {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    scene.add(light);
    return { scene, light };
}

describe('§FIX-SHADOW-SAMPLER-TYPE-PARITY — intended shadow type === actual shadow type', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        drainGpuReleaseQueue();
    });

    it.each(LEVELS)('apply("%s") writes a type the installed three compiles (never PCFSoft)', (level) => {
        const upgrader = new ShadowQualityUpgrader();
        const renderer = fakeRenderer();
        const { scene } = sceneWithLight();

        upgrader.apply(renderer, scene, level);

        // The deprecated value would silently become PCF at the next shadow render,
        // AFTER materials had already compiled against a define that does not exist.
        expect(renderer.shadowMap.type).not.toBe(THREE.PCFSoftShadowMap);
        // Parity, stated positively: the exact type three r183 runs for PCF shadows.
        expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    });

    it.each(LEVELS)('setLevel("%s") holds the same parity on a tier change', (level) => {
        const upgrader = new ShadowQualityUpgrader();
        const renderer = fakeRenderer();
        const { scene } = sceneWithLight();

        // Start from a DIFFERENT tier so setLevel's early-return does not skip the write.
        upgrader.apply(renderer, scene, level === 'high' ? 'standard' : 'high');
        upgrader.setLevel(level);

        expect(renderer.shadowMap.type).not.toBe(THREE.PCFSoftShadowMap);
        expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    });

    it('the "soft" look survives the fix — softness lives in shadow.radius, not the type', () => {
        // Every prior session was ALREADY rendering PCF (the shim substituted it), so
        // this fix must not change the visual model: the per-tier radius is the knob.
        const upgrader = new ShadowQualityUpgrader();
        const renderer = fakeRenderer();
        const { scene, light } = sceneWithLight();

        upgrader.apply(renderer, scene, 'ultra');

        expect((light.shadow as unknown as { radius: number }).radius).toBe(8);
        // §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY (L-819): the resolution lands at the
        // frame boundary (mapSize + resize together), not on the mutation tick.
        drainShadowMapReallocQueue();
        expect(light.shadow.mapSize.width).toBe(4096);
    });
});
