// §VEG-CANOPY-FROM-WOODS (L-12934) — the pure canopy synthesis.
//
// The founder's report (Córdoba Av. Gran Vía, Jouy-en-Josas beside Versailles) is that a forest
// renders as a green carpet with a handful of blobs, because the baked `trees` layer is
// `natural=tree` NODES only while the canopy AREAS ride `parks` as flat polygons. This module fills
// the real wood/forest rings with SYNTHESISED positions, so the properties that must hold are
// exactly the ones that keep that synthesis honest and stable:
//
//   • DETERMINISM — a terrain re-seat (`rebuildContextTreesForBase`) re-runs the whole synthesis.
//     If it scattered differently, the forest would visibly reshuffle every time the terrain settled.
//   • CONTAINMENT — a canopy outside its ring is a tree in the middle of a road.
//   • HOLES — a clearing must stay a clearing (the reader does not carry holes for `parks` YET;
//     the module honours them the day it does, and this spec is what proves that in advance).
//   • KIND — a lawn is not a wood. `park` / `grass` / `other` are never filled.
//   • CAPS + EXCLUSION — bounded by construction, and never drawn on top of a mapped tree.
//
// Pure module: no Cesium, no DOM, no network — this spec runs in milliseconds.

import { describe, it, expect } from 'vitest';
import {
    synthesiseCanopies,
    buildCanopySet,
    siteMetricFrame,
    hashCell,
    CANOPY_GRID_SPACING_M,
    CANOPY_JITTER_FRACTION,
    CANOPY_RADIUS_SCALE_MIN,
    CANOPY_RADIUS_SCALE_MAX,
    CANOPY_HEIGHT_SCALE_MIN,
    CANOPY_HEIGHT_SCALE_MAX,
    MAPPED_TREE_EXCLUSION_M,
    type CanopySourcePolygon,
} from '../contextCanopySynth';

// Jouy-en-Josas, next to Versailles — the founder's second report, and a site whose woods are
// mapped as `natural=wood` areas with almost no `natural=tree` nodes inside them.
const SITE = { lat: 48.7590, lon: 2.1680 };
const FRAME = siteMetricFrame(SITE);

/** A closed square ring, `size` metres on a side, centred `(cx, cy)` metres from the site. */
function squareRing(cx: number, cy: number, size: number): Array<readonly [number, number]> {
    const h = size / 2;
    const pts: Array<readonly [number, number]> = [
        [cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h], [cx - h, cy - h],
    ];
    return pts.map(([x, y]) => [FRAME.toLon(x), FRAME.toLat(y)] as const);
}

function wood(cx: number, cy: number, size: number, osmId = 1): CanopySourcePolygon {
    return { ring: squareRing(cx, cy, size), kind: 'wood', osmId };
}

