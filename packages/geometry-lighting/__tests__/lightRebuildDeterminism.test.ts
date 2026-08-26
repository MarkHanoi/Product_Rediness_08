// @vitest-environment happy-dom
/**
 * §LIGHT121 (L-11903) — founder: "the lighting randomly is on/off — some show
 * proper lumen, sometimes not."
 *
 * ── TWO RIVAL EXPLANATIONS, AND THIS SUITE'S JOB IS TO TELL THEM APART ───────
 *
 * (A) BUDGET-WORKING-AS-DESIGNED. `LiveLightBudget.ts` bounds the number of
 *     fixtures that get a real `THREE.PointLight` (`LIVE_LIGHT_BUDGET_BY_TIER`
 *     — cinematic 8 / balanced 6 / performance 3 / survival 1), ranked by
 *     distance-to-camera-AT-LAST-EDIT. `§LIGHT-BUDGET-HONESTY` (L-11420,
 *     already shipped, see `LiveLightHonesty.test.ts`) established this
 *     ranking is deterministic GIVEN (candidates, budget, focus) — never
 *     `Math.random()`, never wall-clock. A fixture outside the budget still
 *     shows its lit emissive LENS (`_syncLens` runs unconditionally) but
 *     contributes no illumination — which is a legitimate, intentional
 *     degradation, not a defect.
 *
 * (B) A GENUINE RACE. If the SAME record, rebuilt under IDENTICAL conditions
 *     (same candidate set, same tier, same focus point), produces a DIFFERENT
 *     live/dark verdict or a different `PointLight.intensity` from one rebuild
 *     to the next, that is not the budget working — the budget is supposed to
 *     be a pure function of its three inputs and is not being one.
 *
 * ── WHAT THIS SUITE MEASURES ──────────────────────────────────────────────────
 * Holding tier/focus/candidate-set FIXED (isolating (B) from (A) — a moving
 * focus or a shuffled candidate set legitimately changes the ranking, and
 * conflating the two is exactly the mistake the brief warns against), this
 * rebuilds the SAME record N times through THREE different paths a real
 * rebuild takes in production and asserts byte-identical results each time:
 *
 *   1. `builder.add()` on a fresh builder, N independent times — the
 *      ProjectLoader-restore / ProjectSerializer-reload shape.
 *   2. `builder.update()` (`remove()` then `add()`) on ONE long-lived builder,
 *      N times in a row — the property-edit / re-seat shape, and the shape
 *      most likely to exercise `_lightPool` object RECYCLING
 *      (`LightingFragmentBuilder.ts:1805` `this._lightPool.pop()`), which is
 *      exactly the "shared/cached object mutated per-instance" race class
 *      named in the brief.
 *   3. Recycling THROUGH a different fixture family in between (place A,
 *      remove A, place a DIFFERENT type B so B's attach pops A's parked
 *      light, remove B, place A again) — the specific shape that would
 *      surface a missed-field reset on a recycled `THREE.PointLight`.
 *
 * ── RESULT (see the report) ──────────────────────────────────────────────────
 * All three come back byte-identical across 25 rebuilds. `_attachLight`
 * (`LightingFragmentBuilder.ts:1778-1814`) reassigns intensity / distance /
 * decay / color / position / castShadow UNCONDITIONALLY on every attach,
 * recycled object or not — which is exactly what makes this pass. This
 * suite is the measurement that pins it: (A), not (B).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';
import { photometryForFixture, sceneIntensityFor, kelvinToHex } from '@pryzm/core-app-model';

const g = globalThis as unknown as { window?: Record<string, unknown> };
const REBUILDS = 25;
const FIXED_FOCUS = { x: 3, y: 1.6, z: -2 };

/**
 * The INDEPENDENTLY-computed ground truth for a fixture's live light, straight
 * from the photometry table — never read off a builder's own output. Comparing
 * against THIS (not just against a prior snapshot of the SAME mechanism) is
 * what stops a systemic-always-wrong bug from hiding behind self-consistency:
 * a value that is wrong in the SAME way on every rebuild is byte-identical
 * across rebuilds and would pass a self-referential check vacuously.
 */
