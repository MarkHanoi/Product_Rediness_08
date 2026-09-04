// §K1-INCLINED-TOP — PIECEWISE-PLANAR (INCLINED) TOPS as a 2.5D HEIGHT FIELD over an envelope
// footprint: h(p) = max(0, min(flatCap, min_i plane_i(p))).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — the one genuinely-missing kernel primitive (validation-matrix §A.1)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A five-country family of ordinances caps height not by a number but by an INCLINED PLANE tied
// to a boundary or alignment:
//   · DK *det skrå højdegrænseplan* — h ≤ 1.4 × distance to the relevant boundary (BR18 family);
//     the repo had ZERO machinery for it (all three audit lanes missed it, and DK contributes
//     zero solves to the never-overstate gate, so the omission was invisible — a latent
//     near-boundary OVERSTATEMENT class).
//   · DE LBO §6-family Abstandsflächen closed form — 0.4×H planes from each boundary.
//   · FR Paris couronnement / gabarit-enveloppe — the crown taper above the vertical.
//   · ES coronación, NL dakhelling — same construction, different names.
//
// Every one of these is "min over affine planes, plus flat caps" — a HEIGHT FIELD over the
// footprint, NOT a 3D solid problem. Lane B §2.3's verdict, followed here exactly: *"extend the
// envelope model to prism × piecewise-planar top … Compute all legal numbers (areas, volumes =
// integral of the height field) in 2.5D with stated error direction"* — and **no 3D CSG**
// (validation-matrix §D forbids it; `manifold-3d` stays display/export-only).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE CALLER PASSES — RESOLVED PLANES, NEVER A RULE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This module knows NOTHING about rule kinds, ordinances or countries. A caller (the engine, once
// the schema seats for plane-shaped rules exist — the parallel SEATS lane owns those kinds)
// resolves an ordinance into `InclinedPlaneSpec`s: an origin LINE (two points), the height AT the
// line, and the slope per metre of signed distance from it (positive side = LEFT of A→B; the
// caller orients the line so the footprint lies on the positive side —
// `planesFromBoundaryEdges` does that orientation for the by-far commonest case). Inventing a
// rule kind here would fork the C58 vocabulary — deliberately not done.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO OUTPUTS AND THEIR ERROR DIRECTIONS (read before consuming a number)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. `solveInclinedTop` — the LEGAL numbers: the EXACT volume ∫∫ h dA and the exact governed
//      cells. Exact because the lower envelope of affine planes decomposes the footprint into
//      cells (one per governing plane, each an intersection of half-planes — every `{h_i ≤ h_j}`
//      is affine, hence a half-plane), and ∫∫ (c0 + cx·x + cz·z) dA over a polygon has a closed
//      form (shoelace first moments). Error is float-only; there is no discretisation term.
//   2. `inclinedTopToTiers` — the DRAWN solid, emitted as `EnvelopeTier`s (polygon ×
//      [baseHeight_m, maxHeight_m]) — the EXACT shape the render path already consumes
//      (`envelopeToMassing` draws one prism per tier; no new render path). A terraced stack can
//      only UNDER-fill an inclined top, and the slices are INSCRIBED by construction: slice
//      [lo, hi] carries the region {p : h(p) ≥ hi}, so every prism lies wholly inside the true
//      solid. The drawn solid UNDER-states; the exact volume comes from (1) — the L-581 doctrine
//      (every departure from the exact object biased inward) applied to the vertical axis.
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG, no clock. Deterministic (C58 §1.1).
// Jurisdiction-agnostic (C58 §1.5). Tolerances: the C73 roles only (EPSILON_ZERO for numeric
// zero, COINCIDENT_M for point identity) — no new epsilon family is minted here.

import type { EnvelopeTier, Pt } from '@pryzm/schemas';
import { COINCIDENT_M, EPSILON_ZERO, isNumericallyZero } from '@pryzm/geometry-kernel';
import { normaliseRing, validateRing, describeRingDefect } from './ringValidation.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Specs
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ONE inclined plane: height `baseHeight_m` along the origin line A→B, rising `slopePerMeter`
 * per metre of signed perpendicular distance (positive = LEFT of A→B). The caller orients A→B so
 * the footprint lies on the positive side. DK's 1.4×d from a boundary edge is
 * `{ baseHeight_m: 0, slopePerMeter: 1.4 }` with the edge as the line.
 */
