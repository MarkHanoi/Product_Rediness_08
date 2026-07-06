/**
 * SharedMaterialCache tests — §PERF-INSTANCE-MATERIAL-DEDUP (L-131 P6).
 *
 * Proves the P6 invariant: elements that mint a FRESH-but-identical material each
 * (the real world — ColumnFragmentBuilder etc.) still collapse into ONE
 * InstancedMesh group (one draw call), while genuinely-different or opted-out
 * materials stay distinct, and the flag can restore exact pre-P6 behaviour.
 *
 * Imports modules DIRECTLY (not via the rendering barrel) to keep the node test
 * env free of window-touching siblings — same rationale as ElementInstanceBridge.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { InstancedElementRenderer } from './InstancedElementRenderer';
import { ElementInstanceBridge, type ElementInstanceTransform } from './ElementInstanceBridge';
import {
    dedupInstanceMaterial,
    resetSharedMaterialCache,
    sharedMaterialCacheSize,
} from './SharedMaterialCache';

const g = globalThis as {
    __pryzmElementInstancingV1?: boolean;
    __pryzmInstanceMaterialDedup?: boolean;
};

function tf(x: number): ElementInstanceTransform {
    return { centre: { x, y: 1.5, z: 0 }, rotationY: 0, size: { x: 0.4, y: 3, z: 0.4 } };
}

function countGroups(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) n++;
    });
    return n;
}

describe('SharedMaterialCache — dedupInstanceMaterial (unit)', () => {
    beforeEach(() => resetSharedMaterialCache());
    afterEach(() => {
        resetSharedMaterialCache();
        delete g.__pryzmInstanceMaterialDedup;
    });

    it('two distinct objects with identical appearance resolve to ONE canonical', () => {
        const a = new THREE.MeshStandardMaterial({ color: '#cccccc' });
        const b = new THREE.MeshStandardMaterial({ color: '#cccccc' });
        expect(a.uuid).not.toBe(b.uuid);                 // genuinely different objects
        const ca = dedupInstanceMaterial(a);
        const cb = dedupInstanceMaterial(b);
        expect(ca).toBe(a);                              // first seen becomes canonical
        expect(cb).toBe(a);                              // look-alike swapped to canonical
        expect(sharedMaterialCacheSize()).toBe(1);
    });

    it('different colours are NOT merged', () => {
        const white = dedupInstanceMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff' }));
        const blue = dedupInstanceMaterial(new THREE.MeshStandardMaterial({ color: '#0000ff' }));
        expect(white).not.toBe(blue);
        expect(sharedMaterialCacheSize()).toBe(2);
    });

    it('different PBR params (roughness/metalness) are NOT merged', () => {
        const matte = dedupInstanceMaterial(
            new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.9, metalness: 0 }));
        const shiny = dedupInstanceMaterial(
            new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.2, metalness: 0.8 }));
        expect(matte).not.toBe(shiny);
        expect(sharedMaterialCacheSize()).toBe(2);
    });

    it('a material stamped userData.__noInstanceDedup stays on its own uuid', () => {
        const a = new THREE.MeshStandardMaterial({ color: '#abcdef' });
        const b = new THREE.MeshStandardMaterial({ color: '#abcdef' });
        b.userData.__noInstanceDedup = true;
        expect(dedupInstanceMaterial(a)).toBe(a);
        expect(dedupInstanceMaterial(b)).toBe(b);        // NOT swapped to a
        expect(sharedMaterialCacheSize()).toBe(1);       // only `a` cached
    });

    it('a non-classic material type (ShaderMaterial) is never shared', () => {
        const a = new THREE.ShaderMaterial();
        const b = new THREE.ShaderMaterial();
        expect(dedupInstanceMaterial(a)).toBe(a);
        expect(dedupInstanceMaterial(b)).toBe(b);
        expect(sharedMaterialCacheSize()).toBe(0);
    });

    it('flag === false restores pre-P6 behaviour (no sharing)', () => {
        g.__pryzmInstanceMaterialDedup = false;
        const a = new THREE.MeshStandardMaterial({ color: '#123456' });
        const b = new THREE.MeshStandardMaterial({ color: '#123456' });
        expect(dedupInstanceMaterial(a)).toBe(a);
        expect(dedupInstanceMaterial(b)).toBe(b);        // NOT merged when off
        expect(sharedMaterialCacheSize()).toBe(0);
    });
});

describe('SharedMaterialCache — end-to-end draw-call collapse', () => {
    let scene: THREE.Scene;
    let renderer: InstancedElementRenderer;
    let bridge: ElementInstanceBridge;

    beforeEach(() => {
        resetSharedMaterialCache();
        scene = new THREE.Scene();
        renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        bridge = new ElementInstanceBridge(renderer);
    });
    afterEach(() => {
        renderer.clear();               // also resets the shared-material cache
        delete g.__pryzmInstanceMaterialDedup;
    });

    it('10 columns each with a FRESH identical material collapse into ONE group', () => {
        for (let i = 0; i < 10; i++) {
            // The real defeat: a brand-new material per element.
            const mat = new THREE.MeshStandardMaterial({ color: '#cccccc' });
            bridge.register(`col-${i}`, 'level-1', 'Column', tf(i), mat, 'box');
        }
        expect(countGroups(scene)).toBe(1);          // was 10 pre-P6
        expect(renderer.totalInstances).toBe(10);
    });

    it('flag OFF keeps the pre-P6 behaviour: 10 fresh materials = 10 groups', () => {
        g.__pryzmInstanceMaterialDedup = false;
        for (let i = 0; i < 10; i++) {
            const mat = new THREE.MeshStandardMaterial({ color: '#cccccc' });
            bridge.register(`col-${i}`, 'level-1', 'Column', tf(i), mat, 'box');
        }
        expect(countGroups(scene)).toBe(10);
        expect(renderer.totalInstances).toBe(10);
    });

    it('a per-element colour change re-keys that element WITHOUT recolouring the rest', () => {
        const whiteA = new THREE.MeshStandardMaterial({ color: '#ffffff' });
        const whiteB = new THREE.MeshStandardMaterial({ color: '#ffffff' });
        bridge.register('col-A', 'level-1', 'Column', tf(0), whiteA, 'box');
        bridge.register('col-B', 'level-1', 'Column', tf(1), whiteB, 'box');
        expect(countGroups(scene)).toBe(1);          // both white → one group

        // col-A recoloured blue (builder mints a new material) → it must break out
        // into its own group; col-B stays in the white group unchanged.
        const blueA = new THREE.MeshStandardMaterial({ color: '#0000ff' });
        bridge.register('col-A', 'level-1', 'Column', tf(0), blueA, 'box');
        expect(countGroups(scene)).toBe(2);
        expect(renderer.totalInstances).toBe(2);
    });
});