function expectedFor(fixtureType: LightingFixtureType, isNight = false): { intensity: number; distance: number; colorHex: number } {
    const photo = photometryForFixture(fixtureType);
    return {
        intensity: sceneIntensityFor(photo, isNight),
        distance: photo.reachM,
        colorHex: kelvinToHex(photo.kelvin),
    };
}

function lamp(id: string, fixtureType: LightingFixtureType, x: number): LightingData {
    return { id, type: 'lighting', levelId: 'L0', fixtureType, position: { x, y: 2.4, z: 0 } };
}

function newBuilder(): { b: LightingFragmentBuilder; scene: THREE.Scene } {
    const scene = new THREE.Scene();
    const b = new LightingFragmentBuilder();
    b.setScene(scene);
    b.setQualityTier('balanced'); // fixed tier — isolates (B) from a tier change
    b.setFocusProvider(() => FIXED_FOCUS); // fixed focus — isolates (B) from a camera move
    return { b, scene };
}

/** The one fixture's live PointLight, or undefined if it landed dark. */
function lightFor(scene: THREE.Object3D, id: string): THREE.PointLight | undefined {
    let found: THREE.PointLight | undefined;
    scene.traverse((o) => {
        if (!found && (o as THREE.Light).isLight && o.userData?.elementId === id) found = o as THREE.PointLight;
    });
    return found;
}

interface Snapshot {
    readonly lit: boolean;
    readonly reason: string | null;
    readonly intensity: number | null;
    readonly distance: number | null;
    readonly decay: number | null;
    readonly colorHex: number | null;
}

function snapshot(group: THREE.Object3D, scene: THREE.Object3D, id: string): Snapshot {
    const state = group.userData.liveLight as { lit: boolean; reason: string | null } | undefined;
    const light = lightFor(scene, id);
    return {
        lit: state?.lit ?? false,
        reason: state?.reason ?? null,
        intensity: light?.intensity ?? null,
        distance: light?.distance ?? null,
        decay: light?.decay ?? null,
        colorHex: light?.color.getHex() ?? null,
    };
}

