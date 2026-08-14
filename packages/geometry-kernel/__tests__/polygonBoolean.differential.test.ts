/**
 * §C73-POLY-BOOLEAN — the DIFFERENTIAL arm of the GE-05 oracle.
 *
 * `polygonBoolean.oracle.test.ts` pins the hand-computed answers on the known
 * killer cases. This file asks the complementary question — "does the body hold
 * up on inputs nobody designed for it?" — because a hand-picked corpus can only
 * prove the cases its author thought of, and the failure mode this whole module
 * exists to prevent is a SILENT wrong region on real, ugly cadastral data.
 *
 * Two independent checks over the same generated corpus:
 *
 *   1. INCLUSION–EXCLUSION, |A| + |B| = |A ∪ B| + |A ∩ B|. The arrangement body
 *      never uses this identity internally — the two operations are computed by
 *      two different keep-rules over the same sub-edge set — so it is a genuine
 *      cross-check of each rule against the other, at zero cost, on every pair.
 *      A dropped loop, a doubled boundary, a mis-oriented hole or a lost
 *      sub-edge all break it.
 *   2. GRID RASTERISATION on a subset: an area computed by sampling containment,
 *      sharing no code path with splitting, classification or chaining. Slower,
 *      so it runs on fewer pairs — but it is the only check here that could
 *      catch a bug which happens to break both keep-rules symmetrically.
 *
 * The corpus is STAR-SHAPED polygons: k vertices at strictly increasing angles
 * about a centre, with varying radii. Strictly increasing angles make the ring
 * simple by construction (so the generator can never hand the body an input it
 * is contractually allowed to refuse), while varying radii make it concave —
 * which is precisely the shape all three GE-05 deferring sites refuse on today.
 *
 * Determinism: a fixed-seed LCG, so a failure is reproducible and a green run
 * is not luck. No `Math.random` anywhere.
 */

import { describe, it, expect } from 'vitest';
import { intersectPolygons2D, unionPolygons2D } from '../src/pure/polygonBoolean.js';
import { signedArea, type Pt2 } from '../src/pure/polygonOffset.js';
import { pointInRingEvenOdd } from '../src/pure/pointInPolygon.js';
import { COINCIDENT_M } from '../src/tolerance.js';

/** Deterministic LCG (Numerical Recipes constants). Reproducible corpus, no RNG. */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * A star-shaped ring: simple by construction (angles strictly increase), and
 * concave whenever the radii differ. `k` vertices about (cx, cy).
 */
