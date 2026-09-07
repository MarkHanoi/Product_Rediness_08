// §SITE-SCOPE (L-645; C12 §13.3; ADR-0382) — the GEOMETRIC pre-clip: rings, polylines, points.
//
// What these pin: a feature straddling the slab edge is CUT, never dropped; a feature inside is
// returned as the SAME reference (no re-projection); a cut vertex round-trips through the ONE
// projection to under a centimetre; a ring enclosing the whole scope collapses to the scope; a
// self-intersecting ring is KEPT WHOLE and flagged, never silently lost; the point filter and the
// ring clip answer from the SAME polygon; and the cap verdict says the numbers.

import { describe, it, expect } from 'vitest';
import { latLonToSceneXZ, sceneXZToLatLon } from '../../site/boundaryProjection';
import {
    capVerdict,
    completeScopeRadiusM,
    createScopeClipTally,
    createScopeClipper,
    type LonLat,
} from '../scopeClip';
import { scopePolygonSegments, type SiteScope } from '../siteScope';

const BCN = { lat: 41.39, lon: 2.17 };
const RECT: SiteScope = { shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 };
const DISC: SiteScope = { shape: 'circle', radiusM: 900 };

/** Author a feature in TRUE-north XZ metres about BCN and hand it over as the tile `[lon, lat]`. */
const ll = (x: number, z: number): LonLat => {
    const p = sceneXZToLatLon({ x, z }, BCN.lat, BCN.lon);
    return [p.lon, p.lat] as const;
};
const xz = (p: LonLat): { x: number; z: number } => latLonToSceneXZ({ lat: p[1], lon: p[0] }, BCN.lat, BCN.lon);
const squareAt = (cx: number, cz: number, half: number): LonLat[] => [
    ll(cx - half, cz - half), ll(cx + half, cz - half), ll(cx + half, cz + half), ll(cx - half, cz + half),
];
const ringAreaM2 = (ring: ReadonlyArray<LonLat>): number => {
    let a = 0;
    const pts = ring.map(xz);
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
};

