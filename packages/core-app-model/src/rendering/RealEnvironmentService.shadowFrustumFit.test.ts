/**
 * §FIX-GROUND-SHADOW-AT-PERF-TIER (L-168 / L-140) — the primary sun→ground shadow
 * (building → GroundShadowCatcher, the L-11 §FEAT-REAL-ENVIRONMENT feature) must
 * survive however big/tall the building is, NOT just for a small hand-drawn scene.
 *
 * Root cause locked in here: the Pascal key light (the scene's SOLE real shadow
 * caster, driven as the sun) shipped with a FIXED shadow camera (ortho ±50, near 1,
 * far 100) and orbited at ~17 m. When L-164 made all floors of a generated building
 * render full-detail (~4000 meshes → `performance` tier) the building outgrew that
 * frustum AND the light sat inside it → nothing projected onto the L0 catcher → the
 * "building floats" regression. The fix fits the shadow frustum to the live building
 * bounds, mutating ONLY the shadow camera (never mapSize) so it stays device-loss safe.
 *
 * Imports the modules directly (not via the rendering barrel) to keep the node
 * vitest env free of window-touching siblings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RealEnvironmentService } from './RealEnvironmentService';
import { RealSunService, type KeyLightHost } from './RealSunService';

/** A minimal KeyLightHost backed by a real DirectionalLight (the Pascal key light). */
function makeKeyLight(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(10, 10, 10);
    light.castShadow = true;
    // Mirror the Pascal key light's default fixed shadow frustum.
    const cam = light.shadow.camera;
    cam.left = -50; cam.right = 50; cam.top = 50; cam.bottom = -50;
    cam.near = 1; cam.far = 100;
    cam.updateProjectionMatrix();
    return light;
}

/** A large multi-storey building far bigger than the fixed ±50 / far-100 frustum. */
function addBigBuilding(scene: THREE.Scene): void {
    // 80 m × 120 m tall × 80 m block centred at (0, 60, 0) — a generated tower.
    const box = new THREE.Mesh(new THREE.BoxGeometry(80, 120, 80), new THREE.MeshStandardMaterial());
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.set(0, 60, 0);
    scene.add(box);
}

describe('RealSunService.setShadowCoverage — fits the key light shadow frustum', () => {
    let scene: THREE.Scene;
    let light: THREE.DirectionalLight;
    let host: KeyLightHost;
    let sun: RealSunService;

    beforeEach(() => {
        scene = new THREE.Scene();
        light = makeKeyLight();
        scene.add(light);
        host = { get keyLight() { return light; } };
        sun = new RealSunService();
        sun.bind(scene);
        sun.bindKeyLightHost(host);
        sun.enableRealSun({ date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });
    });

    it('with no coverage set, keeps the legacy fixed ±50 / far-100 frustum (small-scene unchanged)', () => {
        const cam = light.shadow.camera;
        expect(cam.right).toBeCloseTo(50, 3);
        expect(cam.far).toBeCloseTo(100, 3);
        // …and orbits at the light's own (~17 m) distance.
        expect(light.position.length()).toBeCloseTo(Math.hypot(10, 10, 10), 3);
    });

    it('coverage widens the ortho frustum + far plane to enclose a large building', () => {
        const center = new THREE.Vector3(0, 60, 0);
        const radius = 0.5 * Math.hypot(80, 120, 80); // ≈ 82 m
        sun.setShadowCoverage(center, radius);

        const cam = light.shadow.camera;
        // Ortho half-extent now spans the building (was 50).
        expect(cam.right).toBeGreaterThan(radius);
        expect(cam.top).toBeGreaterThan(radius);
        // Far plane clears the far side of the model (was 100).
        expect(cam.far).toBeGreaterThan(radius * 2);
        expect(cam.near).toBeGreaterThan(0);
        expect(cam.near).toBeLessThan(cam.far);
    });

    it('re-homes the light OUTSIDE the building along the sun ray, aimed at the model centre', () => {
        const center = new THREE.Vector3(0, 60, 0);
        const radius = 0.5 * Math.hypot(80, 120, 80);
        sun.setShadowCoverage(center, radius);

        // The light must clear the building (its old ~17 m orbit sat INSIDE a 120 m tower).
        expect(light.position.distanceTo(center)).toBeGreaterThan(radius);
        // Aim is the model centre, not the origin.
        expect(light.target.position.distanceTo(center)).toBeLessThan(1e-6);
    });

    it('never resizes the shadow map (device-loss safe — no ShadowDepthTexture realloc)', () => {
        const before = light.shadow.mapSize.clone();
        sun.setShadowCoverage(new THREE.Vector3(0, 60, 0), 82);
        expect(light.shadow.mapSize.equals(before)).toBe(true);
    });

    it('clearing coverage reverts to the legacy fixed frustum', () => {
        sun.setShadowCoverage(new THREE.Vector3(0, 60, 0), 82);
        expect(light.shadow.camera.far).toBeGreaterThan(100);
        sun.setShadowCoverage(null, 0);
        const cam = light.shadow.camera;
        expect(cam.right).toBeCloseTo(50, 3);
        expect(cam.far).toBeCloseTo(100, 3);
    });
});

describe('RealEnvironmentService.refitShadowToScene — grounds the frustum on live geometry', () => {
    let scene: THREE.Scene;
    let light: THREE.DirectionalLight;
    let svc: RealEnvironmentService;

    beforeEach(() => {
        scene = new THREE.Scene();
        light = makeKeyLight();
        scene.add(light);
        svc = new RealEnvironmentService();
        svc.bind(scene, { get keyLight() { return light; } }, () => null, () => 0);
    });

    it('fits the key light frustum to a large building so its shadow reaches the catcher', () => {
        addBigBuilding(scene);
        svc.enable();          // enable() refits internally
        svc.refitShadowToScene();

        const cam = light.shadow.camera;
        // The fixed ±50 / far-100 frustum has grown to cover the 80×120×80 tower.
        expect(cam.right).toBeGreaterThan(50);
        expect(cam.far).toBeGreaterThan(100);
    });

    it('excludes the ground shadow-catcher itself from the bounds (no 4000 m blow-up)', () => {
        // Only the catcher is present (a 4000 m plane) — no real building.
        svc.enable();
        svc.refitShadowToScene();
        const cam = light.shadow.camera;
        // Must NOT have ballooned the frustum to the 4000 m catcher plane.
        expect(cam.right).toBeLessThan(500);
    });

    it('is a no-op-safe revert when the scene has no real geometry', () => {
        svc.enable();
        svc.refitShadowToScene();
        // Legacy fixed frustum retained (nothing to enclose).
        expect(light.shadow.camera.far).toBeCloseTo(100, 3);
    });
});
