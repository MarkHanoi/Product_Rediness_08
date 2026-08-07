/**
 * §FIX-ROOF-REGION-FOLLOWS-ARC (L-699) + §ROOF-ENGINE-STAGE-1
 *
 * Pins the two pure primitives the roof engine is being rebuilt on:
 *   1. `sampleWallCentreline` — the curved-wall sampler, whose parameterisation
 *      MUST agree with the room ring (`RoomPolygonUtils._wallCentrelinePolyline`)
 *      or a roof and the floor finish under it follow two different arcs.
 *   2. `offsetPolygon` — a true mitred parallel offset, replacing the radial
 *      centroid push that made a "300 mm overhang" mean something different on
 *      every footprint.
 */

import { describe, it, expect } from 'vitest';
import {
    sampleWallCentreline,
    sampleWallChords,
    isCurvedWall,
    resolveCurveSegments,
    DEFAULT_CURVE_SEGMENTS,
} from '../src/pure/wallCentreline.js';
import { offsetPolygon, offsetPolygonOrSelf, signedArea } from '../src/pure/polygonOffset.js';

const straightWall = {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
};

/** A semicircle-ish arc: chord (0,0)→(10,0), control lifted to z = 8. */
const curvedWall = {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
    curve: { control: { x: 5, y: 0, z: 8 }, segments: 16 },
};

describe('sampleWallCentreline — the curved-wall boundary the roof region MUST follow', () => {
    it('a straight wall is bit-identical to reading baseLine[0]/[1] (no regression)', () => {
        expect(sampleWallCentreline(straightWall)).toEqual([[0, 0], [10, 0]]);
        expect(isCurvedWall(straightWall)).toBe(false);
    });

    it('a curved wall yields segments+1 points, endpoints exact', () => {
        const pts = sampleWallCentreline(curvedWall);
        expect(pts).toHaveLength(17);
        expect(pts[0]).toEqual([0, 0]);
        expect(pts[16]![0]).toBeCloseTo(10, 12);
        expect(pts[16]![1]).toBeCloseTo(0, 12);
        expect(isCurvedWall(curvedWall)).toBe(true);
    });

    it('THE DEFECT: the chord is NOT the arc — the midpoint is 4 m off', () => {
        // This is the whole bug in one assertion. WallRegionDetector read only
        // baseLine[0]/[1], i.e. the chord, so the region boundary ran straight
        // across a room the user had bounded with a 4 m-deep bow.
        const chordMidZ = 0; // midpoint of [(0,0) → (10,0)]
        const arcMid = sampleWallCentreline(curvedWall)[8]!;
        expect(arcMid[0]).toBeCloseTo(5, 12);
        // Quadratic Bézier at t=0.5 reaches HALF the control offset: 8 / 2 = 4.
        expect(arcMid[1]).toBeCloseTo(4, 12);
        expect(Math.abs(arcMid[1] - chordMidZ)).toBeGreaterThan(3.9);
    });

    it('matches the room-ring parameterisation exactly: p(t)=(1-t)²s+2(1-t)t·c+t²e', () => {
        // Co-owned constant with packages/room-topology/src/RoomPolygonUtils.ts
        // (_wallCentrelinePolyline). Recomputed here independently, so a change
        // to either side breaks this test rather than silently desynchronising
        // the roof from the floor finish beneath it.
        const s = { x: 0, z: 0 }, c = { x: 5, z: 8 }, e = { x: 10, z: 0 };
        const n = 16;
        const expected: Array<[number, number]> = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
            expected.push([a * s.x + b * c.x + d * e.x, a * s.z + b * c.z + d * e.z]);
        }
        expect(sampleWallCentreline(curvedWall)).toEqual(expected);
    });

    it('segment count: defaults to 16, honours >=4, clamps at 256, rejects nonsense', () => {
        expect(resolveCurveSegments(undefined)).toBe(DEFAULT_CURVE_SEGMENTS);
        expect(resolveCurveSegments(3)).toBe(DEFAULT_CURVE_SEGMENTS); // below schema min
        expect(resolveCurveSegments(32)).toBe(32);
        expect(resolveCurveSegments(10_000)).toBe(256);
        expect(resolveCurveSegments(Number.NaN)).toBe(DEFAULT_CURVE_SEGMENTS);
    });

    it('a wall with no usable baseline contributes NOTHING (never a zero-length chord)', () => {
        expect(sampleWallCentreline({})).toEqual([]);
        expect(sampleWallCentreline({ baseLine: [{ x: 0, z: 0 }] })).toEqual([]);
        expect(sampleWallCentreline({ baseLine: [{ x: Number.NaN, z: 0 }, { x: 1, z: 1 }] })).toEqual([]);
    });

    it('chords align 1:1 with the sampled points', () => {
        expect(sampleWallChords(straightWall)).toHaveLength(1);
        expect(sampleWallChords(curvedWall)).toHaveLength(16);
    });
});