describe('rings — inside / outside / cut / refused', () => {
    const clip = createScopeClipper(RECT, BCN, 0);

    it('wholly inside → verdict inside and the SAME array reference (nothing re-projected)', () => {
        const ring = squareAt(100, 50, 20);
        const r = clip.clipRingLonLat(ring);
        expect(r.verdict).toBe('inside');
        expect(r.rings.length).toBe(1);
        expect(r.rings[0]).toBe(ring);
    });

    it('wholly outside → outside, nothing to build', () => {
        const r = clip.clipRingLonLat(squareAt(2000, 0, 20));
        expect(r.verdict).toBe('outside');
        expect(r.rings).toEqual([]);
    });

    it('a footprint straddling the east edge is CUT at x = 600, not dropped — vertices sub-centimetre', () => {
        // 40 m square centred on the edge: half of it is inside.
        const ring = squareAt(600, 0, 20);
        const r = clip.clipRingLonLat(ring);
        expect(r.verdict).toBe('cut');
        expect(r.rings.length).toBe(1);
        const kept = r.rings[0]!;
        expect(ringAreaM2(kept)).toBeCloseTo(20 * 40, 3);
        // Every kept vertex is inside the scope (or on its edge, within 1 mm).
        for (const p of kept) {
            const q = xz(p);
            expect(q.x).toBeLessThanOrEqual(600 + 1e-3);
            expect(Math.abs(q.z)).toBeLessThanOrEqual(20 + 1e-3);
        }
        // The two cut vertices sit at exactly (600, ±20) to under a centimetre after the round trip.
        const cutXs = kept.map(xz).filter((q) => Math.abs(q.x - 600) < 0.01);
        expect(cutXs.length).toBe(2);
        // The two untouched vertices (580, ±20) survive the round trip to under a centimetre.
        const west = kept.map(xz).filter((q) => Math.abs(q.x - 580) < 0.01);
        expect(west.length).toBe(2);
    });

    it('a ring that ENCLOSES the whole scope collapses to the scope polygon', () => {
        const r = clip.clipRingLonLat(squareAt(0, 0, 5000));
        expect(r.verdict).toBe('cut');
        expect(r.rings.length).toBe(1);
        expect(ringAreaM2(r.rings[0]!)).toBeCloseTo(4 * 600 * 450, 2);
    });

    it('a U-shape straddling the edge becomes TWO kept loops', () => {
        // U open to the east, its two arms crossing x = 600, its base outside at x = 700.
        const u: LonLat[] = [
            ll(500, -100), ll(700, -100), ll(700, 100), ll(500, 100),
            ll(500, 60), ll(660, 60), ll(660, -60), ll(500, -60),
        ];
        const r = clip.clipRingLonLat(u);
        expect(r.verdict).toBe('cut');
        expect(r.rings.length).toBe(2);
        expect(ringAreaM2(r.rings[0]!) + ringAreaM2(r.rings[1]!)).toBeCloseTo(2 * (100 * 40), 2);
    });

    it('a closed ring (repeated last vertex) is accepted; inside stays the same reference, cut returns OPEN loops', () => {
        const inside = squareAt(0, 0, 20);
        const closedInside = [...inside, inside[0]!];
        expect(clip.clipRingLonLat(closedInside).rings[0]).toBe(closedInside);
        const straddle = squareAt(600, 0, 20);
        const r = clip.clipRingLonLat([...straddle, straddle[0]!]);
        expect(r.verdict).toBe('cut');
        const loop = r.rings[0]!;
        expect(loop[0]).not.toEqual(loop[loop.length - 1]);
    });

    it('a self-intersecting (bowtie) ring straddling the edge is REFUSED and kept whole — never dropped', () => {
        const bowtie: LonLat[] = [ll(560, -30), ll(640, 30), ll(640, -30), ll(560, 30)];
        const r = clip.clipRingLonLat(bowtie);
        expect(r.verdict).toBe('refused');
        expect(r.rings[0]).toBe(bowtie);
        expect(r.refusal).toMatch(/self-intersecting/);
    });

    it('fewer than three distinct vertices draws nothing → outside', () => {
        expect(clip.clipRingLonLat([ll(0, 0), ll(1, 1)]).verdict).toBe('outside');
        expect(clip.clipRingLonLat([]).verdict).toBe('outside');
    });

    it('a non-finite vertex is refused (kept whole), not silently projected to NaN', () => {
        const bad: LonLat[] = [ll(0, 0), [NaN, 41.39] as const, ll(10, 10)];
        const r = clip.clipRingLonLat(bad);
        expect(r.verdict).toBe('refused');
        expect(r.rings[0]).toBe(bad);
    });
});

describe('rings against the DISC — cut to the n-gon, the same polygon the globe is clipped to', () => {
    const clip = createScopeClipper(DISC, BCN, 0);

    it('a building straddling the rim is cut; every kept vertex passes the clipper\'s own containment', () => {
        const ring = squareAt(900, 0, 15);
        const r = clip.clipRingLonLat(ring);
        expect(r.verdict).toBe('cut');
        for (const loop of r.rings) {
            for (const p of loop) {
                const q = xz(p);
                // On the polygon boundary the even-odd test may go either way; allow 1 mm of slack by
                // testing a point nudged 1 mm toward the origin.
                const k = 1 - 1e-3 / Math.max(1, Math.hypot(q.x, q.z));
                expect(clip.containment.contains(q.x * k, q.z * k)).toBe(true);
            }
        }
        expect(ringAreaM2(r.rings[0]!)).toBeGreaterThan(0);
        expect(ringAreaM2(r.rings[0]!)).toBeLessThan(30 * 30);
    });

    it('the polygon handed to the globe clip has the same vertex count as the containment polygon', () => {
        expect(clip.polygonLatLon.length).toBe(scopePolygonSegments(DISC));
        expect(clip.polygonLonLat.length).toBe(clip.containment.polygon.length);
    });
});

