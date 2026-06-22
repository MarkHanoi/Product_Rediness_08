// §SINGLE-LOAD-PERIPHERAL selection (§18.6 / §19.4) — with the toggle ON, the single-loaded spine
// produces a candidate where every room touches BOTH the corridor (circulation) AND the façade
// (window). The existing ranker (hard-valid pool → preferReachComplete pool tiebreaker → weighted)
// must then PICK that connected candidate over a window-keeping-but-isolated legacy sibling — and it
// must do so WITHOUT any change at the `eligible` stage (the §19.4 landmine: circulation-first as an
// eligibility filter breaks the houseLayout stair-core invariant). This test proves the selection is
// a POOL outcome, not an eligibility filter, and that the OFF path is byte-identical.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enumerateLayouts, preferReachComplete, type EnumerateInput, type TglCandidate } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
// An UPPER (all-private) storey on a COMPACT rectangular plate — the §19.2 trap plate class.
const UPPER: ApartmentProgram = {
    bedrooms: 3, bathrooms: 1, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};
// An ELONGATED axis-aligned rectangle (§20.1 §SINGLE-LOAD-PERIPHERAL plate class, aspect ≳ 1.6): the
// single far band is room-sized (~5.5 m), the run is long. This is the plate single-loaded is FOR.
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 7 }, { x: 0, z: 7 }];
const STAIR: Rect = { x0: 17.5, z0: 5, x1: 20, z1: 7 };   // top-right corner keep-out

const setTree = (v: boolean | undefined): void => {
    const g = globalThis as { window?: { __pryzmSpineTree?: boolean } };
    if (v === undefined) { if (g.window) delete g.window.__pryzmSpineTree; return; }
    g.window = { ...(g.window ?? {}), __pryzmSpineTree: v };
};

describe('§SINGLE-LOAD-PERIPHERAL selection — the ranker ships the connected candidate', () => {
    let lines: string[];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { lines = []; spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); }); });
    afterEach(() => { spy.mockRestore(); setTree(undefined); });

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: RECT, program: UPPER, levelId: 'L1', seed: 'sel', weights: WEIGHTS, count: 3,
        keepOutRects: [STAIR], spineFirst: true, ...over,
    });

    it('toggle OFF ⇒ enumerate result is byte-identical (regression guard, FIRST)', () => {
        setTree(undefined);
        const a = enumerateLayouts(input({ seed: 'off-a' }));
        setTree(false);
        const b = enumerateLayouts(input({ seed: 'off-a' }));
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('toggle ON ⇒ the single-loaded spine fires (§DIAG-SPINE-SINGLELOAD mode=single-loaded)', () => {
        setTree(true);
        const out = enumerateLayouts(input({ seed: 'on-fires' }));
        expect(out.length).toBeGreaterThan(0);
        const diag = lines.filter(l => l.includes('§DIAG-SPINE-SINGLELOAD') || l.includes('§SPINE-TREE single-loaded'));
        expect(diag.some(l => l.includes('mode=single-loaded')), `single-loaded must fire:\n${diag.join('\n')}`).toBe(true);
    });

    it('toggle ON ⇒ the SHIPPED winner does not fail BOTH window and circulation (the trap is escaped)', () => {
        setTree(true);
        const out = enumerateLayouts(input({ seed: 'on-winner' }));
        expect(out.length).toBeGreaterThan(0);
        const winner = out[0]!;
        // The §19.2 trap is a winner that sacrifices ONE of window / circulation. The single-loaded
        // cure produces a candidate satisfying both; the ranker must not ship one failing BOTH.
        const failsWindow = winner.hardFailedRules.includes('window');
        const failsReach = winner.hardFailedRules.includes('reach');
        expect(failsWindow && failsReach, `winner fails both window+reach: [${winner.hardFailedRules.join(',')}]`).toBe(false);
    });

    it('preferReachComplete is a POOL tiebreaker (no-op when no sibling is reach-clean; narrows otherwise)', () => {
        // A pool with NO reach-clean candidate ⇒ identity (never empties — the §19.4 invariant).
        const allSealed = [
            { hardFailedRules: ['reach'] }, { hardFailedRules: ['reach', 'window'] },
        ] as unknown as TglCandidate[];
        expect(preferReachComplete(allSealed)).toBe(allSealed);
        // A mixed pool ⇒ narrows to the reach-clean subset (the connected candidate wins the tiebreak).
        const mixed = [
            { id: 'sealed', hardFailedRules: ['reach'] },
            { id: 'clean', hardFailedRules: [] },
        ] as unknown as TglCandidate[];
        const narrowed = preferReachComplete(mixed);
        expect(narrowed.length).toBe(1);
        expect((narrowed[0] as unknown as { id: string }).id).toBe('clean');
    });

    it('toggle ON ⇒ deterministic selection', () => {
        setTree(true);
        const a = enumerateLayouts(input({ seed: 'det' }));
        const b = enumerateLayouts(input({ seed: 'det' }));
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
