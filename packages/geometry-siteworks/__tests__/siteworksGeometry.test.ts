// SiteworksGeometry — the sweep, the footprint resolver and the area answer.
// C116 §10 · ADR-0384 D2/D4 · C84 EI-1/EI-9.
//
// ⛔ THE ARMS ASSERT MEASURED GEOMETRY, NOT "IT RETURNED SOMETHING". A ribbon of the
// wrong width, a ring wound the wrong way and a fold reported as success all return
// a perfectly well-formed array, so every arm here pins a NUMBER or a REFUSAL.
//
// Scramble control is recorded in the lane's commit message.

import { describe, it, expect } from 'vitest';
import { Siteworks } from '@pryzm/schemas';
import { polygonSignedArea2D } from '@pryzm/geometry-kernel';
import {
    sweepCentrelineToRing,
    siteworksFootprintRing,
    siteworksAreaM2,
    siteworksDatum,
    type GroundPoint,
} from '../src/SiteworksGeometry.js';

const P = (x: number, z: number): GroundPoint => ({ x, y: 0, z });
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
    expect(r.ok).toBe(true);
    return r as Extract<T, { ok: true }>;
};

describe('sweepCentrelineToRing — a straight road is a rectangle of the right size', () => {
    it('sweeps a 100 m straight centreline at 7 m into a 700 m² ring', () => {
        const r = ok(sweepCentrelineToRing([P(0, 0), P(100, 0)], 7));
        expect(Math.abs(polygonSignedArea2D(r.ring.map((p) => [p.x, p.z])))).toBeCloseTo(700, 6);
    });

    it('the ring is exactly half the width either side of the centreline', () => {
        const r = ok(sweepCentrelineToRing([P(0, 0), P(10, 0)], 7));
        const zs = r.ring.map((p) => p.z).sort((a, b) => a - b);
        expect(zs[0]).toBeCloseTo(-3.5, 9);
        expect(zs[zs.length - 1]).toBeCloseTo(3.5, 9);
    });

    it('⭐ every ring vertex lies on the ground plane — y is never invented', () => {
        const r = ok(sweepCentrelineToRing([P(0, 0), P(10, 0), P(10, 10)], 7));
        for (const p of r.ring) expect(p.y).toBe(0);
    });

    // This arm binds on the ASSEMBLY ORDER, which is live production logic, not on a
    // normalisation step. The scramble control is what forced the distinction: an
    // explicit `signedArea > 0 ? ring : reverse(ring)` line used to sit at the end of
    // the sweep, and DELETING IT CHANGED NO TEST RESULT -- it was dead code, because
    // walking out on one side and back on the other already fixes the winding. The
    // line is gone; this arm now fails if the assembly order is reversed.
    it('⭐ the ring is CCW whichever way the user drew the centreline', () => {
        const fwd = ok(sweepCentrelineToRing([P(0, 0), P(50, 0)], 7));
        const rev = ok(sweepCentrelineToRing([P(50, 0), P(0, 0)], 7));
        const diag = ok(sweepCentrelineToRing([P(0, 0), P(30, 40)], 7));
        expect(polygonSignedArea2D(fwd.ring.map((p) => [p.x, p.z]))).toBeGreaterThan(0);
        expect(polygonSignedArea2D(rev.ring.map((p) => [p.x, p.z]))).toBeGreaterThan(0);
        expect(polygonSignedArea2D(diag.ring.map((p) => [p.x, p.z]))).toBeGreaterThan(0);
    });

    it('a wider road has a proportionally larger footprint — width is actually used', () => {
        const a = ok(sweepCentrelineToRing([P(0, 0), P(100, 0)], 7));
        const b = ok(sweepCentrelineToRing([P(0, 0), P(100, 0)], 14));
        const areaA = Math.abs(polygonSignedArea2D(a.ring.map((p) => [p.x, p.z])));
        const areaB = Math.abs(polygonSignedArea2D(b.ring.map((p) => [p.x, p.z])));
        expect(areaB / areaA).toBeCloseTo(2, 6);
    });

    // An L: (0,0) -> (50,0) -> (50,50), half-width h = 3.5.
    //   leg 1 runs +x, its offset normal is (0,-1)  -> the +h side is z = -3.5
    //   leg 2 runs +z, its offset normal is (1, 0)  -> the +h side is x = 53.5
    // So a TRUE MITRE places one vertex at the OUTER corner (53.5, -3.5) and one at
    // the INNER corner (46.5, 3.5). A butt joint places two vertices near each
    // instead. Those two points are the discriminator; the area is not.
    //
    // NOTE ON THE AREA, because an earlier draft of this test got it wrong and the
    // correction is the useful part: a mitred ribbon around a polyline of length L
    // has area EXACTLY L*w. At every corner the outer side gains a triangle and the
    // inner side loses one of equal area, so they cancel. Here L = 100 m and w = 7 m,
    // giving 700 m². The 651 m² the first draft expected is the area of the UNION OF
    // TWO BUTT-JOINTED RECTANGLES (700 - the 7x7 overlap) -- a different construction.
    // The implementation was right and the expectation was wrong.
    it('an L-shaped centreline MITRES — the corner meets at one exact point per side', () => {
        const r = ok(sweepCentrelineToRing([P(0, 0), P(50, 0), P(50, 50)], 7));

        const has = (x: number, z: number) =>
            r.ring.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.z - z) < 1e-9);
        expect(has(53.5, -3.5)).toBe(true);   // outer mitre
        expect(has(46.5, 3.5)).toBe(true);    // inner mitre

        // Six vertices: 2 per square cap, 1 per mitred side. A butt joint would
        // produce eight.
        expect(r.ring.length).toBe(6);
        expect(r.bevelled).toBe(false);

        const area = Math.abs(polygonSignedArea2D(r.ring.map((p) => [p.x, p.z])));
        expect(area).toBeCloseTo(700, 6);
    });

    it('⭐ the mitre is not a coincidence of right angles — a 120 degree bend also closes exactly', () => {
        // Legs of 40 m and 40 m meeting at 120 degrees. Mitred ribbon area is still
        // L*w = 80 * 6 = 480 m², and the ring is still 6 vertices.
        const r = ok(sweepCentrelineToRing(
            [P(0, 0), P(40, 0), P(40 + 40 * Math.cos(Math.PI / 3), 40 * Math.sin(Math.PI / 3))],
            6,
        ));
        expect(r.ring.length).toBe(6);
        expect(Math.abs(polygonSignedArea2D(r.ring.map((p) => [p.x, p.z])))).toBeCloseTo(480, 6);
    });
});

