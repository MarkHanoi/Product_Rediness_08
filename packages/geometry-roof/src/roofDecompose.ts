// §ROOF-CONCAVE-DECOMPOSE (founder L-shape defect, 2026-06-10) — pure 2D
// rectilinear decomposition of a concave footprint into axis-aligned rectangles.
//
// THREE-free, DOM-free, NO Date / NO Math.random — fully deterministic so a roof
// is byte-identical for the same footprint (ADR-0061). Mirrors the pure-geometry
// convention of roofRidgeAxis.ts.
//
// WHY: the hip/gable mesh builder is CONVEX-ONLY (its inward edge-shift normals
// cross at a re-entrant corner → self-intersecting ridge → clashing planes). The
// standard architectural answer for an L / T / U house is to split the footprint
// into rectangular wings, put a normal pitched (gable) roof on each wing at the
// SAME pitch & eave height, and let the ridges meet at a valley where wings abut.
// This module does the SPLIT; the builder puts a gable on each returned rect.

import { EPSILON_ZERO } from '@pryzm/geometry-kernel';

export type Pt2 = [number, number]; // [x, z]

export interface Rect2 {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

/** Rectangle → CCW polygon ([x,z] verts) for downstream gable building. */
export function rectToPolygon(r: Rect2): Pt2[] {
    return [
        [r.minX, r.minZ],
        [r.maxX, r.minZ],
        [r.maxX, r.maxZ],
        [r.minX, r.maxZ],
    ];
}

/**
 * Is this polygon rectilinear (every edge axis-aligned, i.e. horizontal or
 * vertical in the X/Z plane)? Only rectilinear concave shapes (L / T / U / plus,
 * stairs) decompose cleanly into axis-aligned rectangles. A skewed/diagonal
 * concave shell is NOT rectilinear → caller flat-degrades.
 *
 * A tolerance is applied so footprints with tiny floating-point drift on their
 * edges (the house generator's walls are axis-aligned by construction) still
 * qualify. Deterministic.
 */
export function isRectilinear(poly: ReadonlyArray<Pt2>, tol = 1e-3): boolean {
    const n = poly.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % n]!;
        const dx = Math.abs(b[0] - a[0]);
        const dz = Math.abs(b[1] - a[1]);
        // each edge must be (near-)horizontal OR (near-)vertical
        const horizontal = dz <= tol && dx > tol;
        const vertical = dx <= tol && dz > tol;
        if (!horizontal && !vertical) return false;
    }
    return true;
}

/** Sorted unique coordinate list with near-duplicates merged (deterministic). */
function sortedUnique(values: number[], tol: number): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
        if (out.length === 0 || Math.abs(v - out[out.length - 1]!) > tol) out.push(v);
    }
    return out;
}

/** Even-odd point-in-polygon for the cell-centre coverage test.
 *
 *  The `|| EPSILON_ZERO` on the divisor is the degenerate-divide guard C73 §2.4
 *  requires to come from the DECLARED policy rather than be chosen per call
 *  site: `|| 1e-12`, `|| 1e-9` and no guard at all are three different
 *  geometries of the same polygon. It is dimensionless (a guard on arithmetic,
 *  not on model-space distance) and it only ever engages when `zj - zi` is
 *  EXACTLY 0 — which the crossing test on the line above has already excluded —
 *  so the substituted magnitude changes neither the sign nor the verdict. */
function pointInPolygon(px: number, pz: number, poly: ReadonlyArray<Pt2>): boolean {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, zi] = poly[i]!;
        const [xj, zj] = poly[j]!;
        const intersect =
            zi > pz !== zj > pz &&
            px < ((xj - xi) * (pz - zi)) / (zj - zi || EPSILON_ZERO) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * §ROOF-CONCAVE-DECOMPOSE — decompose a rectilinear (possibly concave) footprint
 * into a set of axis-aligned rectangles whose union covers the footprint.
 *
 * Algorithm (deterministic grid sweep):
 *   1. Build the coordinate grid from every distinct vertex X and Z.
 *   2. For each grid cell, mark it "inside" iff its centre lies in the polygon.
 *   3. Greedily merge inside cells into maximal axis-aligned rectangles
 *      (row-run merge, then vertical-extent merge of identical column-spans).
 *
 * For an L this yields 2 rects, a T or U yields 3, etc. Returns `null` when the
 * polygon is not rectilinear or no cell is inside (caller flat-degrades).
 *
 * The merge is column-greedy (left-to-right, then grow downward) so the result
 * is order-stable for a given footprint → byte-identical roofs (ADR-0061).
 */
