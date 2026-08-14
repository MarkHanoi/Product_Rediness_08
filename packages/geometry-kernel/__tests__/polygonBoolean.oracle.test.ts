/**
 * §C73-POLY-BOOLEAN — the ORACLE fixture for the 2-D polygon boolean (GE-05).
 *
 * C73 §6: a predicate exits its arm when it has an oracle fixture at a KNOWN
 * answer. Every expectation below is HAND-COMPUTED and the arithmetic is
 * written out in the comment above it — no expectation was read off a run.
 *
 * The case list is deliberately the known-killer list for boolean code:
 * disjoint · touching at a point · touching along an edge · nested · partial
 * overlap · identical rings · opposite winding · collinear/T-touch overlap ·
 * concave × concave (the case all three deferring sites refuse on) · a union
 * with a HOLE · a sliver at the declared tolerance · and the refusals.
 *
 * Cases E and I additionally carry an INDEPENDENT check: a grid rasterisation
 * that computes the area of A∩B and A∪B by sampling containment, which shares
 * no code path with the arrangement/chaining body under test.
 */

import { describe, it, expect } from 'vitest';
import {
    polygonBoolean2D,
    intersectPolygons2D,
    unionPolygons2D,
    type PolygonBooleanResult,
} from '../src/pure/polygonBoolean.js';
import { signedArea, type Pt2 } from '../src/pure/polygonOffset.js';
import { pointInRingEvenOdd } from '../src/pure/pointInPolygon.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function loopsOf(r: PolygonBooleanResult): readonly Pt2[][] {
    if (!r.ok) throw new Error(`expected ok, got refusal ${r.reason}: ${r.detail ?? ''}`);
    return r.loops;
}

/** Total signed area of the result — outer loops positive, holes negative, so this is the true area. */
function totalArea(r: PolygonBooleanResult): number {
    return loopsOf(r).reduce((acc, loop) => acc + signedArea(loop), 0);
}

function inRing(x: number, y: number, ring: ReadonlyArray<Pt2>): boolean {
    return pointInRingEvenOdd(x, y, ring.length, (i) => ring[i]![0], (i) => ring[i]![1]);
}

/**
 * INDEPENDENT area oracle. Samples cell centres on a regular grid and counts the
 * cells whose centre satisfies the set predicate. Shares NO code with the
 * arrangement/classification/chaining body — it never splits an edge, never
 * classifies a sub-edge and never chains a loop. Convergence is O(perimeter ×
 * cell), so the assertions below allow a margin sized to the grid, not to the
 * answer.
 */
function rasterArea(
    a: ReadonlyArray<Pt2>,
    b: ReadonlyArray<Pt2>,
    op: 'intersection' | 'union',
    step: number,
): number {
    const xs = [...a, ...b].map((p) => p[0]);
    const ys = [...a, ...b].map((p) => p[1]);
    const x0 = Math.min(...xs) - step;
    const x1 = Math.max(...xs) + step;
    const y0 = Math.min(...ys) - step;
    const y1 = Math.max(...ys) + step;
    let cells = 0;
    for (let x = x0 + step / 2; x < x1; x += step) {
        for (let y = y0 + step / 2; y < y1; y += step) {
            const ia = inRing(x, y, a);
            const ib = inRing(x, y, b);
            if (op === 'intersection' ? ia && ib : ia || ib) cells += 1;
        }
    }
    return cells * step * step;
}

/** The reference square: (0,0)–(4,4), CCW. Area = 4 × 4 = 16. */
const SQUARE: Pt2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];

// ─────────────────────────────────────────────────────────────────────────────

describe('§C73-POLY-BOOLEAN — the reference square', () => {
    it('the fixture itself is CCW with area 16 (so every expectation below is anchored)', () => {
        expect(signedArea(SQUARE)).toBe(16);
    });
});