describe('sweepCentrelineToRing — REFUSALS ARE NAMED, never an empty ring', () => {
    it('refuses a one-point centreline and says why', () => {
        const r = sweepCentrelineToRing([P(0, 0)], 7);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/at least 2 points/);
    });

    it('refuses a zero or negative width and says why', () => {
        for (const w of [0, -7]) {
            const r = sweepCentrelineToRing([P(0, 0), P(10, 0)], w);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toMatch(/positive/);
        }
    });

    it('refuses a non-finite width', () => {
        expect(sweepCentrelineToRing([P(0, 0), P(10, 0)], Number.NaN).ok).toBe(false);
    });

    it('⭐ REFUSES A SELF-INTERSECTING SWEEP BY NAME — C116 §10b, now measured', () => {
        // A hairpin far tighter than the width can follow: out 40 m, back 40 m with
        // only 1 m of lateral separation, swept at 20 m. The two sides must cross.
        const r = sweepCentrelineToRing([P(0, 0), P(40, 0), P(40, 1), P(0, 1)], 20);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toMatch(/self-intersect/);
            expect(r.reason).toMatch(/edges \d+\/\d+/);
        }
    });

    it('⛔ a refusal is NOT an empty ring — failure and emptiness never share a value', () => {
        const r = sweepCentrelineToRing([P(0, 0)], 7);
        expect(r.ok).toBe(false);
        expect('ring' in r).toBe(false);
    });
});

