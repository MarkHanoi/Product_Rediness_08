/**
 * §LIGHT147 (L-12420) — the founder's SECOND lighting report, and the reason
 * the diagnostic had to grow a third axis.
 *
 * ── The report, and the discriminator it actually turned out to be ─────────
 *
 * "Lightings from OLD PROJECTS still don't light up. Only the Japanese bed is
 * consistent." Read literally that names PROJECT AGE as the discriminator, and
 * §LIGHT121 (L-11903) had already closed an "always on / mostly not" report as
 * the live-light budget working as designed. But the founder then reproduced
 * the SAME symptom in a BRAND-NEW project: `tier=cinematic` (budget 8), FOUR
 * fixtures created (pendant, linear_led, pendant_conical,
 * pendant_glass_cylinder) — 4 < 8, so nothing could have been throttled — and
 * every one of the four built correct geometry (mesh count rose on each
 * create) and produced ZERO illumination. That single fact reclassifies the
 * discriminator from PROJECT AGE to FIXTURE TYPE / CREATE PATH, and it clears
 * the budget outright: `selectLiveLights` cannot be the cause when the
 * candidate count never approaches the cap.
 *
 * ── What this suite proves, and what it does NOT ────────────────────────────
 *
 * 1. The budget/photometry CLASS is innocent for exactly this reproduction:
 *    all four of the founder's types, built with the same bare-bones DTO
 *    shape the bus→builder bridge constructs (id/type/levelId/fixtureType/
 *    position — no rotation, no `*Params`, no `emission`), at `cinematic`
 *    (budget 8) with only four candidates, each resolve to a real,
 *    non-trivial `THREE.PointLight.intensity`. This is not new coverage of
 *    the FAMILIES (`FixtureEmission.test.ts` already covers each alone); it
 *    is coverage of THIS EXACT COMBINATION under a budget nowhere near its
 *    cap, which is the shape the founder's session actually hit.
 * 2. The diagnostic the founder needs for the NEXT reproduction — one that
 *    can say THROTTLED-BY-BUDGET vs NEVER-REGISTERED vs REGISTERED-BUT-
 *    ZERO-INTENSITY from the console alone, because right now all three look
 *    identical to him ("built geometry, no light").
 *
 * This suite does NOT prove which of the three actually occurred in his
 * WebGPU session — that requires the live app, which no vitest run can
 * stand in for. It proves the diagnostic can now tell the difference, and it
 * proves the builder's own budget/photometry logic is not the explanation
 * for a 4-fixture, budget-8 scene going dark.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';

const g = globalThis as unknown as { window?: Record<string, unknown> };

/** The bare DTO shape `initTools.ts`'s `lighting.created` bus bridge builds —
 * no rotation, no parametric `*Params`, no `emission` override. */
function bareDto(id: string, fixtureType: LightingFixtureType, x = 0): LightingData {
    return { id, type: 'lighting', levelId: 'L1', fixtureType, position: { x, y: 2.6, z: 0 } };
}

function realLightsIn(scene: THREE.Object3D): THREE.Light[] {
    const out: THREE.Light[] = [];
    scene.traverse((o) => { if ((o as THREE.Light).isLight) out.push(o as THREE.Light); });
    return out;
}

describe('§LIGHT147 — the founder\'s brand-new-project repro: 4 fixtures, budget 8', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * ⭐ THE BUDGET-EXONERATION ARM. Reproduces his console facts exactly:
     * tier=cinematic (budget 8), four types, four candidates. If this suite is
     * right that the budget is not the cause, all four must be `lit: true`
     * with a real, non-trivial intensity — not merely "attached".
     */
    it('all four of the founder\'s types light, together, well under the cinematic budget', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setQualityTier('cinematic');

        const types: LightingFixtureType[] = ['pendant', 'linear_led', 'pendant_conical', 'pendant_glass_cylinder'];
        types.forEach((t, i) => b.add(bareDto(`f-${t}`, t, i * 2)));
        b.syncLights();

        expect(b.liveLightCount, 'all four must win a slot — budget 8, only 4 candidates').toBe(4);
        expect(realLightsIn(scene).length).toBe(4);

        const diags = b.liveLightDiagnostics();
        expect(diags).toHaveLength(4);
        for (const d of diags) {
            expect(d.lit, `${d.id} must be lit — nowhere near the budget cap`).toBe(true);
            expect(d.budget).toBe(8);
            expect(d.intensity, `${d.id} intensity`).toBeGreaterThan(0.001);
        }

        // Coverage must show full registration and zero anomalies — the class-level
        // mechanism is clean for this exact reproduction shape.
        const cov = b.livePoolCoverage();
        expect(cov?.unregisteredIds).toEqual([]);
        expect(cov?.zeroIntensityLitIds).toEqual([]);
        b.dispose();
    });

    /**
     * The old budget-overflow scenario stays distinguishable from the new one:
     * when candidates DO exceed the budget, the dark ones are darK BY DESIGN,
     * not by defect, and the coverage/zero-intensity arms stay empty — the
     * diagnostic must not conflate "budgeted dark" with either new anomaly.
     */
    it('a genuinely budget-throttled fixture is NOT reported as unregistered or zero-intensity', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        b.setQualityTier('survival'); // budget 1
        b.add(bareDto('near', 'pendant', 1));
        b.add(bareDto('far', 'pendant', 50));
        b.syncLights();

        const diags = b.liveLightDiagnostics();
        const near = diags.find((d) => d.id === 'near')!;
        const far = diags.find((d) => d.id === 'far')!;
        expect(near.lit).toBe(true);
        expect(far.lit).toBe(false);
        expect(far.intensity).toBeUndefined();   // no real light exists to read a number off
        expect(far.reason).toMatch(/render tier allows/i);

        const cov = b.livePoolCoverage()!;
        expect(cov.unregisteredIds).toEqual([]);       // `far` DID register — it just lost
        expect(cov.zeroIntensityLitIds).toEqual([]);   // nothing lit is anomalously dim
        b.dispose();
    });
});