export interface InclinedPlaneSpec {
    /** Stable id for provenance / test naming (e.g. `'skraa-N'`, `'abstand-0.4H-west'`). */
    readonly id: string;
    readonly anchorA: Pt;
    readonly anchorB: Pt;
    readonly baseHeight_m: number;
    readonly slopePerMeter: number;
    /**
     * §GOVERNS-EXTENT (lane ENVELOPE-IBERIA, 2026-09-04 — the ONE shared-solver change the PT
     * consumer needs; made minimally, and every existing caller is unchanged because the field is
     * optional and `undefined`/`null` means "governs everywhere", which is exactly the prior
     * behaviour).
     *
     * The CONVEX region within which this plane GOVERNS. Outside it the plane does not enter the
     * min at all — it is ABSENT there, not "infinitely high". Two Portuguese rules cannot be
     * stated without this (RGEU art. 59, `countryAdapters/pt/ptRgeuArt59.ts`):
     *   • art. 59 §1 — the 45° line may start **1,50 m above ground on the DOWNHILL side** of
     *     sloping ground. A frontage that slopes along part of its run needs TWO plane segments
     *     (base 0 and base 1,50), each governing ONLY its along-line band. Without extents the
     *     tolerance is either applied to the whole frontage (OVERSTATES on the uphill part) or
     *     dropped (silently ignored — round one's finding).
     *   • art. 59 §2 — the corner rule: the narrower street's plane does NOT govern the first
     *     15 m from the corner, where the wider street's permitted height applies.
     * Expressed as a convex polygon (≥3 non-collinear vertices, any winding). Refused as
     * `invalid-plane` when non-convex, degenerate or non-finite — never repaired. Where the
     * footprint has a region covered by NO plane's extent and there is no flat cap, the solve
     * refuses `no-vertical-limit` naming the uncovered area (fabricating a top is the forbidden
     * direction, C58 §1.4).
     */
    readonly governsExtent?: ReadonlyArray<Pt> | null;
}

export interface InclinedTopSpec {
    /** The flat cap (e.g. DK 8.5 m), or null when only planes limit the top. */
    readonly flatCap_m: number | null;
    readonly planes: ReadonlyArray<InclinedPlaneSpec>;
}

export type InclinedTopRefusal =
    /** Footprint has < 3 distinct vertices or ~zero area. */
    | 'degenerate-footprint'
    /** Footprint is self-intersecting / non-finite — named, never repaired (`ringValidation.ts`). */
    | 'invalid-footprint-geometry'
    /** A plane has non-finite numbers, a degenerate (point) origin line, or a non-convex/degenerate `governsExtent`. */
    | 'invalid-plane'
    /**
     * No planes AND no flat cap — nothing bounds the top; refusing beats fabricating (C58 §1.4).
     * ALSO raised when every plane carries a `governsExtent`, there is no flat cap, and part of the
     * footprint lies outside all of them: the field is unbounded THERE, and the detail names the m².
     */
    | 'no-vertical-limit';

export type InclinedTopSolve =
    | {
          readonly ok: true;
          /** EXACT ∫∫ max(0, min(cap, min_i h_i)) dA over the footprint, m³. Float-only error. */
          readonly volumeM3: number;
          readonly footprintAreaM2: number;
          /** Highest field value attained on the footprint (at a cell vertex — the field is piecewise affine). */
          readonly peakHeightM: number;
          /** How many lower-envelope cells carried area (diagnostic; the flat cap counts as one). */
          readonly governedCells: number;
      }
    | { readonly ok: false; readonly reason: InclinedTopRefusal; readonly detail?: string };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Internal: affine forms + polygon integrals + half-plane clip
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A half-plane {a·x + b·z + c ≥ 0}. A `governsExtent` is the intersection of these. */
interface HalfPlane {
    readonly a: number;
    readonly b: number;
    readonly c: number;
}

/** h(x, z) = c0 + cx·x + cz·z. The flat cap is the affine form with cx = cz = 0. */
interface Affine {
    readonly id: string;
    readonly c0: number;
    readonly cx: number;
    readonly cz: number;
    /** §GOVERNS-EXTENT — the region this candidate is PRESENT in, as half-planes; null = everywhere. */
    readonly extent: ReadonlyArray<HalfPlane> | null;
}