describe('CASE A — DISJOINT', () => {
    // A = (0,0)–(4,4)          area 16
    // B = (10,0)–(14,4)        area 16
    // A ∩ B = ∅                area 0, 0 loops
    // A ∪ B = the two squares  area 32, 2 loops (a union need not be connected)
    const B: Pt2[] = [[10, 0], [14, 0], [14, 4], [10, 4]];

    it('intersection is EMPTY — zero loops, and that is a value, not a failure', () => {
        const r = intersectPolygons2D(SQUARE, B);
        expect(r.ok).toBe(true);
        expect(loopsOf(r)).toHaveLength(0);
    });

    it('union is the TWO squares — 2 loops, both positive, total area 16 + 16 = 32', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(2);
        for (const loop of loopsOf(r)) expect(signedArea(loop)).toBeCloseTo(16, 9);
        expect(totalArea(r)).toBeCloseTo(32, 9);
    });
});

describe('CASE B — TOUCHING AT A POINT (the classic pinch)', () => {
    // A = (0,0)–(4,4), B = (4,4)–(8,8). They share exactly the point (4,4).
    // A ∩ B = the single point (4,4) — zero area, no interior ⇒ EMPTY.
    // A ∪ B = one PINCHED loop through (4,4) twice, area 16 + 16 = 32.
    const B: Pt2[] = [[4, 4], [8, 4], [8, 8], [4, 8]];

    it('intersection of two squares meeting at ONE POINT is empty (a point has no interior)', () => {
        expect(loopsOf(intersectPolygons2D(SQUARE, B))).toHaveLength(0);
    });

    it('union is a single pinched loop of 8 vertices visiting (4,4) twice — area 32', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        const loop = loopsOf(r)[0]!;
        expect(loop).toHaveLength(8);
        const visits = loop.filter((p) => Math.abs(p[0] - 4) < 1e-9 && Math.abs(p[1] - 4) < 1e-9);
        expect(visits).toHaveLength(2);
        expect(totalArea(r)).toBeCloseTo(32, 9);
    });
});

describe('CASE C — TOUCHING ALONG A WHOLE EDGE (opposite-direction shared edge)', () => {
    // A = (0,0)–(4,4), B = (4,0)–(8,4). They share the entire segment x = 4, 0 ≤ y ≤ 4.
    // A traverses it (4,0)→(4,4); B traverses it (4,4)→(4,0) — OPPOSITE, so the
    // two interiors are on opposite sides:
    //   ∩ ⇒ zero-area contact ⇒ EMPTY.
    //   ∪ ⇒ the shared edge is INTERIOR ⇒ dropped ⇒ the 8×4 rectangle, area 32.
    const B: Pt2[] = [[4, 0], [8, 0], [8, 4], [4, 4]];

    it('intersection is empty — abutting squares share boundary, not interior', () => {
        expect(loopsOf(intersectPolygons2D(SQUARE, B))).toHaveLength(0);
    });

    it('union merges them into ONE rectangle of area 8 × 4 = 32, with the shared edge dissolved', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        expect(totalArea(r)).toBeCloseTo(32, 9);
        // The dissolved edge is gone: no boundary vertex sits at (4,2), the
        // midpoint of the shared edge. (The shared edge's ENDPOINTS survive as
        // collinear vertices — that is honest, not a defect.)
        const loop = loopsOf(r)[0]!;
        expect(loop.some((p) => Math.abs(p[0] - 4) < 1e-9 && Math.abs(p[1] - 2) < 1e-9)).toBe(false);
    });
});

describe('CASE D — NESTED (one wholly inside the other)', () => {
    // A = (0,0)–(4,4) area 16; B = (1,1)–(3,3) area 2 × 2 = 4.
    // A ∩ B = B (area 4). A ∪ B = A (area 16).
    const B: Pt2[] = [[1, 1], [3, 1], [3, 3], [1, 3]];

    it('intersection is the INNER ring — area 4', () => {
        const r = intersectPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        expect(totalArea(r)).toBeCloseTo(4, 9);
    });

    it('union is the OUTER ring — area 16, and the inner ring leaves no trace', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        expect(totalArea(r)).toBeCloseTo(16, 9);
        expect(loopsOf(r)[0]).toHaveLength(4);
    });
});

