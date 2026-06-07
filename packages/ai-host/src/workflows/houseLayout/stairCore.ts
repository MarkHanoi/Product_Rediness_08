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

import type { Pt, StairShape } from './types.js';
import { chooseStairCorePosition } from './stairPosition.js';

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

/** A.21.D34(a) — the footprint expressed in the PLATE-LOCAL mm frame the stair-core
 *  candidate positions live in: origin at the bbox min corner, ×1000, plan-Z → y.
 *  Passed to `chooseStairCorePosition` so perimeter candidates are culled to the real
 *  (possibly rotated) shell polygon rather than just its bounding box (so a "flush"
 *  candidate never pokes outside a skewed shell). Pure. */
function plateLocalPolyMm(footprint: readonly Pt[], bb: BBoxM): { x: number; y: number }[] {
    return footprint.map(p => ({ x: (p.x - bb.minX) * 1000, y: (p.z - bb.minZ) * 1000 }));
}

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

    // §STAIR-SPACE-EFFICIENCY (A.21.D29 / #6) — the founder-ratified "engine decides
    // per-plot" objective. Instead of HARD-CODING the central spine, score a small
    // deterministic candidate set (central + perimeter-adjacent on each non-entrance
    // edge) by circulation waste and take the least-waste one. Plate-local mm → add
    // the bbox-min offset. On a plate where central is as good as anything the scorer
    // returns the central candidate (stable tie-break) → byte-identical to before.
    // A.21.D34(a) — cull candidates to the real (possibly rotated) shell polygon so a
    // perimeter "flush" candidate never pokes outside a skewed plate.
    const pos = chooseStairCorePosition(plateWmm, plateHmm, w, h, plateLocalPolyMm(footprint, bb));
    let x = minXmm + pos.x;
    let y = minZmm + pos.y;

    // Keep the core fully inside the plate's bounding box.
    x = clamp(x, minXmm, minXmm + plateWmm - w);
    y = clamp(y, minZmm, minZmm + plateHmm - h);

    return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

function clamp(v: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    return Math.min(hi, Math.max(lo, v));
}

// ─── A.21.D18 — stair SHAPE selection (I / L / U) ────────────────────────────
//
// The straight (I) run reserved above suits a long, thin slot. Where the plate
// can spare a squarer footprint we fold the run into an L (two flights round a
// corner landing — a smaller plan rect) or a U (two parallel flights + a
// half-landing — the most compact plan for a tall storey). Deterministic
// thresholds, documented below; always degrades safely to I when space is tight.

/** L-shape reserved core (mm): ~1.6 m × ~1.6 m square (two flights round a corner). */
const L_W_MM = 1600;
const L_H_MM = 1600;
/** U-shape reserved core (mm): ~2.0 m wide (two ~0.95 m runs + a tiny gap) × ~2.8 m
 *  deep (one flight's run + the shared half-landing). Most compact for a tall gap. */
const U_W_MM = 2000;
const U_H_MM = 2800;

/**
 * Shape-selection thresholds, expressed on the AVAILABLE core box the plate can
 * spare (the MAX_FRACTION-clamped box used by reserveStairCore). We work off the
 * available box — not the I-rect — so a plate that could fit an L/U is offered one.
 *
 *  - availW < {@link MIN_SHAPED_W_MM} OR availH < {@link MIN_SHAPED_H_MM}
 *        → I (space too tight for any folded stair — the safe fallback).
 *  - else if aspect (longer/shorter) ≥ {@link I_ASPECT_MIN}
 *        → I (a long, thin slot — the straight run already fits naturally).
 *  - else if availW ≥ U_W_MM AND availH ≥ U_H_MM
 *        → U (a generous, squarer box — the most compact tall-storey form).
 *  - else if availW ≥ L_W_MM AND availH ≥ L_H_MM
 *        → L (a squarer mid box — two flights round a corner landing).
 *  - else → I (couldn't fit L or U → fall back to the straight run).
 */
const MIN_SHAPED_W_MM = L_W_MM;   // need ≥1.6 m in BOTH plan dims to fold a stair
const MIN_SHAPED_H_MM = L_H_MM;
/** Aspect (longer/shorter side of the available box) at/above which we keep I. */
const I_ASPECT_MIN = 2.2;

/** Choose the stair shape from the available (MAX_FRACTION-clamped) core box (mm). */
function chooseStairShape(availWmm: number, availHmm: number): StairShape {
    if (availWmm < MIN_SHAPED_W_MM || availHmm < MIN_SHAPED_H_MM) return 'I';
    const longer = Math.max(availWmm, availHmm);
    const shorter = Math.max(1, Math.min(availWmm, availHmm));
    const aspect = longer / shorter;
    if (aspect >= I_ASPECT_MIN) return 'I';
    if (availWmm >= U_W_MM && availHmm >= U_H_MM) return 'U';
    if (availWmm >= L_W_MM && availHmm >= L_H_MM) return 'L';
    return 'I';
}

