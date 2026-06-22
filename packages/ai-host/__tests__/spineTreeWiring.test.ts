// §18 slice 4 — the §SPINE-TREE wiring (window.__pryzmSpineTree). Default OFF ⇒ no §SPINE-TREE, the
// engine is byte-identical. ON ⇒ the multi-leg polygon-native spine runs on a SHEARED quad WITH public
// rooms (no rect/no-public gate), connecting every habitable room to the corridor.

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

describe('§18 slice 4 — §SPINE-TREE wiring', () => {
    let lines: string[];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { lines = []; spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); }); });
    afterEach(() => { spy.mockRestore(); setTree(undefined); });

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: SHEARED, program: GROUND, levelId: 'L0', seed: 'tree', weights: WEIGHTS, count: 3,
        keepOutRects: [STAIR], spineFirst: true, ...over,
    });

    it('default (toggle absent): does NOT run §SPINE-TREE', () => {
        setTree(undefined);
        const out = enumerateLayouts(input());
        expect(out.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§SPINE-TREE applied'))).toBe(false);
    });

    it('toggle ON: §SPINE-TREE runs on the sheared quad WITH public rooms (no rect/no-public gate)', () => {
        setTree(true);
        const out = enumerateLayouts(input({ seed: 'tree-on' }));
        expect(out.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§SPINE-TREE applied')), 'spine-tree must run').toBe(true);
    });

    it('§18 slice 5a — tree ON NEVER ships a room↔stair overlap (the regression guard)', () => {
        setTree(true);
        const out = enumerateLayouts(input({ seed: 'tree-nooverlap' }));
        expect(out.length).toBeGreaterThan(0);
        // The regression logged `§DIAG-ROOM-OVERLAP … [Dining↔Stair area=6.7m²]`. With the keep-out
        // subtracted from the bands + the strictly-additive guard, NO room-overlap line may name the stair.
        const stairOverlap = lines.some(l => l.includes('§DIAG-ROOM-OVERLAP') && l.includes('Stair'));
        expect(stairOverlap, 'no room may overlap the stair keep-out').toBe(false);
    });

    it('§18 slice 5a — tree ON never ships an under-min-area habitable room on the winner', () => {
        setTree(true);
        const out = enumerateLayouts(input({ seed: 'tree-minarea' }));
        expect(out.length).toBeGreaterThan(0);
        // The winner must not be a min-area-rejected layout when the tree applied (the guard falls
        // through to legacy rather than shipping squished rooms). underMin on the winner ⇒ regression.
        const winnerLine = lines.filter(l => l.includes('§DIAG-MIN-AREA-GATE')).pop() ?? '';
        // Either the tree was rejected (fell through) or it applied with underMin=0; never applied+underMin>0.
        const treeApplied = lines.some(l => l.includes('§SPINE-TREE applied'));
        if (treeApplied) expect(winnerLine.includes('underMin=0') || winnerLine === '').toBe(true);
    });

    it('toggle ON: deterministic', () => {
        setTree(true);
        const a = enumerateLayouts(input({ seed: 'tree-det' }));
        const b = enumerateLayouts(input({ seed: 'tree-det' }));
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