/** Even-odd containment in the LOCAL metric frame, written independently of the module's helper. */
function insideLocal(ring: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = FRAME.toX(ring[i]![0]), yi = FRAME.toY(ring[i]![1]);
        const xj = FRAME.toX(ring[j]![0]), yj = FRAME.toY(ring[j]![1]);
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

describe('§VEG-CANOPY-FROM-WOODS (L-12934) — synthesiseCanopies', () => {
    it('is DETERMINISTIC: two calls with the same inputs are byte-identical', () => {
        const polys = [wood(0, 0, 120)];
        const a = synthesiseCanopies(polys, { site: SITE, maxCount: 5000 });
        const b = synthesiseCanopies(polys, { site: SITE, maxCount: 5000 });
        expect(a.canopies.length).toBeGreaterThan(50);
        expect(JSON.stringify(b.canopies)).toBe(JSON.stringify(a.canopies));
        // …and the jitter is genuinely varied, not a constant masquerading as determinism.
        const xs = new Set(a.canopies.map((c) => c.lon.toFixed(9)));
        expect(xs.size).toBeGreaterThan(a.canopies.length / 2);
    });

    it('hashCell is an integer mix, stable and well spread (the determinism rests on it)', () => {
        expect(hashCell(3, -7, 1)).toBe(hashCell(3, -7, 1));
        expect(hashCell(3, -7, 1)).not.toBe(hashCell(3, -7, 2));
        expect(hashCell(3, -7, 1)).not.toBe(hashCell(-7, 3, 1));
        const seen = new Set<number>();
        for (let i = 0; i < 500; i++) seen.add(hashCell(i, i * 7, 1));
        expect(seen.size).toBe(500);                       // no collisions over a realistic cell run
        for (let i = 0; i < 50; i++) expect(hashCell(i, 0, 3)).toBeLessThan(2 ** 32);
    });

    it('puts EVERY canopy inside its source ring', () => {
        const polys = [wood(0, 0, 100)];
        const { canopies } = synthesiseCanopies(polys, { site: SITE, maxCount: 5000 });
        expect(canopies.length).toBeGreaterThan(30);
        for (const c of canopies) {
            expect(insideLocal(polys[0]!.ring, FRAME.toX(c.lon), FRAME.toY(c.lat))).toBe(true);
        }
    });

    it('puts NO canopy inside a hole (the clearing in a wood)', () => {
        const poly: CanopySourcePolygon = {
            ring: squareRing(0, 0, 200),
            holes: [squareRing(0, 0, 80)],                  // a 80 m clearing dead centre
            kind: 'wood', osmId: 7,
        };
        const { canopies } = synthesiseCanopies([poly], { site: SITE, maxCount: 5000 });
        expect(canopies.length).toBeGreaterThan(100);
        for (const c of canopies) {
            expect(insideLocal(poly.holes![0]!, FRAME.toX(c.lon), FRAME.toY(c.lat))).toBe(false);
        }
        // The hole really did remove canopies — otherwise this test would pass on an empty set.
        const solid = synthesiseCanopies([{ ...poly, holes: [] }], { site: SITE, maxCount: 5000 });
        expect(solid.canopies.length).toBeGreaterThan(canopies.length);
    });

    it('honours the grid SPACING: no two canopies closer than (1 - 2·jitter) × pitch', () => {
        const spacingM = 12;
        const { canopies } = synthesiseCanopies([wood(0, 0, 150)], { site: SITE, maxCount: 5000, spacingM });
        const floor = spacingM * (1 - 2 * CANOPY_JITTER_FRACTION);
        expect(floor).toBeGreaterThan(0);
        const pts = canopies.map((c) => [FRAME.toX(c.lon), FRAME.toY(c.lat)] as const);
        let worst = Infinity;
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const d = Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]);
                if (d < worst) worst = d;
            }
        }
        expect(worst).toBeGreaterThanOrEqual(floor - 1e-6);
        // …and the density is the documented one: ~1 canopy per pitch² over the ring's area.
        const expected = (150 * 150) / (spacingM * spacingM);
        expect(canopies.length).toBeGreaterThan(expected * 0.7);
        expect(canopies.length).toBeLessThan(expected * 1.3);
    });

    it('defaults to CANOPY_GRID_SPACING_M (~120 canopies per hectare)', () => {
        const { canopies } = synthesiseCanopies([wood(0, 0, 100)], { site: SITE, maxCount: 100_000 });
        const perHa = canopies.length; // a 100 m square IS one hectare
        expect(CANOPY_GRID_SPACING_M).toBe(9);
        expect(perHa).toBeGreaterThan(90);
        expect(perHa).toBeLessThan(150);
    });

    it('caps NEAREST-FIRST, dropping the FARTHEST — never an arbitrary slice', () => {
        const polys = [wood(0, 0, 300)];
        const all = synthesiseCanopies(polys, { site: SITE, maxCount: 100_000 });
        const capped = synthesiseCanopies(polys, { site: SITE, maxCount: 40 });
        expect(all.canopies.length).toBeGreaterThan(40);
        expect(capped.canopies).toHaveLength(40);
        expect(capped.cappedAway).toBe(all.canopies.length - 40);
        // sorted nearest-first, and every kept canopy is nearer than every dropped one
        for (let i = 1; i < capped.canopies.length; i++) {
            expect(capped.canopies[i]!.distM).toBeGreaterThanOrEqual(capped.canopies[i - 1]!.distM);
        }
        const cut = all.canopies.slice(40);
        expect(Math.max(...capped.canopies.map((c) => c.distM)))
            .toBeLessThanOrEqual(Math.min(...cut.map((c) => c.distM)));
    });

    it('excludes candidates sitting on top of a MAPPED tree', () => {
        const polys = [wood(0, 0, 120)];
        const bare = synthesiseCanopies(polys, { site: SITE, maxCount: 100_000 });
        expect(bare.excludedNearMappedTree).toBe(0);
        // Plant a mapped tree exactly on the first ten synthesised positions.
        const mappedTrees = bare.canopies.slice(0, 10).map((c) => ({ lon: c.lon, lat: c.lat }));
        const withMapped = synthesiseCanopies(polys, { site: SITE, maxCount: 100_000, mappedTrees });
        expect(withMapped.excludedNearMappedTree).toBe(10);
        expect(withMapped.canopies).toHaveLength(bare.canopies.length - 10);
        for (const c of withMapped.canopies) {
            for (const m of mappedTrees) {
                const d = Math.hypot(FRAME.toX(c.lon) - FRAME.toX(m.lon), FRAME.toY(c.lat) - FRAME.toY(m.lat));
                expect(d).toBeGreaterThan(MAPPED_TREE_EXCLUSION_M - 1e-6);
            }
        }
    });

    it('fills ONLY wood/forest — a park, a lawn and an unclassified area are never seeded', () => {
        const kinds = ['park', 'grass', 'other'] as const;
        for (const kind of kinds) {
            const r = synthesiseCanopies([{ ring: squareRing(0, 0, 200), kind, osmId: 3 }],
                { site: SITE, maxCount: 5000 });
            expect(r.canopies).toHaveLength(0);
            expect(r.polygonCount).toBe(0);
        }
        const forest = synthesiseCanopies([{ ring: squareRing(0, 0, 200), kind: 'forest', osmId: 4 }],
            { site: SITE, maxCount: 5000 });
        expect(forest.canopies.length).toBeGreaterThan(100);
        expect(forest.polygonCount).toBe(1);
    });

    it('labels every output SYNTHETIC, with a negative id and the REAL polygon it came from', () => {
        const { canopies } = synthesiseCanopies([wood(0, 0, 60, 424242)], { site: SITE, maxCount: 500 });
        expect(canopies.length).toBeGreaterThan(0);
        for (const c of canopies) {
            expect(c.synthetic).toBe(true);
            expect(c.osmId).toBeLessThan(0);               // never mistakeable for an OSM id
            expect(c.sourceOsmId).toBe(424242);            // the REAL ring is named
            expect(c.radiusScale).toBeGreaterThanOrEqual(CANOPY_RADIUS_SCALE_MIN);
            expect(c.radiusScale).toBeLessThanOrEqual(CANOPY_RADIUS_SCALE_MAX);
            expect(c.heightScale).toBeGreaterThanOrEqual(CANOPY_HEIGHT_SCALE_MIN);
            expect(c.heightScale).toBeLessThanOrEqual(CANOPY_HEIGHT_SCALE_MAX);
        }
    });

    it('culls radially and never double-seeds a cell shared by two overlapping woods', () => {
        const near = synthesiseCanopies([wood(0, 0, 1000)], { site: SITE, maxCount: 100_000, maxRadiusM: 100 });
        for (const c of near.canopies) expect(c.distM).toBeLessThanOrEqual(100);
        expect(near.canopies.length).toBeGreaterThan(100);
        // Two woods covering the same ground (a tile-clipped way arrives as several rings).
        const overlap = synthesiseCanopies([wood(0, 0, 100, 1), wood(0, 0, 100, 2)],
            { site: SITE, maxCount: 100_000 });
        const single = synthesiseCanopies([wood(0, 0, 100, 1)], { site: SITE, maxCount: 100_000 });
        expect(overlap.canopies).toHaveLength(single.canopies.length);
    });

    it('never throws on degenerate input, and refuses rather than inventing', () => {
        expect(synthesiseCanopies([], { site: SITE, maxCount: 100 }).canopies).toHaveLength(0);
        expect(synthesiseCanopies([wood(0, 0, 100)], { site: SITE, maxCount: 0 }).canopies).toHaveLength(0);
        expect(synthesiseCanopies([wood(0, 0, 100)], { site: { lat: NaN, lon: 0 }, maxCount: 10 }).canopies)
            .toHaveLength(0);
        const stub: CanopySourcePolygon = { ring: [[2.1, 48.7], [2.2, 48.7]], kind: 'wood', osmId: 1 };
        expect(synthesiseCanopies([stub], { site: SITE, maxCount: 10 }).polygonCount).toBe(0);
    });
});

