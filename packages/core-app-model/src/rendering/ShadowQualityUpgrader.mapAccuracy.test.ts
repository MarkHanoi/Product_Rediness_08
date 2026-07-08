/**
 * §FIX-SHADOW-REALLOC-DEVICE-LOSS-PROJECT-SWITCH (L-189) — shadow-map resolution contract.
 *
 * L-165 (§SPIKE-SHADOW-MAP-ACCURACY) raised the `standard` level (the level the
 * `performance` render tier maps to — the band every real generated building lands in)
 * from a 512-px to a 1024-px shadow map (radius 1→2) to smooth the founder's stair-stepped
 * ground shadow. That bump was REVERTED here: on a project switch the tier escalates and
 * `setLevel()` reallocates this map (standard→high). The realloc disposes the OLD
 * ShadowDepthTexture on a single `setTimeout(0)` macrotask, which does not guarantee the
 * pre-freeze frame's GPU submit has drained — and the LARGER the old texture, the longer
 * that submit takes to drain. The 1024-px old map widened that window enough to reproduce
 * "Destroyed texture [ShadowDepthTexture] used in a submit" ×8 → WebGPU device loss on
 * every project open. 512 px restores the known-good device-safe timing margin.
 *
 * These tests PIN `standard` back to 512 px / radius 1 so the bump cannot silently return
 * without the GPU-fence-based dispose that would make a larger map safe. `high`/`ultra` are
 * unchanged, and the survival shadows-OFF gate still disables the map entirely.
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

describe('ShadowQualityUpgrader §FIX-SHADOW-REALLOC-DEVICE-LOSS-PROJECT-SWITCH', () => {
    let upgrader: ShadowQualityUpgrader;

    beforeEach(() => {
        upgrader = new ShadowQualityUpgrader();
    });

    it('standard level applies a 512px map + radius 1 (L-165 1024/2 bump REVERTED — device-safe realloc)', () => {
        const { scene, key } = sceneWithKeyLight();
        upgrader.apply(fakeRenderer(), scene, 'standard');

        expect(key.shadow.mapSize.width).toBe(512);
        expect(key.shadow.mapSize.height).toBe(512);
        expect((key.shadow as unknown as { radius: number }).radius).toBe(1);
    });

    it('high and ultra levels are unchanged (2048 / 4096)', () => {
        const high = sceneWithKeyLight();
        new ShadowQualityUpgrader().apply(fakeRenderer(), high.scene, 'high');
        expect(high.key.shadow.mapSize.width).toBe(2048);

        const ultra = sceneWithKeyLight();
        new ShadowQualityUpgrader().apply(fakeRenderer(), ultra.scene, 'ultra');
        expect(ultra.key.shadow.mapSize.width).toBe(4096);
    });

    it('project-switch realloc: setLevel(standard→high) never disposes the old ShadowDepthTexture synchronously', async () => {
        // Reproduces the project-switch tier transition (`Level changed to "high"`): the
        // OLD standard-tier depth texture must be released via the DEFERRED (post-submit)
        // path, never a synchronous .dispose() inside setLevel — a synchronous dispose while
        // the pre-freeze frame's submit still references it is the device-loss trigger.
        const { scene, key } = sceneWithKeyLight();
        upgrader.apply(fakeRenderer(), scene, 'standard');
        expect(key.shadow.mapSize.width).toBe(512);

        // Stand in a fake GPU texture on the light's shadow map and track its dispose.
        let disposed = false;
        (key.shadow as unknown as { map: unknown }).map = {
            dispose() { disposed = true; },
        };

        upgrader.setLevel('high');
        // sh.map is nulled synchronously so THREE regenerates at the new size...
        expect((key.shadow as unknown as { map: unknown }).map).toBeNull();
        // ...but the OLD texture must NOT have been disposed synchronously (still mid-submit).
        expect(disposed).toBe(false);
        expect(key.shadow.mapSize.width).toBe(2048);

        // The dispose is deferred to a macrotask (past the current submit).
        await new Promise((r) => setTimeout(r, 0));
        expect(disposed).toBe(true);
    });

    it('survival shadows-OFF gate still disables the map so shadows cost nothing on heavy scenes', () => {
        const { scene, key } = sceneWithKeyLight();
        const renderer = fakeRenderer();
        // survival/>8000 path: standard level applied, then shadow map turned OFF.
        upgrader.apply(renderer, scene, 'standard');
        upgrader.setShadowsEnabled(false);

        // No shadow pass is rendered (renderer map disabled + caster de-armed).
        expect(renderer.shadowMap.enabled).toBe(false);
        expect(key.castShadow).toBe(false);
        expect(upgrader.shadowsEnabled).toBe(false);
    });

    it('restore() returns the light to its pre-upgrade map size', () => {
        const { scene, key } = sceneWithKeyLight();
        key.shadow.mapSize.set(256, 256);
        upgrader.apply(fakeRenderer(), scene, 'standard');
        expect(key.shadow.mapSize.width).toBe(512);
        upgrader.restore();
        expect(key.shadow.mapSize.width).toBe(256);
    });
});
