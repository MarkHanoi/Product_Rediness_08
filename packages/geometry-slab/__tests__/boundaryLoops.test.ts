/**
 * boundaryLoops.test — §FEAT-PLATE-SHAPE-MODES, THE SEPARATING TEST.
 *
 * ─── WHAT MAKES THIS A SEPARATING TEST AND NOT A SMOKE TEST ───────────────────
 *
 * A test that only asserts "circularLoopVertices returned some points" passes for a
 * rectangle, for an octagon, and for a bug that ignores the radius. The model this
 * file follows is lane ROUND1's: state the properties that make a circle A CIRCLE,
 * then feed those same assertions two DELIBERATELY WRONG implementations and prove
 * the assertions reject both.
 *
 * The two wrong implementations are the two failures this feature can actually
 * have, not invented ones:
 *   • `RECTANGLE_CALLED_ROUND` — the mode switch falls through and the rectangular
 *     branch runs. This is the exact §L955 silent-fallback-to-rectangle failure that
 *     C86 PR-9 forbids for openings, and there is live precedent for it.
 *   • `EIGHT_FACET_STAIRCASE` — the parameterisation is right but the density is
 *     wrong, so the "circle" is a visibly faceted octagon. This is what a fixed
 *     segment count produces at large radii.
 *
 * ⭐ THE AREA ASSERTION IS THE ONE THAT SEPARATES, AND IT DOES SO BY CONSTRUCTION.
 * For semi-axes rx, rz the three candidates have DIFFERENT areas that no tolerance
 * can reconcile:
 *      true ellipse   π·rx·rz  ≈ 3.1416·rx·rz
 *      rectangle      4·rx·rz  ≈ 4.0000·rx·rz   (+27%)
 *      regular 8-gon  2√2·rx·rz ≈ 2.8284·rx·rz  (−10%)
 * So "a rectangle called round" cannot pass this file no matter how it is written.
 */

import { describe, it, expect } from 'vitest';
import {
    boundaryLoopVertices,
    boundaryLoopRefusal,
    circularLoopVertices,
    ellipticalLoopVertices,
    rectangularLoopVertices,
    loopSegmentCount,
    isBoundaryLoopMode,
    BOUNDARY_LOOP_MODES,
    BOUNDARY_LOOP_LABELS,
    MIN_LOOP_EXTENT_M,
    MIN_LOOP_SEGMENTS,
    MAX_LOOP_SEGMENTS,
    LOOP_CHORD_TOLERANCE_M,
    WALL_LOOP_DENSITY,
    PLATE_LOOP_DENSITY,
    type ArcVertex2D,
} from '../src/boundaryLoops';

// ─────────────────────────────────────────────────────────────────────────────
// The properties that make a ring the shape it claims to be
// ─────────────────────────────────────────────────────────────────────────────