describe('siteworksFootprintRing — form does not leak to consumers', () => {
    it('resolves a LINEAR surface through the sweep', () => {
        const s = Siteworks.parse({
            form: 'linear', centreline: [P(0, 0), P(100, 0)], widthM: 7, boundary: [], holes: [],
        });
        const r = ok(siteworksFootprintRing(s));
        expect(Math.abs(polygonSignedArea2D(r.ring.map((p) => [p.x, p.z])))).toBeCloseTo(700, 6);
    });

    it('resolves an AREAL surface as its stored boundary, untouched', () => {
        const b = [P(0, 0), P(20, 0), P(20, 10), P(0, 10)];
        const s = Siteworks.parse({ form: 'areal', centreline: [], boundary: b, holes: [] });
        const r = ok(siteworksFootprintRing(s));
        expect(r.ring).toEqual(b);
    });
});

describe('siteworksAreaM2 — ONE answer, and holes are subtracted', () => {
    it('a 20x10 parking area is 200 m²', () => {
        const s = Siteworks.parse({
            role: 'parking', form: 'areal', centreline: [],
            boundary: [P(0, 0), P(20, 0), P(20, 10), P(0, 10)], holes: [],
        });
        expect(ok(siteworksAreaM2(s)).areaM2).toBeCloseTo(200, 9);
    });

    it('⭐ a 4x5 planted island is SUBTRACTED — 200 − 20 = 180 m²', () => {
        const s = Siteworks.parse({
            role: 'parking', form: 'areal', centreline: [],
            boundary: [P(0, 0), P(20, 0), P(20, 10), P(0, 10)],
            holes: [[P(2, 2), P(6, 2), P(6, 7), P(2, 7)]],
        });
        expect(ok(siteworksAreaM2(s)).areaM2).toBeCloseTo(180, 9);
    });

    it('a linear road area agrees with its own swept ring', () => {
        const s = Siteworks.parse({
            form: 'linear', centreline: [P(0, 0), P(100, 0)], widthM: 7, boundary: [], holes: [],
        });
        expect(ok(siteworksAreaM2(s)).areaM2).toBeCloseTo(700, 6);
    });

    it('⛔ refuses rather than returning 0 when the sweep cannot be solved', () => {
        const s = Siteworks.parse({
            form: 'linear', centreline: [P(0, 0), P(40, 0), P(40, 1), P(0, 1)],
            widthM: 20, boundary: [], holes: [],
        });
        const r = siteworksAreaM2(s);
        expect(r.ok).toBe(false);
        // The distinction that matters: NOT ok, and no areaM2 to misread as zero.
        expect('areaM2' in r).toBe(false);
    });

    it('⛔ refuses a hole larger than the surface rather than returning a negative area', () => {
        const s = Siteworks.parse({
            form: 'areal', centreline: [],
            boundary: [P(0, 0), P(4, 0), P(4, 4), P(0, 4)],
            holes: [[P(-10, -10), P(10, -10), P(10, 10), P(-10, 10)]],
        });
        const r = siteworksAreaM2(s);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/inside-out|larger than/);
    });
});

describe('siteworksDatum — the Slab rule, inherited not re-derived (ADR-0384 D4)', () => {
    it('the finished surface sits AT the datum and the construction hangs BELOW it', () => {
        const s = Siteworks.parse({ ...{ form: 'linear' as const }, thickness: 0.3, baseOffset: 0 });
        const d = siteworksDatum(s, 12.5);
        expect(d.topY).toBe(12.5);
        expect(d.bottomY).toBeCloseTo(12.2, 9);
    });

    it('baseOffset lifts BOTH faces — it moves the surface, it does not thicken it', () => {
        const s = Siteworks.parse({ thickness: 0.4, baseOffset: 1.5 });
        const d = siteworksDatum(s, 10);
        expect(d.topY).toBeCloseTo(11.5, 9);
        expect(d.bottomY).toBeCloseTo(11.1, 9);
        expect(d.topY - d.bottomY).toBeCloseTo(0.4, 9);
    });

    it('⛔ the plate never extrudes UPWARD — bottomY is always below topY', () => {
        const s = Siteworks.parse({ thickness: 2, baseOffset: -3 });
        const d = siteworksDatum(s, 0);
        expect(d.bottomY).toBeLessThan(d.topY);
    });
});
