// Casa Unifamiliar — stair-core reservation (§6 step 2, §7).
//
// PURE + DETERMINISTIC L2. Picks an axis-aligned rectangle (mm, plan frame) that
// reserves the staircase footprint. The SAME rect is used on every storey it
// passes through (vertical alignment §7) so stairs stack and the stairwell void
// punches the upper slab directly over the run.
//
// Sizing: a typical UK/EU domestic stair is ≈ 1.0 m clear width × ~2.6–3.2 m run
// (landing included). We reserve 1.0 m × 3.0 m by default, clamped down for tiny
// footprints so the core never exceeds a fraction of the plate.
//
// Placement: central-ish, biased toward an interior "spine" — we centre the core
// on the footprint X-centroid and offset it back from the front (min-Z) edge so it
// does NOT block the entrance (the entry is conventionally on the min-Z façade).
// Single-storey houses don't call this (no stair), but it is still well-defined.

import type { Pt } from './types.js';

/** Default reserved stair-core dimensions (mm): 1.0 m wide × 3.0 m deep run. */
const STAIR_W_MM = 1000;
const STAIR_H_MM = 3000;

/** Never let the core eat more than this fraction of either plate dimension. */
const MAX_FRACTION = 0.45;

/** Minimum sane core dimension (mm) — below this a stair can't physically fit,
 *  but we still return a positive rect (the orchestrator handles degenerate
 *  plates; a too-small house simply gets a proportionally-shrunk core). */
const MIN_DIM_MM = 600;

interface BBoxM { minX: number; minZ: number; maxX: number; maxZ: number; }

function bboxOf(footprint: readonly Pt[]): BBoxM {
    if (footprint.length === 0) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of footprint) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, minZ, maxX, maxZ };
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Reserve the stair-core rectangle (mm, plan frame) for a stack of `storeyCount`
 * storeys over `footprint` (world X-Z metres). Deterministic. Returns
 * `{ x, y, w, h }` where x/y is the min corner and w/h the extent, all mm.
 *
 * For `storeyCount <= 1` the result is still well-formed (callers simply ignore
 * it — a single-storey house has no stair).
 *
 * The rect is the SAME on every storey (it depends only on the footprint, which is
 * identical floor-to-floor), guaranteeing the vertical-alignment invariant (§7).
 */
export function reserveStairCore(
    footprint: Pt[],
    _storeyCount: number,
): { x: number; y: number; w: number; h: number } {
    const bb = bboxOf(footprint);
    const plateWmm = Math.max(0, (bb.maxX - bb.minX) * 1000);
    const plateHmm = Math.max(0, (bb.maxZ - bb.minZ) * 1000);

    // Size the core, clamped so it never exceeds MAX_FRACTION of either dimension.
    const maxW = plateWmm * MAX_FRACTION;
    const maxH = plateHmm * MAX_FRACTION;
    let w = Math.min(STAIR_W_MM, maxW > 0 ? maxW : STAIR_W_MM);
    let h = Math.min(STAIR_H_MM, maxH > 0 ? maxH : STAIR_H_MM);
    // Keep a positive, sane minimum where the plate allows it.
    w = Math.max(Math.min(MIN_DIM_MM, plateWmm > 0 ? plateWmm : MIN_DIM_MM), w);
    h = Math.max(Math.min(MIN_DIM_MM, plateHmm > 0 ? plateHmm : MIN_DIM_MM), h);

    const minXmm = bb.minX * 1000;
    const minZmm = bb.minZ * 1000;

    // X: centre the core on the plate X-centre (central spine).
    const cx = minXmm + plateWmm / 2;
    let x = cx - w / 2;

    // Z: offset BACK from the entrance (min-Z) edge — place the core's near edge
    // ~1/3 of the plate depth in, so the entry/hall stays clear at the front.
    const backOffset = plateHmm * (1 / 3);
    let y = minZmm + backOffset;

    // Keep the core fully inside the plate's bounding box.
    x = clamp(x, minXmm, minXmm + plateWmm - w);
    y = clamp(y, minZmm, minZmm + plateHmm - h);

    return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

function clamp(v: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    return Math.min(hi, Math.max(lo, v));
}

export { bboxOf as __bboxOfForTest };