export function decomposeRectilinear(
    poly: ReadonlyArray<Pt2>,
    tol = 1e-3,
): Rect2[] | null {
    if (!isRectilinear(poly, tol)) return null;

    const xs = sortedUnique(poly.map((p) => p[0]), tol);
    const zs = sortedUnique(poly.map((p) => p[1]), tol);
    if (xs.length < 2 || zs.length < 2) return null;

    const nCol = xs.length - 1; // grid columns (between consecutive X lines)
    const nRow = zs.length - 1; // grid rows    (between consecutive Z lines)

    // inside[row][col] — is the cell centre inside the polygon?
    const inside: boolean[][] = [];
    for (let r = 0; r < nRow; r++) {
        const row: boolean[] = [];
        const cz = (zs[r]! + zs[r + 1]!) / 2;
        for (let c = 0; c < nCol; c++) {
            const cx = (xs[c]! + xs[c + 1]!) / 2;
            row.push(pointInPolygon(cx, cz, poly));
        }
        inside.push(row);
    }

    // Greedy maximal-rectangle merge over the cell grid.
    const used: boolean[][] = inside.map((row) => row.map(() => false));
    const rects: Rect2[] = [];

    for (let r = 0; r < nRow; r++) {
        for (let c = 0; c < nCol; c++) {
            if (!inside[r]![c] || used[r]![c]) continue;

            // Grow right along this row while inside & unused.
            let cEnd = c;
            while (cEnd + 1 < nCol && inside[r]![cEnd + 1] && !used[r]![cEnd + 1]) cEnd++;

            // Grow down while every cell in [c..cEnd] of the next row is inside & unused.
            let rEnd = r;
            growDown: for (let rr = r + 1; rr < nRow; rr++) {
                for (let cc = c; cc <= cEnd; cc++) {
                    if (!inside[rr]![cc] || used[rr]![cc]) break growDown;
                }
                rEnd = rr;
            }

            for (let rr = r; rr <= rEnd; rr++) {
                for (let cc = c; cc <= cEnd; cc++) used[rr]![cc] = true;
            }

            rects.push({
                minX: xs[c]!,
                maxX: xs[cEnd + 1]!,
                minZ: zs[r]!,
                maxZ: zs[rEnd + 1]!,
            });
        }
    }

    return rects.length > 0 ? rects : null;
}

/** Centroid (vertex average) of a polygon. Deterministic. */
function centroidOf(poly: ReadonlyArray<Pt2>): [number, number] {
    let sx = 0, sz = 0;
    for (const [x, z] of poly) { sx += x; sz += z; }
    const n = poly.length || 1;
    return [sx / n, sz / n];
}

/**
 * Principal-axis angle (radians) of a footprint = the direction of its LONGEST
 * edge, relative to world +X. For a rectilinear shell rotated to a plot's
 * principal axis (the founder's rotated L/T/U plots) this is the rotation that,
 * when undone, makes every edge axis-aligned again. Deterministic (no RNG).
 */
export function principalAxisAngle(poly: ReadonlyArray<Pt2>): number {
    let maxLen = 0;
    let ang = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len > maxLen) { maxLen = len; ang = Math.atan2(dz, dx); }
    }
    return ang;
}

/** Rotate a polygon's [x,z] verts about a pivot by `angle` rad (XZ plane). */
export function rotatePolyXZ(
    poly: ReadonlyArray<Pt2>, angle: number, cx: number, cz: number,
): Pt2[] {
    const c = Math.cos(angle), s = Math.sin(angle);
    return poly.map(([x, z]): Pt2 => {
        const X = x - cx, Z = z - cz;
        return [cx + X * c - Z * s, cz + X * s + Z * c];
    });
}

/**
 * §ROOF-PRINCIPAL-FRAME (founder "roof renders flat when the shape isn't a
 * rectangle", 2026-06-16) — decompose a footprint into axis-aligned rectangles,
 * trying the WORLD frame first and then the footprint's PRINCIPAL-AXIS frame.
 *
 * `decomposeRectilinear` only recognises edges that are axis-aligned in WORLD
 * X/Z, so a rectilinear L/T/U ROTATED to a plot's principal axis (every edge at
 * ~θ°) fails it → the roof flat-degrades. Here, when the world frame fails, we
 * de-rotate the footprint by −θ about its centroid (θ = longest-edge angle) so
 * the rotated-rectilinear shell becomes axis-aligned, decompose THERE, and return
 * the rects IN THAT DE-ROTATED FRAME together with `angleRad`/pivot so the caller
 * can rotate the built gable mesh back by +θ. `angleRad === 0` ⇒ the world frame
 * already worked (no rotation needed; byte-identical to the old path). Returns
 * `null` only when the shell is non-rectilinear in BOTH frames (genuine flat).
 * Deterministic (θ + centroid are pure functions of the footprint).
 */
export function decomposeInPrincipalFrame(
    poly: ReadonlyArray<Pt2>, tol = 1e-3,
): { rects: Rect2[]; angleRad: number; cx: number; cz: number } | null {
    const [cx, cz] = centroidOf(poly);
    const direct = decomposeRectilinear(poly, tol);
    if (direct && direct.length > 0) return { rects: direct, angleRad: 0, cx, cz };

    const theta = principalAxisAngle(poly);
    // Longest edge already (near-)horizontal but world decompose failed ⇒ the
    // shell is genuinely non-rectilinear (a diagonal edge somewhere) → flat.
    if (Math.abs(theta) < 1e-4) return null;

    const local = rotatePolyXZ(poly, -theta, cx, cz);
    const rects = decomposeRectilinear(local, tol);
    if (!rects || rects.length === 0) return null;
    return { rects, angleRad: theta, cx, cz };
}

/**
 * Convenience: can this footprint be split into pitched-roof rectangles?
 * (true ⇒ the caller should keep gable/hip and route through the decompose
 * builder; false ⇒ flat-degrade.) A convex footprint is NOT decomposed here —
 * it already has a working single-ridge builder, so callers gate this on
 * "concave" first. §ROOF-PRINCIPAL-FRAME: also true for a rotated rectilinear
 * shell (decomposable in its principal-axis frame), so the executor no longer
 * flat-degrades a rotated L/T/U.
 */
export function canDecomposeConcave(poly: ReadonlyArray<Pt2>, tol = 1e-3): boolean {
    return decomposeInPrincipalFrame(poly, tol) !== null;
}