/** The resolved, shaped stair core (mm rect + form + flights metadata). */
export interface StairCoreShaped {
    readonly rectMm: { x: number; y: number; w: number; h: number };
    readonly shape: StairShape;
    /** Risers in flight 1 (before the landing); 0 for I (single flight). */
    readonly risersBeforeLanding: number;
    /** Landing depth (m); 0 for I. */
    readonly landingDepthM: number;
}

/**
 * Split `totalRisers` across the flights for a given shape (A.21.D18).
 *  - I → one flight (all risers; second entry 0).
 *  - L/U → ≈half each (flight 1 = floor(total/2), flight 2 = remainder), each ≥1.
 * Deterministic. Returns `{ before, after }` (after === total for I).
 */
export function splitRisersForShape(
    shape: StairShape,
    totalRisers: number,
): { before: number; after: number } {
    if (shape === 'I' || totalRisers < 3) return { before: 0, after: totalRisers };
    const before = Math.max(1, Math.floor(totalRisers / 2));
    const after = Math.max(1, totalRisers - before);
    return { before, after };
}

/**
 * Reserve the stair core AND choose its shape (A.21.D18). Same placement +
 * MAX_FRACTION clamp logic as {@link reserveStairCore}, but it FIRST decides the
 * shape from the available box, then sizes the rect to that shape's footprint
 * (clamped to the plate), so the returned rect tightly bounds the actual stair.
 *
 * Deterministic; never produces an invalid (sub-minimum) stair — degrades to I
 * with the straight-run rect when the plate is too small to fold a stair.
 *
 * `totalRisers` (the floor-to-floor riser count) drives the flight split for
 * L/U; pass it from the orchestrator (≈ ftf / riserHeight).
 */
export function reserveStairCoreShaped(
    footprint: Pt[],
    storeyCount: number,
    totalRisers: number,
): StairCoreShaped {
    const bb = bboxOf(footprint);
    const plateWmm = Math.max(0, (bb.maxX - bb.minX) * 1000);
    const plateHmm = Math.max(0, (bb.maxZ - bb.minZ) * 1000);

    // The box the plate can spare for circulation (same MAX_FRACTION rule).
    const availW = plateWmm * MAX_FRACTION;
    const availH = plateHmm * MAX_FRACTION;

    const shape = chooseStairShape(
        availW > 0 ? availW : Infinity,
        availH > 0 ? availH : Infinity,
    );

    // For I we reuse the straight-run reservation verbatim (1.0 × 3.0 m rect).
    if (shape === 'I') {
        const rect = reserveStairCore(footprint, storeyCount);
        return { rectMm: rect, shape: 'I', risersBeforeLanding: 0, landingDepthM: 0 };
    }

    // L / U: size a square-ish rect to the shape's target footprint, clamped to
    // the available box (never below MIN_DIM_MM, never beyond MAX_FRACTION).
    const targetW = shape === 'U' ? U_W_MM : L_W_MM;
    const targetH = shape === 'U' ? U_H_MM : L_H_MM;
    let w = Math.min(targetW, availW > 0 ? availW : targetW);
    let h = Math.min(targetH, availH > 0 ? availH : targetH);
    w = Math.max(Math.min(MIN_DIM_MM, plateWmm > 0 ? plateWmm : MIN_DIM_MM), w);
    h = Math.max(Math.min(MIN_DIM_MM, plateHmm > 0 ? plateHmm : MIN_DIM_MM), h);

    const minXmm = bb.minX * 1000;
    const minZmm = bb.minZ * 1000;
    // §STAIR-SPACE-EFFICIENCY (A.21.D29 / #6) — score candidate positions for the
    // shaped (L/U) core too, on its OWN footprint (w×h), and take the least-waste
    // one (central tie-break → no shift where central is best). See stairPosition.ts.
    // A.21.D34(a) — cull to the rotated shell polygon (see reserveStairCore).
    const pos = chooseStairCorePosition(plateWmm, plateHmm, w, h, plateLocalPolyMm(footprint, bb));
    let x = minXmm + pos.x;
    let y = minZmm + pos.y;
    x = clamp(x, minXmm, minXmm + plateWmm - w);
    y = clamp(y, minZmm, minZmm + plateHmm - h);

    const { before } = splitRisersForShape(shape, Math.max(2, Math.round(totalRisers)));
    // Landing depth: L = one stair width (~1.0 m); U = two widths (~2.0 m) so the
    // half-landing spans both parallel runs — matching StairCreationController.
    const landingDepthM = shape === 'U' ? 2.0 : 1.0;

    return {
        rectMm: { x: r3(x), y: r3(y), w: r3(w), h: r3(h) },
        shape,
        risersBeforeLanding: before,
        landingDepthM,
    };
}

export { bboxOf as __bboxOfForTest, chooseStairShape as __chooseStairShapeForTest };
