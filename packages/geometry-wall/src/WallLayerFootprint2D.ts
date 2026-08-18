// WallLayerFootprint2D — per-LAYER footprint bands cut out of the ADR-0055 V2 wall
// footprint (the missing P2 half for LAYERED walls).
//
// PURE module (no THREE, no DOM, no I/O) — same contract as `WallFootprint2D`.
//
// ─── WHY THIS EXISTS: §FIX-LAYERED-WALL-V2-PARITY (founder 2026-08-06) ────────────────────
//
// The founder drew a LAYERED interior partition whose first point was the L JUNCTION of two
// existing walls and got a CLASH — the partition's end poking through the corner. Standing
// rule: "THERE SHOULD NEVER BE A CLASH OF WALLS."
//
// The cause is a PIPELINE PARITY GAP, not a bad number:
//
//   • A PLAIN wall body is built by `WallFragmentBuilder.createWallBodyFragment`, which routes
//     through the ADR-0055 V2 chain — `JunctionResolverV2.resolveJunctions` →
//     `WallFootprint2D.buildWallFootprint` → `WallPolygonExtruder.buildWallExtrusion`. V2
//     solves the whole junction as ONE ring sweep, so adjacent wall footprints are
//     edge-coincident BY CONSTRUCTION: they touch, they never interpenetrate.
//
//   • A LAYERED wall never reaches that function. The layered branch of `buildWall()` returns
//     early and builds one `MiterPrismBuilder.buildMiterPrism` per layer from the LEGACY
//     `WallJoinResolver` miter normals. The legacy miter is a per-wall PLANE PROJECTION with
//     no cross-wall non-overlap guarantee, so at a junction the two solvers disagree.
//
// MEASURED on the founder's case (two 0.30 m arms mitred at the origin + a diagonal guest
// starting at the corner; grid sampler at 2 mm, identical to
// `WallJoinResolver.clashFreeFootprints.test.ts`):
//
//       guest ∩ arm        LEGACY (layered path)      V2 (plain path)
//       0.10 m guest              2 520 mm²                  0 mm²
//       0.375 m guest            35 112 mm²                  0 mm²
//
// V2 already answers the founder's case correctly. The layered path simply never asks it.
//
// ─── WHAT THIS MODULE DOES ───────────────────────────────────────────────────────────────
//
// Given the wall's V2 footprint (already mitred against every neighbour) and the authored
// layer thicknesses, slice the footprint into N bands with half-plane clips parallel to the
// wall axis. Two properties fall out and are the whole point:
//
//   1. Every band is a SUBSET of the footprint ⇒ if the footprint does not clash, no band
//      clashes. Non-overlap with the neighbours is INHERITED, not re-derived. There is no
//      second miter solver to disagree with the first.
//   2. Bands are pairwise disjoint and, when the authored layers sum to the wall thickness,
//      their union is exactly the footprint ⇒ no seam, no doubled solid between layers.
//
// The band's lateral extents use the SAME convention as the layered branch of
// `WallFragmentBuilder` today (`cursor = -totalThickness / 2`, stacking along
// `outward = leftPerp(dir)`), so layer ORDER and layer POSITION are byte-unchanged; only the
// mitred ends move — from the legacy projection to V2's junction-solved corners.
//
// Deliberate non-goal: this module does NOT reconcile a layer stack whose thicknesses do not
// sum to `wall.thickness`. It clips to the footprint, so an under-sum leaves the outer face
// short (visible, honest) and an over-sum is trimmed at the footprint boundary (never a
// clash). `layerSumMismatch` reports the discrepancy so a caller can surface it rather than
// discover it as geometry.

