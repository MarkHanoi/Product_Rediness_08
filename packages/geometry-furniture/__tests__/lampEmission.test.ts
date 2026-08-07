/**
 * §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — catalogue lamps are a fixture family.
 *
 * Founder defect (A): "NOT ALL the lighting fixtures have light". The split was
 * real but not where it was first assumed — it is not "elements vs GLB". It is:
 *
 *   (i)  first-class LIGHTING ELEMENTS (`light_*`, CREATE_LIGHTING) built by
 *        LightingFragmentBuilder — these DID get a THREE light, but only at
 *        night and only at a physically negligible 1.5 candela; and
 *   (ii) LAMPS FROM THE FURNITURE CATALOGUE (`FurnitureType === 'lamp'`) built
 *        by LampBuilder — these had NO light source AT ALL, only an emissive
 *        shade material. §LAMP-NO-POINTLIGHT deliberately removed them in
 *        2026-06 because KHR_lights_punctual nodes crashed the Cesium GLB
 *        export; GLBExporter now strips every `isLight` child at the export
 *        boundary, so that reason no longer holds.
 *
 * This suite pins family (ii): a placed catalogue lamp yields an emitter with
 * intensity > 0, at a plausible anchor, tagged so the environment dimmer skips it.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it, beforeEach } from 'vitest';
import { LampBuilder } from '../src/builders/LampBuilder';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData } from '../src/FurnitureTypes';
import {
    photometryForFurnitureLamp,
    sceneIntensityFor,
    FIXTURE_LIGHT_ROLE,
} from '@pryzm/core-app-model';

const lampData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'lamp-1', type: 'furniture', furnitureType: 'lamp',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 0.35, length: 0.35, height: 1.6,
    material: 'wood', properties: {},
    ...over,
} as FurnitureData);

function lightsOf(group: THREE.Object3D): THREE.PointLight[] {
    const out: THREE.PointLight[] = [];
    group.traverse((o) => { if ((o as THREE.Light).isLight) out.push(o as THREE.PointLight); });
    return out;
}

describe('§FEAT-FIXTURE-PHOTOMETRY — catalogue lamps emit light', () => {
    let builder: LampBuilder;
    beforeEach(() => { builder = new LampBuilder(new MaterialService()); });

    it('a placed FLOOR lamp yields exactly one emitter with intensity > 0', () => {
        const lights = lightsOf(builder.build(lampData({ height: 1.6 })));
        expect(lights, 'floor lamp had NO light source at all before this change').toHaveLength(1);
        expect(lights[0]!.intensity).toBeGreaterThan(0);
    });

    it('a placed BEDSIDE lamp (≤0.6 m) yields exactly one emitter with intensity > 0', () => {
        const lights = lightsOf(builder.build(lampData({ height: 0.45, width: 0.18 })));
        expect(lights).toHaveLength(1);
        expect(lights[0]!.intensity).toBeGreaterThan(0);
    });

    it('intensities come from the photometric table, not a hard-coded scalar', () => {
        const floor   = lightsOf(builder.build(lampData({ height: 1.6 })))[0]!;
        const bedside = lightsOf(builder.build(lampData({ height: 0.45 })))[0]!;

        expect(floor.intensity)
            .toBeCloseTo(sceneIntensityFor(photometryForFurnitureLamp('floor_standard'), false), 8);
        expect(bedside.intensity)
            .toBeCloseTo(sceneIntensityFor(photometryForFurnitureLamp('bedside_table'), false), 8);
        // An 800 lm floor lamp must out-shine a 350 lm bedside lamp, in that ratio.
        expect(floor.intensity / bedside.intensity).toBeCloseTo(800 / 350, 5);
    });

    it('the emitter anchor is at the SHADE, never at the model origin (the floor)', () => {
        for (const h of [1.6, 0.45]) {
            const g = builder.build(lampData({ height: h }));
            const l = lightsOf(g)[0]!;
            expect(l.position.y, `h=${h} emitter must not sit on the floor`).toBeGreaterThan(0);
            // …and must sit in the upper half of the lamp, where the bulb is.
            expect(l.position.y).toBeGreaterThan(h * 0.5);
            expect(l.position.y).toBeLessThanOrEqual(h);
        }
    });

    it('is tagged FIXTURE_LIGHT_ROLE so the day/night environment dimmer skips it', () => {
        const l = lightsOf(builder.build(lampData()))[0]!;
        expect(l.userData.role).toBe(FIXTURE_LIGHT_ROLE);
    });

    it('never casts shadows — the cube-shadow-map texture-unit cap belongs to the sun', () => {
        expect(lightsOf(builder.build(lampData()))[0]!.castShadow).toBe(false);
        expect(lightsOf(builder.build(lampData({ height: 0.45 })))[0]!.castShadow).toBe(false);
    });

    it('uses a physical inverse-square decay and a finite, bounded reach', () => {
        const l = lightsOf(builder.build(lampData()))[0]!;
        expect(l.decay).toBe(2);
        expect(l.distance).toBe(photometryForFurnitureLamp('floor_standard').reachM);
        expect(l.distance).toBeGreaterThan(0);
    });

    it('is at least 2× the legacy emission the first-class fixtures shipped with', () => {
        for (const h of [1.6, 0.45]) {
            expect(lightsOf(builder.build(lampData({ height: h })))[0]!.intensity / 1.5)
                .toBeGreaterThanOrEqual(2);
        }
    });

    it('adds exactly ONE light per lamp — repeated builds do not accumulate', () => {
        for (let i = 0; i < 5; i++) {
            expect(lightsOf(builder.build(lampData({ id: `lamp-${i}` })))).toHaveLength(1);
        }
    });
});
