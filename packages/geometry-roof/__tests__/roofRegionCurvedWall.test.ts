/**
 * §FIX-ROOF-REGION-FOLLOWS-ARC (L-699) — the founder's report, end to end.
 *
 * Founder, live build `096e12b4`: *"I created a roof BY REGION, but the region
 * had a CURVED WALL within, and it could not cope with it."* The screenshot showed
 * a single flat faceted plane that ignored the curve, overhung the building, and
 * was not a sloping roof at all.
 *
 * There were THREE independent defects behind that one picture, and this file
 * pins each of them as a separate failing-first assertion:
 *
 *   A. `WallRegionDetector` read only `baseLine[0]`/`baseLine[1]` — the arc's
 *      CHORD — so the region boundary ran straight across the bow.
 *   B. Even with a correct boundary, a pitched roofType on a non-rectilinear
 *      footprint FLAT-DEGRADED, because the only concave path required
 *      rectilinearity and a tessellated arc is rectilinear in no frame.
 *   C. The overhang was a radial push from the centroid, not a parallel offset,
 *      so the eave left the building.
 *
 * §ROOF-REGION-SHARED-TRACER (C79 §6.5, 2026-08-12): `WallRegionDetector` is
 * RETIRED (see the tombstone in `src/index.ts`); roof-by-region now runs on the
 * shared `SlabRegionTracer` via `traceRoofRegionAtPoint`. The assertions below
 * were re-derived for the shared tracer's §ARC-DENSITY behaviour: the wall's
 * `curve.segments` is honoured as a FLOOR and density may be RAISED from the
 * arc's curvature, so exact chord counts are no longer contract — following the
 * arc (not its chord) is.
 */

import { describe, it, expect } from 'vitest';
import { traceRoofRegionAtPoint } from '../src/RoofRegionTrace';
import { RoofGeometryBuilder } from '../src/RoofGeometryBuilder';
import type { RoofData } from '../src/RoofTypes';

/**
 * A 10 × 8 room whose NORTH wall (z = 8) bows OUTWARD to z = 12 at its midpoint.
 * Modelled exactly as the wall schema does: one wall record, `baseLine` = the two
 * arc endpoints, `curve.control` = the quadratic-Bézier control point.
 */
const ROOM_WALLS = [
    { id: 'w-s', baseLine: [{ x: 0, z: 0 }, { x: 10, z: 0 }] },
    { id: 'w-e', baseLine: [{ x: 10, z: 0 }, { x: 10, z: 8 }] },
    {
        id: 'w-n-curved',
        baseLine: [{ x: 10, z: 8 }, { x: 0, z: 8 }],
        curve: { control: { x: 5, z: 16 }, segments: 16 },
    },
    { id: 'w-w', baseLine: [{ x: 0, z: 8 }, { x: 0, z: 0 }] },
];

const region = (): [number, number][] =>
    traceRoofRegionAtPoint(ROOM_WALLS, 5, 4)!.polygon;

function makeRoof(poly: [number, number][], roofType: RoofData['roofType']): RoofData {
    return {
        id: 'r1', type: 'roof', levelId: 'L0',
        footprint: { polygon: poly, centroid: [0, 0] },
        roofType, slope: 0.4, overhang: 0.3, baseOffset: 0, thickness: 0.2,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
    } as RoofData;
}

function yRange(geo: { getAttribute(n: string): { array: ArrayLike<number> } | undefined }) {
    const pos = geo.getAttribute('position')!;
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < pos.array.length; i += 3) {
        lo = Math.min(lo, pos.array[i]!);
        hi = Math.max(hi, pos.array[i]!);
    }
    return { lo, hi };
}

