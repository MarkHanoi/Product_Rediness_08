/**
 * §PERF-HEAVY-SHADOW-OFF — PascalSceneLighting shadow-suppression contract.
 *
 * The Pascal key light is the sole default shadow caster. On a heavy scene
 * (≥ the coordinator's ≥8000-caster ceiling) OR during active camera motion, the
 * whole shadow pass must be dropped by clearing keyLight.castShadow — the real
 * lever that the coordinator's OBC-bound ShadowQualityUpgrader never reached.
 *
 * Imports the module directly (not via the rendering barrel) to keep the node
 * vitest env free of window-touching siblings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { PascalSceneLighting } from './PascalSceneLighting';

function findKeyLight(scene: THREE.Scene): THREE.DirectionalLight | undefined {
    let found: THREE.DirectionalLight | undefined;
    scene.traverse((o) => {
        if (o instanceof THREE.DirectionalLight && o.name === 'pascal-key-light') found = o;
    });
    return found;
}

describe('PascalSceneLighting §PERF-HEAVY-SHADOW-OFF', () => {
    let scene: THREE.Scene;
    let svc: PascalSceneLighting;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new PascalSceneLighting();
    });

    it('key light casts shadows by default after apply()', () => {
        svc.apply(scene);
        const key = findKeyLight(scene);
        expect(key).toBeDefined();
        expect(key!.castShadow).toBe(true);
        expect(svc.shadowsSuppressed).toBe(false);
    });

    it('setShadowsSuppressed(true) clears keyLight.castShadow (no shadow pass)', () => {
        svc.apply(scene);
        svc.setShadowsSuppressed(true);
        expect(svc.shadowsSuppressed).toBe(true);
        expect(findKeyLight(scene)!.castShadow).toBe(false);
    });

    it('is fully reversible — restore returns the configured castShadow', () => {
        svc.apply(scene);
        svc.setShadowsSuppressed(true);
        svc.setShadowsSuppressed(false);
        expect(svc.shadowsSuppressed).toBe(false);
        expect(findKeyLight(scene)!.castShadow).toBe(true);
    });

    it('is idempotent — repeated same-state calls do not change anything', () => {
        svc.apply(scene);
        svc.setShadowsSuppressed(true);
        svc.setShadowsSuppressed(true);
        expect(findKeyLight(scene)!.castShadow).toBe(false);
    });

    it('honours a suppression requested BEFORE the lights exist (pre-warm ordering)', () => {
        // Tier gate may fire the first applyTierForMeshCount before pascalSceneLighting
        // .apply() on a pre-warmed renderer — the intent must survive to light creation.
        svc.setShadowsSuppressed(true);
        svc.apply(scene);
        expect(svc.shadowsSuppressed).toBe(true);
        expect(findKeyLight(scene)!.castShadow).toBe(false);
    });

    it('does NOT suppress a config that never wanted shadows (castShadows:false)', () => {
        svc.apply(scene, { castShadows: false });
        const key = findKeyLight(scene)!;
        expect(key.castShadow).toBe(false);
        // Restore must not turn on shadows the config never asked for.
        svc.setShadowsSuppressed(true);
        svc.setShadowsSuppressed(false);
        expect(key.castShadow).toBe(false);
    });

    it('dispose() resets suppression so the next project is a cold start', () => {
        svc.apply(scene);
        svc.setShadowsSuppressed(true);
        svc.dispose();
        expect(svc.shadowsSuppressed).toBe(false);
        // Re-apply on a fresh scene → shadows back on by default.
        const scene2 = new THREE.Scene();
        svc.apply(scene2);
        expect(findKeyLight(scene2)!.castShadow).toBe(true);
    });
});
