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
    LIGHTING_FIXTURE_PHOTOMETRY,
    isGeneralLightingFixture,
} from '@pryzm/core-app-model';

/**
 * §FEAT-LOD200-LUMINAIRES (L-1330) — ONE definition, imported. This predicate was
 * briefly written out here too; two copies of "which fixtures light a space" is the
 * rival-table shape the whole lane exists to remove, so it lives beside the matrix
 * that determines it and both suites read the same answer.
 */
const isRoomLighting = (t: LightingFixtureType): boolean => isGeneralLightingFixture(t);

/**
 * Every fixture family the builder can be asked to draw — DERIVED from the single
 * photometry table, not re-listed.
 *
 * §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) — this WAS a hand-written list of
 * twelve, and adding the twenty LOD-200 families broke it, which is the finding
 * worth keeping: a test that hard-codes the population it is meant to cover stops
 * covering the population the moment the population grows. It reported a failure
 * for exactly the case it should have been asserting — that twenty new families
 * are all present and all emit.
 *
 * Reading the table instead means every future family is covered by these suites on
 * the day it is added, with no edit here. The table is itself asserted TOTAL over
 * `LightingFixtureType` by `FixturePhotometry.test.ts`, so this cannot silently
 * shrink either.
 */
const ALL_FIXTURE_TYPES: readonly LightingFixtureType[] =
    Object.keys(LIGHTING_FIXTURE_PHOTOMETRY) as LightingFixtureType[];

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

/**
 * §PERF-LIGHT-COST-MODEL (2026-08-09) — run `assert` with EXACTLY ONE fixture family
 * present, then remove it.
 *
 * These coverage tests used to add all 12 families at once and assert 12 live lights.
 * That silently encoded "the live-light budget is bigger than 12", which was only true
 * while the budget was the (dead-wired) 48. The budget is a REAL, derived cap now, so a
 * per-family PHOTOMETRY assertion must isolate the family under test rather than lean on
 * a budget large enough to hold every family at once — otherwise a legitimate budget
 * change breaks tests that are not about the budget at all.
 */