describe('A — the region boundary must FOLLOW the arc, not cut across it', () => {
    it('detects the region and returns the tessellated arc, not a 4-vertex box', () => {
        const traced = traceRoofRegionAtPoint(ROOM_WALLS, 5, 4);
        expect(traced).not.toBeNull();
        // 3 straight walls + ≥16 arc chords (curve.segments=16 is a FLOOR under
        // §ARC-DENSITY). Before the L-699 fix this was 4 — the arc collapsed to
        // its chord.
        expect(traced!.polygon.length).toBeGreaterThanOrEqual(19);
    });

    it('the boundary reaches near the arc APEX at z = 12 (the chord stops at z = 8)', () => {
        const poly = region();
        const maxZ = Math.max(...poly.map((p) => p[1]));
        // z(t) = 8 + 16·t(1−t) peaks at 12; with n ≥ 16 chords the nearest sample
        // to t = 0.5 is within 1/(2n) ≤ 1/32, so maxZ ≥ 12 − 16/(32²) ≈ 11.984.
        expect(maxZ).toBeGreaterThan(11.9);
        expect(maxZ).toBeLessThanOrEqual(12 + 1e-9);
        // The whole defect in one number: the chord-only boundary topped out at 8,
        // discarding ~4 m of room the user had drawn.
        expect(maxZ - 8).toBeGreaterThan(3.9);
    });

    it('a room of only STRAIGHT walls is unchanged (no regression)', () => {
        const straightRoom = [
            { id: 'a', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
            { id: 'b', baseLine: [{ x: 6, z: 0 }, { x: 6, z: 6 }] },
            { id: 'c', baseLine: [{ x: 6, z: 6 }, { x: 0, z: 6 }] },
            { id: 'd', baseLine: [{ x: 0, z: 6 }, { x: 0, z: 0 }] },
        ];
        const traced = traceRoofRegionAtPoint(straightRoom, 3, 3);
        expect(traced).not.toBeNull();
        expect(traced!.polygon.length).toBe(4);
    });

    it('the returned polygon is wound CCW (positive area) — the retired detector\'s contract', () => {
        const poly = region();
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            area += poly[i]![0] * poly[j]![1] - poly[j]![0] * poly[i]![1];
        }
        expect(area / 2).toBeGreaterThan(0);
    });
});

describe('B — a curved region must produce a REAL SLOPING roof, never a flat plane', () => {
    const poly = region();

    it('gable over the traced curved region rises above the eave', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(poly, 'gable'));
        const { lo, hi } = yRange(geo);
        // lo is the soffit at -thickness; hi is the ridge/apex. A flat roof would
        // give hi === 0 — which is precisely what the founder saw.
        expect(lo).toBeCloseTo(-0.2, 6);
        expect(hi).toBeGreaterThan(0.5);
    });

    it('hip over the traced curved region rises above the eave', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(poly, 'hip'));
        expect(yRange(geo).hi).toBeGreaterThan(0.5);
    });

    it('the surface is GRADED, not two planes: many distinct heights', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(poly, 'hip'));
        const pos = geo.getAttribute('position')!;
        const heights = new Set<number>();
        for (let i = 1; i < pos.array.length; i += 3) heights.add(Math.round(pos.array[i]! * 1000));
        // 8 offset rings + eave + soffit ⇒ ≥ 8 distinct levels.
        expect(heights.size).toBeGreaterThanOrEqual(8);
    });

    it('a plain RECTANGLE still takes the closed-form gable path (no regression)', () => {
        const rect: [number, number][] = [[0, 0], [10, 0], [10, 4], [0, 4]];
        const geo = RoofGeometryBuilder.generate(makeRoof(rect, 'gable'));
        const pos = geo.getAttribute('position')!;
        const heights = new Set<number>();
        for (let i = 1; i < pos.array.length; i += 3) heights.add(Math.round(pos.array[i]! * 1000));
        // eave (0) + ridge + soffit = exactly 3 levels — the classic gable.
        expect(heights.size).toBe(3);
        expect(yRange(geo).hi).toBeGreaterThan(0);
    });
});

describe('C — the eave must stay parallel to the building', () => {
    const poly = region();

    it('a 0.3 m overhang extends the footprint by 0.3 m, not by a shape-dependent amount', () => {
        // The footprint apex is wherever the tessellation sampled nearest t = 0.5,
        // so measure the eave RELATIVE to it — the invariant is "parallel offset
        // of 0.3 m", not an absolute coordinate.
        const apexZ = Math.max(...poly.map((p) => p[1]));
        const geo = RoofGeometryBuilder.generate(makeRoof(poly, 'hip'));
        const pos = geo.getAttribute('position')!;
        let maxZ = -Infinity;
        for (let i = 0; i < pos.array.length; i += 3) maxZ = Math.max(maxZ, pos.array[i + 2]!);
        // A true 0.3 m parallel offset puts the eave 0.3 m past the apex (plus the
        // sub-centimetre mitre overshoot of a tessellated arc). A radial push from
        // the centroid — the old defect — overshoots by a shape-dependent amount.
        expect(maxZ - apexZ).toBeGreaterThan(0.29);
        expect(maxZ - apexZ).toBeLessThan(0.36);
    });
});
