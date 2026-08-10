/**
 * §SHADOW-MAP-REALLOC-AT-BOUNDARY (founder P0, 2026-08-10) — the upgrader's side
 * of the realloc-vs-submit ordering fix.
 *
 * THE CRASH THIS PINS AGAINST (deploy 7657195d): new project → a few walls →
 * "Destroyed texture [Texture \"ShadowDepthTexture\"] used in a submit" on every
 * frame → §RECOVERY-MUST-REFUSE → infinite refuse/recover loop, dead viewport.
 *
 * The previous `_deferReleaseShadowMap` nulled `shadow.map` and queued the old
 * render target for a frame-boundary DISPOSE. On the WebGPU node path that is a
 * use-after-free by construction: three r183's ShadowNode holds its own reference
 * to the SAME render target (ShadowNode.js:563-564) and never re-reads
 * `shadow.map` — so the boundary drain destroyed a texture the node kept
 * rendering into and sampling every subsequent frame, unrecoverably.
 *
 * What these tests pin (through the PUBLIC api — apply/setLevel/restore):
 *   1. the light-owned map is NEVER nulled and NEVER disposed by the upgrader,
 *      not synchronously and not via the deferred GPU release queue;
 *   2. the resolution change is delivered as a frame-boundary realloc request,
 *      performed by the target's OWN setSize() when the frame owner drains.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    drainGpuReleaseQueue,
    drainShadowMapReallocQueue,
    pendingShadowMapReallocCount,
} from '@pryzm/renderer-three';
import { ShadowQualityUpgrader } from './ShadowQualityUpgrader';

/** Renderer stub — only what apply()/setLevel()/restore() touch. */
function fakeRenderer() {
    return {
        shadowMap: { type: THREE.PCFShadowMap, enabled: false },
    } as unknown as THREE.WebGLRenderer;
}

/**
 * A scene with one shadow-casting light that ALREADY OWNS a live shadow map —
 * the state a real viewport is in when a tier change lands (the WebGPU
 * ShadowNode has allocated and holds the same target as `shadow.map`).
 */
function sceneWithAllocatedLight() {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    const map = {
        isRenderTarget: true as const,
        width: 1024,
        height: 1024,
        texture: { name: 'ShadowMap', dispose: vi.fn() },
        setSize: vi.fn((w: number, h: number) => { map.width = w; map.height = h; }),
        dispose: vi.fn(),
    };
    (light.shadow as unknown as { map: unknown }).map = map;
    scene.add(light);
    return { scene, light, map };
}

describe('§SHADOW-MAP-REALLOC-AT-BOUNDARY — ShadowQualityUpgrader never destroys a light-owned map', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // Isolate both frame-boundary queues.
        drainGpuReleaseQueue();
        drainShadowMapReallocQueue();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('apply() keeps shadow.map attached and undisposed — the WebGPU ShadowNode still uses it', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, map } = sceneWithAllocatedLight();

        upgrader.apply(fakeRenderer(), scene, 'high'); // mapSize 1024 → 2048

        // TOOTH: the old code did `shadow.map = null` here.
        expect((light.shadow as unknown as { map: unknown }).map).toBe(map);
        expect(map.dispose).not.toHaveBeenCalled();

        // TOOTH: the old code queued the old target on the GPU RELEASE queue —
        // draining it destroyed the texture the ShadowNode still submits with.
        drainGpuReleaseQueue();
        expect(map.dispose).not.toHaveBeenCalled();

        // The mapSize write landed, and the realloc request is queued for the
        // frame boundary instead.
        expect(light.shadow.mapSize.width).toBe(2048);
        expect(pendingShadowMapReallocCount()).toBeGreaterThan(0);
    });

    it('the frame-boundary drain performs the realloc via the target\'s OWN setSize()', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, map } = sceneWithAllocatedLight();

        upgrader.apply(fakeRenderer(), scene, 'high');
        drainShadowMapReallocQueue(); // what RenderPipelineManager.render() does at the boundary

        expect(map.setSize).toHaveBeenCalledWith(2048, 2048);
        expect(map.dispose).not.toHaveBeenCalled(); // dispose belongs to THREE, inside setSize
        expect((light.shadow as unknown as { needsUpdate?: boolean }).needsUpdate).toBe(true);
    });

    it('setLevel() re-routes the same way on a live tier change', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, map } = sceneWithAllocatedLight();

        upgrader.apply(fakeRenderer(), scene, 'high');
        drainShadowMapReallocQueue();
        map.setSize.mockClear();

        upgrader.setLevel('ultra'); // 2048 → 4096
        expect(map.setSize).not.toHaveBeenCalled(); // nothing on the mutation tick
        drainShadowMapReallocQueue();
        expect(map.setSize).toHaveBeenCalledWith(4096, 4096);
        expect(map.dispose).not.toHaveBeenCalled();
    });

    it('setShadowsEnabled(false) leaves the light-owned map alone (castShadow is the lever)', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, map } = sceneWithAllocatedLight();

        upgrader.apply(fakeRenderer(), scene, 'high');
        drainShadowMapReallocQueue();
        upgrader.setShadowsEnabled(false);

        expect(light.castShadow).toBe(false);
        expect((light.shadow as unknown as { map: unknown }).map).toBe(map);
        drainGpuReleaseQueue();
        expect(map.dispose).not.toHaveBeenCalled();
    });
});
