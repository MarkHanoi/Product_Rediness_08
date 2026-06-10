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

export type Pt2 = [number, number]; // [x, z]

export interface Rect2 {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

const EPS = 1e-6;

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

/** Even-odd point-in-polygon for the cell-centre coverage test. */
function pointInPolygon(px: number, pz: number, poly: ReadonlyArray<Pt2>): boolean {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, zi] = poly[i]!;
        const [xj, zj] = poly[j]!;
        const intersect =
            zi > pz !== zj > pz &&
            px < ((xj - xi) * (pz - zi)) / (zj - zi || EPS) + xi;
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

/**
 * Convenience: can this footprint be split into pitched-roof rectangles?
 * (true ⇒ the caller should keep gable/hip and route through the decompose
 * builder; false ⇒ flat-degrade.) A convex footprint is NOT decomposed here —
 * it already has a working single-ridge builder, so callers gate this on
 * "concave" first.
 */
export function canDecomposeConcave(poly: ReadonlyArray<Pt2>, tol = 1e-3): boolean {
    const rects = decomposeRectilinear(poly, tol);
    return rects !== null && rects.length >= 1;
}