describe('CASE E — PARTIAL OVERLAP', () => {
    // A = (0,0)–(4,4) area 16; B = (2,2)–(6,6) area 16.
    // A ∩ B = the square (2,2)–(4,4) ⇒ 2 × 2 = 4.
    // A ∪ B = 16 + 16 − 4 = 28.
    const B: Pt2[] = [[2, 2], [6, 2], [6, 6], [2, 6]];

    it('intersection is the (2,2)–(4,4) square — 4 vertices, area 4', () => {
        const r = intersectPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        expect(loopsOf(r)[0]).toHaveLength(4);
        expect(totalArea(r)).toBeCloseTo(4, 9);
    });

    it('union area is 16 + 16 − 4 = 28', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        expect(totalArea(r)).toBeCloseTo(28, 9);
    });

    it('INDEPENDENT grid rasterisation agrees on both areas', () => {
        expect(rasterArea(SQUARE, B, 'intersection', 0.02)).toBeCloseTo(4, 1);
        expect(rasterArea(SQUARE, B, 'union', 0.02)).toBeCloseTo(28, 1);
    });
});

describe('CASE F — IDENTICAL RINGS (every edge shared, same direction)', () => {
    // Every sub-edge of A matches a sub-edge of B in the SAME direction, so it
    // is kept ONCE (from A) for both ops. ∩ = ∪ = the ring, area 16 — NOT a
    // doubled boundary, which is the failure this deduplication rule prevents.
    it('intersection of a ring with itself is that ring, once — area 16, 4 vertices', () => {
        const r = intersectPolygons2D(SQUARE, SQUARE);
        expect(loopsOf(r)).toHaveLength(1);
        expect(loopsOf(r)[0]).toHaveLength(4);
        expect(totalArea(r)).toBeCloseTo(16, 9);
    });

    it('union of a ring with itself is that ring, once — area 16, 4 vertices', () => {
        const r = unionPolygons2D(SQUARE, SQUARE);
        expect(loopsOf(r)).toHaveLength(1);
        expect(loopsOf(r)[0]).toHaveLength(4);
        expect(totalArea(r)).toBeCloseTo(16, 9);
    });
});

describe('CASE G — OPPOSITE WINDING', () => {
    // B is A reversed (CW). Winding is canonicalised to CCW on entry, so every
    // answer must be IDENTICAL to case F. A boolean that read the CW ring as
    // "the complement" would return the empty set or the whole plane here.
    const CW: Pt2[] = [...SQUARE].reverse();

    it('the fixture really is clockwise (area −16)', () => {
        expect(signedArea(CW)).toBe(-16);
    });

    it('CW ∩ CCW = the same square, area 16', () => {
        expect(totalArea(intersectPolygons2D(SQUARE, CW))).toBeCloseTo(16, 9);
    });

    it('CW ∪ CCW = the same square, area 16', () => {
        expect(totalArea(unionPolygons2D(SQUARE, CW))).toBeCloseTo(16, 9);
    });

    it('a CW input to a partial overlap gives the same answer as its CCW twin', () => {
        const B: Pt2[] = [[2, 2], [6, 2], [6, 6], [2, 6]];
        const Brev: Pt2[] = [...B].reverse();
        expect(totalArea(intersectPolygons2D(SQUARE, Brev))).toBeCloseTo(4, 9);
        expect(totalArea(unionPolygons2D(SQUARE, Brev))).toBeCloseTo(28, 9);
    });
});

describe('CASE H — COLLINEAR / T-TOUCH: a PARTIAL shared edge', () => {
    // A = (0,0)–(4,4). B = (4,1)–(8,3): B's left edge lies ON A's right edge but
    // covers only y ∈ [1,3]. B's vertices (4,1) and (4,3) fall in the INTERIOR
    // of A's edge — the T-touch that must split A's edge symmetrically.
    //   ∩ ⇒ EMPTY (interiors disjoint; shared edge runs opposite).
    //   ∪ ⇒ an L/T shape: 16 + (8−4)×(3−1) = 16 + 8 = 24.
    const B: Pt2[] = [[4, 1], [8, 1], [8, 3], [4, 3]];

    it('intersection is empty — a shared PART of an edge is still only boundary', () => {
        expect(loopsOf(intersectPolygons2D(SQUARE, B))).toHaveLength(0);
    });

    it('union area is 16 + 8 = 24, one loop, and it passes through the T-touch vertices', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        expect(totalArea(r)).toBeCloseTo(24, 9);
        const loop = loopsOf(r)[0]!;
        const has = (x: number, y: number): boolean =>
            loop.some((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9);
        expect(has(4, 1)).toBe(true);
        expect(has(4, 3)).toBe(true);
        // …and NOT through (4,2), the midpoint of the dissolved shared part.
        expect(has(4, 2)).toBe(false);
    });
});

