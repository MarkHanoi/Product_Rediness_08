/**
 * §SECTION-POCHE-HAS-A-PLANE (founder 2026-09-09 · L-13269 · C09 §4.6)
 *
 * THE ASK: *"A NEW LANE FOR: DOCUMENTATION QUALITY - PROJECT ON PLAN VIEW AND ELEVATION AND
 * SECTIONS ... THE QUALITY ATM IS REALLY BAD."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ A SECTION COULD NEVER HATCH, AND THE FAILURE WAS SILENT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `PocheFillBuilder._parseSegments` read `positions[i]` (x) and `positions[i+2]` (z) per vertex
 * and ignored y — with a comment that said so: *"XZ plane only — Y is ignored (plan view
 * geometry is flat)."* For a PLAN cut that is exactly right: the ring is horizontal.
 *
 * ⛔ A SECTION CUT RING IS VERTICAL. `buildMeshPlaneIntersectionGeometry` emits a ring coplanar
 * with the section depth plane, so it varies in **y** and in ONE horizontal axis and is CONSTANT
 * in the other. Flattened onto xz, every vertex of a wall face collapses to the same point;
 * `aKey === bKey`; every segment is dropped as degenerate; the loop stitcher gets an empty
 * array; the function returns `[]`. **Not a faint poché — NO poché, for every section and
 * elevation this product has ever drawn.** Poché is the single largest readability lever in a
 * section, which is why the founder's complaint and this defect are the same sentence.
 *
 * ⚠ AND THE TEST THAT SHOULD HAVE CAUGHT IT USED A HORIZONTAL FIXTURE LABELLED AS AN ELEVATION
 * CUT BAND. A fixture that does not have the geometry of the thing it names cannot falsify the
 * thing it names — [[fake-more-capable-than-real]], one level down. The arms below use rings
 * that are genuinely vertical, and the first of them FAILED before this lane.
 */

import { describe, it, expect } from 'vitest';
import { PocheFillBuilder } from './PocheFillBuilder';

/** A closed ring as an interleaved LineSegments buffer: consecutive vertex PAIRS are segments. */
function ringToSegments(pts: ReadonlyArray<readonly [number, number, number]>): number[] {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    return out;
}

/** A 4 m x 2.7 m wall face standing on a section plane at z = 2.5 — VERTICAL, varying in y. */
const VERTICAL_WALL_FACE_AT_Z: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 2.5], [4, 0, 2.5], [4, 2.7, 2.5], [0, 2.7, 2.5],
];

/** The same face turned 90 degrees — vertical, on a section plane at x = 1.5, varying in z. */
const VERTICAL_WALL_FACE_AT_X: ReadonlyArray<readonly [number, number, number]> = [
    [1.5, 0, 0], [1.5, 0, 4], [1.5, 2.7, 4], [1.5, 2.7, 0],
];

/** A plan cut ring — HORIZONTAL, at a constant y. The case that always worked. */
const HORIZONTAL_PLAN_RING: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1.2, 0], [4, 1.2, 0], [4, 1.2, 0.3], [0, 1.2, 0.3],
];


/**
 * Distinct points in a built polygon. ⭐ THE DEFECT'S REAL SIGNATURE: a ring read on the WRONG
 * plane does not vanish — it collapses to TWO distinct points (a line with no area), which the
 * canvas then fills as nothing. "Returns []" was my first guess and it was less precise than the
 * bug; a 2-point polygon is what the audit actually described, and asserting the wrong shape
 * would have let a future regression produce a 2-point poché and still pass.
 */
function distinctPointCount(poly: { points: string }): number {
    return new Set(poly.points.split(' ')).size;
}

/** A polygon can enclose area only with 3+ distinct points. */
function enclosesArea(polys: ReadonlyArray<{ points: string }>): boolean {
    return polys.some((p) => distinctPointCount(p) >= 3);
}

