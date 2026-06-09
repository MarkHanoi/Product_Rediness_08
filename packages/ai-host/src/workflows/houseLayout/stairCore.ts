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
import { chooseStairCorePosition, aspectFromSunDir, snapRectInsidePoly, type AspectBias, type StairCorePositionKind } from './stairPosition.js';

/** §STAIR-WORST-ASPECT (2026-06-08) — optional site solar data the stair reservation
 *  uses to bias the core toward the POOR-ASPECT perimeter wall (founder rule: the
 *  stair takes the worst façade so habitable rooms keep the best). Absent ⇒ the
 *  legacy waste-only placement (perimeter-vs-central decided purely by circulation
 *  waste; no behaviour change). The latitude is the SAME `solar.latDeg` the window-
 *  orientation engine already consumes.
 *
 *  `sunDirLayout` (optional) is the sun/equator-facing unit direction ALREADY mapped
 *  into the PLATE-LOCAL (principal-axis-rotated) frame the core is reserved in
 *  (x=East, y=plan-Z). When present it OVERRIDES the latitude derivation — the
 *  orchestrator supplies it so a SKEWED plate's aspect is correct in the rotated
 *  frame (the same −angle map `runDeterministicLayout` applies to the window sun
 *  direction). On an axis-aligned plate `sunDirLayout` equals `aspectFromSunDir`. */
export interface StairSolar {
    readonly latDeg: number;
    readonly sunDirLayout?: { readonly x: number; readonly y: number } | null;
}

/** Build the plate-local AspectBias from optional solar data. Always returns a bias
 *  object when `solar` is present (even near the equator → sunDir null, which still
 *  activates the §STAIR-WORST-ASPECT perimeter preference — the stair hugs a wall
 *  regardless of latitude, which is what fixes the central-hole subdivision break).
 *  Absent ⇒ undefined → `chooseStairCorePosition` uses its legacy waste-only path. */
function aspectBiasFor(solar: StairSolar | undefined): AspectBias | undefined {
    if (!solar) return undefined;
    const sunDir = solar.sunDirLayout !== undefined ? solar.sunDirLayout : aspectFromSunDir(solar.latDeg);
    return { sunDir };
}

/** Default reserved stair-core dimensions (mm): 1.0 m wide × 3.0 m deep run. */
const STAIR_W_MM = 1000;
const STAIR_H_MM = 3000;