/** Shoelace area of a ring, unsigned. */
function ringArea(ring: readonly ArcVertex2D[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** How far the worst vertex is from the true ellipse, in "radius units".
 *  0 means every vertex lies exactly ON the outline. */
function worstOutlineDeviation(
    ring: readonly ArcVertex2D[],
    centre: ArcVertex2D,
    rx: number,
    rz: number,
): number {
    let worst = 0;
    for (const p of ring) {
        const u = (p.x - centre.x) / rx;
        const v = (p.z - centre.z) / rz;
        worst = Math.max(worst, Math.abs(Math.hypot(u, v) - 1));
    }
    return worst;
}

/** The largest gap between a chord's midpoint and the true curve — the sagitta the
 *  density policy promises to bound. */
function worstSagitta(
    ring: readonly ArcVertex2D[],
    centre: ArcVertex2D,
    rx: number,
    rz: number,
): number {
    let worst = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        const mx = (p.x + q.x) / 2;
        const mz = (p.z + q.z) / 2;
        // Push the chord midpoint out to the ellipse along its own ray.
        const u = (mx - centre.x) / rx;
        const v = (mz - centre.z) / rz;
        const k = Math.hypot(u, v);
        if (k === 0) continue;
        const ex = centre.x + (mx - centre.x) / k;
        const ez = centre.z + (mz - centre.z) / k;
        worst = Math.max(worst, Math.hypot(ex - mx, ez - mz));
    }
    return worst;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TWO DELIBERATELY WRONG IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** ⛔ WRONG #1 — the mode switch fell through to the rectangular branch. */
function RECTANGLE_CALLED_ROUND(centre: ArcVertex2D, rx: number, rz: number): ArcVertex2D[] {
    return [
        { x: centre.x - rx, z: centre.z - rz },
        { x: centre.x + rx, z: centre.z - rz },
        { x: centre.x + rx, z: centre.z + rz },
        { x: centre.x - rx, z: centre.z + rz },
    ];
}

/** ⛔ WRONG #2 — right parameterisation, fixed (too coarse) segment count. */
function EIGHT_FACET_STAIRCASE(centre: ArcVertex2D, rx: number, rz: number): ArcVertex2D[] {
    const out: ArcVertex2D[] = [];
    for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        out.push({ x: centre.x + rx * Math.cos(t), z: centre.z + rz * Math.sin(t) });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────

const C: ArcVertex2D = { x: 3, z: -2 };

describe('§FEAT-PLATE-SHAPE-MODES — the vocabulary', () => {
    it('is the C86 adjective set, and the ellipse mode READS "Elliptical"', () => {
        expect(BOUNDARY_LOOP_MODES).toEqual(['rectangular', 'circular', 'elliptical']);
        expect(BOUNDARY_LOOP_LABELS.elliptical).toBe('Elliptical');
    });

    // ⭐ The founder wrote "eclipse". The reading is ELLIPSE and it is deliberately
    // VISIBLE, so this asserts the misspelling never reached the vocabulary.
    it('contains no "eclipse" anywhere in the mode ids or labels', () => {
        const all = [...BOUNDARY_LOOP_MODES, ...Object.values(BOUNDARY_LOOP_LABELS)].join(' ');
        expect(all.toLowerCase()).not.toContain('eclipse');
    });

    it('rejects a mode it does not implement (EI-3 — no offer without an arm)', () => {
        expect(isBoundaryLoopMode('circular')).toBe(true);
        expect(isBoundaryLoopMode('eclipse')).toBe(false);
        expect(isBoundaryLoopMode('ellipse')).toBe(false);   // handrail's spelling, L-1322
        expect(isBoundaryLoopMode('square')).toBe(false);    // handrail's spelling, L-1322
    });
});

describe('§FEAT-PLATE-SHAPE-MODES — a circle is a circle', () => {
    const R = 4;
    const ring = circularLoopVertices(C, { x: C.x + R, z: C.z });

    it('puts EVERY vertex ON the outline', () => {
        expect(ring.length).toBeGreaterThanOrEqual(MIN_LOOP_SEGMENTS);
        expect(worstOutlineDeviation(ring, C, R, R)).toBeLessThan(1e-12);
    });

    it('has the area of a circle, not of its bounding box', () => {
        expect(ringArea(ring)).toBeCloseTo(Math.PI * R * R, 0);
    });

    it('holds every chord within the declared tolerance of the true curve', () => {
        expect(worstSagitta(ring, C, R, R)).toBeLessThanOrEqual(LOOP_CHORD_TOLERANCE_M * 1.05);
    });

    it('is CCW and carries no duplicated closing vertex (C92 §12 R-5)', () => {
        let signed = 0;
        for (let i = 0; i < ring.length; i++) {
            const p = ring[i];
            const q = ring[(i + 1) % ring.length];
            signed += p.x * q.z - q.x * p.z;
        }
        expect(signed).toBeGreaterThan(0);
        const first = ring[0];
        const last = ring[ring.length - 1];
        expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeGreaterThan(1e-6);
    });
});

// ⭐⭐ THE SEPARATION. The same assertions, run against the two wrong implementations.
describe('§FEAT-PLATE-SHAPE-MODES — the separating half: both wrong builds are REJECTED', () => {
    const R = 4;
    const truth = circularLoopVertices(C, { x: C.x + R, z: C.z });

    it('⛔ REJECTS a rectangle called round — by area and by outline', () => {
        const wrong = RECTANGLE_CALLED_ROUND(C, R, R);
        // It fails the outline test: the corners are √2 radii out.
        expect(worstOutlineDeviation(wrong, C, R, R)).toBeGreaterThan(0.4);
        // And it fails the area test decisively: 4r² vs πr².
        expect(ringArea(wrong)).toBeCloseTo(4 * R * R, 0);
        expect(Math.abs(ringArea(wrong) - Math.PI * R * R)).toBeGreaterThan(1);
        // The real implementation passes the same assertion the fake fails.
        expect(ringArea(truth)).toBeCloseTo(Math.PI * R * R, 0);
    });

    it('⛔ REJECTS an 8-facet staircase — every vertex is ON the outline, yet it still fails', () => {
        const wrong = EIGHT_FACET_STAIRCASE(C, R, R);
        // ⚠ THE POINT OF THIS CASE: the vertex test ALONE cannot catch it.
        expect(worstOutlineDeviation(wrong, C, R, R)).toBeLessThan(1e-12);
        // The sagitta and area assertions are what separate it.
        expect(worstSagitta(wrong, C, R, R)).toBeGreaterThan(LOOP_CHORD_TOLERANCE_M * 10);
        expect(ringArea(wrong)).toBeCloseTo(2 * Math.SQRT2 * R * R, 0);
        expect(Math.abs(ringArea(wrong) - Math.PI * R * R)).toBeGreaterThan(1);
        // The real implementation clears the same bar.
        expect(worstSagitta(truth, C, R, R)).toBeLessThanOrEqual(LOOP_CHORD_TOLERANCE_M * 1.05);
    });

    it('the real circle is NOT the rectangle and NOT the octagon (vertex counts differ)', () => {
        expect(truth.length).not.toBe(4);
        expect(truth.length).not.toBe(8);
        expect(truth.length).toBeGreaterThan(8);
    });
});

describe('§FEAT-PLATE-SHAPE-MODES — the ellipse', () => {
    const RX = 6, RZ = 2;
    const ring = ellipticalLoopVertices(C, { x: C.x + RX, z: C.z + RZ });

    it('puts every vertex on the ellipse and has area π·rx·rz', () => {
        expect(worstOutlineDeviation(ring, C, RX, RZ)).toBeLessThan(1e-12);
        expect(ringArea(ring)).toBeCloseTo(Math.PI * RX * RZ, 0);
    });

    it('is NOT its bounding rectangle', () => {
        expect(Math.abs(ringArea(ring) - 4 * RX * RZ)).toBeGreaterThan(1);
    });

    // ⭐ The graceful degeneracy the header promises — it must be REAL, not aspirational.
    it('degenerates to a circle when the two semi-axes are equal, rather than refusing', () => {
        const square = ellipticalLoopVertices(C, { x: C.x + 3, z: C.z + 3 });
        const circle = circularLoopVertices(C, { x: C.x + 3, z: C.z });
        expect(square.length).toBe(circle.length);
        expect(ringArea(square)).toBeCloseTo(ringArea(circle), 6);
    });
});

describe('§FEAT-PLATE-SHAPE-MODES — density policy', () => {
    it('gives a LARGER loop more segments than a smaller one', () => {
        expect(loopSegmentCount(20)).toBeGreaterThan(loopSegmentCount(1));
    });

    it('clamps to the declared floor and cap', () => {
        expect(loopSegmentCount(0.06)).toBeGreaterThanOrEqual(MIN_LOOP_SEGMENTS);
        expect(loopSegmentCount(10_000)).toBeLessThanOrEqual(MAX_LOOP_SEGMENTS);
    });

    it('returns 0 — never a silent default — for a nonsense radius', () => {
        expect(loopSegmentCount(0)).toBe(0);
        expect(loopSegmentCount(-1)).toBe(0);
        expect(loopSegmentCount(Number.NaN)).toBe(0);
    });
});

describe('§FEAT-PLATE-SHAPE-MODES — refusals name a reason AND a way forward (C16 CA-18)', () => {
    const tiny = { x: C.x + 0.001, z: C.z + 0.001 };

    it('refuses a degenerate gesture with an EMPTY ring, never a fallback rectangle', () => {
        // ⛔ §L955 / C86 PR-9: a silent fall-back to a rectangle is the forbidden outcome.
        for (const mode of BOUNDARY_LOOP_MODES) {
            expect(boundaryLoopVertices(mode, C, tiny)).toEqual([]);
        }
    });

    it('every mode has a refusal sentence carrying the limit and the next action', () => {
        for (const mode of BOUNDARY_LOOP_MODES) {
            const reason = boundaryLoopRefusal(mode, C, tiny);
            expect(reason).toBeTruthy();
            expect(reason).toContain(MIN_LOOP_EXTENT_M.toFixed(2));
            expect(reason!.length).toBeGreaterThan(30);
        }
    });

    it('stays SILENT when the gesture is fine — a refusal that always fires is not a gate', () => {
        const good = { x: C.x + 5, z: C.z + 5 };
        for (const mode of BOUNDARY_LOOP_MODES) {
            expect(boundaryLoopRefusal(mode, C, good)).toBeNull();
        }
    });
});

describe('§FEAT-PLATE-SHAPE-MODES — the rectangular mode is the tools’ existing gesture', () => {
    it('is the axis-aligned box through two opposite corners, CCW from the min corner', () => {
        const r = rectangularLoopVertices({ x: 5, z: 1 }, { x: 1, z: 4 });
        expect(r).toEqual([
            { x: 1, z: 1 },
            { x: 5, z: 1 },
            { x: 5, z: 4 },
            { x: 1, z: 4 },
        ]);
    });

    it('dispatches through the one entry point identically', () => {
        const a = { x: 0, z: 0 }, b = { x: 4, z: 3 };
        expect(boundaryLoopVertices('rectangular', a, b)).toEqual(rectangularLoopVertices(a, b));
        expect(boundaryLoopVertices('circular', a, b)).toEqual(circularLoopVertices(a, b));
        expect(boundaryLoopVertices('elliptical', a, b)).toEqual(ellipticalLoopVertices(a, b));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FEAT-WALL-SHAPE-MODES — the density policy is PER-FAMILY, and that is testable
// ─────────────────────────────────────────────────────────────────────────────

describe('§FEAT-WALL-SHAPE-MODES — a wall run is COARSER than a plate outline, deliberately', () => {
    const R = 4;
    const rim = { x: C.x + R, z: C.z };

    it('a 4 m circular WALL run emits far fewer chords than the same plate boundary', () => {
        const wall  = circularLoopVertices(C, rim, WALL_LOOP_DENSITY);
        const plate = circularLoopVertices(C, rim, PLATE_LOOP_DENSITY);
        expect(wall.length).toBeLessThan(plate.length);
        // ⭐ THE POINT: each wall chord is a REAL element with an id, a schedule row and
        // two junctions. The plate policy would emit ~64 walls of ~390 mm — a nonsense
        // model. This asserts the wall run stays in buildable territory.
        expect(wall.length).toBeLessThanOrEqual(24);
        expect(wall.length).toBeGreaterThanOrEqual(8);
        const chord = (2 * Math.PI * R) / wall.length;
        expect(chord).toBeGreaterThan(1.0);
    });

    it('is STILL a circle — coarser density must not mean a wrong shape', () => {
        const wall = circularLoopVertices(C, rim, WALL_LOOP_DENSITY);
        // Every vertex still lies exactly ON the circle...
        expect(worstOutlineDeviation(wall, C, R, R)).toBeLessThan(1e-12);
        // ...and it is still nearer a circle than its bounding box is.
        expect(Math.abs(ringArea(wall) - 4 * R * R)).toBeGreaterThan(1);
    });

    it('⛔ REJECTS a rectangle called round under the WALL policy too', () => {
        const wrong = RECTANGLE_CALLED_ROUND(C, R, R);
        const wall  = circularLoopVertices(C, rim, WALL_LOOP_DENSITY);
        expect(wrong.length).toBe(4);
        expect(wall.length).toBeGreaterThan(4);
        expect(worstOutlineDeviation(wrong, C, R, R)).toBeGreaterThan(0.4);
        expect(worstOutlineDeviation(wall,  C, R, R)).toBeLessThan(1e-12);
    });

    it('the DEFAULT is the plate policy, so no existing caller changed behaviour', () => {
        expect(circularLoopVertices(C, rim)).toEqual(circularLoopVertices(C, rim, PLATE_LOOP_DENSITY));
        expect(loopSegmentCount(R)).toBe(loopSegmentCount(R, PLATE_LOOP_DENSITY));
    });
});