describe('CASE I — CONCAVE × CONCAVE (the case all three GE-05 sites refuse on)', () => {
    // U = a 6×6 square with a 2-wide notch cut from the top:
    //   outer 6 × 6 = 36, notch x ∈ [2,4] × y ∈ [2,6] = 2 × 4 = 8 ⇒ area 28.
    const U: Pt2[] = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6]];
    // BAR = a horizontal band y ∈ [3,5] running clear across: 8 × 2 = 16.
    const BAR: Pt2[] = [[-1, 3], [7, 3], [7, 5], [-1, 5]];

    it('the U fixture is CCW with the hand-computed area 36 − 8 = 28', () => {
        expect(signedArea(U)).toBeCloseTo(28, 9);
        expect(signedArea(BAR)).toBeCloseTo(16, 9);
    });

    it('intersection is TWO DISJOINT REGIONS — the U’s two arms — 2 × (2 × 2) = 8', () => {
        // Left arm  x ∈ [0,2], y ∈ [3,5] ⇒ 2 × 2 = 4
        // Right arm x ∈ [4,6], y ∈ [3,5] ⇒ 2 × 2 = 4
        const r = intersectPolygons2D(U, BAR);
        expect(loopsOf(r)).toHaveLength(2);
        for (const loop of loopsOf(r)) expect(signedArea(loop)).toBeCloseTo(4, 9);
        expect(totalArea(r)).toBeCloseTo(8, 9);
    });

    it('union has a HOLE — the notch below the bar becomes enclosed', () => {
        // Total area = 28 + 16 − 8 = 36.
        // The trapped void is the notch slice x ∈ [2,4], y ∈ [2,3] ⇒ 2 × 1 = 2,
        // sealed below by the U at y = 2, at the sides by the U at x = 2 and
        // x = 4, and above by the bar at y = 3. It must come back as a NEGATIVE
        // loop, not be silently dropped (dropping it over-states buildable area
        // by 2 m² — the L-616 direction).
        const r = unionPolygons2D(U, BAR);
        const loops = loopsOf(r);
        const outer = loops.filter((l) => signedArea(l) > 0);
        const holes = loops.filter((l) => signedArea(l) < 0);
        expect(outer).toHaveLength(1);
        expect(holes).toHaveLength(1);
        expect(signedArea(holes[0]!)).toBeCloseTo(-2, 9);
        expect(signedArea(outer[0]!)).toBeCloseTo(38, 9);
        expect(totalArea(r)).toBeCloseTo(36, 9);
    });

    it('INDEPENDENT grid rasterisation agrees on both areas', () => {
        expect(rasterArea(U, BAR, 'intersection', 0.02)).toBeCloseTo(8, 1);
        expect(rasterArea(U, BAR, 'union', 0.02)).toBeCloseTo(36, 1);
    });
});

describe('CASE J — NEAR-DEGENERATE SLIVER AT THE DECLARED TOLERANCE', () => {
    // B's left edge sits 1e-4 m INSIDE A's right edge — an overlap strip
    // 0.0001 m wide × 2 m tall = 2e-4 m². That is BELOW COINCIDENT_M (1e-3 m):
    // the model declares those two boundaries to be THE SAME PLACE, so the
    // overlap is not a region the model can represent.
    //   ∩ ⇒ EMPTY. Not "a 0.0002 m² region" — reporting it would report a
    //       difference the tolerance policy says does not exist.
    //   ∪ ⇒ the two behave as if exactly abutting: 16 + 4.0001 × 2 − 2e-4 = 24.0
    const B: Pt2[] = [[4 - 1e-4, 1], [8, 1], [8, 3], [4 - 1e-4, 3]];

    it('an overlap thinner than COINCIDENT_M reads as NO overlap — decided, not accidental', () => {
        expect(loopsOf(intersectPolygons2D(SQUARE, B))).toHaveLength(0);
    });

    it('union closes cleanly at 24.0 m² — no sliver, no duplicated boundary', () => {
        const r = unionPolygons2D(SQUARE, B);
        expect(loopsOf(r)).toHaveLength(1);
        // 1e-3 margin: the answer is only defined to the declared point identity.
        expect(totalArea(r)).toBeCloseTo(24, 3);
    });
});

