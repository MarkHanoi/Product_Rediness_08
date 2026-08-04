// ADR-0288 / §COR-MC-FOOTPRINT — the `occupation-capped-alignment` footprint construction.
//
// ⚠⚠⚠ READ `GeometricRule.ts`'s `OccupationCappedAlignmentRuleSchema` HEADER FIRST. This module
// does NOT extract a shape from an ordinance. It implements a documented PRYZM ENGINEERING
// DECISION for the one legal shape a stated occupation ratio with NO stated siting rule leaves
// genuinely open: which of the infinitely many area-`cap`-sized footprints does PRYZM draw?
//
// THE CHOSEN CONSTRUCTION (and why)
// ----------------------------------
// Front-align + party-wall sides + unconstrained depth means the building COULD legally fill the
// WHOLE parcel behind the alignment, subject only to the area cap. So PRYZM draws the MAXIMAL
// legally-consistent envelope at the alignment's own frontage width: extend the already-inset
// (front/side/rear-treated) ring straight back from the aligned edge until EITHER
//   (a) the accumulated footprint area equals `targetAreaM2` (the occupation cap), or
//   (b) the ring's own rear boundary is reached (the parcel is too shallow for the cap to bind),
// whichever comes first. This is the SAME half-plane-clip primitive `alignment` already uses
// (`clipToDepthBand`) — no new geometric operation, no parallel clipper — with the difference that
// the DEPTH fed into it is SOLVED (to hit a target area) rather than read as a scalar from the
// pack. That mirrors exactly how `block-derived-alignment` and `tiered-occupation` already solve
// a depth/band rather than reading one, and reuses their bisection idiom (`blockDerivedDepth.ts`).
//
// WHY A RECTANGLE-AT-FRONTAGE-WIDTH AND NOT SOME OTHER AREA-`cap` SHAPE. It is the least arbitrary
// choice available: every input (the front-aligned inset's own width, the parcel's own rear
// boundary, the stated occupation ratio) is a REAL, already-held value, and the ONLY new thing
// this module contributes is WHERE inside that envelope the depth stops — which is exactly the
// same kind of choice `alignment`'s stated depth makes, except here the depth is derived from an
// area target instead of quoted from the ordinance. A thin L-shape or a corner-square would
// satisfy the same area cap with EQUAL legal validity and ZERO more justification — this module
// picks the shape that is useful for massing/feasibility (a buildable volume a design can actually
// start from) and says, loudly, everywhere it surfaces, that this is a choice and not a citation.
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG. Deterministic (C58 §1.1): a fixed bisection
// budget, never a tolerance-based while-loop, for the same reason `blockDerivedDepth.ts` uses one.

import type { Pt } from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import { clipToDepthBand } from './depthBandClip.js';

/** Fixed bisection budget — see `blockDerivedDepth.ts`'s identical note on why this is fixed
 *  rather than tolerance-based (C58 §1.1 byte-determinism). 40 halvings of any realistic parcel
 *  depth (metres) resolves far below millimetre precision. */
export const OCCUPATION_CAPPED_DEPTH_BISECTION_STEPS = 40;

export interface OccupationCappedDepthResult {
    /** The clipped footprint ring (scene-XZ metres). Empty when `degenerate`. */
    readonly polygon: Pt[];
    readonly areaM2: number;
    readonly degenerate: boolean;
    /**
     * TRUE when the occupation cap did NOT bind — the front/side/rear-treated inset, taken all the
     * way to the parcel's own rear boundary, is already at or under the cap. The honest reading is
     * "this parcel is too shallow for the ordinance's occupation limit to be the constraint"; the
     * FULL inset is returned, not a truncated one — truncating an already-compliant ring would
     * under-state what the ordinance actually permits (§CONTEXT-DATA-HONESTY: unknown ≠ zero, and
     * here the analogous error would be "non-binding ≠ smaller").
     */
    readonly capInactive: boolean;
    /** The solved depth (metres) from the aligned edge, or `null` when `capInactive`/`degenerate`
     *  (the full, un-truncated inset was used and no single depth number governs it). */
    readonly depth_m: number | null;
}

/**
 * Solve, then clip, the `occupation-capped-alignment` footprint (ADR-0288).
 *
 * @param insetPolygon  the ALREADY front/side/rear-treated ring (the output of
 *   `insetPolygonPerEdge` for this rule's `alignmentOffset_m` / `sideTreatment` / `rear_m`) — the
 *   candidate footprint BEFORE any depth truncation, exactly as `alignment`'s caller passes it to
 *   `clipToDepthBand`.
 * @param edgeA,edgeB   the aligned edge (the alineación), same contract as `clipToDepthBand`.
 * @param targetAreaM2  `maxCoverage × polygonArea(parcelRing)` — the ocupación cap, computed by
 *   the caller so this module stays ignorant of where the ratio came from (ADR-0270 P5 — the
 *   engine reads resolved fields, this geometry helper reads only geometry + one target number).
 */
