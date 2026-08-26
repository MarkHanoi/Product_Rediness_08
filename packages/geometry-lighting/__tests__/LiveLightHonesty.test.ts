/**
 * §LIGHT-BUDGET-HONESTY (L-11420) — the founder's question, pinned.
 *
 *   *"WHY DO SOME LIGHTING PRODUCTS PRODUCE LIGHT DEPENDING ON RANDOM FACTORS?"*
 *
 * ── What this suite establishes, and what it deliberately does NOT ───────────
 *
 * It establishes that the selection is NOT random — it is a distance ranking
 * against a tier-derived budget, deterministic and re-derivable — and that every
 * fixture now CARRIES that verdict with the numbers behind it, so a fixture that
 * cannot emit says so instead of looking broken (C16 CA-18 / C74: refuse by name,
 * with the numbers, never silently).
 *
 * ⛔ It does NOT establish that the budget VALUES (8/6/3/1) are the right ones.
 * `LiveLightBudget.ts` says so itself — they are DERIVED-BUT-UNMEASURED, and
 * validating them needs an in-browser orbit-FPS capture that no bench in this
 * repo can do (no GL context in headless Node). Nothing here should be read as
 * evidence that 3 is enough; see the lane report.
 *
 * ── §LIGHT121 (L-11903, 2026-08-26) — the founder's Japanese-bed report ───────
 *
 * *"the lights of the Japanese bed are ALWAYS on — and it is the only element —
 * the rest sometimes, mostly not."* MEASURED: `JapaneseBedBuilder.ts` has no
 * emissive material and no light of its own; the glow is the two lighting
 * FIXTURES placed beside it, and at his `performance` tier (budget 3, ~2983
 * meshes) they are almost always the two nearest the camera, because the
 * camera is parked at the bed to look at it. This is §LIGHT-BUDGET-HONESTY
 * above, not a new mechanism — the "always on / mostly not" SHAPE is exactly
 * what a distance-ranked budget of 3 looks like from inside one session. See
 * `lightRebuildDeterminism.test.ts` (§LIGHT121) for the independent proof that
 * this is NOT a race (25 rebuilds of one record, fixed tier/focus: byte-
 * identical). The 'the budget console summary…' describe block below pins the
 * ONE new thing this lane adds: the per-fixture `reason` (already existed,
 * L-11420) reaching a surface a founder session already reads — the console —
 * since the honesty stamp on `userData` had no reader anywhere in the app.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder, type LiveLightState } from '../src/LightingFragmentBuilder';
import type { LightingData } from '../src/LightingTypes';
import { LIVE_LIGHT_BUDGET_BY_TIER, DEFAULT_LIVE_LIGHT_BUDGET } from '@pryzm/core-app-model';

const g = globalThis as unknown as { window?: unknown };

function fixture(id: string, x: number): LightingData {
    return {
        id, type: 'lighting', levelId: 'L1',
        fixtureType: 'pendant', position: { x, y: 2.4, z: 0 },
    };
}

function realLightsIn(scene: THREE.Object3D): number {
    let n = 0;
    scene.traverse((o) => { if ((o as THREE.Light).isLight) n++; });
    return n;
}

function makeBuilder(): { b: LightingFragmentBuilder; scene: THREE.Scene } {
    const scene = new THREE.Scene();
    const b = new LightingFragmentBuilder();
    b.setScene(scene);
    return { b, scene };
}

describe('§LIGHT-BUDGET-HONESTY — the budget is REAL and it BINDS', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('the cold-start budget is the PERFORMANCE rung, not the middle of the ladder', () => {
        // §FIX-LIGHT-TIER-UNWIRED: this used to open at `balanced` on the assumption a
        // tier would be reported promptly, and for a long time nothing ever reported
        // one — so the "cold start" was the permanent budget for every scene.
        expect(DEFAULT_LIVE_LIGHT_BUDGET).toBe(LIVE_LIGHT_BUDGET_BY_TIER.performance);
        expect(DEFAULT_LIVE_LIGHT_BUDGET).toBe(3);
    });

    it('MEASURES the founder\'s case: 40 fixtures on `performance` yield 3 real lights', () => {
        const { b, scene } = makeBuilder();
        b.setQualityTier('performance');
        for (let i = 0; i < 40; i++) b.add(fixture(`f-${i}`, i * 2));
        b.syncLights();

        expect(realLightsIn(scene)).toBe(3);
        expect(b.liveLightCount).toBe(3);
        // …and the other 37 are not broken, they are BUDGETED.
        const diags = b.liveLightDiagnostics();
        expect(diags).toHaveLength(40);
        expect(diags.filter((d) => d.lit)).toHaveLength(3);
        b.dispose();
    });

    it('every tier binds at its OWN rung — the ladder is not decorative', () => {
        for (const [tier, budget] of Object.entries(LIVE_LIGHT_BUDGET_BY_TIER)) {
            const { b, scene } = makeBuilder();
            b.setQualityTier(tier as keyof typeof LIVE_LIGHT_BUDGET_BY_TIER);
            for (let i = 0; i < 20; i++) b.add(fixture(`f-${i}`, i * 2));
            b.syncLights();
            expect(realLightsIn(scene), `${tier} budget`).toBe(budget);
            b.dispose();
        }
    });

    it('under budget, EVERY fixture lights — the budget caps, it does not ration', () => {
        const { b, scene } = makeBuilder();
        b.setQualityTier('cinematic');           // budget 8
        for (let i = 0; i < 5; i++) b.add(fixture(`f-${i}`, i * 2));
        b.syncLights();
        expect(realLightsIn(scene)).toBe(5);
        expect(b.liveLightDiagnostics().every((d) => d.lit)).toBe(true);
        b.dispose();
    });
});

describe('§LIGHT-BUDGET-HONESTY — NOT random: the ranking is deterministic', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('the SAME scene selects the SAME winners on every rebuild', () => {
        const run = (): string[] => {
            const { b } = makeBuilder();
            b.setQualityTier('performance');
            b.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
            // Deliberately added in an order UNRELATED to distance, so insertion
            // order cannot be mistaken for the ranking.
            for (const x of [18, 4, 30, 2, 12, 8, 24, 6]) b.add(fixture(`f-${x}`, x));
            b.syncLights();
            const out = b.liveLightDiagnostics().filter((d) => d.lit).map((d) => d.id!);
            b.dispose();
            return out;
        };
        expect(run()).toEqual(run());
        // Nearest three to the origin are x = 2, 4, 6 — DISTANCE, not insertion order.
        expect(run().sort()).toEqual(['f-2', 'f-4', 'f-6']);
    });

    it('the winner is the fixture nearest the FOCUS, and moving focus moves the winner', () => {
        const { b } = makeBuilder();
        b.setQualityTier('survival');            // budget 1 — one winner, unambiguous
        let focusX = 0;
        b.setFocusProvider(() => ({ x: focusX, y: 0, z: 0 }));
        for (const x of [0, 10, 20, 30]) b.add(fixture(`f-${x}`, x));
        b.syncLights();
        expect(b.liveLightDiagnostics().find((d) => d.lit)!.id).toBe('f-0');

        focusX = 30;
        b.syncLights();
        expect(b.liveLightDiagnostics().find((d) => d.lit)!.id).toBe('f-30');
        b.dispose();
    });

    it('rank is a TOTAL order over every fixture — 1..N, no gaps, no ties', () => {
        const { b } = makeBuilder();
        b.setQualityTier('performance');
        for (let i = 0; i < 12; i++) b.add(fixture(`f-${i}`, i * 3));
        b.syncLights();
        const ranks = b.liveLightDiagnostics().map((d) => d.rank).sort((a, z) => a - z);
        expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        // The lit ones are exactly the top of that order — not an arbitrary subset.
        const lit = b.liveLightDiagnostics().filter((d) => d.lit).map((d) => d.rank).sort((a, z) => a - z);
        expect(lit).toEqual([1, 2, 3]);
        b.dispose();
    });
});

describe('§LIGHT-BUDGET-HONESTY — a dark fixture SAYS SO, with the numbers', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('an unlit fixture carries a reason naming the tier, the budget and its rank', () => {
        const { b } = makeBuilder();
        b.setQualityTier('performance');
        b.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        for (let i = 0; i < 10; i++) b.add(fixture(`f-${i}`, i * 5));
        b.syncLights();

        const dark = b.liveLightDiagnostics().find((d) => !d.lit)!;
        expect(dark.reason).toBeTruthy();
        // ⭐ The numbers must actually BE in the sentence — a reason that says
        // "not lit" and nothing else is the silent refusal this exists to remove.
        expect(dark.reason!).toContain('performance');
        expect(dark.reason!).toContain('3 live fixture lights');
        expect(dark.reason!).toContain(`ranks ${dark.rank} of 10`);
        expect(dark.budget).toBe(3);
        expect(dark.total).toBe(10);
        expect(dark.tier).toBe('performance');
        b.dispose();
    });

    it('a LIT fixture carries no reason — no false alarm on a working light', () => {
        const { b } = makeBuilder();
        b.setQualityTier('cinematic');
        b.add(fixture('solo', 0));
        b.syncLights();
        const s = b.liveLightDiagnostics()[0]!;
        expect(s.lit).toBe(true);
        expect(s.reason).toBeNull();
        b.dispose();
    });

    it('reports an UNWIRED focus rather than implying "nearest the camera"', () => {
        // Without a focus provider the ranking is distance-from-ORIGIN. Still
        // deterministic, but it is NOT what the reason sentence claims, so the
        // degradation is reported instead of hidden.
        const { b } = makeBuilder();
        b.setQualityTier('performance');
        b.add(fixture('a', 0));
        b.syncLights();
        expect(b.liveLightDiagnostics()[0]!.focused).toBe(false);

        const { b: b2 } = makeBuilder();
        b2.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        b2.add(fixture('a', 0));
        b2.syncLights();
        expect(b2.liveLightDiagnostics()[0]!.focused).toBe(true);
        b.dispose(); b2.dispose();
    });

    it('the tier is reported as null before one arrives — never guessed', () => {
        const { b } = makeBuilder();
        b.add(fixture('a', 0));
        b.syncLights();
        const s: LiveLightState = b.liveLightDiagnostics()[0]!;
        expect(s.tier).toBeNull();
        expect(s.budget).toBe(DEFAULT_LIVE_LIGHT_BUDGET);
        b.dispose();
    });

    it('diagnostics are EMPTY before any fixture exists — no fabricated ranking', () => {
        const { b } = makeBuilder();
        expect(b.liveLightDiagnostics()).toEqual([]);
        b.dispose();
    });
});

describe('§LIGHT121 (L-11903) — the budget console summary: the honesty stamp finally reaches a reader', () => {
    beforeEach(() => { g.window = g.window ?? {}; vi.restoreAllMocks(); });

    it('prints a summary naming the live/dark/total/tier numbers when the budget overflows', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { b } = makeBuilder();
        b.setQualityTier('performance'); // budget 3
        for (let i = 0; i < 10; i++) b.add(fixture(`f${i}`, i));
        b.syncLights();

        expect(info).toHaveBeenCalledTimes(1);
        const line = info.mock.calls[0]![0] as string;
        expect(line).toContain('3 of 10 fixtures');
        expect(line).toContain('performance');
        expect(line).toContain('7'); // dark count
        expect(line).toContain('liveLightDiagnostics()');
        b.dispose();
    });

    it('is DEDUPED — an unrelated resync of the SAME live/dark set does not reprint it', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { b } = makeBuilder();
        b.setQualityTier('performance');
        for (let i = 0; i < 10; i++) b.add(fixture(`f${i}`, i));
        b.syncLights();
        expect(info).toHaveBeenCalledTimes(1);

        // A resync that changes NOTHING about who is live/dark — e.g. a
        // day/night toggle — must not reprint the same line.
        b.setDayNight('night');
        b.syncLights();
        b.setDayNight('day');
        b.syncLights();
        expect(info, 'an unchanged live/dark set must not reprint the summary').toHaveBeenCalledTimes(1);
        b.dispose();
    });

    it('RE-FIRES when the live/dark set actually changes (a fixture is added, tipping a new one dark)', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { b } = makeBuilder();
        b.setQualityTier('performance');
        for (let i = 0; i < 10; i++) b.add(fixture(`f${i}`, i));
        b.syncLights();
        expect(info).toHaveBeenCalledTimes(1);

        b.add(fixture('f10', 100));
        b.syncLights();
        expect(info, 'an 11th fixture changes the dark set and must be reported').toHaveBeenCalledTimes(2);
        b.dispose();
    });

    it('says NOTHING when every fixture fits inside the budget — no false alarm on a healthy scene', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { b } = makeBuilder();
        b.setQualityTier('cinematic'); // budget 8
        for (let i = 0; i < 3; i++) b.add(fixture(`f${i}`, i));
        b.syncLights();
        expect(info).not.toHaveBeenCalled();
        b.dispose();
    });

    it('the Japanese-bed shape, reproduced directly: two near fixtures stay lit every rebuild, everything else stays dark, and the summary explains it', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { b } = makeBuilder();
        b.setQualityTier('performance'); // budget 3, matches his measured tier
        b.setFocusProvider(() => ({ x: 0, y: 0, z: 0 })); // camera parked at the bed
        // The two bedside lamps, closest to the camera…
        b.add(fixture('bedside_lamp_left', 0.3));
        b.add(fixture('bedside_lamp_right', -0.3));
        // …and forty other fixtures scattered through the rest of the building,
        // each farther than the last — `far_0` is the NEAREST of the forty.
        for (let i = 0; i < 40; i++) b.add(fixture(`far_${i}`, 20 + i));
        b.syncLights();

        const lamps = b.liveLightDiagnostics().filter((d) => d.id?.startsWith('bedside_lamp'));
        expect(lamps.every((d) => d.lit), 'both bedside lamps must be live — every rebuild, deterministically').toBe(true);
        // Budget 3 = the two lamps PLUS exactly one more: the nearest remaining
        // candidate. This is the honest shape — not "everything else is dark",
        // but "the budget's third slot goes to whoever is third-nearest", which
        // is what makes "sometimes, mostly not" true for the REST of the model
        // while the two lamps read as unconditionally on.
        const far = b.liveLightDiagnostics().filter((d) => d.id?.startsWith('far_'));
        const farLit = far.filter((d) => d.lit);
        expect(farLit.map((d) => d.id)).toEqual(['far_0']);
        expect(far.filter((d) => d.id !== 'far_0').every((d) => !d.lit), 'every far fixture but the nearest must be dark').toBe(true);
        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0]![0] as string).toContain('3 of 42 fixtures');
        b.dispose();
    });
});