describe('REFUSALS — a failure is never encoded as an empty result (C73 §4.3)', () => {
    it('fewer than 3 distinct vertices ⇒ degenerate-input', () => {
        const r = intersectPolygons2D([[0, 0], [1, 1]], SQUARE);
        expect(r).toMatchObject({ ok: false, reason: 'degenerate-input' });
    });

    it('an all-collinear ring ⇒ degenerate-input (zero area, no interior)', () => {
        const r = intersectPolygons2D([[0, 0], [1, 0], [2, 0], [3, 0]], SQUARE);
        expect(r).toMatchObject({ ok: false, reason: 'degenerate-input' });
    });

    it('a non-finite ordinate ⇒ degenerate-input', () => {
        const r = intersectPolygons2D([[0, 0], [4, 0], [Number.NaN, 4], [0, 4]], SQUARE);
        expect(r).toMatchObject({ ok: false, reason: 'degenerate-input' });
    });

    it('a self-intersecting (bowtie) ring ⇒ self-intersecting-input, NOT a repaired answer', () => {
        const bowtie: Pt2[] = [[0, 0], [4, 4], [4, 0], [0, 4]];
        const r = intersectPolygons2D(bowtie, SQUARE);
        expect(r).toMatchObject({ ok: false, reason: 'self-intersecting-input' });
    });

    it('the refusal is symmetric — a bad SECOND argument refuses too', () => {
        const r = unionPolygons2D(SQUARE, [[0, 0], [1, 1]]);
        expect(r).toMatchObject({ ok: false, reason: 'degenerate-input' });
    });
});

describe('SYMMETRY — both delivered operations are commutative', () => {
    const cases: ReadonlyArray<readonly [string, Pt2[]]> = [
        ['partial overlap', [[2, 2], [6, 2], [6, 6], [2, 6]]],
        ['nested', [[1, 1], [3, 1], [3, 3], [1, 3]]],
        ['edge-touching', [[4, 0], [8, 0], [8, 4], [4, 4]]],
        ['disjoint', [[10, 0], [14, 0], [14, 4], [10, 4]]],
    ];
    for (const [name, B] of cases) {
        it(`${name}: area(A op B) === area(B op A) for both ops`, () => {
            for (const op of ['intersection', 'union'] as const) {
                const ab = polygonBoolean2D(SQUARE, B, op);
                const ba = polygonBoolean2D(B, SQUARE, op);
                expect(totalArea(ba)).toBeCloseTo(totalArea(ab), 9);
                expect(loopsOf(ba)).toHaveLength(loopsOf(ab).length);
            }
        });
    }
});

describe('INCLUSION–EXCLUSION — |A| + |B| = |A ∪ B| + |A ∩ B|', () => {
    // An identity the arrangement body never uses internally, so it is a real
    // cross-check on the two keep-rules rather than a restatement of one.
    const cases: ReadonlyArray<readonly [string, Pt2[], number]> = [
        ['partial overlap', [[2, 2], [6, 2], [6, 6], [2, 6]], 16],
        ['nested', [[1, 1], [3, 1], [3, 3], [1, 3]], 4],
        ['edge-touching', [[4, 0], [8, 0], [8, 4], [4, 4]], 16],
        ['disjoint', [[10, 0], [14, 0], [14, 4], [10, 4]], 16],
        ['T-touch partial edge', [[4, 1], [8, 1], [8, 3], [4, 3]], 8],
        ['identical', [[0, 0], [4, 0], [4, 4], [0, 4]], 16],
    ];
    for (const [name, B, areaB] of cases) {
        it(name, () => {
            const inter = totalArea(intersectPolygons2D(SQUARE, B));
            const uni = totalArea(unionPolygons2D(SQUARE, B));
            expect(uni + inter).toBeCloseTo(16 + areaB, 9);
        });
    }

    it('concave × concave: 28 + 16 = 36 + 8', () => {
        const U: Pt2[] = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6]];
        const BAR: Pt2[] = [[-1, 3], [7, 3], [7, 5], [-1, 5]];
        expect(
            totalArea(unionPolygons2D(U, BAR)) + totalArea(intersectPolygons2D(U, BAR)),
        ).toBeCloseTo(28 + 16, 9);
    });
});