describe('offsetPolygon — a real parallel offset, not a radial push', () => {
    const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];

    it('a square offset by 1 m is a square 1 m larger ON EVERY EDGE', () => {
        const r = offsetPolygon(square, 1);
        expect(r.degenerate).toBe(false);
        expect(r.polygon).toHaveLength(4);
        for (const [x, z] of r.polygon) {
            expect(Math.abs(Math.abs(x - 5) - 6)).toBeLessThan(1e-9);
            expect(Math.abs(Math.abs(z - 5) - 6)).toBeLessThan(1e-9);
        }
    });

    it('THE OLD DEFECT: the radial push gave 0.707 m of eave for a 1 m overhang', () => {
        // Reproduction of the replaced `_applyOverhang`, kept as the failing-first
        // evidence for §ROOF-ENGINE-STAGE-1. On the square, radial displacement of
        // 1 m moves each corner diagonally, so the EDGE only advances by cos45°.
        const cx = 5, cz = 5;
        const radial = square.map(([x, z]) => {
            const dx = x - cx, dz = z - cz;
            const len = Math.hypot(dx, dz) || 1;
            return [x + (dx / len) * 1, z + (dz / len) * 1] as [number, number];
        });
        const edgeAdvance = radial[1]![0] - 10; // +x face of the square
        expect(edgeAdvance).toBeCloseTo(Math.SQRT1_2, 6);
        expect(edgeAdvance).toBeLessThan(0.71); // i.e. a 1.00 m overhang drew 0.71 m

        const correct = offsetPolygon(square, 1).polygon;
        const correctAdvance = Math.max(...correct.map((p) => p[0])) - 10;
        expect(correctAdvance).toBeCloseTo(1, 9);
    });

    it('an ELONGATED footprint offsets uniformly (the radial push distorted it)', () => {
        const strip: Array<[number, number]> = [[0, 0], [40, 0], [40, 4], [0, 4]];
        const r = offsetPolygon(strip, 0.3);
        const xs = r.polygon.map((p) => p[0]);
        const zs = r.polygon.map((p) => p[1]);
        expect(Math.min(...xs)).toBeCloseTo(-0.3, 9);
        expect(Math.max(...xs)).toBeCloseTo(40.3, 9);
        expect(Math.min(...zs)).toBeCloseTo(-0.3, 9);
        expect(Math.max(...zs)).toBeCloseTo(4.3, 9);
    });

    it('winding-agnostic: a CW ring offsets outward too', () => {
        const cw = [...square].reverse();
        expect(signedArea(square) > 0).not.toBe(signedArea(cw) > 0);
        const r = offsetPolygon(cw, 1);
        expect(r.polygon).toHaveLength(4);
        const xs = r.polygon.map((p) => p[0]);
        expect(Math.max(...xs)).toBeCloseTo(11, 9);
        expect(Math.min(...xs)).toBeCloseTo(-1, 9);
    });

    it('a CONCAVE (L-shaped) footprint keeps its re-entrant corner INSIDE', () => {
        const L: Array<[number, number]> = [
            [0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10],
        ];
        const r = offsetPolygon(L, 0.5);
        expect(r.polygon.length).toBeGreaterThanOrEqual(6);
        // The re-entrant vertex (4,4) must move AWAY from the material, i.e. to
        // (4.5, 4.5) — the radial push moved it toward the centroid-outward
        // direction and inverted the notch.
        const reentrant = r.polygon.find((p) => Math.abs(p[0] - 4.5) < 1e-6 && Math.abs(p[1] - 4.5) < 1e-6);
        expect(reentrant).toBeDefined();
        expect(Math.abs(signedArea(r.polygon))).toBeGreaterThan(Math.abs(signedArea(L)));
    });

    it('a tessellated ARC offsets to a PARALLEL arc (constant normal distance)', () => {
        // A 32-gon inscribed in a circle of radius 5 — every vertex is a pure
        // chord-to-chord mitre, so the whole ring exercises the arc case.
        const N = 32;
        const arc: Array<[number, number]> = [];
        for (let i = 0; i < N; i++) {
            const a = (2 * Math.PI * i) / N;
            arc.push([5 * Math.cos(a), 5 * Math.sin(a)]);
        }
        const r = offsetPolygon(arc, 0.5);
        expect(r.degenerate).toBe(false);
        expect(r.polygon).toHaveLength(N);
        // The mitre of two chords overshoots the true parallel arc by exactly
        // 1/cos(π/N). Assert the EXACT known error, not a loose bound — that is
        // what proves the offset is following the curve rather than approximating
        // it by luck (same discipline as the L-693 curved-finish proof).
        // Each chord's apothem is 5·cos(π/N); shifting it out by d raises the
        // apothem to 5·cos(π/N)+d, so the mitred vertex lands at
        //   R' = (5·cos(π/N) + d) / cos(π/N) = 5 + d/cos(π/N).
        const expectedR = 5 + 0.5 / Math.cos(Math.PI / N);
        for (const p of r.polygon) {
            expect(Math.hypot(p[0], p[1])).toBeCloseTo(expectedR, 9);
        }
        expect(expectedR - 5.5).toBeLessThan(0.003); // < 3 mm overshoot at 32 chords
    });

    it('an inward offset that consumes the polygon REFUSES rather than inventing a ring', () => {
        const small: Array<[number, number]> = [[0, 0], [2, 0], [2, 2], [0, 2]];
        const r = offsetPolygon(small, -5);
        expect(r.polygon).toEqual([]);
        expect(r.degenerate).toBe(true);
        expect(r.reason).toBeTruthy();
    });

    it('offsetPolygonOrSelf is fail-safe: a roof is ALWAYS produced, degradation reported', () => {
        const small: Array<[number, number]> = [[0, 0], [2, 0], [2, 2], [0, 2]];
        const r = offsetPolygonOrSelf(small, -5);
        expect(r.polygon).toEqual(small);
        expect(r.degenerate).toBe(true);
    });

    it('a zero overhang is the identity', () => {
        expect(offsetPolygon(square, 0).polygon).toEqual(square);
        expect(offsetPolygon(square, 0).degenerate).toBe(false);
    });
});
