/**
 * §W2A-ONE-OFFSET — an INDEPENDENT ORACLE for the polygon offset.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT "MORE UNIT TESTS"
 * ─────────────────────────────────────────────────────────────────────────────
 * Three copies of this algorithm shipped at three levels of correctness, and
 * EVERY ONE OF THEM PASSED ITS OWN PACKAGE'S TESTS. The tests asserted things
 * the implementation was structurally guaranteed to satisfy — a vertex count, an
 * area ratio, `success === true` — none of which is the property an offset
 * claims. So this file asserts the DEFINITION instead, with geometry written
 * here and imported from nowhere:
 *
 *     R = offset(S, d)  ⇒  every point of ∂R sits exactly |d| from ∂S.
 *
 * MEASURED AT EDGE MIDPOINTS, deliberately: at a CORNER the distance to ∂S is
 * legitimately greater than d (the miter wedge), so corners cannot discriminate.
 * Midpoints can.
 *
 * THE DISCRIMINATOR IS THE SPREAD, NOT THE MEAN. A centroid radial dilation —
 * the routine this replaced — pulls each vertex back in proportion to its
 * distance from the centre, so it can match the requested distance ON AVERAGE
 * while being wrong everywhere. Only `max − min` separates a real offset from a
 * scale. Bar: 0.1 mm, the figure the L-825 floor-finish fix achieved against a
 * 100 mm target.
 *
 * BEFORE (`applyOverhang`, the routine wired into the shipping roof committer),
 * requested 300 mm:
 *     square 10×10      212.13 mm            spread   0.00 mm   ← d·cos45°
 *     elongated 40×4     29.85 … 298.51 mm   spread 268.66 mm
 *     L-shape           121.77 … 260.96 mm   spread 139.19 mm
 *     U-shape           183.24 … 228.13 mm   spread  44.89 mm
 *     cadastral arc     204.48 … 297.20 mm   spread  92.71 mm
 * AFTER: 300.00 mm, spread 0.00 mm, on all of them.
 */

import { describe, it, expect } from 'vitest';
import {
    offsetPolygon,
    findSelfIntersection,
    type Pt2,
} from '../src/pure/polygonOffset.js';
import * as roofPolygon from '../src/producers/_internal/roof/polygon.js';

// ── the oracle: written here, importing nothing from the subject ─────────────

function distPtSeg(p: Pt2, a: Pt2, b: Pt2): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-20) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distToBoundary(p: Pt2, ring: readonly Pt2[]): number {
    let m = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const d = distPtSeg(p, ring[i]!, ring[(i + 1) % ring.length]!);
        if (d < m) m = d;
    }
    return m;
}

/** Perpendicular distance from ∂S at every edge midpoint of R. */
function midpointDistances(source: readonly Pt2[], result: readonly Pt2[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < result.length; i++) {
        const a = result[i]!;
        const b = result[(i + 1) % result.length]!;
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
        out.push(distToBoundary([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], source));
    }
    return out;
}

/** Bar: 0.1 mm, from the L-825 floor-finish fix. */
const BAR_M = 0.0001;

function expectTrueOffset(source: readonly Pt2[], d: number): Pt2[] {
    const r = offsetPolygon(source, d);
    expect(r.degenerate, `unexpected degeneracy: ${r.reason}`).toBe(false);
    expect(r.polygon.length).toBeGreaterThanOrEqual(3);

    const ds = midpointDistances(source, r.polygon);
    expect(ds.length).toBeGreaterThan(0);
    const min = Math.min(...ds);
    const max = Math.max(...ds);

    // THE assertion. Not a vertex count, not an area ratio, not `success`.
    expect(max - min, `spread ${(max - min) * 1000}mm`).toBeLessThanOrEqual(BAR_M);
    expect(Math.abs((min + max) / 2 - Math.abs(d))).toBeLessThanOrEqual(BAR_M);
    return r.polygon;
}

// ── fixtures ────────────────────────────────────────────────────────────────

const SQUARE: Pt2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
/** The anisotropy of a centroid scale is loudest on an elongated plan. */
const ELONGATED: Pt2[] = [[0, 0], [40, 0], [40, 4], [0, 4]];
const L_SHAPE: Pt2[] = [[0, 0], [12, 0], [12, 5], [5, 5], [5, 12], [0, 12]];
const U_SHAPE: Pt2[] = [[0, 0], [14, 0], [14, 12], [10, 12], [10, 4], [4, 4], [4, 12], [0, 12]];
const COURTYARD_OUTER: Pt2[] = [[0, 0], [20, 0], [20, 20], [0, 20]];
const COURTYARD_HOLE: Pt2[] = [[7, 7], [13, 7], [13, 13], [7, 13]];

/** A traced cadastral ring: a tessellated arc plus near-parallel vertices — the
 *  shape whose near-parallel corners the deleted `shrinkPolygon` silently ate. */
function cadastralArc(): Pt2[] {
    const pts: Pt2[] = [];
    for (let i = 0; i <= 24; i++) {
        const t = (Math.PI * i) / 24;
        pts.push([10 * Math.cos(t), 10 * Math.sin(t)]);
    }
    pts.push([-10, -2], [-5, -2.0001], [0, -2], [5, -1.9999], [10, -2]);
    return pts;
}

