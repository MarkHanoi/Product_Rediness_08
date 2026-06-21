// §SPINE-FIRST P6 (skew-clip) — spine-first must survive the enumerate POLYGON route on a SKEWED
// plate. Before P6, a sheared quad took §POLYGON-NATIVE-ROUTE which re-tiled area-first and DISCARDED
// the spine layout; now subdivide clamps the spine cells to the real polygon and flags the result so
// enumerate keeps them. This is what makes spine-first usable on the founder's GIS-boundary plates.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const HABITABLE = new Set(['living', 'kitchen', 'dining', 'master', 'bedroom', 'study']);

// An all-private (upper) programme — no public rooms, so the spine path is eligible.
const UPPER: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};

// A genuinely SKEWED convex quad (~16 × 12 bbox, all four edges off-axis) — the rectified/sheared
// case that drives enumerate's §POLYGON-NATIVE-ROUTE.
const SKEWED: Pt[] = [
    { x: -0.2, z: 0.5 }, { x: 15.7, z: -0.3 },
    { x: 16.2, z: 11.8 }, { x: 0.3, z: 11.4 },
];

function everyHabitableReachable(c: ReturnType<typeof enumerateLayouts>[number]): boolean {
    const spaces = c.graph.nodes.filter(n => n.kind === 'Space');
    if (spaces.length === 0) return true;
    const adj = new Map<string, string[]>();
    for (const n of spaces) adj.set(n.guid, []);
    for (const e of c.graph.edges) {
        const permeable = e.kind === 'CONNECTS_THROUGH' || (e.kind === 'ADJACENT_TO' && e.props?.permeable === true);
        if (!permeable) continue;
        adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from);
    }
    const seen = new Set([spaces[0]!.guid]); const q = [spaces[0]!.guid];
    while (q.length) { const cur = q.shift()!; for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
    const typeOf = (n: typeof spaces[number]): string =>
        String(n.attrs?.spaceType ?? n.attrs?.roomType ?? n.attrs?.name ?? '').toLowerCase();
    return spaces.every(n => !HABITABLE.has(typeOf(n)) || seen.has(n.guid));
}

describe('§SPINE-FIRST P6 — spine-first survives the polygon route on a skewed plate', () => {
    let lines: string[];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { lines = []; spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); }); });
    afterEach(() => { spy.mockRestore(); });

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: SKEWED, program: UPPER, levelId: 'L1', seed: 'p6', weights: WEIGHTS, count: 3, ...over,
    });

    it('spineFirst ON: the spine path FIRES on the skewed plate (not discarded by the polygon route)', () => {
        const out = enumerateLayouts(input({ spineFirst: true }));
        expect(out.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§SPINE-FIRST applied')), 'spine-first must run on the skewed plate').toBe(true);
        // And it was clamped to the real polygon (P6), not left as a bbox overflow.
        expect(lines.some(l => l.includes('§SPINE-FIRST applied') && l.includes('clamped=yes'))).toBe(true);
    });

    it('spineFirst ON: ships a winner that seals NO habitable room', () => {
        const out = enumerateLayouts(input({ spineFirst: true, seed: 'p6-reach' }));
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]!.hardFailedRules ?? []).not.toContain('reach');
        expect(everyHabitableReachable(out[0]!), 'winner seals a habitable room').toBe(true);
    });

    it('spineFirst OFF (default): does NOT run the spine path (byte-identical legacy route)', () => {
        enumerateLayouts(input({ seed: 'p6-off' }));
        expect(lines.some(l => l.includes('§SPINE-FIRST applied'))).toBe(false);
    });

    it('determinism (ADR-0061) — two spine-first runs are byte-identical', () => {
        const i = input({ spineFirst: true, seed: 'p6-det' });
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
