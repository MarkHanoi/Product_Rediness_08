/**
 * §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — RealSunService drives the REAL shadow
 * caster (the Pascal key light) instead of adding a parallel DirectionalLight.
 *
 * Verifies the task-mandated contract:
 *   • a sun-direction/offset control updates the KEY LIGHT direction,
 *   • no competing parallel light is added to the scene (single caster),
 *   • the key light's castShadow gate is NEVER touched here (owned by
 *     PascalSceneLighting + §PERF-HEAVY-SHADOW-OFF / ADR-0111),
 *   • disabling restores the key light's studio default exactly.
 *
 * Imports the module directly (not via the rendering barrel) to keep the node
 * vitest env free of window-touching siblings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RealSunService, type KeyLightHost } from './RealSunService';

/** A minimal KeyLightHost backed by a real DirectionalLight (the Pascal key). */
function makeHost(): { host: KeyLightHost; light: THREE.DirectionalLight } {
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(10, 10, 10);
    light.castShadow = true;
    const host: KeyLightHost = { get keyLight() { return light; } };
    return { host, light };
}

describe('RealSunService §FEAT-REAL-ENVIRONMENT-SUN — drives the key light', () => {
    let scene: THREE.Scene;
    let svc: RealSunService;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealSunService();
    });

    it('drives the bound key light and adds NO parallel light to the scene', () => {
        const { host, light } = makeHost();
        scene.add(light);
        const before = light.position.clone();

        svc.bind(scene);
        svc.bindKeyLightHost(host);
        svc.enableRealSun({ lat: 40.4168, lng: -3.7038, date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });

        // The key light moved to the solar direction …
        expect(light.position.distanceTo(before)).toBeGreaterThan(0.001);
        // … and NO standalone sun light was added (single caster preserved).
        const sunLights = scene.children.filter(
            (o) => o instanceof THREE.DirectionalLight && o.name === '__pryzm_real_sun_light__',
        );
        expect(sunLights).toHaveLength(0);
    });

    it('never touches the key light castShadow gate (ADR-0111 / §PERF-HEAVY-SHADOW-OFF)', () => {
        const { host, light } = makeHost();
        light.castShadow = true;
        svc.bind(scene);
        svc.bindKeyLightHost(host);
        svc.enableRealSun({ date: new Date(Date.UTC(2026, 5, 21, 3, 0, 0)) }); // pre-dawn (sun low)
        // Even with the sun below the horizon, the key light's shadow gate is untouched.
        expect(light.castShadow).toBe(true);
    });

    it('an azimuth offset re-solves and moves the key light', () => {
        const { host, light } = makeHost();
        svc.bind(scene);
        svc.bindKeyLightHost(host);
        svc.enableRealSun({ date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });
        const afterEnable = light.position.clone();

        svc.setOffsets({ azimuthDeg: 90 });
        expect(light.position.distanceTo(afterEnable)).toBeGreaterThan(0.001);
    });

    it('manual mode uses the absolute azimuth/elevation from the panel', () => {
        const { host, light } = makeHost();
        svc.bind(scene);
        svc.bindKeyLightHost(host);
        svc.enableRealSun({ date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });
        svc.setMode('manual');
        // Elevation 90° (straight up) + azimuth 0 → direction ≈ +Y.
        svc.setOffsets({ azimuthDeg: 0, elevationDeg: 90, intensity: 1 });

        const dir = light.position.clone().normalize();
        expect(dir.y).toBeGreaterThan(0.98); // essentially straight up
        expect(svc.mode).toBe('manual');
    });

    it('disable restores the key light to its studio default exactly', () => {
        const { host, light } = makeHost();
        const origPos = light.position.clone();
        const origIntensity = light.intensity;

        svc.bind(scene);
        svc.bindKeyLightHost(host);
        svc.enableRealSun({ date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });
        // Perturbed by the solve …
        expect(light.position.distanceTo(origPos)).toBeGreaterThan(0.001);

        svc.disableRealSun();
        // … restored on disable.
        expect(light.position.distanceTo(origPos)).toBeLessThan(1e-6);
        expect(light.intensity).toBeCloseTo(origIntensity, 6);
    });

    it('preserves the key light distance (shadow-frustum coverage) when driving', () => {
        const { host, light } = makeHost();
        const origDist = light.position.length();
        svc.bind(scene);
        svc.bindKeyLightHost(host);
        svc.enableRealSun({ date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });
        expect(light.position.length()).toBeCloseTo(origDist, 4);
    });
});