describe('§VEG-CANOPY-FROM-WOODS (L-12934) — buildCanopySet merges the two honest sources', () => {
    const polys = [wood(0, 0, 150)];
    const mapped = [
        { lon: FRAME.toLon(5), lat: FRAME.toLat(5), osmId: 111 },
        { lon: FRAME.toLon(-20), lat: FRAME.toLat(30), osmId: 222 },
        { lon: FRAME.toLon(4000), lat: FRAME.toLat(0), osmId: 333 },   // far outside the near disc
    ];

    it('keeps mapped + synthesised in ONE nearest-first set, counted APART', () => {
        const set = buildCanopySet(mapped, polys, { site: SITE, maxRadiusM: 890, maxSynthetic: 5000 });
        expect(set.mappedCount).toBe(2);                     // the 4 km tree is culled
        expect(set.mappedAvailable).toBe(2);
        expect(set.syntheticCount).toBeGreaterThan(100);
        expect(set.polygonCount).toBe(1);
        expect(set.instances).toHaveLength(set.mappedCount + set.syntheticCount);
        expect(set.instances.filter((i) => i.synthetic)).toHaveLength(set.syntheticCount);
        expect(set.instances.filter((i) => !i.synthetic)).toHaveLength(set.mappedCount);
        for (let i = 1; i < set.instances.length; i++) {
            expect(set.instances[i]!.distM).toBeGreaterThanOrEqual(set.instances[i - 1]!.distM);
        }
        // Mapped trees keep an unvaried crown — their POSITION is OSM's claim, their size is not.
        for (const m of set.instances.filter((i) => !i.synthetic)) {
            expect(m.radiusScale).toBe(1);
            expect(m.heightScale).toBe(1);
        }
    });

    it('never seeds a canopy on top of a mapped tree, and is deterministic across calls', () => {
        const a = buildCanopySet(mapped, polys, { site: SITE, maxRadiusM: 890 });
        const b = buildCanopySet(mapped, polys, { site: SITE, maxRadiusM: 890 });
        expect(JSON.stringify(b.instances)).toBe(JSON.stringify(a.instances));
        for (const c of a.instances.filter((i) => i.synthetic)) {
            for (const m of mapped) {
                const d = Math.hypot(FRAME.toX(c.lon) - FRAME.toX(m.lon), FRAME.toY(c.lat) - FRAME.toY(m.lat));
                expect(d).toBeGreaterThan(MAPPED_TREE_EXCLUSION_M - 1e-6);
            }
        }
    });

    it('respects BOTH caps independently — real trees are never spent on synthetic ones', () => {
        const set = buildCanopySet(mapped, polys, { site: SITE, maxRadiusM: 890, maxMapped: 1, maxSynthetic: 25 });
        expect(set.mappedCount).toBe(1);
        expect(set.mappedAvailable).toBe(2);                 // the cap bite is visible, not silent
        expect(set.syntheticCount).toBe(25);
        expect(set.syntheticCappedAway).toBeGreaterThan(0);
        expect(set.instances).toHaveLength(26);
    });

    it('maxSynthetic 0 reproduces the pre-lane render exactly (mapped trees only)', () => {
        const set = buildCanopySet(mapped, polys, { site: SITE, maxRadiusM: 890, maxSynthetic: 0 });
        expect(set.syntheticCount).toBe(0);
        expect(set.instances).toHaveLength(2);
        expect(set.instances.every((i) => !i.synthetic)).toBe(true);
    });

    it('degrades honestly: no polygons ⇒ mapped only; no trees ⇒ synthesised only; neither ⇒ empty', () => {
        expect(buildCanopySet(mapped, [], { site: SITE, maxRadiusM: 890 }).syntheticCount).toBe(0);
        expect(buildCanopySet(mapped, [], { site: SITE, maxRadiusM: 890 }).mappedCount).toBe(2);
        const noTrees = buildCanopySet([], polys, { site: SITE, maxRadiusM: 890 });
        expect(noTrees.mappedCount).toBe(0);
        expect(noTrees.syntheticCount).toBeGreaterThan(100);
        expect(buildCanopySet([], [], { site: SITE, maxRadiusM: 890 }).instances).toHaveLength(0);
        expect(buildCanopySet(mapped, polys, { site: { lat: NaN, lon: NaN }, maxRadiusM: 890 }).instances)
            .toHaveLength(0);
    });
});
