// §PERF-SUNHOURS-BVH (L-143, ADR-0074 follow-on) — a PURE, THREE-free uniform-grid
// spatial index over 2-D occluder bounding boxes, used to accelerate the direct-beam
// shadow raycast that dominates the site sun-hours / façade study cost.
//
// WHY THIS EXISTS
// ---------------
// The sun-hours engine tests, for every (cell × sun-sample), whether the ray toward the
// sun is blocked by ANY occluder (OSM context buildings + the massing). The naive test
// loops over EVERY occluder — with ~4700 context buildings that is the dominant cost
// (cells × samples × occluders ≈ hundreds of millions of prism tests). Because a shadow
// ray only ever crosses occluders NEAR its ground path, a uniform grid keyed by each
// occluder's bbox lets a query return only the handful of occluders whose bbox the ray
// SEGMENT could cross — turning the inner loop from O(occluders) into O(occluders-near-ray).
//
// DETERMINISM CONTRACT (P8 / ADR-0074 "byte-identical")
// -----------------------------------------------------
// `queryRaySegment` returns a strict SUPERSET of every occluder whose bbox the ray segment
// crosses (see the proof in `buildOccluderIndex`). The caller runs its EXACT per-occluder
// occlusion test on each candidate and ORs the result, so an accelerated pass yields
// byte-identical occlusion to the naive all-occluders loop — only faster. No RNG, no Date,
// no I/O, no THREE, no DOM: same boxes + same ray ⇒ same candidate set.
//
// FRAME: boxes + rays are in the ground plane (east, north) metres — the same StreetGrid
// XZ convention the site-metric prisms use. Heights are the caller's concern (the caller's
// per-occluder test decides whether the ray clears the roof); this index is purely 2-D.

/** An occluder's axis-aligned ground bounding box, (east, north) metres. */
export interface OccluderBox {
    readonly minE: number;
    readonly maxE: number;
    readonly minN: number;
    readonly maxN: number;
}

/** A built spatial index over a fixed occluder-box set. Immutable after build. */
export interface OccluderIndex {
    /** Grid cell edge (m). */
    readonly cellSizeM: number;
    /** Number of indexed occluders. */
    readonly count: number;
    /**
     * Collect the INDICES of every occluder whose bbox the ray SEGMENT — from `(e0, n0)`
     * along the UNIT horizontal direction `(de, dn)` for `maxReach` metres — could cross.
     * The candidate list is a strict SUPERSET of the true crossings (never misses one),
     * deduplicated, in ascending grid-visitation order. Fills and returns `out` (cleared
     * first) so the caller can reuse one scratch array across the hot loop (zero GC).
     */
    queryRaySegment(
        e0: number,
        n0: number,
        de: number,
        dn: number,
        maxReach: number,
        out: number[],
    ): number[];
}

/** Auto-size the grid cell from the occluder extent + count so a query touches only a
 *  few cells (≈ one building per cell), clamped to a sane building-scale range. */
function autoCellSize(boxes: readonly OccluderBox[], extentE: number, extentN: number): number {
    const n = boxes.length;
    if (n === 0) return 32;
    // Mean bbox span is a good cell scale (≈ one occluder per cell); fall back to a
    // grid-area heuristic when the boxes are degenerate. Clamp to [8 m, 80 m].
    let spanSum = 0;
    for (const b of boxes) spanSum += (b.maxE - b.minE) + (b.maxN - b.minN);
    const meanSpan = spanSum / (2 * n);
    const areaScale = Math.sqrt(Math.max(1, (extentE * extentN) / n));
    const raw = meanSpan > 1e-3 ? meanSpan : areaScale;
    return Math.max(8, Math.min(80, raw));
}

/**
 * Build a uniform-grid spatial index over occluder ground bounding boxes. Pure +
 * deterministic. `cellSizeM` is auto-chosen from the occluder extent/count when omitted.
 *
 * SUPERSET PROOF (why the accelerated raycast is byte-identical to naive):
 *   Each box B is registered into every grid cell its bbox overlaps, EXPANDED by a
 *   one-cell halo in every direction. A query samples the ray segment at ≤ one-cell
 *   spacing and looks up each sample point's exact cell. If the ray crosses B, it passes
 *   through some cell c ∈ cells(B); the nearest sample point to that crossing is within
 *   ≤ cellSize of a point in c, so its cell c′ differs from c by at most 1 per axis, i.e.
 *   c′ ∈ halo(c). Since B was registered into halo(cells(B)) ⊇ halo(c) ∋ c′, B is present
 *   in grid[c′] and is therefore returned. Hence the candidate set contains every box the
 *   ray segment crosses (a superset). □
 */
