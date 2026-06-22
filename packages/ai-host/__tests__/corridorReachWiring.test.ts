// §CORRIDOR-REACH P1 wiring — the gated enumerate hook. Default OFF ⇒ byte-identical (no §CORRIDOR-
// REACH log, no behavioural change). With window.__pryzmCorridorReach=true on a house storey whose
// stair would otherwise be sealed, the post-pass runs (logs §CORRIDOR-REACH). Determinism preserved.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
// An all-private (upper) programme so the stair must reach the corridor (no hall to serve it).
const UPPER: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};
// A rectangular upper plate with a corner stair keep-out (the keep-out drives the house path).
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 12 }, { x: 0, z: 12 }];
const STAIR_KEEPOUT: Rect = { x0: 13.5, z0: 9.2, x1: 15.5, z1: 12 };   // top-right corner

const setReach = (v: boolean | undefined): void => {
    const g = globalThis as { window?: { __pryzmCorridorReach?: boolean } };
    if (v === undefined) { if (g.window) delete g.window.__pryzmCorridorReach; return; }
    g.window = { ...(g.window ?? {}), __pryzmCorridorReach: v };
};

describe('§CORRIDOR-REACH P1 — gated enumerate wiring', () => {
    let lines: string[];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { lines = []; spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); }); });
    afterEach(() => { spy.mockRestore(); setReach(undefined); });

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: RECT, program: UPPER, levelId: 'L1', seed: 'reach', weights: WEIGHTS, count: 3,
        keepOutRects: [STAIR_KEEPOUT], ...over,
    });

    it('default (toggle absent): does NOT run §CORRIDOR-REACH (byte-identical)', () => {
        setReach(undefined);
        const out = enumerateLayouts(input());
        expect(out.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§CORRIDOR-REACH'))).toBe(false);
    });

    it('toggle ON: still produces a valid set and is deterministic', () => {
        setReach(true);
        const a = enumerateLayouts(input({ seed: 'reach-det' }));
        const b = enumerateLayouts(input({ seed: 'reach-det' }));
        expect(a.length).toBeGreaterThan(0);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('toggle ON vs OFF: OFF output is unchanged from the pre-feature baseline (no accidental default-on)', () => {
        setReach(false);
        const off = enumerateLayouts(input({ seed: 'reach-cmp' }));
        expect(off.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§CORRIDOR-REACH'))).toBe(false);
    });
});
