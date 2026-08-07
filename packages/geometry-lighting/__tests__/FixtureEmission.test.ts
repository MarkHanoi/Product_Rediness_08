/**
 * §FEAT-FIXTURE-PHOTOMETRY / §FIX-LIGHT-NIGHT-CONTRIBUTION (2026-08-06)
 *
 * Founder defect: a night-mode interior full of placed fixtures rendered black —
 * "every fixture is drawn as geometry … no fixture casts any visible pool of
 * light". Root causes pinned by this suite:
 *
 *   1. lights existed ONLY in night mode (`if (this._isNight) _attachLight(...)`),
 *      so a fixture could never illuminate by day;
 *   2. every family shared one flat 1.5-candela emission, which under THREE
 *      r165+ physical lighting is DIMMER at 2.5 m than the scene's own ambient;
 *   3. `mirror_light` had no emitter anchor at all and sat inside the wall;
 *   4. attaching was one-shot — a fixture placed in day mode never brightened
 *      when night was toggled.
 *
 * Assertions are on DATA (light counts, intensities, positions), never pixels.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';
import {
    photometryForFixture,
    sceneIntensityFor,
    FIXTURE_LIGHT_ROLE,
    LIVE_LIGHT_BUDGET_BY_TIER,
} from '@pryzm/core-app-model';

const ALL_FIXTURE_TYPES: readonly LightingFixtureType[] = [
    'downlight', 'pendant', 'linear_led', 'pendant_pebble',
    'pendant_ceramic_bell', 'pendant_conical', 'pendant_cluster',
    'floor_wood_post', 'floor_arc_brass', 'floor_tripod_black',
    'table_terracotta', 'mirror_light',
];

const g = globalThis as unknown as { window?: Record<string, unknown> };

function makeData(fixtureType: LightingFixtureType, id = `light-${fixtureType}`, x = 0): LightingData {
    return { id, type: 'lighting', levelId: 'L0', fixtureType, position: { x, y: 2.4, z: 0 } };
}

function scene(builder: LightingFragmentBuilder): THREE.Object3D {
    return (builder as unknown as { _scene: THREE.Object3D })._scene;
}

/** Every fixture-owned point light currently in the builder's scene. */
function fixtureLights(builder: LightingFragmentBuilder): THREE.PointLight[] {
    const out: THREE.PointLight[] = [];
    scene(builder).traverse((o) => {
        if ((o as THREE.Light).isLight && o.userData?.role === FIXTURE_LIGHT_ROLE) {
            out.push(o as THREE.PointLight);
        }
    });
    return out;
}

function rootOf(builder: LightingFragmentBuilder, id: string): THREE.Object3D {
    return scene(builder).children.find((c) => c.userData?.id === id)!;
}

describe('§FIX-LIGHT-NIGHT-CONTRIBUTION — coverage: every family emits', () => {
    let builder: LightingFragmentBuilder;

    beforeEach(() => {
        if (g.window === undefined) g.window = {};
        builder = new LightingFragmentBuilder();
        builder.setScene(new THREE.Group());
    });
    afterEach(() => builder.dispose());

    it('EVERY fixture family produces a real light with intensity > 0 — in DAY mode', () => {
        builder.setDayNight('day');
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.syncLights();

        const lights = fixtureLights(builder);
        expect(lights).toHaveLength(ALL_FIXTURE_TYPES.length);
        for (const l of lights) {
            expect(l.intensity, `${l.userData.elementId} day intensity`).toBeGreaterThan(0);
            expect(l.distance).toBeGreaterThan(0);
        }
    });

    it('EVERY fixture family produces a real light with intensity > 0 — in NIGHT mode', () => {
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.setDayNight('night');

        const lights = fixtureLights(builder);
        expect(lights).toHaveLength(ALL_FIXTURE_TYPES.length);
        for (const l of lights) expect(l.intensity).toBeGreaterThan(0);
    });

    it('intensity matches the photometric table exactly — no hidden scalar', () => {
        builder.setDayNight('night');
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.syncLights();

        for (const t of ALL_FIXTURE_TYPES) {
            const light = fixtureLights(builder).find((l) => l.userData.elementId === `light-${t}`)!;
            expect(light, t).toBeDefined();
            expect(light.intensity, t).toBeCloseTo(sceneIntensityFor(photometryForFixture(t), true), 8);
            expect(light.distance, t).toBe(photometryForFixture(t).reachM);
            expect(light.decay, t).toBe(2);      // physical inverse-square
        }
    });

    it('is at least 2× the legacy flat 1.5-candela emission for every family', () => {
        builder.setDayNight('night');
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.syncLights();
        for (const l of fixtureLights(builder)) {
            expect(l.intensity / 1.5, String(l.userData.elementId)).toBeGreaterThanOrEqual(2);
        }
    });

    it('fixture lights never cast shadows — the cube-shadow-map cap belongs to the sun', () => {
        builder.setDayNight('night');
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.syncLights();
        for (const l of fixtureLights(builder)) expect(l.castShadow).toBe(false);
    });

    it('stamps FIXTURE_LIGHT_ROLE so the environment dimmer skips them', () => {
        builder.add(makeData('pendant'));
        builder.syncLights();
        expect(fixtureLights(builder)[0]!.userData.role).toBe(FIXTURE_LIGHT_ROLE);
    });
});