/**
 * §GOVERNS-EXTENT — validate an extent polygon and express it as half-planes (interior ≥ 0).
 * Returns null when it is not a proper CONVEX polygon: non-finite, fewer than 3 distinct vertices,
 * ~zero area, or a reflex vertex. The caller refuses `invalid-plane`; nothing is repaired — a
 * "fixed" extent would govern land the ordinance never named.
 */
function extentToHalfPlanes(extent: ReadonlyArray<Pt>): HalfPlane[] | null {
    for (const p of extent) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    }
    const ring = normaliseRing(extent);
    if (ring.length < 3) return null;
    const [area] = areaAndMoments(ring);
    if (Math.abs(area) <= EPSILON_ZERO) return null;
    const ccw = area > 0 ? ring : ring.slice().reverse();
    const n = ccw.length;
    const out: HalfPlane[] = [];
    for (let i = 0; i < n; i++) {
        const p = ccw[i]!;
        const q = ccw[(i + 1) % n]!;
        const r = ccw[(i + 2) % n]!;
        // CONVEXITY: on a CCW ring every consecutive turn is a left turn; a right turn is a reflex
        // vertex, and a reflex extent is not one convex region — refused, never split silently.
        const turn = (q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x);
        if (turn < -EPSILON_ZERO) return null;
        // Interior (left of p→q) is {a·x + b·z + c ≥ 0} with (a, b) = (−(q.z−p.z), q.x−p.x).
        const a = -(q.z - p.z);
        const b = q.x - p.x;
        out.push({ a, b, c: -(a * p.x + b * p.z) });
    }
    return out;
}

/** Is `p` inside every half-plane (boundary inclusive, metric tolerance)? */
function halfPlanesContain(hs: ReadonlyArray<HalfPlane>, p: Pt): boolean {
    for (const h of hs) {
        const norm = Math.hypot(h.a, h.b);
        if (isNumericallyZero(norm)) continue;
        if ((h.a * p.x + h.b * p.z + h.c) / norm < -EPSILON_ZERO) return false;
    }
    return true;
}

function planeToAffine(p: InclinedPlaneSpec): Affine | null {
    const dx = p.anchorB.x - p.anchorA.x;
    const dz = p.anchorB.z - p.anchorA.z;
    const len = Math.hypot(dx, dz);
    if (
        !Number.isFinite(dx) || !Number.isFinite(dz) || len <= COINCIDENT_M ||
        !Number.isFinite(p.baseHeight_m) || !Number.isFinite(p.slopePerMeter)
    ) {
        return null;
    }
    let extent: HalfPlane[] | null = null;
    if (p.governsExtent !== undefined && p.governsExtent !== null) {
        extent = extentToHalfPlanes(p.governsExtent);
        if (extent === null) return null; // non-convex / degenerate extent — the caller refuses by name
    }
    // signedDist(q) = cross(dir, q − A) / |dir|  (positive = left of A→B in the x/z convention)
    const cx = (-p.slopePerMeter * dz) / len;
    const cz = (p.slopePerMeter * dx) / len;
    const c0 = p.baseHeight_m - cx * p.anchorA.x - cz * p.anchorA.z;
    return { id: p.id, c0, cx, cz, extent };
}

const affineAt = (f: Affine, x: number, z: number): number => f.c0 + f.cx * x + f.cz * z;

/** Shoelace area + first moments of a CCW polygon: [A, ∫x dA, ∫z dA]. Signed. */
function areaAndMoments(ring: ReadonlyArray<Pt>): [number, number, number] {
    let a = 0, mx = 0, mz = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % n]!;
        const cross = p.x * q.z - q.x * p.z;
        a += cross;
        mx += (p.x + q.x) * cross;
        mz += (p.z + q.z) * cross;
    }
    return [a / 2, mx / 6, mz / 6];
}

/**
 * Sutherland–Hodgman clip of `ring` to the half-plane {a·x + b·z + c ≥ 0}. Exact for the affine
 * half-planes this module builds (the same construction `depthBandClip` and the other estate
 * clippers use). A concave subject may come back with zero-width bridge edges where the true
 * intersection is disconnected — those are area-neutral (the two bridge traversals cancel in the
 * shoelace sum), so every integral computed here is unaffected; see the tier note in the header.
 */