describe('§LIGHT147 — NEVER-REGISTERED: a store record with no builder root', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * Simulates exactly the hazard `initTools.ts`'s `lighting.created` bridge
     * comment warns about: SOMETHING wrote a fixture into the store (so it
     * shows up in a schedule, a plan symbol, or a future reopen) but never
     * called `builder.add()` for it. Before this lane, that fixture was
     * invisible to every honesty surface this builder carries — not
     * "throttled", not "dark by budget", simply absent from the population
     * `liveLightDiagnostics()` iterates. `livePoolCoverage()` is the one check
     * that can see it, because it is the one check that reads the STORE.
     */
    it('is named by id, distinctly from every throttled/lit fixture', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setQualityTier('cinematic');

        const ghost: LightingData = bareDto('ghost-1', 'pendant', 0);
        const real: LightingData = bareDto('real-1', 'linear_led', 3);
        // The store has BOTH records — `ghost-1` never reached builder.add().
        (g.window as Record<string, unknown>).lightingStore = { getAll: () => [ghost, real] };

        b.add(real);
        b.syncLights();

        const cov = b.livePoolCoverage()!;
        expect(cov.storeRecords).toBe(2);
        expect(cov.registered).toBe(1);
        expect(cov.unregisteredIds).toEqual(['ghost-1']);

        // The ghost has no row in liveLightDiagnostics AT ALL — it is invisible to
        // that surface by construction, which is exactly the gap this closes.
        expect(b.liveLightDiagnostics().some((d) => d.id === 'ghost-1')).toBe(false);
        // The real fixture is unaffected and correctly lit.
        const realDiag = b.liveLightDiagnostics().find((d) => d.id === 'real-1')!;
        expect(realDiag.lit).toBe(true);
        expect(realDiag.intensity).toBeGreaterThan(0);
        b.dispose();
    });

    it('reports zero unregistered ids and equal counts in the ordinary case', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        const data = bareDto('ordinary-1', 'downlight');
        (g.window as Record<string, unknown>).lightingStore = { getAll: () => [data] };
        b.add(data);
        b.syncLights();

        const cov = b.livePoolCoverage()!;
        expect(cov.storeRecords).toBe(1);
        expect(cov.registered).toBe(1);
        expect(cov.unregisteredIds).toEqual([]);
        b.dispose();
    });

    it('livePoolCoverage() is null before the first sync — never a fabricated zero', () => {
        const b = new LightingFragmentBuilder();
        b.setScene(new THREE.Scene());
        expect(b.livePoolCoverage()).toBeNull();
        b.dispose();
    });
});

describe('§LIGHT147 — REGISTERED-BUT-ZERO-INTENSITY: a fixture that won the budget and still reads dark', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * §CONTEXT-DATA-HONESTY / schema-evolution guard: a stale, explicit
     * `emission.intensity` override — the exact shape `FixturePhotometry.ts`
     * itself worked through (the pre-photometry flat 1.5-candela scalar reads
     * BELOW the scene's ambient floor at 2.5 m) — must surface as its own,
     * named state rather than reading identically to a fixture that is simply
     * lit and working. Nothing in production currently WRITES an explicit
     * `emission` (verified: no non-test source references `emission:` as an
     * object literal), so this is a guard against a dormant vector, not proof
     * it fired — but the class must not be able to hide this when it does.
     */
    it('a near-zero explicit emission override is distinguished from a healthy light', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setQualityTier('cinematic');

        const stale: LightingData = {
            ...bareDto('stale-1', 'pendant'),
            emission: { intensity: 0.0001 },
        };
        (g.window as Record<string, unknown>).lightingStore = { getAll: () => [stale] };
        b.add(stale);
        b.syncLights();

        const diag = b.liveLightDiagnostics().find((d) => d.id === 'stale-1')!;
        expect(diag.lit, 'a near-zero override still WINS the budget slot').toBe(true);
        expect(diag.intensity).toBeCloseTo(0.0001, 6);

        const cov = b.livePoolCoverage()!;
        expect(cov.zeroIntensityLitIds).toEqual(['stale-1']);
        expect(cov.unregisteredIds).toEqual([]);
        b.dispose();
    });

    it('every catalogue family, resolved with NO explicit override, clears the threshold', () => {
        // The class-level guarantee this state exists to police: absent an
        // explicit override, the catalogue never resolves to near-zero for any
        // family this builder can place — a schema predating a field never
        // regresses THIS axis, because intensity is derived from `fixtureType`,
        // never from a persisted numeric field.
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setQualityTier('cinematic');
        b.add(bareDto('downlight-1', 'downlight'));
        b.add(bareDto('pendant-1', 'pendant', 2));
        b.syncLights();

        const cov = b.livePoolCoverage()!;
        expect(cov.zeroIntensityLitIds).toEqual([]);
        b.dispose();
    });
});