describe('polylines — corridors are cut at the edge, and re-entry makes a second piece', () => {
    const clip = createScopeClipper(RECT, BCN, 0);

    it('wholly inside → same reference', () => {
        const line = [ll(-100, 0), ll(100, 0), ll(100, 100)];
        const r = clip.clipPolylineLonLat(line);
        expect(r.verdict).toBe('inside');
        expect(r.pieces[0]).toBe(line);
    });

    it('wholly outside → nothing', () => {
        expect(clip.clipPolylineLonLat([ll(700, 0), ll(900, 0)]).pieces).toEqual([]);
        expect(clip.clipPolylineLonLat([]).pieces).toEqual([]);
        expect(clip.clipPolylineLonLat([ll(700, 0)]).pieces).toEqual([]);
    });

    it('a road leaving the scope is cut ON the edge, sub-centimetre, keeping its inside vertex verbatim', () => {
        const line = [ll(500, 10), ll(700, 10)];
        const r = clip.clipPolylineLonLat(line);
        expect(r.verdict).toBe('cut');
        expect(r.pieces.length).toBe(1);
        const piece = r.pieces[0]!;
        expect(piece.length).toBe(2);
        expect(piece[0]).toBe(line[0]);
        const end = xz(piece[1]!);
        expect(Math.abs(end.x - 600)).toBeLessThan(0.01);
        expect(Math.abs(end.z - 10)).toBeLessThan(0.01);
    });

    it('a road that leaves and re-enters becomes two pieces, each ending on the edge', () => {
        // Along z = 0 from x = −800 to +800 → two pieces? No: ONE crossing in and one out is one
        // piece. Use a road along the SOUTH edge that dips out and back: z goes −400 → −500 → −400.
        const line = [ll(-100, -400), ll(0, -500), ll(100, -400)];
        const r = clip.clipPolylineLonLat(line);
        expect(r.verdict).toBe('cut');
        expect(r.pieces.length).toBe(2);
        for (const piece of r.pieces) {
            const a = xz(piece[0]!), b = xz(piece[piece.length - 1]!);
            // One end is an original vertex (z = −400), the other lies on the edge z = −450.
            expect(Math.min(Math.abs(a.z + 450), Math.abs(b.z + 450))).toBeLessThan(0.01);
        }
    });

    it('a road crossing the whole scope keeps only the inside span, both ends on the edge', () => {
        const line = [ll(-1000, 100), ll(1000, 100)];
        const r = clip.clipPolylineLonLat(line);
        expect(r.pieces.length).toBe(1);
        const a = xz(r.pieces[0]![0]!), b = xz(r.pieces[0]![1]!);
        expect(Math.abs(a.x + 600)).toBeLessThan(0.01);
        expect(Math.abs(b.x - 600)).toBeLessThan(0.01);
    });

    it('a vertex exactly on the boundary neither breaks the chain nor duplicates a point', () => {
        const line = [ll(0, 0), ll(600, 0), ll(700, 0)];
        const r = clip.clipPolylineLonLat(line);
        expect(r.verdict).toBe('cut');
        expect(r.pieces.length).toBe(1);
        const pts = r.pieces[0]!.map(xz);
        expect(pts.length).toBe(2);
        expect(Math.abs(pts[1]!.x - 600)).toBeLessThan(0.01);
    });
});

describe('points — centre-in-scope, counted, from the SAME polygon as the ring clip', () => {
    it('kept / dropped counts', () => {
        const clip = createScopeClipper(RECT, BCN, 0);
        const trees = [ll(0, 0), ll(599, 449), ll(601, 0), ll(0, -451), ll(-300, 200)];
        const r = clip.filterPointsLonLat(trees, (t) => t);
        expect(r.kept.length).toBe(3);
        expect(r.dropped).toBe(2);
        expect(r.kept[0]).toBe(trees[0]);
    });

    it('a tree inside the exact circle but outside the n-gon is DROPPED — it would float past the cut', () => {
        const clip = createScopeClipper(DISC, BCN, 0);
        const n = clip.containment.polygon.length;
        const mid = Math.PI / n;
        const r = (900 * Math.cos(mid) + 900) / 2;
        const tree = ll(r * Math.cos(mid), r * Math.sin(mid));
        expect(Math.hypot(xz(tree).x, xz(tree).z)).toBeLessThan(900);
        expect(clip.filterPointsLonLat([tree], (t) => t).dropped).toBe(1);
        expect(clip.containsLonLat(tree)).toBe(false);
    });
});