describe('§FIX-LIGHT-NIGHT-CONTRIBUTION — day/night behaviour', () => {
    let builder: LightingFragmentBuilder;
    beforeEach(() => {
        if (g.window === undefined) g.window = {};
        builder = new LightingFragmentBuilder();
        builder.setScene(new THREE.Group());
    });
    afterEach(() => builder.dispose());

    it('night is BRIGHTER than day for every family (was: night-only, then dimmed)', () => {
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));

        builder.setDayNight('day');
        builder.syncLights();
        const day = new Map(fixtureLights(builder).map((l) => [String(l.userData.elementId), l.intensity]));

        builder.setDayNight('night');
        const night = new Map(fixtureLights(builder).map((l) => [String(l.userData.elementId), l.intensity]));

        expect(day.size).toBe(ALL_FIXTURE_TYPES.length);
        for (const [id, dayI] of day) {
            expect(night.get(id)!, id).toBeGreaterThan(dayI);
        }
    });

    it('a fixture placed in DAY mode brightens when night is toggled (was one-shot)', () => {
        builder.setDayNight('day');
        builder.add(makeData('pendant'));
        builder.syncLights();
        const before = fixtureLights(builder)[0]!.intensity;

        builder.setDayNight('night');
        const after = fixtureLights(builder)[0]!.intensity;

        expect(after).toBeGreaterThan(before);
        // Still exactly ONE light — the toggle must refresh, not duplicate.
        expect(fixtureLights(builder)).toHaveLength(1);
    });

    it('toggling day/night repeatedly never accumulates duplicate lights', () => {
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        for (let i = 0; i < 6; i++) builder.setDayNight(i % 2 ? 'night' : 'day');
        expect(fixtureLights(builder)).toHaveLength(ALL_FIXTURE_TYPES.length);
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — emitter anchors', () => {
    let builder: LightingFragmentBuilder;
    beforeEach(() => {
        if (g.window === undefined) g.window = {};
        builder = new LightingFragmentBuilder();
        builder.setScene(new THREE.Group());
    });
    afterEach(() => builder.dispose());

    it('no fixture leaves its emitter at the group origin', () => {
        builder.setDayNight('night');
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.syncLights();
        for (const l of fixtureLights(builder)) {
            expect(l.position.lengthSq(), `${l.userData.elementId} anchor at origin`).toBeGreaterThan(0);
        }
    });

    it('mirror_light emits IN FRONT of the wall plane, not inside it (had no anchor case)', () => {
        builder.setDayNight('night');
        builder.add(makeData('mirror_light'));
        builder.syncLights();
        const l = fixtureLights(builder)[0]!;
        expect(l.position.z).toBeGreaterThan(0);   // +Z is out of the wall
    });

    it('ceiling families emit BELOW their mount point; floor/table lamps ABOVE', () => {
        builder.setDayNight('night');
        for (const t of ALL_FIXTURE_TYPES) builder.add(makeData(t));
        builder.syncLights();
        for (const l of fixtureLights(builder)) {
            const t = String(l.userData.elementId).replace('light-', '') as LightingFixtureType;
            const mount = photometryForFixture(t).mount;
            if (mount === 'ceiling') {
                expect(l.position.y, `${t} should hang down`).toBeLessThan(0);
            } else if (mount === 'floor' || mount === 'table') {
                expect(l.position.y, `${t} should stand up`).toBeGreaterThan(0);
            }
        }
    });

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — the join key with the element-type registry.
     *
     * `LightingTypeDefinitions.BUILT_IN_LIGHTING_TYPES` (landed by the
     * element-type agent) is IDENTITY ONLY — id/name/description/mount, no
     * photometric values. Its `id` is the join key into the photometry table, and
     * its `mount` must agree with photometry's. This test is the seam: it fails
     * the moment either side adds a fixture the other does not know about, or
     * classifies one differently.
     */
    it('joins 1:1 with BUILT_IN_LIGHTING_TYPES on id, and agrees on mount class', async () => {
        const { BUILT_IN_LIGHTING_TYPES } = await import('../src/LightingTypeDefinitions');
        const registryIds = BUILT_IN_LIGHTING_TYPES.map((d) => d.id).sort();
        expect(registryIds).toEqual([...ALL_FIXTURE_TYPES].sort());
        for (const def of BUILT_IN_LIGHTING_TYPES) {
            expect(photometryForFixture(def.id).mount, `${def.id} mount class`).toBe(def.mount);
        }
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — live-light budget', () => {
    let builder: LightingFragmentBuilder;
    beforeEach(() => {
        if (g.window === undefined) g.window = {};
        builder = new LightingFragmentBuilder();
        builder.setScene(new THREE.Group());
    });
    afterEach(() => builder.dispose());

    it('caps live lights at the tier budget and degrades without dropping the nearest', () => {
        builder.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        builder.setDayNight('night');
        // 100 fixtures on a line, nearest at x=1.
        for (let i = 0; i < 100; i++) builder.add(makeData('downlight', `dl-${String(i).padStart(3, '0')}`, i + 1));
        builder.syncLights();

        builder.setQualityTier('cinematic');
        expect(fixtureLights(builder)).toHaveLength(LIVE_LIGHT_BUDGET_BY_TIER.cinematic);

        builder.setQualityTier('survival');
        const survivors = fixtureLights(builder);
        expect(survivors).toHaveLength(LIVE_LIGHT_BUDGET_BY_TIER.survival);
        // The nearest fixture must survive every degradation step.
        expect(survivors.map((l) => l.userData.elementId)).toContain('dl-000');
    });

    it('a fixture outside the budget keeps its emissive lens — it still reads as ON', () => {
        builder.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        builder.setDayNight('night');
        for (let i = 0; i < 40; i++) builder.add(makeData('pendant', `p-${String(i).padStart(3, '0')}`, i + 1));
        builder.setQualityTier('survival');   // budget 8 → 32 fixtures go dark

        const farthest = rootOf(builder, 'p-039');
        let lenses = 0;
        farthest.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m?.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 0) > 0) lenses++;
        });
        expect(lenses, 'budget-dark fixture must still have a lit lens').toBeGreaterThan(0);
        // …and it genuinely has no point light.
        let hasLight = false;
        farthest.traverse((o) => { if ((o as THREE.Light).isLight) hasLight = true; });
        expect(hasLight).toBe(false);
    });

    it('a typical residential scene (12 fixtures) is entirely within budget', () => {
        builder.setDayNight('night');
        for (let i = 0; i < 12; i++) builder.add(makeData('downlight', `dl-${i}`, i));
        builder.syncLights();
        expect(fixtureLights(builder)).toHaveLength(12);
        expect(builder.liveLightCount).toBe(12);
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — material sharing (instancing hazard)', () => {
    it('100 identical fixtures do NOT produce 100 unique lens materials', () => {
        if (g.window === undefined) g.window = {};
        const builder = new LightingFragmentBuilder();
        builder.setScene(new THREE.Group());
        builder.setDayNight('night');
        for (let i = 0; i < 100; i++) builder.add(makeData('downlight', `dl-${i}`, i));
        builder.syncLights();

        const mats = new Set<THREE.Material>();
        scene(builder).traverse((o) => {
            const m = (o as THREE.Mesh).material;
            if (m && !Array.isArray(m)) mats.add(m as THREE.Material);
        });
        // Body + reflector + bezel + lens ≈ a handful of shared materials, not 400.
        expect(mats.size).toBeLessThan(20);
        builder.dispose();
    });
});