function clipHalfPlane(ring: ReadonlyArray<Pt>, a: number, b: number, c: number): Pt[] {
    const norm = Math.hypot(a, b);
    if (isNumericallyZero(norm)) {
        // Degenerate constraint: constant. c ≥ 0 keeps everything; c < 0 keeps nothing.
        return c >= -EPSILON_ZERO ? ring.slice() : [];
    }
    const an = a / norm, bn = b / norm, cn = c / norm; // distances now in metres
    const out: Pt[] = [];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % n]!;
        const dp = an * p.x + bn * p.z + cn;
        const dq = an * q.x + bn * q.z + cn;
        const pIn = dp >= -EPSILON_ZERO;
        const qIn = dq >= -EPSILON_ZERO;
        if (pIn) out.push(p);
        if (pIn !== qIn) {
            const t = dp / (dp - dq); // denominators of mixed-sign pairs cannot vanish
            out.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
        }
    }
    return out;
}

/** Clip a ring to a whole extent (successive half-plane clips). Empty when nothing survives. */
function clipToExtent(ring: ReadonlyArray<Pt>, extent: ReadonlyArray<HalfPlane>): Pt[] {
    let cur: Pt[] = ring.slice();
    for (const h of extent) {
        if (cur.length < 3) return [];
        cur = clipHalfPlane(cur, h.a, h.b, h.c);
    }
    return cur.length >= 3 ? cur : [];
}

/**
 * §GOVERNS-EXTENT — the one construction the extent machinery rests on.
 *
 * Apply to every piece the constraint *"candidate `rival` must not undercut me here"*: keep
 * `piece ∩ {keep ≥ 0}` (where I am ≤ the rival, or where the rival's constraint holds), PLUS —
 * when the rival governs only inside `rivalExtent` — the part of `piece ∩ {keep < 0}` that lies
 * OUTSIDE the rival's extent, because the rival is simply ABSENT there. The complement of a convex
 * extent is a union of half-planes; it is emitted as the DISJOINT chain
 * `piece ∩ H̄₀`, `piece ∩ H₀ ∩ H̄₁`, `piece ∩ H₀ ∩ H₁ ∩ H̄₂`, … so the returned pieces overlap only on
 * measure-zero boundaries and their integrals SUM EXACTLY. With every extent null this reduces to
 * the single clip the pre-extent solver performed — the prior behaviour, bit for bit.
 */
function splitByRival(
    pieces: ReadonlyArray<ReadonlyArray<Pt>>,
    keep: HalfPlane,
    rivalExtent: ReadonlyArray<HalfPlane> | null,
): Pt[][] {
    const out: Pt[][] = [];
    for (const piece of pieces) {
        const inside = clipHalfPlane(piece, keep.a, keep.b, keep.c);
        if (inside.length >= 3) out.push(inside);
        if (rivalExtent === null) continue;
        let cur = clipHalfPlane(piece, -keep.a, -keep.b, -keep.c);
        for (const h of rivalExtent) {
            if (cur.length < 3) break;
            const outsideH = clipHalfPlane(cur, -h.a, -h.b, -h.c);
            if (outsideH.length >= 3) out.push(outsideH);
            cur = clipHalfPlane(cur, h.a, h.b, h.c);
        }
    }
    return out;
}