function forEachFamilyAlone(
    builder: LightingFragmentBuilder,
    assertOne: (type: LightingFixtureType, light: THREE.PointLight) => void,
): void {
    for (const t of ALL_FIXTURE_TYPES) {
        builder.add(makeData(t));
        builder.syncLights();
        const lights = fixtureLights(builder);
        expect(lights, t + ': exactly one fixture light').toHaveLength(1);
        assertOne(t, lights[0]!);
        builder.remove('light-' + t);
        builder.syncLights();
    }
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
        forEachFamilyAlone(builder, (t, l) => {
            expect(l.intensity, t + ' day intensity').toBeGreaterThan(0);
            expect(l.distance, t).toBeGreaterThan(0);
        });
    });

    it('EVERY fixture family produces a real light with intensity > 0 — in NIGHT mode', () => {
        builder.setDayNight('night');
        forEachFamilyAlone(builder, (t, l) => {
            expect(l.intensity, t + ' night intensity').toBeGreaterThan(0);
        });
    });

    it('intensity matches the photometric table exactly — no hidden scalar', () => {
        builder.setDayNight('night');
        forEachFamilyAlone(builder, (t, light) => {
            expect(light.intensity, t).toBeCloseTo(sceneIntensityFor(photometryForFixture(t), true), 8);
            expect(light.distance, t).toBe(photometryForFixture(t).reachM);
            expect(light.decay, t).toBe(2);      // physical inverse-square
        });
    });

    /**
     * §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) — SPLIT, and the split is the point.
     *
     * This assertion used to read "for EVERY family", which was true only while every
     * family was a room light of ≥ 450 lm. The twenty LOD-200 rows introduced the first
     * fixtures whose whole PURPOSE is to be dim: a maintained emergency downlight (180 lm)
     * and an internally illuminated exit sign (60 lm). EN 1838 asks for on the order of
     * 1 lx on an escape-route centre line — roughly two orders of magnitude below an
     * amenity level — so a life-safety fixture that cleared a GENERAL-LIGHTING brightness
     * floor would be the defect, not the fix.
     *
     * The same is true of a 2 W step MARKER: its job is to mark a position, not to
     * illuminate the volume it sits in.
     *
     * The original intent survives intact for the fixtures it was written about: no
     * ROOM-LIGHTING family may be dimmer than the flat scalar it replaced. The
     * life-safety and marker families get the assertion that is actually true of them —
     * they emit, and they emit LESS than general lighting — so both claims are now
     * checked instead of one being quietly relaxed to accommodate the other. The
     * population split is DERIVED (`isRoomLighting`), so it cannot be widened later to
     * absorb a family that simply came out too dim by mistake.
     */
    it('every ROOM-LIGHTING family is at least 2× the legacy flat 1.5-candela emission', () => {
        builder.setDayNight('night');
        let checked = 0;
        forEachFamilyAlone(builder, (t, l) => {
            if (!isRoomLighting(t)) return;   // a duty or a marker, not a room light
            expect(l.intensity / 1.5, t).toBeGreaterThanOrEqual(2);
            checked++;
        });
        // The exclusion must never silently swallow the whole population.
        expect(checked, 'room-lighting families checked').toBeGreaterThanOrEqual(12);
    });

    it('LIFE-SAFETY and MARKER families emit, but are DIMMER than general lighting — by design', () => {
        builder.setDayNight('night');
        const emergency: string[] = [];
        forEachFamilyAlone(builder, (t, l) => {
            if (isRoomLighting(t)) return;
            emergency.push(t);
            // It must still light — an emergency luminaire that emits nothing is the
            // one failure mode that matters.
            expect(l.intensity, t + ' must still emit').toBeGreaterThan(0);
            // …and it must not masquerade as amenity lighting.
            expect(l.intensity, t + ' must not read as a room light')
                .toBeLessThan(sceneIntensityFor(photometryForFixture('downlight'), true));
        });
        expect(emergency.sort()).toEqual(['emergency_downlight', 'exit_sign', 'step_marker_light']);
    });

    it('fixture lights never cast shadows — the cube-shadow-map cap belongs to the sun', () => {
        builder.setDayNight('night');
        forEachFamilyAlone(builder, (t, l) => expect(l.castShadow, t).toBe(false));
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
        // §PERF-LIGHT-COST-MODEL — one family at a time; the budget is a real cap now.
        for (const t of ALL_FIXTURE_TYPES) {
            builder.setDayNight('day');
            builder.add(makeData(t));
            builder.syncLights();
            const dayI = fixtureLights(builder)[0]!.intensity;

            builder.setDayNight('night');
            const nightI = fixtureLights(builder)[0]!.intensity;

            expect(nightI, t).toBeGreaterThan(dayI);
            builder.remove('light-' + t);
            builder.syncLights();
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
        // Exactly `budget` fixtures so this asserts NON-DUPLICATION, not the cap.
        const n = LIVE_LIGHT_BUDGET_BY_TIER.cinematic;
        builder.setQualityTier('cinematic');
        for (let i = 0; i < n; i++) builder.add(makeData('downlight', 'dl-' + i, i));
        for (let i = 0; i < 6; i++) builder.setDayNight(i % 2 ? 'night' : 'day');
        builder.syncLights();
        expect(fixtureLights(builder)).toHaveLength(n);
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

    /**
     * §PERF-LIGHT-COST-MODEL — this used to assert that a 12-fixture room is "entirely
     * within budget". That held only while the budget was 48, and 48 came from a stated
     * per-light cost (~10 ALU/fragment) that three's own shader disproves: the unrolled
     * NUM_POINT_LIGHTS loop runs the FULL physical BRDF per fragment per light. A room
     * CAN exceed the budget now; the contract is that it degrades GRACEFULLY — never
     * above the cap, never dropping the nearest, every fixture keeps its lit lens.
     */
    it('a 12-fixture room degrades to the cap without dropping the nearest fixture', () => {
        builder.setQualityTier('cinematic');
        builder.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        builder.setDayNight('night');
        for (let i = 0; i < 12; i++) {
            builder.add(makeData('downlight', 'dl-' + String(i).padStart(2, '0'), i + 1));
        }
        builder.syncLights();

        const cap = LIVE_LIGHT_BUDGET_BY_TIER.cinematic;
        expect(builder.liveLightCount).toBe(cap);
        expect(fixtureLights(builder)).toHaveLength(cap);
        expect(fixtureLights(builder).map((l) => l.userData.elementId)).toContain('dl-00');
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