describe('θ ≠ 0 — the scope rotates with the parcel, the OSM feature does not', () => {
    it('a rectangle at 45° keeps a point on the rotated axis and drops the un-rotated corner', () => {
        const clip = createScopeClipper({ shape: 'rectangle', halfWidthM: 600, halfDepthM: 600 }, BCN, Math.PI / 4);
        expect(clip.containsLonLat(ll(840, 0))).toBe(true);
        expect(clip.containsLonLat(ll(590, 590))).toBe(false);
        // The un-rotated corner square is wholly OUTSIDE the diamond (x + z = 1140 > 600·√2).
        expect(clip.clipRingLonLat(squareAt(590, 590, 20)).verdict).toBe('outside');
        // A square centred ON the diamond's north-east edge (x + z = 600·√2) straddles it: cut, half kept.
        const e = 600 * Math.SQRT2 / 2;
        const r = clip.clipRingLonLat(squareAt(e, e, 20));
        expect(r.verdict).toBe('cut');
        expect(ringAreaM2(r.rings[0]!)).toBeCloseTo(40 * 40 / 2, 2);
    });
});

describe('tally + cap verdict — the honesty line carries the numbers', () => {
    it('tally lines', () => {
        const t = createScopeClipTally();
        t.add('landuse', 'inside', 12);
        t.add('landuse', 'cut', 7);
        t.add('landuse', 'outside', 41);
        t.add('landuse', 'refused');
        t.addDropped('trees', 962, 1500);
        expect(t.lines()).toEqual([
            'landuse: 12 inside · 7 cut · 41 outside · 1 refused (kept whole)',
            'trees: 1500 inside · 0 cut · 962 outside',
        ]);
        expect(t.counts('trees').outside).toBe(962);
    });

    it('capVerdict — the founder\'s own tree numbers (L-13058): 1500 of 2462 inside 891 m', () => {
        const v = capVerdict('trees', 2462, 1500, { shape: 'circle', radiusM: 891 });
        expect(v.complete).toBe(false);
        expect(v.dropped).toBe(962);
        expect(v.completeRadiusM).toBeCloseTo(891 * Math.sqrt(1500 / 2462), 6); // ≈ 695 m
        expect(v.line).toMatch(/1500 of 2462 inside the scope drawn — 962 dropped by the cap; complete at a scope of ~695 m/);
    });

    it('capVerdict — complete when the cap does not bite', () => {
        const v = capVerdict('trees', 2462, 3000, { shape: 'circle', radiusM: 891 });
        expect(v.complete).toBe(true);
        expect(v.dropped).toBe(0);
        expect(v.completeRadiusM).toBeNull();
        expect(v.line).toBe('trees: 2462 of 2462 inside the scope drawn (cap 3000 not reached)');
    });

    it('completeScopeRadiusM — the tightest layer decides the slider\'s "complete" mark', () => {
        const measured: SiteScope = { shape: 'circle', radiusM: 891 };
        const r = completeScopeRadiusM(measured, [
            { layer: 'buildings', eligible: 5440, cap: 14000 },
            { layer: 'trees', eligible: 2462, cap: 1500 },
            { layer: 'lamps', eligible: 1018, cap: 2400 },
        ]);
        expect(r?.boundBy).toBe('trees');
        expect(r?.radiusM).toBeCloseTo(891 * Math.sqrt(1500 / 2462), 6);
        const all = completeScopeRadiusM(measured, [{ layer: 'trees', eligible: 2462, cap: 3000 }]);
        expect(all?.radiusM).toBe(891);
        expect(all?.boundBy).toMatch(/every cap holds/);
        expect(completeScopeRadiusM(measured, [])).toBeNull();
    });
});