function starRing(rand: () => number, cx: number, cy: number, k: number, rMin: number, rMax: number): Pt2[] {
    const ring: Pt2[] = [];
    for (let i = 0; i < k; i++) {
        const angle = (2 * Math.PI * i) / k;
        const r = rMin + (rMax - rMin) * rand();
        ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return ring;
}

function inRing(x: number, y: number, ring: ReadonlyArray<Pt2>): boolean {
    return pointInRingEvenOdd(x, y, ring.length, (i) => ring[i]![0], (i) => ring[i]![1]);
}

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

function areaOf(r: ReturnType<typeof intersectPolygons2D>): number | null {
    return r.ok ? r.loops.reduce((acc, loop) => acc + signedArea(loop), 0) : null;
}

/**
 * The corpus. Offsets are chosen to span the whole topology range: heavy
 * overlap, partial overlap, grazing contact and full separation — the last two
 * being where a boolean's chaining is most likely to fail.
 */
function corpus(count: number, seed: number): Array<{ a: Pt2[]; b: Pt2[]; offset: number }> {
    const rand = lcg(seed);
    const out: Array<{ a: Pt2[]; b: Pt2[]; offset: number }> = [];
    for (let i = 0; i < count; i++) {
        const ka = 5 + Math.floor(rand() * 8);
        const kb = 5 + Math.floor(rand() * 8);
        // 0 → concentric, 12 → fully separated (both rings fit inside radius 5).
        const offset = (i % 12) + rand();
        out.push({
            a: starRing(rand, 0, 0, ka, 2, 5),
            b: starRing(rand, offset, rand() * 2 - 1, kb, 2, 5),
            offset,
        });
    }
    return out;
}

/** Ring perimeter — the lever arm in the module header's resolution-limit bound. */
function perimeter(ring: ReadonlyArray<Pt2>): number {
    let p = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        p += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return p;
}

describe('§C73-POLY-BOOLEAN differential — inclusion–exclusion over a generated corpus', () => {
    it('|A| + |B| = |A ∪ B| + |A ∩ B| for 240 concave star-shaped pairs, within the DECLARED bound', () => {
        // The bound is the module header's, not a fudge factor:
        //     |A|+|B| − (|A∪B|+|A∩B|)  ≤  COINCIDENT_M × (P_A + P_B) / 2
        // A vertex of one ring landing within COINCIDENT_M of the other's
        // boundary is THE SAME PLACE by declaration; which member of that pair
        // a loop adopts as its representative can shift the boundary laterally
        // by at most COINCIDENT_M over its adjacent edges.
        //
        // Two separate assertions, so the loose bound cannot hide a real bug:
        //   · EVERY case must be inside the derived bound;
        //   · at most a HANDFUL may exceed plain float noise (1e-6). A change
        //     that degrades many cases from exact to merely-bounded fails here
        //     even though every individual case is still "within bound".
        const cases = corpus(240, 0x5eed_1);
        const overBound: string[] = [];
        const overNoise: string[] = [];
        let checked = 0;
        for (const { a, b, offset } of cases) {
            const inter = intersectPolygons2D(a, b);
            const uni = unionPolygons2D(a, b);
            // A refusal is NOT a pass — it is a failure of this arm, so a body
            // that "passed" by refusing everything could not hide here.
            if (!inter.ok || !uni.ok) {
                overBound.push(
                    `offset=${offset.toFixed(3)} REFUSED ` +
                    `∩=${inter.ok ? 'ok' : inter.reason} ∪=${uni.ok ? 'ok' : uni.reason}`,
                );
                continue;
            }
            checked += 1;
            const lhs = Math.abs(signedArea(a)) + Math.abs(signedArea(b));
            const rhs = areaOf(uni)! + areaOf(inter)!;
            const delta = Math.abs(lhs - rhs);
            const bound = (COINCIDENT_M * (perimeter(a) + perimeter(b))) / 2;
            const line =
                `offset=${offset.toFixed(3)} |A|+|B|=${lhs.toFixed(6)} ` +
                `vs |A∪B|+|A∩B|=${rhs.toFixed(6)} (Δ=${delta.toExponential(2)}, bound=${bound.toExponential(2)})`;
            if (delta > bound) overBound.push(line);
            else if (delta > 1e-6) overNoise.push(line);
        }
        expect(overBound).toEqual([]);
        expect(checked).toBe(240);
        // Measured 2026-08-14: exactly ONE of 240 pairs has a near-coincident
        // vertex (Δ = 4.5e-4 m² against a bound of 3.4e-2 m²). Pinned at ≤ 3 so
        // a regression that makes near-coincidence common is a failure, not a
        // silent drift.
        expect(overNoise.length).toBeLessThanOrEqual(3);
    });

    it('both operations are commutative over the same corpus', () => {
        const failures: string[] = [];
        for (const { a, b, offset } of corpus(120, 0x5eed_2)) {
            for (const op of ['intersection', 'union'] as const) {
                const f = op === 'intersection' ? intersectPolygons2D : unionPolygons2D;
                const ab = f(a, b);
                const ba = f(b, a);
                if (!ab.ok || !ba.ok) {
                    failures.push(`offset=${offset.toFixed(3)} ${op}: refusal`);
                    continue;
                }
                if (Math.abs(areaOf(ab)! - areaOf(ba)!) > 1e-6) {
                    failures.push(
                        `offset=${offset.toFixed(3)} ${op}: ${areaOf(ab)} vs ${areaOf(ba)}`,
                    );
                }
                if (ab.loops.length !== ba.loops.length) {
                    failures.push(
                        `offset=${offset.toFixed(3)} ${op}: ${ab.loops.length} vs ${ba.loops.length} loops`,
                    );
                }
            }
        }
        expect(failures).toEqual([]);
    });

    it('an INDEPENDENT grid rasterisation agrees on both areas for 8 pairs', () => {
        // Coarser grid than the hand-computed cases and a margin sized to it:
        // rasterisation error is O(perimeter × cell), and a star of radius ≤ 5
        // with up to 12 vertices has a perimeter under ~60 m, so a 0.05 m cell
        // admits up to ~1.5 m² of boundary error. The check is therefore a
        // GROSS-ERROR detector — a swapped keep-rule, a dropped region, a
        // doubled loop — not a precision statement.
        const failures: string[] = [];
        for (const { a, b, offset } of corpus(8, 0x5eed_3)) {
            for (const op of ['intersection', 'union'] as const) {
                const f = op === 'intersection' ? intersectPolygons2D : unionPolygons2D;
                const r = f(a, b);
                if (!r.ok) {
                    failures.push(`offset=${offset.toFixed(3)} ${op}: ${r.reason}`);
                    continue;
                }
                const mine = areaOf(r)!;
                const raster = rasterArea(a, b, op, 0.05);
                if (Math.abs(mine - raster) > 1.5) {
                    failures.push(
                        `offset=${offset.toFixed(3)} ${op}: body=${mine.toFixed(3)} ` +
                        `raster=${raster.toFixed(3)}`,
                    );
                }
            }
        }
        expect(failures).toEqual([]);
    }, 30_000);

    it('every result loop is non-degenerate: ≥ 3 vertices and non-zero area', () => {
        const failures: string[] = [];
        for (const { a, b, offset } of corpus(120, 0x5eed_4)) {
            for (const op of ['intersection', 'union'] as const) {
                const f = op === 'intersection' ? intersectPolygons2D : unionPolygons2D;
                const r = f(a, b);
                if (!r.ok) continue;
                for (const loop of r.loops) {
                    if (loop.length < 3 || Math.abs(signedArea(loop)) < 1e-9) {
                        failures.push(
                            `offset=${offset.toFixed(3)} ${op}: loop with ${loop.length} verts, ` +
                            `area ${signedArea(loop)}`,
                        );
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });

    it('an intersection is a SUBSET of both inputs — no output area outside either ring', () => {
        // The strongest cheap soundness statement for the legally-binding path:
        // over-stating buildable area is the C58 §1.4 / L-616 failure. Sampled
        // at loop-edge midpoints, which are the points a wrong keep-rule moves.
        const failures: string[] = [];
        for (const { a, b, offset } of corpus(120, 0x5eed_5)) {
            const r = intersectPolygons2D(a, b);
            if (!r.ok) continue;
            for (const loop of r.loops) {
                // The CENTROID of a convex sub-triangle is not guaranteed
                // inside a concave loop, so probe the loop's own vertices
                // nudged toward its centroid — a point that must be inside the
                // intersection if the loop bounds one.
                const cx = loop.reduce((s, p) => s + p[0], 0) / loop.length;
                const cy = loop.reduce((s, p) => s + p[1], 0) / loop.length;
                for (const v of loop) {
                    const px = v[0] + (cx - v[0]) * 1e-3;
                    const py = v[1] + (cy - v[1]) * 1e-3;
                    // A vertex nudged 0.1% toward the centroid may still leave a
                    // concave loop; only assert the ONE-SIDED statement that
                    // matters — if it is inside the result loop it must be
                    // inside BOTH inputs.
                    if (!inRing(px, py, loop)) continue;
                    if (!inRing(px, py, a) || !inRing(px, py, b)) {
                        failures.push(
                            `offset=${offset.toFixed(3)} point (${px.toFixed(4)}, ${py.toFixed(4)}) ` +
                            `is in the intersection but not in ${inRing(px, py, a) ? 'B' : 'A'}`,
                        );
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });
});
