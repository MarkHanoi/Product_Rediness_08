/**
 * §FEAT-FIXTURE-PHOTOMETRY — live-light budget.
 *
 * The budget is the thing standing between "every fixture emits" and a WebGPU
 * device loss, so its guarantees are asserted rather than assumed: it caps, it
 * degrades monotonically by tier, and degradation never drops a NEARER fixture
 * while keeping a farther one.
 */
import { describe, it, expect } from 'vitest';
import {
    LIVE_LIGHT_BUDGET_BY_TIER,
    DEFAULT_LIVE_LIGHT_BUDGET,
    liveLightBudgetForTier,
    selectLiveLights,
    type LightBudgetCandidate,
} from './LiveLightBudget.js';
import type { SceneQualityTier } from '../rendering/SceneQualityTierManager.js';

const TIERS: readonly SceneQualityTier[] = ['cinematic', 'balanced', 'performance', 'survival'];

/** N fixtures on the +X axis at 1 m, 2 m, 3 m … so "nearest" is unambiguous. */
function ladder(n: number): LightBudgetCandidate[] {
    return Array.from({ length: n }, (_, i) => ({ id: `f${String(i).padStart(3, '0')}`, x: i + 1, y: 0, z: 0 }));
}

describe('live-light budget — tiers', () => {
    it('every tier has a documented, non-zero budget', () => {
        for (const t of TIERS) {
            expect(LIVE_LIGHT_BUDGET_BY_TIER[t], t).toBeGreaterThan(0);
        }
    });

    it('the budget degrades monotonically from cinematic to survival', () => {
        const vals = TIERS.map((t) => LIVE_LIGHT_BUDGET_BY_TIER[t]);
        for (let i = 1; i < vals.length; i++) {
            expect(vals[i]!, `${TIERS[i]} vs ${TIERS[i - 1]}`).toBeLessThan(vals[i - 1]!);
        }
    });

    it('caps at the documented limit — cinematic 64, survival 8', () => {
        expect(LIVE_LIGHT_BUDGET_BY_TIER.cinematic).toBe(64);
        expect(LIVE_LIGHT_BUDGET_BY_TIER.survival).toBe(8);
    });

    it('an unreported tier falls back to the documented default, never to 0 or Infinity', () => {
        expect(liveLightBudgetForTier(undefined)).toBe(DEFAULT_LIVE_LIGHT_BUDGET);
        expect(DEFAULT_LIVE_LIGHT_BUDGET).toBeGreaterThan(0);
        expect(Number.isFinite(DEFAULT_LIVE_LIGHT_BUDGET)).toBe(true);
    });
});

describe('live-light budget — selection', () => {
    it('never exceeds the budget', () => {
        for (const t of TIERS) {
            const budget = liveLightBudgetForTier(t);
            const sel = selectLiveLights(ladder(200), budget, { x: 0, y: 0, z: 0 });
            expect(sel.live.length, t).toBeLessThanOrEqual(budget);
            expect(sel.live.length, t).toBe(budget);
        }
    });

    it('live ∪ dark is the whole input set, and they are disjoint', () => {
        const all = ladder(50);
        const sel = selectLiveLights(all, 10, { x: 0, y: 0, z: 0 });
        expect(sel.live.length + sel.dark.length).toBe(all.length);
        expect(new Set([...sel.live, ...sel.dark]).size).toBe(all.length);
    });

    it('under budget, EVERY fixture is live — the common residential case', () => {
        const sel = selectLiveLights(ladder(12), 64, { x: 0, y: 0, z: 0 });
        expect(sel.live).toHaveLength(12);
        expect(sel.dark).toHaveLength(0);
    });

    it('keeps the NEAREST fixtures and drops the farthest', () => {
        const sel = selectLiveLights(ladder(20), 3, { x: 0, y: 0, z: 0 });
        expect(sel.live).toEqual(['f000', 'f001', 'f002']);
        expect(sel.dark).toContain('f019');
    });

    it('degrading the budget by tier NEVER drops a nearer light while keeping a farther one', () => {
        const all = ladder(100);
        let prev: readonly string[] | null = null;
        for (const t of TIERS) {                       // richest → cheapest
            const sel = selectLiveLights(all, liveLightBudgetForTier(t), { x: 0, y: 0, z: 0 });
            if (prev) {
                // Every survivor of the cheaper tier must have been live at the
                // richer tier — degradation is a strict prefix, not a reshuffle.
                for (const id of sel.live) expect(prev).toContain(id);
            }
            prev = sel.live;
        }
    });

    it('is deterministic — equidistant fixtures break ties on id, not insertion order', () => {
        const co = [
            { id: 'zeta',  x: 1, y: 0, z: 0 },
            { id: 'alpha', x: 1, y: 0, z: 0 },
            { id: 'mid',   x: 1, y: 0, z: 0 },
        ];
        const a = selectLiveLights(co, 2, { x: 0, y: 0, z: 0 });
        const b = selectLiveLights([...co].reverse(), 2, { x: 0, y: 0, z: 0 });
        expect(a.live).toEqual(['alpha', 'mid']);
        expect(b.live).toEqual(a.live);
    });

    it('honours the importance boost — a promoted far fixture outranks a plain nearer one', () => {
        const cands: LightBudgetCandidate[] = [
            { id: 'near', x: 3, y: 0, z: 0 },
            { id: 'far',  x: 5, y: 0, z: 0, boost: 1 },   // effective distance 2.5
        ];
        const sel = selectLiveLights(cands, 1, { x: 0, y: 0, z: 0 });
        expect(sel.live).toEqual(['far']);
    });

    it('tracks the focus point — moving the camera changes which lights are live', () => {
        const all = ladder(20);
        const nearOrigin = selectLiveLights(all, 2, { x: 0, y: 0, z: 0 });
        const nearFarEnd = selectLiveLights(all, 2, { x: 20, y: 0, z: 0 });
        expect(nearOrigin.live).toEqual(['f000', 'f001']);
        expect(nearFarEnd.live).toEqual(['f019', 'f018']);
    });

    it('a zero or negative budget degrades to no live lights rather than throwing', () => {
        expect(selectLiveLights(ladder(5), 0).live).toHaveLength(0);
        expect(selectLiveLights(ladder(5), -3).live).toHaveLength(0);
        expect(selectLiveLights(ladder(5), 0).dark).toHaveLength(5);
    });

    it('an empty scene is handled without error', () => {
        const sel = selectLiveLights([], 64);
        expect(sel.live).toHaveLength(0);
        expect(sel.dark).toHaveLength(0);
    });
});