describe('§SECTION-POCHE-HAS-A-PLANE — a vertical cut ring now fills', () => {
    it('⭐ a vertical wall face on a z-plane fills when read as `xy` — THIS FAILED BEFORE', () => {
        const buf = ringToSegments(VERTICAL_WALL_FACE_AT_Z);
        const filled = PocheFillBuilder.fromRawBuffer(buf, '#000000', 1, 0.002, 'xy');
        expect(filled.length).toBeGreaterThan(0);
        // And the points carry the real dimensions — 4 m wide, 2.7 m tall.
        const coords = filled[0]!.points.split(' ').map((p) => p.split(',').map(Number));
        const us = coords.map((c) => c[0]!);
        const vs = coords.map((c) => c[1]!);
        expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(4, 3);
        expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2.7, 3);
    });

    it('⭐ a vertical face on an x-plane fills when read as `zy`', () => {
        const buf = ringToSegments(VERTICAL_WALL_FACE_AT_X);
        expect(PocheFillBuilder.fromRawBuffer(buf, '#000000', 1, 0.002, 'zy').length)
            .toBeGreaterThan(0);
    });

    it('⛔ AND THE DEFECT IS REPRODUCED — read as `xz` it COLLAPSES to a 2-point line', () => {
        // The shipped behaviour before L-13269, kept as proof that the plane selector is
        // load-bearing rather than decorative.
        //
        // ⚠ CORRECTED WHILE WRITING THIS ARM. I first asserted `[]`. The real collapse is
        // finer and worse: reduced onto xz the four vertices become (0,2.5) (4,2.5) (4,2.5)
        // (0,2.5) — two of the four segments are degenerate and dropped, and the surviving two
        // stitch into a TWO-POINT loop. A polygon with two distinct points encloses no area, so
        // the canvas fills nothing — but it is NOT an empty result, and a test expecting `[]`
        // would have passed a future regression that emitted exactly this.
        const buf = ringToSegments(VERTICAL_WALL_FACE_AT_Z);
        const collapsed = PocheFillBuilder.fromRawBuffer(buf, '#000000', 1, 0.002, 'xz');
        expect(enclosesArea(collapsed), 'a wrong-plane read must enclose NO area').toBe(false);
        for (const poly of collapsed) expect(distinctPointCount(poly)).toBeLessThan(3);
    });

    it('⭐ and the CORRECT plane encloses real area — the two readings are not equivalent', () => {
        const buf = ringToSegments(VERTICAL_WALL_FACE_AT_Z);
        expect(enclosesArea(PocheFillBuilder.fromRawBuffer(buf, '#000000', 1, 0.002, 'xy'))).toBe(true);
        expect(enclosesArea(PocheFillBuilder.fromRawBuffer(buf, '#000000', 1, 0.002, 'xz'))).toBe(false);
    });
});

describe('§SECTION-POCHE-HAS-A-PLANE — the plan path is UNCHANGED', () => {
    it('⭐ a horizontal plan ring still fills, and `xz` is still the DEFAULT', () => {
        // ⛔ THE REGRESSION THAT WOULD MATTER MOST. Plan poché works today and ships in every
        // drawing; a plane selector that changed the default would break the case that works to
        // fix the case that does not.
        const buf = ringToSegments(HORIZONTAL_PLAN_RING);
        const explicit = PocheFillBuilder.fromRawBuffer(buf, '#cccccc', 0.5, 0.002, 'xz');
        const defaulted = PocheFillBuilder.fromRawBuffer(buf, '#cccccc', 0.5);
        expect(defaulted.length).toBeGreaterThan(0);
        expect(defaulted).toEqual(explicit);
    });

    it('the plan ring carries its real footprint — 4 m x 0.3 m', () => {
        const filled = PocheFillBuilder.fromRawBuffer(ringToSegments(HORIZONTAL_PLAN_RING), '#000', 1);
        const coords = filled[0]!.points.split(' ').map((p) => p.split(',').map(Number));
        const us = coords.map((c) => c[0]!);
        const vs = coords.map((c) => c[1]!);
        expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(4, 3);
        expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(0.3, 3);
    });

    it('⚠ a HORIZONTAL ring read as a VERTICAL plane also yields nothing — symmetry, not luck', () => {
        // The failure is not "xz is broken"; it is "the plane must match the ring". Pinning both
        // directions stops the next lane concluding that one plane is simply better.
        expect(enclosesArea(
            PocheFillBuilder.fromRawBuffer(ringToSegments(HORIZONTAL_PLAN_RING), '#000', 1, 0.002, 'xy'),
        )).toBe(false);
    });

    it('a degenerate segment is STILL dropped — that guard is correct and stays', () => {
        // Two coincident points carry no edge. What L-13269 changed is WHICH points are
        // coincident, never whether coincident points are dropped.
        expect(PocheFillBuilder.fromRawBuffer([0, 0, 0, 0, 0, 0], '#000', 1)).toEqual([]);
    });
});