export function buildOccluderIndex(boxes: readonly OccluderBox[], cellSizeM?: number): OccluderIndex {
    const count = boxes.length;

    // Overall extent (origin for cell indexing).
    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    for (const b of boxes) {
        if (b.minE < minE) minE = b.minE;
        if (b.minN < minN) minN = b.minN;
        if (b.maxE > maxE) maxE = b.maxE;
        if (b.maxN > maxN) maxN = b.maxN;
    }
    if (!Number.isFinite(minE)) { minE = 0; minN = 0; maxE = 0; maxN = 0; }
    const extentE = Math.max(0, maxE - minE);
    const extentN = Math.max(0, maxN - minN);

    const cell = cellSizeM && cellSizeM > 0 ? cellSizeM : autoCellSize(boxes, extentE, extentN);
    // Column count (+halo padding) so a clamped cell key never collides across rows.
    const nx = Math.max(1, Math.floor(extentE / cell) + 3);
    const nz = Math.max(1, Math.floor(extentN / cell) + 3);
    // Diagonal of the indexed region — the furthest a ray need ever be walked (beyond it
    // there are no occluders to hit), used to clamp a pathological maxReach.
    const indexDiagonal = Math.hypot(extentE, extentN) + 2 * cell;

    const gx = (e: number): number => {
        const i = Math.floor((e - minE) / cell) + 1; // +1 pad for the low halo
        return i < 0 ? 0 : i >= nx ? nx - 1 : i;
    };
    const gz = (n: number): number => {
        const i = Math.floor((n - minN) / cell) + 1;
        return i < 0 ? 0 : i >= nz ? nz - 1 : i;
    };
    const key = (cx: number, cz: number): number => cz * nx + cx;

    // Register each box into its cells + a one-cell halo (see SUPERSET PROOF).
    const grid = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
        const b = boxes[i]!;
        const cx0 = gx(b.minE) - 1, cx1 = gx(b.maxE) + 1;
        const cz0 = gz(b.minN) - 1, cz1 = gz(b.maxN) + 1;
        for (let cz = Math.max(0, cz0); cz <= Math.min(nz - 1, cz1); cz++) {
            for (let cx = Math.max(0, cx0); cx <= Math.min(nx - 1, cx1); cx++) {
                const k = key(cx, cz);
                const bucket = grid.get(k);
                if (bucket) bucket.push(i);
                else grid.set(k, [i]);
            }
        }
    }

    // Per-box epoch marks for O(1) dedup across a single query (no per-query allocation).
    const mark = new Int32Array(count).fill(-1);
    let epoch = 0;

    const queryRaySegment = (
        e0: number,
        n0: number,
        de: number,
        dn: number,
        maxReach: number,
        out: number[],
    ): number[] => {
        out.length = 0;
        if (count === 0) return out;
        const dmag = Math.hypot(de, dn);
        if (!(dmag > 1e-9) || !Number.isFinite(maxReach) || maxReach <= 0) {
            // Degenerate ray (overhead sun / zero reach): only the origin cell matters.
            const bucket = grid.get(key(gx(e0), gz(n0)));
            if (bucket) for (const bi of bucket) out.push(bi);
            return out;
        }
        const ux = de / dmag, uz = dn / dmag;
        const reach = Math.min(maxReach, indexDiagonal);
        const ep = ++epoch;
        // Sample the segment at half-cell spacing (≤ cellSize ⇒ the SUPERSET PROOF holds).
        const step = cell * 0.5;
        let lastCx = -2147483648, lastCz = -2147483648;
        for (let d = 0; d <= reach + step; d += step) {
            const dd = d > reach ? reach : d;
            const cx = gx(e0 + ux * dd);
            const cz = gz(n0 + uz * dd);
            if (cx === lastCx && cz === lastCz) { if (dd >= reach) break; continue; }
            lastCx = cx; lastCz = cz;
            const bucket = grid.get(key(cx, cz));
            if (bucket) {
                for (const bi of bucket) {
                    if (mark[bi] !== ep) { mark[bi] = ep; out.push(bi); }
                }
            }
            if (dd >= reach) break;
        }
        return out;
    };

    return { cellSizeM: cell, count, queryRaySegment };
}
