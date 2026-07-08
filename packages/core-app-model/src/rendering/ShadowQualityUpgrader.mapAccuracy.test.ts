/**
 * §SPIKE-SHADOW-MAP-ACCURACY (L-165) — shadow-map resolution contract.
 *
 * The founder's ground shadow was stair-stepped because the `standard` quality level
 * (the level the `performance` render tier maps to — the band every real generated
 * building lands in) applied a 512-px shadow map, ~0.2–0.3 m/texel over the key light's
 * fitted ortho frustum. This spike raised `standard` to 1024 px (radius 2). These tests
 * pin that resolution, confirm `high`/`ultra` are unchanged, and confirm the survival
 * shadows-OFF gate still DISABLES the map so the bump costs nothing on the heaviest scenes
 * (the 40-storey WebGPU budget stays untouched).
 *
 * Imports the module directly (not via the rendering barrel) to keep the node vitest env
 * free of window-touching siblings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { ShadowQualityUpgrader } from './ShadowQualityUpgrader';

/** A minimal renderer stand-in exposing only the shadowMap surface apply() touches. */
function fakeRenderer(): THREE.WebGLRenderer {
    return {
        shadowMap: { type: THREE.PCFShadowMap, enabled: false },
    } as unknown as THREE.WebGLRenderer;
}

/** A scene with one shadow-casting directional light (the Pascal key-light analogue). */
function sceneWithKeyLight(): { scene: THREE.Scene; key: THREE.DirectionalLight } {
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 4);
    key.castShadow = true;
    scene.add(key);
    return { scene, key };
}

describe('ShadowQualityUpgrader §SPIKE-SHADOW-MAP-ACCURACY', () => {
    let upgrader: ShadowQualityUpgrader;

    beforeEach(() => {
        upgrader = new ShadowQualityUpgrader();
    });

    it('standard level now applies a 1024px map + radius 2 (was 512/1)', () => {
        const { scene, key } = sceneWithKeyLight();
        upgrader.apply(fakeRenderer(), scene, 'standard');

        expect(key.shadow.mapSize.width).toBe(1024);
        expect(key.shadow.mapSize.height).toBe(1024);
        expect((key.shadow as unknown as { radius: number }).radius).toBe(2);
    });

    it('high and ultra levels are unchanged (2048 / 4096)', () => {
        const high = sceneWithKeyLight();
        new ShadowQualityUpgrader().apply(fakeRenderer(), high.scene, 'high');
        expect(high.key.shadow.mapSize.width).toBe(2048);

        const ultra = sceneWithKeyLight();
        new ShadowQualityUpgrader().apply(fakeRenderer(), ultra.scene, 'ultra');
        expect(ultra.key.shadow.mapSize.width).toBe(4096);
    });

    it('survival shadows-OFF gate still disables the map so the 1024 bump costs nothing on heavy scenes', () => {
        const { scene, key } = sceneWithKeyLight();
        const renderer = fakeRenderer();
        // survival/>8000 path: standard level applied, then shadow map turned OFF.
        upgrader.apply(renderer, scene, 'standard');
        upgrader.setShadowsEnabled(false);

        // No shadow pass is rendered (renderer map disabled + caster de-armed) — so the
        // 1024 map is never allocated on the heaviest scenes.
        expect(renderer.shadowMap.enabled).toBe(false);
        expect(key.castShadow).toBe(false);
        expect(upgrader.shadowsEnabled).toBe(false);
    });

    it('restore() returns the light to its pre-upgrade map size', () => {
        const { scene, key } = sceneWithKeyLight();
        key.shadow.mapSize.set(256, 256);
        upgrader.apply(fakeRenderer(), scene, 'standard');
        expect(key.shadow.mapSize.width).toBe(1024);
        upgrader.restore();
        expect(key.shadow.mapSize.width).toBe(256);
    });
});
