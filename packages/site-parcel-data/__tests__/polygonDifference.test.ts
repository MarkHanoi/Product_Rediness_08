// §K1-POLY-DIFFERENCE — THE ORACLE TABLE for `A ∖ B` (polygonDifference.ts).
//
// The kernel boolean's header (§C73-POLY-BOOLEAN) forbade a difference op "without the same
// oracle table the two delivered ops carry". This file IS that table, four independent arms:
//
//   1. HAND-COMPUTED CASES — closed-form fixtures covering every keep-rule branch: disjoint,
//      identical, contained, corner/notch/split overlap, shared collinear edges (the alineación
//      degeneracy, both orientations), the annulus (hole first-class in the result), and the
//      typed refusals.
//   2. INDEPENDENT HALF-PLANE ORACLE — for a CONVEX subtrahend, |A ∖ B| decomposes exactly into
//      Σ_i |A ∩ H_1 ∩ … ∩ H_{i-1} ∩ ¬H_i| over B's half-planes: disjoint pieces computed by an
//      oracle S-H clipper WRITTEN IN THIS FILE (it shares no code with the op under test), over a
//      seeded corpus of concave subjects × convex subtrahends.
//   3. DIFFERENTIAL ARM — the partition identity |A| = |A∩B| + |A∖B|, with |A∩B| from the
//      kernel's PROVEN `intersectPolygons2D`, over an adversarial corpus (concave×concave,
//      collinear shared edges, hole-touching-boundary, near-tolerance slivers), within the
//      declared resolution bound COINCIDENT_M × (P_A + P_B) / 2.
//   4. GRID POINT ORACLE — even-odd membership of the result parts equals (∈A ∧ ∉B) for every
//      grid point further than 2·COINCIDENT_M from both boundaries, via an in-test even-odd.
//
// Plus §K1-CARVE — the inward-bias contract of `carveHolesToSimpleRings`: the carved area NEVER
// exceeds the exact difference (the assertion that goes red NAMING THE GAINED AREA if the bias
// direction is ever flipped), loses exactly the bridge slit, and no carved point lies in a hole.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import { COINCIDENT_M, intersectPolygons2D, polygonSignedArea2D } from '@pryzm/geometry-kernel';
import {
    CARVE_SLIT_WIDTH_M,
    carveHolesToSimpleRings,
    differencePartsAreaM2,
    differenceRings2D,
    type PolygonDifferencePart,
} from '../src/geometry/polygonDifference.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────────────────────
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
];
const area = (ring: ReadonlyArray<Pt>): number =>
    Math.abs(polygonSignedArea2D(ring.map((p) => [p.x, p.z] as [number, number])));
const perimeter = (ring: ReadonlyArray<Pt>): number => {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        s += Math.hypot(q.x - p.x, q.z - p.z);
    }
    return s;
};
/** The kernel's declared symmetric resolution bound for a ring pair, plus float slack. */
const resolutionBound = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>): number =>
    (COINCIDENT_M * (perimeter(a) + perimeter(b))) / 2 + 1e-6;

// ── Independent even-odd membership (NOT the kernel's — an oracle must not share its subject) ──
function evenOddInRing(px: number, pz: number, ring: ReadonlyArray<Pt>): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.z > pz !== b.z > pz && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}
const inParts = (px: number, pz: number, parts: ReadonlyArray<PolygonDifferencePart>): boolean =>
    parts.some((p) => evenOddInRing(px, pz, p.outer) && !p.holes.some((h) => evenOddInRing(px, pz, h)));
const distToRing = (px: number, pz: number, ring: ReadonlyArray<Pt>): number => {
    let best = Infinity;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const rx = b.x - a.x;
        const rz = b.z - a.z;
        const len2 = rx * rx + rz * rz;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * rx + (pz - a.z) * rz) / len2));
        best = Math.min(best, Math.hypot(px - (a.x + t * rx), pz - (a.z + t * rz)));
    }
    return best;
};