// §STAIR-RUN-BOUND (2026-06-08) — the executor builds a straight I-flight whose run
// length is totalRisers × tread (HouseLayoutExecutor STAIR_TREAD_M). The legacy 3.0 m
// reserved depth is SHORTER than that run (e.g. 17 risers × 0.27 = 4.59 m), so the
// rendered flight overran the reserved cell and poked past the shell wall — the
// "stairs out of the shell" defect. §STAIR-OFF-SHELL only kept the (too-small) rect
// inside the polygon; the actual stair is bigger than the rect. When the caller
// supplies the riser count we size the reserved DEPTH to bound the real run (+ a small
// top step-off margin), so snapRectInsidePoly keeps the GEOMETRY — not a too-small
// proxy — inside the (possibly rotated) shell. Keep STAIR_TREAD_MM in lock-step with
// HouseLayoutExecutor's STAIR_TREAD_M.
const STAIR_TREAD_MM = 270;          // === HouseLayoutExecutor STAIR_TREAD_M (0.27 m)
const STAIR_RUN_MARGIN_MM = 300;     // top step-off / landing nose

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
    // §STAIR-WORST-ASPECT — optional site solar so the I-core hugs the poor-aspect
    // perimeter wall. Absent ⇒ legacy waste-only placement (bit-identical).
    solar?: StairSolar,
    // §STAIR-RUN-BOUND — floor-to-floor riser count. When present the reserved I-run
    // depth is sized to the REAL flight length (totalRisers × tread + margin) instead of
    // the legacy 3.0 m literal, so the reserved cell bounds the rendered stair. Absent
    // ⇒ the 3.0 m default (byte-identical to the pre-fix path and direct test callers).
    totalRisers?: number,
): { x: number; y: number; w: number; h: number } {
    const bb = bboxOf(footprint);
    const plateWmm = Math.max(0, (bb.maxX - bb.minX) * 1000);
    const plateHmm = Math.max(0, (bb.maxZ - bb.minZ) * 1000);

    // §STAIR-RUN-BOUND — bound the reserved depth to the real straight-run length.
    const runDepthMm = totalRisers && totalRisers > 0
        ? Math.round(totalRisers) * STAIR_TREAD_MM + STAIR_RUN_MARGIN_MM
        : STAIR_H_MM;

    // Size the core, clamped so it never exceeds MAX_FRACTION of either dimension.
    const maxW = plateWmm * MAX_FRACTION;
    const maxH = plateHmm * MAX_FRACTION;
    let w = Math.min(STAIR_W_MM, maxW > 0 ? maxW : STAIR_W_MM);
    let h = Math.min(runDepthMm, maxH > 0 ? maxH : runDepthMm);
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
    // §STAIR-WORST-ASPECT — bias toward the poor-aspect perimeter wall when site
    // solar is supplied (else legacy waste-only).
    const poly = plateLocalPolyMm(footprint, bb);
    const pos = chooseStairCorePosition(
        plateWmm, plateHmm, w, h, poly, aspectBiasFor(solar),
    );
    // Keep the core inside the plate's bounding box (plate-local frame).
    let lx = clamp(pos.x, 0, Math.max(0, plateWmm - w));
    let ly = clamp(pos.y, 0, Math.max(0, plateHmm - h));
    // §STAIR-OFF-SHELL (§22.7) — the bbox clamp above can leave the rect proud of a
    // ROTATED shell (bbox ⊋ polygon) or re-escape a contained position. Re-validate
    // against the real shell polygon and nudge inward to a tightly-contained spot if it
    // escaped. Axis-aligned plate: bbox === shell ⇒ already contained ⇒ verbatim (D18).
    ({ x: lx, y: ly } = snapRectInsidePoly(lx, ly, w, h, plateWmm, plateHmm, poly));

    return { x: r3(minXmm + lx), y: r3(minZmm + ly), w: r3(w), h: r3(h) };
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
    /**
     * §STAIR-HALF-LANDING-INWARD (2026-06-09, founder "set the half-landing towards
     * the inside") — the WINNING placement KIND from {@link chooseStairCorePosition}
     * (`'central' | 'left' | 'right' | 'back'`). It tells the editor which side of the
     * plate the INTERIOR lies on, so a U-stair's second (return) flight + half-landing
     * fold TOWARD the plate interior instead of poking OUT past the perimeter wall the
     * core is flush against:
     *   - `'left'`  → core flush to the LEFT wall (x≈0)        → interior is +x
     *   - `'right'` → core flush to the RIGHT wall (x≈plateW)  → interior is −x
     *   - `'back'`  → core flush to the REAR wall (max-Z)      → interior is −z
     *   - `'central'` → no flush wall → keep the legacy left-of-flight-1 offset.
     * Plate-local LAYOUT frame (the same frame `rectMm` is authored in). Only the
     * U-shape executor branch consumes it; I/L are byte-identical regardless.
     */
    readonly interiorSide: StairCorePositionKind;
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
    // §STAIR-WORST-ASPECT — optional site solar (latitude) so the shaped core hugs
    // the poor-aspect perimeter wall. Absent ⇒ legacy waste-only (bit-identical).
    solar?: StairSolar,
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

    // For I we reuse the straight-run reservation — now sized to the real run length
    // (§STAIR-RUN-BOUND) by threading the riser count through, so the reserved cell
    // bounds the rendered flight and the stair stays inside the shell.
    if (shape === 'I') {
        const rect = reserveStairCore(footprint, storeyCount, solar, totalRisers);
        // §STAIR-HALF-LANDING-INWARD — re-derive the placement KIND for the I-rect with
        // the SAME scorer `reserveStairCore` ran (identical inputs → identical winner), so
        // the shaped core still reports which wall it abuts. The I executor branch ignores
        // it (a straight run has no return flight to fold), so this is metadata-only for I.
        const iPoly = plateLocalPolyMm(footprint, bb);
        const iPos = chooseStairCorePosition(
            plateWmm, plateHmm, rect.w, rect.h, iPoly, aspectBiasFor(solar),
        );
        return { rectMm: rect, shape: 'I', risersBeforeLanding: 0, landingDepthM: 0, interiorSide: iPos.kind };
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
    // §STAIR-WORST-ASPECT — bias toward the poor-aspect wall when solar is supplied.
    const poly = plateLocalPolyMm(footprint, bb);
    const pos = chooseStairCorePosition(
        plateWmm, plateHmm, w, h, poly, aspectBiasFor(solar),
    );
    let lx = clamp(pos.x, 0, Math.max(0, plateWmm - w));
    let ly = clamp(pos.y, 0, Math.max(0, plateHmm - h));
    // §STAIR-OFF-SHELL (§22.7) — re-validate the post-bbox-clamp rect against the
    // rotated shell polygon and nudge inward; axis-aligned ⇒ already contained ⇒
    // verbatim (A.21.D18 byte-identity).
    ({ x: lx, y: ly } = snapRectInsidePoly(lx, ly, w, h, plateWmm, plateHmm, poly));
    const x = minXmm + lx;
    const y = minZmm + ly;

    const { before } = splitRisersForShape(shape, Math.max(2, Math.round(totalRisers)));
    // Landing depth: L = one stair width (~1.0 m); U = two widths (~2.0 m) so the
    // half-landing spans both parallel runs — matching StairCreationController.
    const landingDepthM = shape === 'U' ? 2.0 : 1.0;

    return {
        rectMm: { x: r3(x), y: r3(y), w: r3(w), h: r3(h) },
        shape,
        risersBeforeLanding: before,
        landingDepthM,
        // §STAIR-HALF-LANDING-INWARD — the winning placement kind tells the executor
        // which side of the plate the interior lies on, so a U-stair's half-landing +
        // return flight fold INWARD (not out past the flush perimeter wall).
        interiorSide: pos.kind,
    };
}

export { bboxOf as __bboxOfForTest, chooseStairShape as __chooseStairShapeForTest };