// ─── §FEAT-RAKE-LAYERED (founder 2026-08-18) ─────────────────────────────────────────────
//
// "In parallel I need LAYERED walls to work with RAKED walls too."
//
// A layer authored `t` thick is `t` thick PERPENDICULAR to the wall face (that is what a
// system-type layer means, and `wall.thickness` is stamped as `Σ t` — so it too is a
// perpendicular quantity for a layered wall). Once the wall is sheared to θ, that same layer
// occupies `t / sin θ` in PLAN. This module is where the bands are cut, so this is where the
// conversion belongs — via the single canonical `WallRake.rakedPlanThickness`, never a local
// `/ Math.sin(...)`.
//
// Everything else is unchanged. `rakeAngleDeg` is OPTIONAL and absent/90 short-circuits to the
// exact pre-existing arithmetic (`rakedPlanThickness` returns its input at 90°), so a vertical
// layered wall's bands are byte-identical — same `total`, same `cursor` walk, same clips.
//
// The CALLER is responsible for handing in a footprint whose plan half-thickness is already the
// RAKED one (`wall.thickness / sin θ`); `WallPipelineV2.effectivePlanThickness` does that for
// both the junction solve and the footprint, so the bands and the polygon they are clipped
// against are built in the same frame. `layerSumMismatch` is therefore also a PLAN-space
// quantity: it compares the plan stack against the plan footprint, and is 0 for a
// correctly-authored stack at any rake — not just at 90°.

import type { Pt2 } from './JunctionResolverV2.js';
import type { WallFootprint } from './WallFootprint2D.js';
import { rakedPlanThickness } from './WallRake.js';

/** One layer's plan-XZ region, in the same winding as the source footprint. */
export interface WallLayerBand {
    /** Index into the authored `layerThicknesses` array. */
    readonly index: number;
    /** Clipped polygon in world plan-XZ. EMPTY when the band falls outside the footprint. */
    readonly polygon: readonly Pt2[];
    /** Signed lateral extents of the band along `leftPerp(direction)`, relative to the
     *  centreline. `lo < hi`. Useful for callers that need the band's nominal position.
     *  §FEAT-RAKE-LAYERED: these are PLAN extents — `hi - lo` is `t / sin θ`, not `t`. */
    readonly lateralLo: number;
    readonly lateralHi: number;
    /** §FEAT-RAKE-LAYERED — the band's nominal PLAN width, `t_i / sin θ` (= `t_i` at 90°).
     *  Stated explicitly so a caller asserting the founder's number does not have to
     *  re-derive it from `hi - lo` and re-introduce the division this module owns. */
    readonly planThickness: number;
}

export interface WallLayerBands {
    readonly wallId: string;
    readonly bands: readonly WallLayerBand[];
    /** `sum(layerThicknesses) − 2 * footprint.halfThickness`. 0 when the stack fills the wall.
     *  Non-zero is an AUTHORING inconsistency, reported rather than silently absorbed. */
    readonly layerSumMismatch: number;
}

// ─── Pure 2-D helpers (mirrored from WallFootprint2D — same style, no shared mutable state) ──

const len = (a: Pt2): number => Math.hypot(a.x, a.z);
const unit = (a: Pt2): Pt2 => { const L = len(a) || 1; return { x: a.x / L, z: a.z / L }; };
const leftPerp = (d: Pt2): Pt2 => ({ x: -d.z, z: d.x });   // CCW 90°

/**
 * Clip `poly` to the half-plane `sign * (u(p) - bound) >= 0`, where `u(p)` is the signed
 * lateral coordinate of `p` measured along `axis` from `origin`.
 *
 * Sutherland–Hodgman against a single half-plane. The clip region is convex (a half-plane),
 * so the algorithm is exact for any SIMPLE subject polygon; a wall footprint is monotone in
 * the lateral direction (a left chain and a right chain), so the result is a single region —
 * no degenerate bridge edges. Winding is preserved.
 */