// ── Independent half-plane S-H clipper (oracle arm 2 — written fresh, shares nothing) ─────────
/** Clip `ring` to {a·x + b·z + c ≥ 0}. */
function oracleClipHalfPlane(ring: ReadonlyArray<Pt>, a: number, b: number, c: number): Pt[] {
    const out: Pt[] = [];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % n]!;
        const dp = a * p.x + b * p.z + c;
        const dq = a * q.x + b * q.z + c;
        if (dp >= 0) out.push(p);
        if (dp >= 0 !== dq >= 0) {
            const t = dp / (dp - dq);
            out.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
        }
    }
    return out;
}
/** CCW-orient a ring (oracle-local). */
function oracleCcw(ring: ReadonlyArray<Pt>): Pt[] {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        s += p.x * q.z - q.x * p.z;
    }
    return s >= 0 ? ring.slice() : ring.slice().reverse();
}
/**
 * |A ∖ B| for CONVEX B by the disjoint half-plane decomposition:
 * piece_i = A ∩ H_1 ∩ … ∩ H_{i-1} ∩ ¬H_i (inside the first i−1 half-planes of B, outside the
 * i-th). The pieces are pairwise disjoint and their union is exactly A ∖ B.
 */
function oracleConvexDifferenceArea(subject: ReadonlyArray<Pt>, convexB: ReadonlyArray<Pt>): number {
    const b = oracleCcw(convexB);
    // CCW edge (p → q): interior is the LEFT side, i.e. {(-dz)·x + (dx)·z + (dz·px − dx·pz) ≥ 0}.
    const halfPlanes = b.map((p, i) => {
        const q = b[(i + 1) % b.length]!;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        return { a: -dz, b: dx, c: dz * p.x - dx * p.z };
    });
    let total = 0;
    for (let i = 0; i < halfPlanes.length; i++) {
        let piece = subject.slice();
        for (let j = 0; j < i && piece.length >= 3; j++) {
            const h = halfPlanes[j]!;
            piece = oracleClipHalfPlane(piece, h.a, h.b, h.c);
        }
        const h = halfPlanes[i]!;
        if (piece.length >= 3) piece = oracleClipHalfPlane(piece, -h.a, -h.b, -h.c); // ¬H_i
        if (piece.length >= 3) total += area(piece);
    }
    return total;
}