export function solveOccupationCappedDepth(
    insetPolygon: ReadonlyArray<Pt>,
    edgeA: Pt,
    edgeB: Pt,
    targetAreaM2: number,
): OccupationCappedDepthResult {
    if (insetPolygon.length < 3 || !Number.isFinite(targetAreaM2) || targetAreaM2 <= 0) {
        return { polygon: [], areaM2: 0, degenerate: true, capInactive: false, depth_m: null };
    }

    const fullAreaM2 = polygonArea(insetPolygon);
    if (!(fullAreaM2 > 0)) {
        return { polygon: [], areaM2: 0, degenerate: true, capInactive: false, depth_m: null };
    }

    // The cap does not bind: the whole (rear-bounded) inset is already within the occupation
    // limit. Return it UNTRUNCATED — see `capInactive`'s docstring for why this is not a `0` depth.
    if (fullAreaM2 <= targetAreaM2) {
        return {
            polygon: insetPolygon.map((p) => ({ x: p.x, z: p.z })),
            areaM2: fullAreaM2,
            degenerate: false,
            capInactive: true,
            depth_m: null,
        };
    }

    // The maximum depth that could ever matter is bounded by the inset's own extent from the
    // aligned edge — searching further can never reduce area, so it wastes bisection steps without
    // changing the answer. `clipToDepthBand`'s `bandInactive` already tells us this cheaply: probe
    // a depth far beyond any plausible parcel and read back the ring's true extent from its area
    // approaching `fullAreaM2`. Simpler and equally exact: bisect directly on depth against area,
    // since `clipToDepthBand`'s half-plane clip is monotonically NON-DECREASING in depth (deeper
    // band ⇒ same or more of the ring retained) — the same monotonicity argument
    // `blockDerivedDepth.ts` relies on, mirrored rather than duplicated in spirit.
    let lo = 0;              // area(lo) = 0 (or undefined — treated as below target)
    let hi = maxExtentFrom(insetPolygon, edgeA, edgeB);
    if (!(hi > 0)) {
        return { polygon: [], areaM2: 0, degenerate: true, capInactive: false, depth_m: null };
    }

    for (let i = 0; i < OCCUPATION_CAPPED_DEPTH_BISECTION_STEPS; i++) {
        const mid = (lo + hi) / 2;
        const clipped = clipToDepthBand(insetPolygon, edgeA, edgeB, mid);
        const midArea = clipped.degenerate ? 0 : polygonArea(clipped.polygon);
        if (midArea < targetAreaM2) lo = mid;
        else hi = mid;
    }

    const solved = clipToDepthBand(insetPolygon, edgeA, edgeB, hi);
    if (solved.degenerate || solved.polygon.length < 3) {
        return { polygon: [], areaM2: 0, degenerate: true, capInactive: false, depth_m: null };
    }
    return {
        polygon: solved.polygon,
        areaM2: polygonArea(solved.polygon),
        degenerate: false,
        capInactive: false,
        depth_m: hi,
    };
}

function sub(a: Pt, b: Pt): Pt {
    return { x: a.x - b.x, z: a.z - b.z };
}
function dot(a: Pt, b: Pt): number {
    return a.x * b.x + a.z * b.z;
}

/**
 * The furthest any vertex of `ring` lies from the aligned edge, along its inward normal — an
 * upper bound on the depth a bisection ever needs to probe. Duplicates `clipToDepthBand`'s own
 * inward-normal resolution (ring-centroid test, winding-agnostic) rather than importing an
 * unexported helper — a deliberate, small duplication so this module's public surface stays one
 * function and does not reach into `depthBandClip.ts`'s internals.
 */
function maxExtentFrom(ring: ReadonlyArray<Pt>, edgeA: Pt, edgeB: Pt): number {
    const d = sub(edgeB, edgeA);
    const len = Math.hypot(d.x, d.z);
    if (len <= 1e-6) return 0;
    let n = { x: -d.z / len, z: d.x / len };
    let cx = 0, cz = 0;
    for (const p of ring) { cx += p.x; cz += p.z; }
    const centroid = { x: cx / ring.length, z: cz / ring.length };
    if (dot(n, sub(centroid, edgeA)) < 0) n = { x: -n.x, z: -n.z };
    let maxD = 0;
    for (const p of ring) maxD = Math.max(maxD, dot(sub(p, edgeA), n));
    return maxD;
}
