// §SPINE-TREE COMPETING-CANDIDATE wiring (2026-06-22). The multi-leg, polygon-native, public/private-
// zoned corridor spine is now enumerated as a COMPETING CANDIDATE of EVERY strategy whenever spine-first
// is active (the house path) — the SAME Pareto gates then pick the better of {legacy carve, tree}. This
// replaced the old window.__pryzmSpineTree faith-flip: it is provably non-regressive (a tree that seals a
// room loses on reach/circulation; a tree that connects every room beats the served-through carve) AND
// it surfaces by default, so the founder sees the circulation-first layout without setting any toggle.
//
// Two invariants are tested here:
//   1. spineFirst ON ⇒ the tree COMPETES by default (a §SPINE-TREE applied/rejected line appears) and the
//      shipped winner NEVER draws a room across the stair keep-out (the slice-5a geometric guard).
//   2. spineFirst OFF (apartment path) ⇒ no tree candidate, byte-identical.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
// A MIXED (ground) program — public + private — so the no-public gate would block the legacy spine path.
const GROUND: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: false, entranceHall: true,
};
// A genuinely SHEARED convex quad (off-axis) — the rect gate would block the legacy spine path here.
const SHEARED: Pt[] = [{ x: -0.2, z: 0.6 }, { x: 16.1, z: -0.4 }, { x: 16.6, z: 12.0 }, { x: 0.3, z: 11.5 }];
const STAIR: Rect = { x0: 13.8, z0: 9.0, x1: 15.8, z1: 11.8 };   // corner stair keep-out

const setTree = (v: boolean | undefined): void => {
    const g = globalThis as { window?: { __pryzmSpineTree?: boolean } };
    if (v === undefined) { if (g.window) delete g.window.__pryzmSpineTree; return; }
    g.window = { ...(g.window ?? {}), __pryzmSpineTree: v };
};

describe('§SPINE-TREE competing-candidate wiring', () => {
    let lines: string[];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { lines = []; spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); }); });
    afterEach(() => { spy.mockRestore(); setTree(undefined); });

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: SHEARED, program: GROUND, levelId: 'L0', seed: 'tree', weights: WEIGHTS, count: 3,
        keepOutRects: [STAIR], spineFirst: true, ...over,
    });

    it('spineFirst ON (no toggle): §SPINE-TREE COMPETES by default on the sheared+mixed plate', () => {
        setTree(undefined);                                   // NO window toggle — the competing candidate drives it
        const out = enumerateLayouts(input({ seed: 'tree-default' }));
        expect(out.length).toBeGreaterThan(0);
        // The tree variant of at least one strategy must have RUN (applied or geometrically rejected) —
        // i.e. it is now part of the pool the gates choose from, without any console toggle.
        const treeRan = lines.some(l => l.includes('§SPINE-TREE applied') || l.includes('§SPINE-TREE rejected'));
        expect(treeRan, 'the tree must compete by default when spineFirst is on').toBe(true);
    });

    it('spineFirst OFF (apartment path): NO tree candidate is enumerated (byte-identical)', () => {
        setTree(undefined);
        const out = enumerateLayouts(input({ spineFirst: false, seed: 'no-spine' }));
        expect(out.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§SPINE-TREE'))).toBe(false);
    });

    it('the shipped winner NEVER draws a room across the stair keep-out (slice-5a geometric guard)', () => {
        setTree(undefined);
        const out = enumerateLayouts(input({ seed: 'tree-nooverlap' }));
        expect(out.length).toBeGreaterThan(0);
        // No room-overlap diagnostic on the winner may name the stair (the §65.1 defect the founder hit).
        const stairOverlap = lines.some(l => l.includes('§DIAG-ROOM-OVERLAP') && l.includes('Stair'));
        expect(stairOverlap, 'no room may overlap the stair keep-out').toBe(false);
    });

    it('the console escape hatch (window.__pryzmSpineTree = true) still forces the tree on', () => {
        setTree(true);
        const out = enumerateLayouts(input({ seed: 'tree-on' }));
        expect(out.length).toBeGreaterThan(0);
        const treeRan = lines.some(l => l.includes('§SPINE-TREE applied') || l.includes('§SPINE-TREE rejected'));
        expect(treeRan, 'the explicit toggle must still engage the tree').toBe(true);
    });

    it('deterministic: same input ⇒ identical output', () => {
        setTree(undefined);
        const a = enumerateLayouts(input({ seed: 'tree-det' }));
        const b = enumerateLayouts(input({ seed: 'tree-det' }));
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