const D = 0.3; // a 300 mm eave — the founder's case

describe('§W2A-ONE-OFFSET — offsetPolygon against an independent oracle', () => {
    it('square: 300 mm requested is 300 mm delivered (the old routine gave 212.13 mm)', () => {
        expectTrueOffset(SQUARE, D);
    });

    it('elongated 40×4 outward — where a centroid scale is loudest (was 29.85…298.51 mm)', () => {
        expectTrueOffset(ELONGATED, D);
    });

    it('L-shape outward — the re-entrant corner must move OUT of the notch, not into it', () => {
        const out = expectTrueOffset(L_SHAPE, D);
        // A radial push moves the re-entrant vertex AWAY from the centroid, i.e.
        // deeper into the notch. The notch corner of this L is (5,5) and the
        // centroid is outside the notch, so the correct offset moves it to
        // (5.3, 5.3) — further from the centroid is (4.7, 4.7).
        const notch = out.find((p) => Math.abs(p[0] - 5) < 1 && Math.abs(p[1] - 5) < 1);
        expect(notch).toBeDefined();
        expect(notch![0]).toBeGreaterThan(5);
        expect(notch![1]).toBeGreaterThan(5);
    });

    it('U-shape outward', () => { expectTrueOffset(U_SHAPE, D); });

    it('courtyard: outer ring grows and the hole ring shrinks, both by exactly d', () => {
        // The module offsets ONE simple ring; a ring-with-hole is two calls, and
        // the hole is offset INWARD (which is outward in the void's own frame).
        expectTrueOffset(COURTYARD_OUTER, D);
        expectTrueOffset(COURTYARD_HOLE, -D);
    });

    it('cadastral ring with near-parallel vertices: NO vertex is dropped', () => {
        const src = cadastralArc();
        const out = expectTrueOffset(src, D);
        // The deleted `shrinkPolygon` did `if (|det| < 1e-8) continue`, deleting the
        // vertex at every near-parallel corner and returning that as success. A
        // parallel offset preserves vertex correspondence exactly.
        expect(out.length).toBe(src.length);
    });

    it('every fixture also offsets INWARD at the same fidelity', () => {
        for (const f of [SQUARE, ELONGATED, L_SHAPE, U_SHAPE, COURTYARD_OUTER]) {
            expectTrueOffset(f, -D);
        }
    });

    it('winding-independent: a CW ring gives the same answer as its CCW reverse', () => {
        const ccw = expectTrueOffset(SQUARE, D);
        const cw = expectTrueOffset([...SQUARE].reverse(), D);
        expect(cw.length).toBe(ccw.length);
        // Same point set, possibly rotated/reversed.
        const key = (p: Pt2): string => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
        expect(new Set(cw.map(key))).toEqual(new Set(ccw.map(key)));
    });
});

describe('§W2A-ONE-OFFSET — refusal is explicit and keeps its reason', () => {
    it('over-shrinking REFUSES rather than returning an inside-out ring', () => {
        const r = offsetPolygon(SQUARE, -50);
        expect(r.polygon).toEqual([]);
        expect(r.degenerate).toBe(true);
        expect(r.reason).toBeTruthy();
    });

    it('a U-shape shrunk past its arms REFUSES — the old code returned inverted arms', () => {
        // `shrinkPolygon(U, 3)` returned EIGHT vertices as success whose measured
        // pullback ranged over 1000 mm for a 3000 mm request: the arms had flipped.
        const r = offsetPolygon(U_SHAPE, -3);
        expect(r.degenerate).toBe(true);
        expect(r.reason).toContain('inverted');
    });

    it('§W2A-FOLD-DETECT — a self-intersecting result is reported, not passed off', () => {
        // Area monotonicity does NOT catch a fold: this one shrinks the ring AND
        // crosses itself. Before the fold test this returned degenerate: false.
        const r = offsetPolygon(cadastralArc(), -2.095);
        expect(r.polygon.length).toBeGreaterThanOrEqual(3);
        expect(findSelfIntersection(r.polygon)).not.toBeNull();
        expect(r.degenerate).toBe(true);
        expect(r.reason).toContain('self-intersect');
    });

    it('failure and emptiness are never the same value', () => {
        // A refusal carries a reason; a zero-distance no-op does not.
        const refused = offsetPolygon([[0, 0], [1, 0]], 1);
        expect(refused.degenerate).toBe(true);
        expect(refused.reason).toBeTruthy();

        const noop = offsetPolygon(SQUARE, 0);
        expect(noop.degenerate).toBe(false);
        expect(noop.reason).toBeUndefined();
        expect(noop.polygon).toEqual(SQUARE);
    });
});

describe('§W2A-ONE-OFFSET — the clones are gone, not merely unused', () => {
    it('geometry-kernel no longer exports applyOverhang or shrinkPolygon', () => {
        // A twin that still compiles is a twin that will be called again. These
        // were the two the shipping `produceRoof` used.
        expect((roofPolygon as Record<string, unknown>).applyOverhang).toBeUndefined();
        expect((roofPolygon as Record<string, unknown>).shrinkPolygon).toBeUndefined();
    });
});