// ── Seeded PRNG (deterministic corpus — mulberry32) ───────────────────────────────────────────
function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6d2b79f5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
/** A random SIMPLE (star-shaped about its centre) concave ring. */
function randomStarRing(rnd: () => number, cx: number, cz: number, rMin: number, rMax: number, n: number): Pt[] {
    const angles: number[] = [];
    for (let i = 0; i < n; i++) angles.push(rnd() * 2 * Math.PI);
    angles.sort((u, v) => u - v);
    // Reject near-duplicate angles (sliver spokes) by nudging deterministically.
    for (let i = 1; i < n; i++) {
        if (angles[i]! - angles[i - 1]! < 0.05) angles[i] = angles[i - 1]! + 0.05;
    }
    return angles.map((a) => {
        const r = rMin + (rMax - rMin) * rnd();
        return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) };
    });
}
/** A random convex ring (hull of a random point cloud) — oracle-arm subtrahends. */
function randomConvexRing(rnd: () => number, cx: number, cz: number, r: number, n: number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
        pts.push({ x: cx + (rnd() * 2 - 1) * r, z: cz + (rnd() * 2 - 1) * r });
    }
    // Gift-wrap hull (oracle-local, independent).
    pts.sort((u, v) => u.x - v.x || u.z - v.z);
    const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const lower: Pt[] = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: Pt[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i]!;
        while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-POLY-DIFFERENCE arm 1 — the hand-computed case table', () => {
    const A = rect(0, 0, 10, 10); // 100 m²

    it('disjoint B → A unchanged (one part, no holes)', () => {
        const d = differenceRings2D(A, rect(20, 0, 30, 10));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(0);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(100, 9);
    });

    it('A ∖ A → genuinely empty (an answer, not an error)', () => {
        const d = differenceRings2D(A, rect(0, 0, 10, 10));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(0);
    });

    it('A ⊂ B → empty', () => {
        const d = differenceRings2D(A, rect(-5, -5, 15, 15));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(0);
    });

    it('corner overlap → the L-shape, exactly 75 m²', () => {
        const d = differenceRings2D(A, rect(5, 5, 15, 15));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(0);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(75, 9);
        expect(d.parts[0]!.outer).toHaveLength(6); // an L has six corners
    });

    it('edge notch (B pokes through the bottom edge) → 80 m², simply connected', () => {
        const d = differenceRings2D(A, rect(3, -5, 7, 5));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(0);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(80, 9);
    });

    it('⭐ ANNULUS — B strictly inside A comes back as ONE part with ONE first-class hole', () => {
        const d = differenceRings2D(A, rect(3, 3, 7, 7));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(1);
        expect(area(d.parts[0]!.outer)).toBeCloseTo(100, 9);
        expect(area(d.parts[0]!.holes[0]!)).toBeCloseTo(16, 9);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(84, 9);
    });

    it('B splits A into two pieces → two parts, 40 m² each', () => {
        const d = differenceRings2D(A, rect(4, -1, 6, 11));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(2);
        const areas = d.parts.map((p) => area(p.outer)).sort((u, v) => u - v);
        expect(areas[0]).toBeCloseTo(40, 9);
        expect(areas[1]).toBeCloseTo(40, 9);
    });

    it('⭐ COLLINEAR SHARED EDGE, external abut (the alineación degeneracy) → A intact', () => {
        // B abuts A along A's whole right edge — collinear-coincident by construction, the exact
        // case Greiner–Hormann breaks on and the arrangement handles by endpoint identity.
        const d = differenceRings2D(A, rect(10, 0, 20, 10));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(100, 9);
    });

    it('⭐ COLLINEAR SHARED EDGE, internal strip (B inside A sharing three edge runs) → 50 m²', () => {
        const d = differenceRings2D(A, rect(5, 0, 10, 10));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(0);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(50, 9);
    });

    it('hole TOUCHING the boundary (shares a bottom-edge run) → simply connected, 84 m², no hole', () => {
        const d = differenceRings2D(A, rect(3, 0, 7, 4));
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(0);
        expect(differencePartsAreaM2(d.parts)).toBeCloseTo(84, 9);
    });

    it('concave subject: U-shape minus the blocker that seals its mouth → two towers', () => {
        // U: outer 10×10 with the top-middle bitten down to z=2 between x=3..7.
        const U: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 7, z: 10 },
            { x: 7, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 10 }, { x: 0, z: 10 },
        ];
        const d = differenceRings2D(U, rect(-1, 6, 11, 11)); // shave everything above z=6
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        // |U| = 100 − 4×8 = 68; removed = U ∩ {z ≥ 6} = the two tower tops, 3×4 each = 24.
        // The base connects what remains, so the answer is ONE part of 44 m².
        expect(d.parts).toHaveLength(1);
        expect(d.parts[0]!.holes).toHaveLength(0);
        expect(d.parts.reduce((s, p) => s + area(p.outer), 0)).toBeCloseTo(44, 9);
    });

    it('winding-independence: CW inputs give the same answer', () => {
        const d1 = differenceRings2D(A, rect(5, 5, 15, 15));
        const d2 = differenceRings2D(A.slice().reverse(), rect(5, 5, 15, 15).reverse());
        expect(d1.ok && d2.ok).toBe(true);
        if (!d1.ok || !d2.ok) return;
        expect(differencePartsAreaM2(d2.parts)).toBeCloseTo(differencePartsAreaM2(d1.parts), 9);
    });

    it('typed refusals: degenerate and self-intersecting inputs are NAMED, never repaired', () => {
        const twoPts = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
        const bowtie: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 8 }, { x: 10, z: 0 }, { x: 0, z: 8 }];
        const collinear: Pt[] = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }];
        const d1 = differenceRings2D(twoPts, A);
        expect(d1.ok === false && d1.reason).toBe('degenerate-input');
        const d2 = differenceRings2D(A, bowtie);
        expect(d2.ok === false && d2.reason).toBe('self-intersecting-input');
        const d3 = differenceRings2D(collinear, A);
        expect(d3.ok === false && d3.reason).toBe('degenerate-input');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-POLY-DIFFERENCE arm 2 — independent half-plane oracle (convex subtrahends)', () => {
    it('matches the disjoint half-plane decomposition over a seeded concave×convex corpus', () => {
        const rnd = mulberry32(0x51a7);
        expect.hasAssertions();
        let compared = 0;
        for (let trial = 0; trial < 60; trial++) {
            const subject = randomStarRing(rnd, 0, 0, 6, 14, 9 + Math.floor(rnd() * 6));
            const sub = randomConvexRing(rnd, (rnd() * 2 - 1) * 12, (rnd() * 2 - 1) * 12, 8, 8);
            if (sub.length < 3) continue;
            const d = differenceRings2D(subject, sub);
            if (!d.ok) continue; // a refusal draws nothing and cannot overstate — not a miss
            const got = differencePartsAreaM2(d.parts);
            const want = oracleConvexDifferenceArea(subject, sub);
            expect(
                Math.abs(got - want),
                `trial ${trial}: op ${got.toFixed(6)} m² vs half-plane oracle ${want.toFixed(6)} m² ` +
                    `(Δ ${(got - want).toFixed(6)} m² — a positive Δ is GAINED area)`,
            ).toBeLessThanOrEqual(resolutionBound(subject, sub));
            compared++;
        }
        // "Looked nowhere" is not a pass — the corpus must actually exercise the op.
        expect(compared).toBeGreaterThanOrEqual(45);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-POLY-DIFFERENCE arm 3 — the partition identity |A| = |A∩B| + |A∖B|', () => {
    const checkIdentity = (a: Pt[], b: Pt[], label: string): boolean => {
        const d = differenceRings2D(a, b);
        const x = intersectPolygons2D(
            a.map((p) => [p.x, p.z] as [number, number]),
            b.map((p) => [p.x, p.z] as [number, number]),
        );
        if (!d.ok || !x.ok) return false;
        const inter = x.loops.reduce((s, l) => s + Math.abs(polygonSignedArea2D(l)), 0);
        const diff = differencePartsAreaM2(d.parts);
        expect(
            Math.abs(area(a) - (inter + diff)),
            `${label}: |A|=${area(a).toFixed(6)} vs |A∩B|+|A∖B|=${(inter + diff).toFixed(6)} ` +
                `(Δ ${(inter + diff - area(a)).toFixed(6)} m²)`,
        ).toBeLessThanOrEqual(resolutionBound(a, b));
        return true;
    };

    it('holds on the whole hand-computed table geometry', () => {
        const A = rect(0, 0, 10, 10);
        expect(checkIdentity(A, rect(5, 5, 15, 15), 'corner')).toBe(true);
        expect(checkIdentity(A, rect(3, 3, 7, 7), 'annulus')).toBe(true);
        expect(checkIdentity(A, rect(3, 0, 7, 4), 'edge-touching hole')).toBe(true);
        expect(checkIdentity(A, rect(5, 0, 10, 10), 'shared-edge strip')).toBe(true);
        expect(checkIdentity(A, rect(4, -1, 6, 11), 'splitter')).toBe(true);
    });

    it('holds over a seeded concave×concave adversarial corpus', () => {
        const rnd = mulberry32(20260902);
        let resolved = 0;
        for (let trial = 0; trial < 80; trial++) {
            const a = randomStarRing(rnd, 0, 0, 5, 12, 8 + Math.floor(rnd() * 7));
            const b = randomStarRing(rnd, (rnd() * 2 - 1) * 10, (rnd() * 2 - 1) * 10, 4, 11, 8 + Math.floor(rnd() * 7));
            if (checkIdentity(a, b, `concave trial ${trial}`)) resolved++;
        }
        expect(resolved).toBeGreaterThanOrEqual(60); // refusals allowed, blanket refusal is not
    });

    it('holds on NEAR-TOLERANCE SLIVER subtrahends (or refuses — never a gain beyond the bound)', () => {
        const A = rect(0, 0, 10, 10);
        // A 0.5 mm-tall sliver crossing A: below the 1 mm identity, the model cannot represent
        // its bite. Honest outcomes: a degenerate-input refusal (the sliver dedupes away), or an
        // answer within the declared bound. A gain beyond the bound is the one forbidden outcome.
        const sliver: Pt[] = [
            { x: -1, z: 5 }, { x: 11, z: 5.0005 }, { x: 11, z: 5.001 }, { x: -1, z: 5.0005 },
        ];
        const d = differenceRings2D(A, sliver);
        if (d.ok) {
            const got = differencePartsAreaM2(d.parts);
            const exact = 100 - 10 * 0.0005; // ≈ |A| − sliver∩A (a ~0.5 mm band across A's 10 m width)
            expect(
                got - exact,
                `sliver: op granted ${got.toFixed(6)} m² vs exact ${exact.toFixed(6)} m² — ` +
                    `GAINED ${(got - exact).toFixed(6)} m²`,
            ).toBeLessThanOrEqual(resolutionBound(A, sliver));
        } else {
            expect(['degenerate-input', 'self-intersecting-input', 'unresolved-topology']).toContain(d.reason);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-POLY-DIFFERENCE arm 4 — grid point-membership oracle', () => {
    const cases: Array<{ label: string; a: Pt[]; b: Pt[] }> = [
        { label: 'annulus', a: rect(0, 0, 10, 10), b: rect(3, 3, 7, 7) },
        { label: 'corner', a: rect(0, 0, 10, 10), b: rect(5, 5, 15, 15) },
        { label: 'shared-edge strip', a: rect(0, 0, 10, 10), b: rect(5, 0, 10, 10) },
        {
            label: 'concave U vs blocker',
            a: [
                { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 7, z: 10 },
                { x: 7, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 10 }, { x: 0, z: 10 },
            ],
            b: rect(-1, 6, 11, 11),
        },
    ];
    for (const { label, a, b } of cases) {
        it(`membership matches (∈A ∧ ∉B) on ${label}`, () => {
            const d = differenceRings2D(a, b);
            expect(d.ok).toBe(true);
            if (!d.ok) return;
            let checked = 0;
            for (let ix = 0; ix <= 40; ix++) {
                for (let iz = 0; iz <= 40; iz++) {
                    const px = -1.3 + (12.6 * ix) / 40;
                    const pz = -1.3 + (12.6 * iz) / 40;
                    // Boundary band excluded: within 2·COINCIDENT_M of either input boundary the
                    // model declares "the same place" and membership is not a fact.
                    if (distToRing(px, pz, a) < 2 * COINCIDENT_M) continue;
                    if (distToRing(px, pz, b) < 2 * COINCIDENT_M) continue;
                    const want = evenOddInRing(px, pz, a) && !evenOddInRing(px, pz, b);
                    expect(
                        inParts(px, pz, d.parts),
                        `${label}: point (${px.toFixed(3)}, ${pz.toFixed(3)}) — want ${want}`,
                    ).toBe(want);
                    checked++;
                }
            }
            expect(checked).toBeGreaterThan(1000);
        });
    }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-CARVE — the inward-biased bridge to simple rings', () => {
    const OUTER = rect(0, 0, 100, 100); // 10,000 m²
    const COURTYARD = rect(35, 35, 65, 65); // 900 m²

    it('⭐ THE BIAS CONTRACT — a bridged carve NEVER gains area over the exact difference', () => {
        const out = carveHolesToSimpleRings(OUTER, [COURTYARD]);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        const exact = 10_000 - 900;
        const carved = out.rings.reduce((s, r) => s + area(r), 0);
        // ⛔ THE UNDER-COVERAGE ASSERTION. If the bias direction is ever flipped, this line goes
        // red NAMING THE GAINED AREA — that is its entire purpose (lane-K1 falsification arm).
        expect(
            carved - exact,
            `carve GAINED ${(carved - exact).toFixed(6)} m² over the exact ${exact} m² — ` +
                'the forbidden direction (C58 §1.4 / L-616)',
        ).toBeLessThanOrEqual(1e-9);
        // And it loses STRICTLY the slit — a real, positive, bounded, reported loss.
        expect(out.rings).toHaveLength(1);
        expect(out.holesCarved).toBe(1);
        expect(out.slitAreaLostM2).toBeGreaterThan(0);
        expect(carved + out.slitAreaLostM2).toBeCloseTo(exact, 6);
        // Corridor ≤ (hole→boundary distance + hole half-width + bbox margin) × slit width.
        expect(out.slitAreaLostM2).toBeLessThanOrEqual(CARVE_SLIT_WIDTH_M * 55);
    });

    it('no carved point lies inside the hole (grid oracle on the bridged ring)', () => {
        const out = carveHolesToSimpleRings(OUTER, [COURTYARD]);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        let inHole = 0;
        for (let ix = 0; ix <= 60; ix++) {
            for (let iz = 0; iz <= 60; iz++) {
                const px = (100 * ix) / 60;
                const pz = (100 * iz) / 60;
                const inRings = out.rings.some((r) => evenOddInRing(px, pz, r));
                if (inRings && evenOddInRing(px, pz, COURTYARD) && distToRing(px, pz, COURTYARD) > 2 * COINCIDENT_M) {
                    inHole++;
                }
            }
        }
        expect(inHole).toBe(0);
    });

    it('a hole that reaches the boundary carves EXACTLY — no slit, no loss', () => {
        const out = carveHolesToSimpleRings(OUTER, [rect(35, 0, 65, 30)]);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.slitAreaLostM2).toBe(0);
        expect(out.rings.reduce((s, r) => s + area(r), 0)).toBeCloseTo(10_000 - 900, 6);
    });

    it('a disjoint hole costs nothing at all', () => {
        const out = carveHolesToSimpleRings(OUTER, [rect(200, 200, 230, 230)]);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.holesCarved).toBe(0);
        expect(out.slitAreaLostM2).toBe(0);
        expect(out.rings.reduce((s, r) => s + area(r), 0)).toBeCloseTo(10_000, 6);
    });

    it('a hole that SPLITS the region returns both pieces (the consumer refuses multi-region)', () => {
        const out = carveHolesToSimpleRings(OUTER, [rect(40, -1, 60, 101)]);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.rings).toHaveLength(2);
        expect(out.rings.reduce((s, r) => s + area(r), 0)).toBeCloseTo(8_000, 6);
    });

    it('TWO interior courtyards carve sequentially, each with its own inward slit', () => {
        const holes = [rect(10, 10, 30, 30), rect(60, 60, 90, 90)]; // 400 + 900
        const out = carveHolesToSimpleRings(OUTER, holes);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        const exact = 10_000 - 400 - 900;
        const carved = out.rings.reduce((s, r) => s + area(r), 0);
        expect(out.holesCarved).toBe(2);
        expect(
            carved - exact,
            `two-hole carve GAINED ${(carved - exact).toFixed(6)} m²`,
        ).toBeLessThanOrEqual(1e-9);
        expect(carved + out.slitAreaLostM2).toBeCloseTo(exact, 5);
    });

    it('the carve REFUSES (typed) on a malformed hole — the consumer falls back to the honest refusal', () => {
        const bowtie: Pt[] = [{ x: 40, z: 40 }, { x: 60, z: 55 }, { x: 60, z: 40 }, { x: 40, z: 55 }];
        const out = carveHolesToSimpleRings(OUTER, [bowtie]);
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe('self-intersecting-input');
    });
});