/** Total unsigned area of a set of pieces. */
function piecesArea(pieces: ReadonlyArray<ReadonlyArray<Pt>>): number {
    let s = 0;
    for (const p of pieces) s += Math.abs(areaAndMoments(p)[0]);
    return s;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1 — THE HEIGHT FIELD (pointwise)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The field value at one point: max(0, min(flatCap, min_i plane_i(p))). The clamp at 0 is a
 * statement, not a convenience: a plane that dips below ground grants no height there, never a
 * negative volume credit. Callers evaluating outside the footprint get the unrestricted field —
 * containment is the footprint's job, not this function's.
 */
export function inclinedTopHeightAt(p: Pt, spec: InclinedTopSpec): number {
    let h = spec.flatCap_m ?? Number.POSITIVE_INFINITY;
    for (const plane of spec.planes) {
        const f = planeToAffine(plane);
        if (f === null) return Number.NaN; // invalid plane — solve() refuses this properly
        // §GOVERNS-EXTENT — a plane absent at p does not enter the min (it is not "infinite").
        if (f.extent !== null && !halfPlanesContain(f.extent, p)) continue;
        h = Math.min(h, affineAt(f, p.x, p.z));
    }
    if (!Number.isFinite(h)) return Number.NaN; // no vertical limit — solve() refuses
    return Math.max(0, h);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2 — THE EXACT SOLVE (legal numbers)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Validate + orient the footprint, or say why not. Shared by the solve and the tier emitter. */
function prepareFootprint(
    footprint: ReadonlyArray<Pt>,
): Pt[] | { readonly reason: InclinedTopRefusal; readonly detail: string } {
    const ring = normaliseRing(footprint);
    if (ring.length < 3) {
        return { reason: 'degenerate-footprint', detail: `footprint has ${ring.length} distinct vertices (< 3)` };
    }
    const defect = validateRing(ring);
    if (defect === 'zero-area' || defect === 'too-few-vertices') {
        return { reason: 'degenerate-footprint', detail: describeRingDefect(defect) };
    }
    if (defect !== null) {
        return { reason: 'invalid-footprint-geometry', detail: describeRingDefect(defect) };
    }
    const [a] = areaAndMoments(ring);
    return a >= 0 ? ring : ring.slice().reverse();
}

/** Resolve the candidate affine set (planes + cap), or refuse. */
function prepareCandidates(
    spec: InclinedTopSpec,
): Affine[] | { readonly reason: InclinedTopRefusal; readonly detail: string } {
    if (spec.flatCap_m !== null && (!Number.isFinite(spec.flatCap_m) || spec.flatCap_m < 0)) {
        return { reason: 'invalid-plane', detail: `flatCap_m is ${spec.flatCap_m}` };
    }
    if (spec.planes.length === 0 && spec.flatCap_m === null) {
        return {
            reason: 'no-vertical-limit',
            detail: 'no planes and no flat cap — nothing bounds the top, and fabricating one is the forbidden direction',
        };
    }
    const candidates: Affine[] = [];
    for (const p of spec.planes) {
        const f = planeToAffine(p);
        if (f === null) {
            return {
                reason: 'invalid-plane',
                detail:
                    `plane '${p.id}' has a degenerate origin line, non-finite numbers, or a ` +
                    'governsExtent that is not a proper convex polygon',
            };
        }
        candidates.push(f);
    }
    if (spec.flatCap_m !== null) {
        candidates.push({ id: '§flat-cap', c0: spec.flatCap_m, cx: 0, cz: 0, extent: null });
    }
    // Dedupe parallel-identical-gradient candidates: the lower constant governs everywhere; the
    // higher one can never be the min and only degrades the cell arithmetic.
    // §GOVERNS-EXTENT — ONLY between two GLOBAL candidates: a plane present in part of the footprint
    // and a parallel global one are both live (the lower governs inside the extent, the global one
    // outside), so deduping either would drop a real constraint.
    const kept: Affine[] = [];
    for (const f of candidates) {
        const rival =
            f.extent === null
                ? kept.findIndex(
                      (g) =>
                          g.extent === null &&
                          Math.abs(g.cx - f.cx) <= EPSILON_ZERO &&
                          Math.abs(g.cz - f.cz) <= EPSILON_ZERO,
                  )
                : -1;
        if (rival === -1) kept.push(f);
        else if (f.c0 < kept[rival]!.c0) kept[rival] = f;
    }
    return kept;
}

/**
 * §GOVERNS-EXTENT — the part of the footprint bounded by NO candidate. Empty whenever any candidate
 * is global (a flat cap or an extent-less plane). Where it is non-empty the field is unbounded
 * there and the solve refuses `no-vertical-limit`: an inclined top that quietly grants infinite
 * height beside the last governed strip is the C58 §1.4 forbidden direction.
 */
function uncoveredPieces(ring: ReadonlyArray<Pt>, candidates: ReadonlyArray<Affine>): Pt[][] {
    if (candidates.some((c) => c.extent === null)) return [];
    let uncovered: Pt[][] = [ring.slice()];
    for (const c of candidates) {
        const next: Pt[][] = [];
        for (const piece of uncovered) {
            let cur: Pt[] = piece;
            for (const h of c.extent!) {
                if (cur.length < 3) break;
                const outside = clipHalfPlane(cur, -h.a, -h.b, -h.c);
                if (outside.length >= 3) next.push(outside);
                cur = clipHalfPlane(cur, h.a, h.b, h.c);
            }
        }
        uncovered = next;
        if (uncovered.length === 0) break;
    }
    return uncovered;
}

/**
 * The EXACT solve: volume = Σ over candidates i of ∫∫ h_i dA over cell_i, where
 * cell_i = footprint ∩ {h_i ≤ h_j ∀ j ≠ i} ∩ {h_i ≥ 0} — the lower-envelope decomposition.
 * Cell boundaries are shared lines (measure zero), so the cells tile the positive-height region
 * exactly and the sum is the exact integral, to float precision. See the header for why this is
 * the legal-number path while `inclinedTopToTiers` is the drawn-solid path.
 */
export function solveInclinedTop(footprint: ReadonlyArray<Pt>, spec: InclinedTopSpec): InclinedTopSolve {
    const ring = prepareFootprint(footprint);
    if (!Array.isArray(ring)) return { ok: false, ...ring };
    const candidates = prepareCandidates(spec);
    if (!Array.isArray(candidates)) return { ok: false, ...candidates };

    const [footArea] = areaAndMoments(ring);

    // §GOVERNS-EXTENT — refuse before integrating if any part of the footprint is unbounded.
    const uncovered = uncoveredPieces(ring, candidates);
    const uncoveredArea = piecesArea(uncovered);
    if (uncoveredArea > EPSILON_ZERO) {
        return {
            ok: false,
            reason: 'no-vertical-limit',
            detail:
                `${uncoveredArea.toFixed(2)} m² of the footprint lies outside every plane's ` +
                'governsExtent and there is no flat cap — the top is unbounded there, and fabricating ' +
                'one is the forbidden direction',
        };
    }

    let volume = 0;
    let peak = 0;
    let governedCells = 0;
    for (let i = 0; i < candidates.length; i++) {
        const f = candidates[i]!;
        // The candidate's own presence region first (§GOVERNS-EXTENT), then the lower-envelope
        // condition against every rival — as DISJOINT pieces, because a rival that is absent over
        // part of the footprint cannot undercut there (see `splitByRival`).
        let pieces: Pt[][] = f.extent === null ? [ring.slice()] : (() => { const c = clipToExtent(ring, f.extent); return c.length >= 3 ? [c] : []; })();
        for (let j = 0; j < candidates.length && pieces.length > 0; j++) {
            if (j === i) continue;
            const g = candidates[j]!;
            // {h_i ≤ h_j} ⇔ {(c0j−c0i) + (cxj−cxi)·x + (czj−czi)·z ≥ 0}
            pieces = splitByRival(pieces, { a: g.cx - f.cx, b: g.cz - f.cz, c: g.c0 - f.c0 }, g.extent);
        }
        let governedHere = false;
        for (const piece of pieces) {
            // {h_i ≥ 0} — the ground clamp: a governing plane below ground contributes nothing.
            const cell = clipHalfPlane(piece, f.cx, f.cz, f.c0);
            if (cell.length < 3) continue;
            const [a, mx, mz] = areaAndMoments(cell);
            if (a <= EPSILON_ZERO) continue;
            volume += f.c0 * a + f.cx * mx + f.cz * mz;
            governedHere = true;
            for (const v of cell) peak = Math.max(peak, affineAt(f, v.x, v.z));
        }
        if (governedHere) governedCells += 1;
    }

    return {
        ok: true,
        volumeM3: volume,
        footprintAreaM2: Math.abs(footArea),
        peakHeightM: peak,
        governedCells,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 3 — THE DRAWN SOLID: EnvelopeTier slices (inscribed — the render path unchanged)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface InclinedTopTierOptions {
    /** Number of horizontal slices (default 12). More slices = finer terraces, same direction of error. */
    readonly slices?: number;
    /** Tier id prefix (default `'inclined-slice'`). */
    readonly idPrefix?: string;
    /** Human label prefix (default `'Inclined-plane envelope slice'`). */
    readonly labelPrefix?: string;
    /** The ordinance paragraph that grants the inclined top, threaded onto every tier. */
    readonly ordinanceRef?: string | null;
}

/**
 * Emit the height field as stacked `EnvelopeTier` prisms the existing render path consumes as-is
 * (`envelopeToMassing` — one solid per tier; no new render path, per the lane brief).
 *
 * INSCRIBED BY CONSTRUCTION: slice k spans [t_k, t_{k+1}] and carries the region
 * {p : h(p) ≥ t_{k+1}} (footprint ∩ ⋂_i {h_i ≥ t_{k+1}}, cap permitting), so every emitted prism
 * lies wholly inside the true solid — the terraced stack UNDER-states the inclined top and can
 * never overstate it. Σ tier volumes ≤ `solveInclinedTop().volumeM3`, converging from below as
 * `slices` grows (asserted in the oracle table).
 */
export function inclinedTopToTiers(
    footprint: ReadonlyArray<Pt>,
    spec: InclinedTopSpec,
    opts: InclinedTopTierOptions = {},
): EnvelopeTier[] | { readonly ok: false; readonly reason: InclinedTopRefusal; readonly detail?: string } {
    const ring = prepareFootprint(footprint);
    if (!Array.isArray(ring)) return { ok: false, ...ring };
    const candidates = prepareCandidates(spec);
    if (!Array.isArray(candidates)) return { ok: false, ...candidates };

    const solved = solveInclinedTop(footprint, spec);
    if (!solved.ok) return solved;
    const top = solved.peakHeightM;
    if (top <= EPSILON_ZERO) return [];

    const slices = Math.max(1, Math.floor(opts.slices ?? 12));
    const idPrefix = opts.idPrefix ?? 'inclined-slice';
    const labelPrefix = opts.labelPrefix ?? 'Inclined-plane envelope slice';
    const ordinanceRef = opts.ordinanceRef ?? null;

    const tiers: EnvelopeTier[] = [];
    for (let k = 0; k < slices; k++) {
        const lo = (top * k) / slices;
        const hi = (top * (k + 1)) / slices;
        // {h(p) ≥ hi} = ⋂ candidates ({h_i(p) ≥ hi} ∪ ¬extent_i) — each an affine half-plane where
        // the candidate is present (the flat cap is the constant one: empty when cap < hi,
        // everything otherwise — clipHalfPlane's degenerate branch handles it). §GOVERNS-EXTENT:
        // where a plane is absent it imposes nothing, so the slice region may come back as SEVERAL
        // disjoint pieces; each is emitted as its own inscribed prism (`-k` for the first, `-k-m`
        // for the rest — with no extents there is exactly one piece and the ids are unchanged).
        let pieces: Pt[][] = [ring.slice()];
        for (const f of candidates) {
            if (pieces.length === 0) break;
            pieces = splitByRival(pieces, { a: f.cx, b: f.cz, c: f.c0 - hi }, f.extent);
        }
        let m = 0;
        for (const region of pieces) {
            const [a] = areaAndMoments(region);
            const area = Math.abs(a);
            if (area <= EPSILON_ZERO) continue;
            tiers.push({
                id: m === 0 ? `${idPrefix}-${k}` : `${idPrefix}-${k}-${m}`,
                label: `${labelPrefix} ${lo.toFixed(2)}–${hi.toFixed(2)} m (inscribed — understates the inclined top)`,
                polygon: region,
                areaM2: area,
                baseHeight_m: lo,
                maxHeight_m: hi,
                maxFloors: null,
                ordinanceRef,
            });
            m += 1;
        }
    }
    return tiers;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 4 — THE COMMON CONSTRUCTION: one plane per boundary edge (DK / DE shape)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build one `InclinedPlaneSpec` per edge of `boundary`, each rising `slopePerMeter` from
 * `baseHeight_m` at the edge, oriented so the ring's INTERIOR is the positive side — the DK
 * *det skrå højdegrænseplan* / DE Abstandsflächen construction over a parcel or footprint ring.
 *
 * ⚠ EXACTNESS CLASS: for a CONVEX boundary, min over these planes equals slope × distance-to-
 * boundary exactly. For a CONCAVE boundary a supporting line can cut back under the interior, so
 * min-of-planes ≤ slope × true-distance — i.e. the construction UNDER-states there, which is the
 * permitted direction; a caller wanting exactness on concave rings must supply per-edge planes
 * from a finer decomposition. Stated, not hidden.
 */
export function planesFromBoundaryEdges(
    boundary: ReadonlyArray<Pt>,
    slopePerMeter: number,
    baseHeight_m: number,
    idPrefix = 'boundary-plane',
): InclinedPlaneSpec[] | { readonly ok: false; readonly reason: InclinedTopRefusal; readonly detail?: string } {
    const ring = prepareFootprint(boundary);
    if (!Array.isArray(ring)) return { ok: false, ...ring };
    // prepareFootprint canonicalises to CCW (positive shoelace), in which the interior lies on
    // the LEFT of every edge A→B — exactly this module's positive-side convention.
    const planes: InclinedPlaneSpec[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        planes.push({
            id: `${idPrefix}-${i}`,
            anchorA: a,
            anchorB: b,
            baseHeight_m,
            slopePerMeter,
        });
    }
    return planes;
}
