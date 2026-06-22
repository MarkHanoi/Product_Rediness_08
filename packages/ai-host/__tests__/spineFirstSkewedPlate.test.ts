// §SPINE-FIRST P8 (rectangular-shell gate, 2026-06-22) — spine-first packs rooms into BBOX-derived
// bands, which only coincide with the real perimeter on a RECTANGLE. On a genuinely SKEWED convex
// quad the bbox bands overflow the slanted façade ("rooms out of the boundary" — the founder's
// upper-floor regression) and the per-cell clamp only leaves white slivers. So P8 GATES spine-first
// to a rectangular shell; a sheared/concave plate falls through to the polygon-native carve
// (§POLYGON-NATIVE-ROUTE → subdividePolygon) the ground floor already proves correct. (This retires
// the earlier P6 "skew-clip" ambition of running spine-first ON skewed plates.)

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
// case that drives enumerate's §POLYGON-NATIVE-ROUTE. P8 must NOT run spine-first here.
const SKEWED: Pt[] = [
    { x: -0.2, z: 0.5 }, { x: 15.7, z: -0.3 },
    { x: 16.2, z: 11.8 }, { x: 0.3, z: 11.4 },
];

// A clean AXIS-ALIGNED rectangle (~16 × 12) — the case P8 KEEPS on the spine path.
const RECT: Pt[] = [
    { x: 0, z: 0 }, { x: 16, z: 0 },
    { x: 16, z: 12 }, { x: 0, z: 12 },
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

describe('§SPINE-FIRST P8 — spine-first is gated to a rectangular shell', () => {
    let lines: string[];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { lines = []; spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); }); });
    afterEach(() => { spy.mockRestore(); });

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: SKEWED, program: UPPER, levelId: 'L1', seed: 'p8', weights: WEIGHTS, count: 3, ...over,
    });

    it('spineFirst ON + SKEWED plate: the spine path is GATED OUT (polygon-native carve handles it)', () => {
        const out = enumerateLayouts(input({ spineFirst: true }));
        expect(out.length).toBeGreaterThan(0);
        // P8: a sheared quad must NOT take the bbox-band spine path (that overflowed the façade).
        expect(lines.some(l => l.includes('§SPINE-FIRST applied')), 'spine-first must NOT run on a skewed plate').toBe(false);
        // The polygon-native route handles the sheared quad instead (no bbox overflow by construction).
        expect(lines.some(l => l.includes('§POLYGON-NATIVE-ROUTE'))).toBe(true);
    });

    it('spineFirst ON + RECTANGLE: the spine path DOES fire (the gate lets a rectangle through)', () => {
        const out = enumerateLayouts(input({ spineFirst: true, shellPolygon: RECT, seed: 'p8-rect' }));
        expect(out.length).toBeGreaterThan(0);
        expect(lines.some(l => l.includes('§SPINE-FIRST applied')), 'spine-first must run on a rectangle').toBe(true);
    });

    it('spineFirst ON + SKEWED: still ships a winner that seals NO habitable room (legacy path sound)', () => {
        const out = enumerateLayouts(input({ spineFirst: true, seed: 'p8-reach' }));
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]!.hardFailedRules ?? []).not.toContain('reach');
        expect(everyHabitableReachable(out[0]!), 'winner seals a habitable room').toBe(true);
    });

    it('spineFirst OFF (default): does NOT run the spine path (byte-identical legacy route)', () => {
        enumerateLayouts(input({ seed: 'p8-off' }));
        expect(lines.some(l => l.includes('§SPINE-FIRST applied'))).toBe(false);
    });

    it('determinism (ADR-0061) — two spine-first runs are byte-identical (both shells)', () => {
        const s = input({ spineFirst: true, seed: 'p8-det' });
        expect(JSON.stringify(enumerateLayouts(s))).toEqual(JSON.stringify(enumerateLayouts(s)));
        const r = input({ spineFirst: true, shellPolygon: RECT, seed: 'p8-det-rect' });
        expect(JSON.stringify(enumerateLayouts(r))).toEqual(JSON.stringify(enumerateLayouts(r)));
    });
});