function clipHalfPlane(
    poly: readonly Pt2[],
    origin: Pt2,
    axis: Pt2,
    bound: number,
    sign: 1 | -1,
): Pt2[] {
    if (poly.length < 3) return [];
    const u = (p: Pt2): number => sign * (((p.x - origin.x) * axis.x + (p.z - origin.z) * axis.z) - bound);
    const out: Pt2[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const ua = u(a);
        const ub = u(b);
        const aIn = ua >= 0;
        const bIn = ub >= 0;
        if (aIn) out.push(a);
        if (aIn !== bIn) {
            const denom = ua - ub;
            // |denom| is the lateral span of this edge; a near-zero span means the edge lies
            // ON the clip line, in which case both endpoints are effectively "in" and no new
            // vertex is needed. Guarding here keeps a NaN out of the polygon.
            if (Math.abs(denom) > 1e-12) {
                const t = ua / denom;
                out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
            }
        }
    }
    // Drop duplicate consecutive vertices the clip can introduce at a grazing corner; they
    // extrude into zero-area side quads and confuse downstream area/winding maths.
    const dedup: Pt2[] = [];
    for (const p of out) {
        const q = dedup[dedup.length - 1];
        if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 1e-9) dedup.push(p);
    }
    if (dedup.length > 1) {
        const first = dedup[0]!;
        const last = dedup[dedup.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) <= 1e-9) dedup.pop();
    }
    return dedup.length >= 3 ? dedup : [];
}

/**
 * §FIX-LAYERED-WALL-V2-PARITY — slice one wall's V2 footprint into per-layer bands.
 *
 * `layerThicknesses` is the authored stack, exterior→interior, in the SAME order the layered
 * branch of `WallFragmentBuilder` walks today. Band *i* occupies the lateral interval
 * `[-total/2 + Σ_{j<i} t_j, ... + t_i]` measured along `leftPerp(footprint.direction)` from
 * the wall centreline — identical to the existing `cursor` walk, so no layer moves sideways.
 *
 * Returns EMPTY polygons (never throws) for a degenerate/invalid footprint or a non-finite
 * thickness, so the caller's contract is "skip the empty bands", matching how
 * `buildWallExtrusion` already treats a sub-3-vertex polygon.
 */
export function buildWallLayerBands(
    footprint: WallFootprint,
    layerThicknesses: readonly number[],
    rakeAngleDeg?: number | null,
): WallLayerBands {
    // §FEAT-RAKE-LAYERED — PERPENDICULAR (authored) → PLAN, once, up front. At 90° this is
    // the identity map, so every number below is the pre-rake number.
    const planT = layerThicknesses.map(t => rakedPlanThickness(t, rakeAngleDeg));

    const empty = (mismatch: number): WallLayerBands => ({
        wallId: footprint.id,
        bands: planT.map((t, i) => ({
            index: i, polygon: [] as readonly Pt2[], lateralLo: 0, lateralHi: Number.isFinite(t) ? t : 0,
            planThickness: Number.isFinite(t) ? t : 0,
        })),
        layerSumMismatch: mismatch,
    });

    if (footprint.invalid || footprint.polygon.length < 3 || layerThicknesses.length === 0) {
        return empty(0);
    }
    let total = 0;
    for (const t of planT) {
        if (!Number.isFinite(t) || t <= 0) return empty(0);
        total += t;
    }

    const dir = unit(footprint.direction);
    const axis = leftPerp(dir);
    const origin = footprint.start;
    const mismatch = total - 2 * footprint.halfThickness;

    const bands: WallLayerBand[] = [];
    let cursor = -total / 2;
    for (let i = 0; i < planT.length; i++) {
        const lo = cursor;
        const hi = cursor + planT[i]!;
        cursor = hi;
        // Two half-plane clips: u >= lo, then u <= hi.
        const lower = clipHalfPlane(footprint.polygon, origin, axis, lo, +1);
        const polygon = lower.length >= 3 ? clipHalfPlane(lower, origin, axis, hi, -1) : [];
        bands.push({ index: i, polygon, lateralLo: lo, lateralHi: hi, planThickness: planT[i]! });
    }

    return { wallId: footprint.id, bands, layerSumMismatch: mismatch };
}