describe('§LIGHT121 / L-11903 — same record, same conditions, rebuilt N times: byte-identical light state', () => {
    beforeEach(() => { if (g.window === undefined) g.window = {}; });

    it('PATH 1 — a fresh builder every rebuild (ProjectLoader-restore shape): 25/25 identical', () => {
        const id = 'lamp-fresh';
        const snapshots: Snapshot[] = [];
        for (let i = 0; i < REBUILDS; i++) {
            const { b, scene } = newBuilder();
            b.add(lamp(id, 'table_terracotta', 0));
            b.syncLights();
            const group = scene.children.find((c) => c.userData?.id === id)!;
            snapshots.push(snapshot(group, scene, id));
            b.dispose();
        }
        const [first, ...rest] = snapshots;
        for (const [i, s] of rest.entries()) {
            expect(s, `rebuild ${i + 2} of ${REBUILDS} diverged from rebuild 1`).toEqual(first);
        }
        expect(first!.lit, 'a single fixture well under the balanced (6) budget must be live').toBe(true);
        // Ground truth, not self-reference: closes the loophole where a value that
        // is WRONG THE SAME WAY every time would pass a same-vs-same comparison.
        const expected = expectedFor('table_terracotta');
        expect(first!.intensity, 'intensity must match the photometry table, not merely repeat itself').toBe(expected.intensity);
        expect(first!.distance).toBe(expected.distance);
        expect(first!.colorHex).toBe(expected.colorHex);
    });

    it('PATH 2 — update() (remove+add) on ONE long-lived builder, N times: 25/25 identical, and matches a fresh build', () => {
        const id = 'lamp-updated';
        const { b, scene } = newBuilder();
        b.add(lamp(id, 'table_terracotta', 0));
        b.syncLights();
        const group = scene.children.find((c) => c.userData?.id === id)!;
        const baseline = snapshot(group, scene, id);

        const snapshots: Snapshot[] = [];
        for (let i = 0; i < REBUILDS; i++) {
            b.update(lamp(id, 'table_terracotta', 0)); // remove() then add() — same data every time
            b.syncLights();
            const g2 = scene.children.find((c) => c.userData?.id === id)!;
            snapshots.push(snapshot(g2, scene, id));
        }
        for (const [i, s] of snapshots.entries()) {
            expect(s, `update() rebuild ${i + 1} diverged from the baseline single-add`).toEqual(baseline);
        }
        b.dispose();
    });

    it('PATH 3 — recycle the SAME fixture through a DIFFERENT family\'s light object, N times: no field bleeds across the swap', () => {
        // Forces `_lightPool.pop()` (LightingFragmentBuilder.ts:1805) to hand the
        // terracotta lamp's PARKED light object to a `pendant` (different photometry:
        // different lumens → different intensity, different reachM → different
        // distance, different kelvin → different colour), and back again — the exact
        // shape that would surface a missed unconditional-reset field.
        const idA = 'lamp-recycle-a';
        const idB = 'lamp-recycle-b';
        const { b, scene } = newBuilder();

        b.add(lamp(idA, 'table_terracotta', 0));
        b.syncLights();
        const groupA0 = scene.children.find((c) => c.userData?.id === idA)!;
        const baselineA = snapshot(groupA0, scene, idA);

        // Ground truth BEFORE any recycling happens at all — if this were wrong the
        // loop below would just repeat the same wrong number and hide the defect.
        const expectedA = expectedFor('table_terracotta');
        expect(baselineA.intensity, 'pre-recycle baseline must already match table_terracotta photometry').toBe(expectedA.intensity);
        expect(baselineA.colorHex).toBe(expectedA.colorHex);

        const expectedB = expectedFor('pendant');
        const snapshots: Snapshot[] = [];
        for (let i = 0; i < REBUILDS; i++) {
            b.remove(idA);
            b.add(lamp(idB, 'pendant', 1)); // steals A's just-parked light object
            b.syncLights();
            // B must read as PENDANT, not as a leftover table_terracotta value —
            // this is the direction a self-referential A-vs-A check cannot see,
            // because it never looks at what the borrower ends up with.
            const groupB = scene.children.find((c) => c.userData?.id === idB)!;
            const snapB = snapshot(groupB, scene, idB);
            expect(snapB.intensity, `round ${i + 1}: pendant borrowed a's light object but must show pendant's OWN intensity`).toBe(expectedB.intensity);
            expect(snapB.colorHex, `round ${i + 1}: pendant must show its own colour, not table_terracotta's`).toBe(expectedB.colorHex);

            b.remove(idB);
            b.add(lamp(idA, 'table_terracotta', 0)); // reclaims a light object recycled from B
            b.syncLights();
            const groupA = scene.children.find((c) => c.userData?.id === idA)!;
            snapshots.push(snapshot(groupA, scene, idA));
        }
        for (const [i, s] of snapshots.entries()) {
            expect(s, `recycle-round ${i + 1}: table_terracotta must read identically after recycling through pendant`).toEqual(baselineA);
        }
        b.dispose();
    });

    it('CONTROL — a fixture placed alongside a full budget (balanced=6) consistently lands DARK, not randomly one or the other', () => {
        // Proves explanation (A): this is the budget, deterministically, not a coin flip.
        const { b, scene } = newBuilder();
        // Six fixtures close to FIXED_FOCUS (x:3) fill the balanced(6) budget...
        const ids = Array.from({ length: 6 }, (_, i) => `l${i}`);
        for (const [i, id] of ids.entries()) b.add(lamp(id, 'downlight', 2 + i * 0.1));
        // ...so this one, unambiguously the farthest candidate, must always lose.
        b.add(lamp('far-outlier', 'downlight', 500));
        b.syncLights();
        const farGroup = scene.children.find((c) => c.userData?.id === 'far-outlier')!;
        const results: boolean[] = [];
        for (let i = 0; i < REBUILDS; i++) {
            b.update(lamp('far-outlier', 'downlight', 500));
            b.syncLights();
            const g2 = scene.children.find((c) => c.userData?.id === 'far-outlier')!;
            results.push((g2.userData.liveLight as { lit: boolean }).lit);
        }
        expect(results.every((r) => r === false), 'the outlier must be dark on EVERY rebuild, never intermittently live').toBe(true);
        expect(farGroup).toBeDefined();
        b.dispose();
    });
});
