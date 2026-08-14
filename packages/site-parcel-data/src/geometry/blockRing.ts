// ADR-0271 P4 — producing the BLOCK (*manzana*) ring and its street frontages.
//
// WHY THIS EXISTS
// ---------------
// P3 wired `block-derived-alignment` into the envelope engine, and it correctly REFUSES to
// answer without a block ring + per-edge frontage classification. Nothing produced either.
// This module produces both, purely, from inputs the product already has.
//
// TWO SEPARATE JOBS, DELIBERATELY NOT ONE FUNCTION
// ------------------------------------------------
//   1. `dissolveParcelsToBlockRing` — parcels of a manzana → the block outline.
//   2. `classifyBlockFrontages`      — block outline + road geometry → which edges are streets.
// They have different inputs, different failure modes and different trust levels (see the
// PROVENANCE WARNING below). Fusing them would hide which one failed.
//
// WHY EDGE-CANCELLATION AND NOT A POLYGON UNION
// ---------------------------------------------
// The parcels of a block TILE it. So every interior boundary is shared by exactly two parcels
// and appears TWICE in the edge multiset, while every block-perimeter edge appears ONCE.
// Dropping the doubled edges and chaining the survivors yields the outline exactly — no boolean
// library, no `@turf` dependency (which would land on the C10 NFT-15 bundle budget), and no
// floating-point union robustness problems.
//
// It is also EXACT where a union is approximate: we never construct a new vertex, we only keep
// or discard input ones. That matters because this ring feeds a compliance number.
//
// ⚠ ITS REAL LIMITATION, STATED UP FRONT: it requires a CONFORMING tiling — neighbours must
// share whole edges vertex-for-vertex. Real cadastral data has T-junctions (one parcel's edge
// spans two of its neighbour's) and slivers. Those do NOT silently produce a wrong ring: they
// leave unmatched edge fragments, the chain fails to close, and we return `degenerate`. Refusing
// is the contract here (C58 §1.2 tier 3) — an almost-right block ring yields an almost-right
// *profunditat edificable*, which is precisely the confidently-wrong compliance number ADR-0270,
// ADR-0271, L-462 and L-465 all exist to prevent.
//
// §DISSOLVE-TJUNCTION-SPLIT (L-539) — THE ABOVE CAVEAT WAS THE DOMINANT OUTCOME, AND IS NOW
// REPAIRED FOR ONE MEASURED CLASS ONLY
// ---------------------------------------------------------------------------------------------
// Measured on 956 complete real *manzanas* across 5 Spanish cities (probe + full method in
// `docs/04-reference/spain/SPAIN-DISSOLVE-FAILURE-TAXONOMY.md`): the exact pass produced a ring
// for only **63.5 %** of them. One Barcelona block in five, and three Sevilla blocks in five,
// yielded NO ring — therefore no depth, no width, no height, and a 0.5 m footprint slab.
//
// The taxonomy demolished the assumption this header itself carried. There are **no slivers and
// no near-coincident vertices**: across 349 failing manzanas, the nearest-neighbour distance of
// every break vertex was ≥ 0.05 m, and 0 of 250,646 parcel edges were shorter than 0.083 m. A
// vertex weld — the "obvious" fix, and the one the brief anticipated — moves NOTHING below 0.1 m
// and is therefore not implemented. **We still never move a vertex.**
//
// What actually dominates is a single defect with a single cause. Catastro's INSPIRE GML
// publishes WGS84 coordinates rounded to **6 decimal places** (verified on 12,601 sampled
// vertices), i.e. on a grid of 1e-6° ≈ **0.083 m east / 0.111 m north** at Iberian latitudes —
// which is exactly the 0.0835 m floor observed in the edge-length distribution. Two neighbours
// digitising the SAME boundary can therefore hold different vertex COUNTS on it: parcel A stores
// `p → q`, parcel B stores `p → r → q` with `r` sitting up to a rounding off the straight line.
// Nothing cancels; the survivors form the block outline PLUS a hair-thin triangle `p-r-q`, so the
// chain finds two loops instead of one and refuses. 94 % of the multi-loop failures are exactly
// that: an extra loop nested inside the outline with an area of ~0 % of it.
//
// The repair is correspondingly narrow: before cancelling, SPLIT an edge at any existing vertex
// lying within `TJUNCTION_SPLIT_TOLERANCE_M` of its interior. `p → q` becomes `p → r`, `r → q`,
// both cancel against B, and the outline closes.
//
// ⚠ WHAT THIS COSTS, STATED PLAINLY. The split point is the NEIGHBOUR'S OWN EXISTING VERTEX — no
// vertex is constructed and none is moved, so the "output points are input points" guarantee
// survives intact. The one thing that IS given up: the ring may now follow a path that departs
// from the exactly-straight `p → q` by up to the tolerance. That deviation is bounded by 0.10 m,
// which is SMALLER THAN THE SOURCE DATA'S OWN COORDINATE RESOLUTION (0.111 m north) — the repair
// cannot introduce an error larger than the rounding already present in the input. The tolerance
// is derived and defended in `TJUNCTION_SPLIT_TOLERANCE_M` below; it is not a tuned number.
//
// ⚠ AND WHAT IT DELIBERATELY DOES NOT DO. The exact pass runs FIRST and its result is returned
// UNCHANGED whenever it succeeds. Applying the repair unconditionally would have altered 137 of
// the 607 rings that already existed — i.e. silently moved 137 compliance numbers. A new failure
// is recoverable; a silently changed *profunditat edificable* is not. `non-manifold` (genuinely
// overlapping parcels) and `malformed-parcel` are never repaired either: those are wrong INPUTS,
// not a digitisation artefact. Blocks that are genuinely two separate polygons still refuse.
//
// ⚠⚠ PROVENANCE WARNING — READ BEFORE TRUSTING A FRONTAGE CLASSIFICATION
// ---------------------------------------------------------------------
// `classifyBlockFrontages` infers a LEGAL fact (which boundaries are street frontages, per PGM
// Art. 242.2) from OSM road geometry, which has no legal standing. Under C58 §1.4 a value
// derived this way is `estimated`, and it must reach the envelope as such — L-459 is the same
// defect one layer down (a fabricated context height rendered indistinguishably from a surveyed
// one). The caller MUST NOT promote a derived classification to `published-structured`.
//
// ⚠ AND A SYSTEMATIC BIAS THE CALLER MUST KNOW ABOUT: OSM roads are CENTRELINES. Art. 242
// measures depth from the street FRONTAGE (the alignment line), which sits roughly half a
// carriageway away. Using centrelines to LOCATE a frontage is fine — that is proximity, and
// this module only asks "is there a street beyond this edge?". Using them to MEASURE one is not.
// This module therefore only ever CLASSIFIES; it never returns a distance that could be mistaken
// for a setback, and the depth is always measured from the block ring's own edge.
//
// Strategic context: ADR-0271 P4, C58 §1.2/§1.4/§1.9, C19 §10.1 (edge-classification heuristic,
// which explicitly sanctions "edge nearest the longest street = front"), C12 §8 (no new Overpass
// query — roads arrive from the existing single context fetch).

// §DISSOLVE-INTERIOR-VOID (L-586) — THE MULTI-LOOP REFUSAL WAS NOT ALWAYS A DEFECT IN THE INPUT.
// -----------------------------------------------------------------------------------------------
// The header above treats a perimeter that chains into more than one loop as a single failure —
// "T-junctions, slivers, or a gap". It is not one failure. It is four, and only ONE of them is
// ours; the multi-loop bucket was hiding a correctness win and three genuine upstream defects
// behind the same `open-or-disjoint` label.
//
// THE MEASUREMENT THAT SEPARATES THEM IS A SIGN, NOT A HEURISTIC. For the parcel union P, the
// divergence theorem gives `Area(P) = Σ signed areas of the loops of ∂P`. So with one large loop
// and some small ones, and all areas taken positive:
//
//   Σ|parcels| == |outer| − Σ|small|  ⇒ the small loops are HOLES. The parcels tile the block MINUS
//                                       an unparcelled courtyard, light well or passage. The block
//                                       OUTLINE is the outer loop, exactly and unambiguously, and
//                                       the input is a perfectly good tiling-with-holes.
//   Σ|parcels| == |outer| + Σ|small|  ⇒ the small loops are SEPARATE components — a DETACHED
//                                       fragment of the manzana if they lie outside the outer loop,
//                                       or two OVERLAPPING parcels if they lie inside (the overlap
//                                       is bounded twice, so it never cancels). Neither is a
//                                       tiling. Both must still refuse.
//   neither                           ⇒ mixed or worse. Refuse.
//
// Census over the same 956 real manzanas the L-539 work used (`scratchpad/probe-l586-loopsign.mts`,
// exact pass only): 607 single-loop, 114 rejected earlier at the degree-2 test, 2 non-manifold, and
// 233 multi-loop — of which **83 are HOLES**, 74 are interior overlaps, 11 are detached fragments
// and 65 satisfy neither identity. Only the 83 are recoverable, and this module now recovers them:
// it returns the outer loop as the ring and the holes as `voids` rather than discarding them
// (C58 §1.4 — a fact we measured must not vanish; a caller sizing a *pati interior*, or writing a
// caveat, has to be able to see that the outline is not solid).
//
// Worked examples, ring area against the SUM OF PUBLISHED CADASTRAL PARCEL AREAS — a number this
// module never sees. Madrid 17516: outer 13,309 m² − void 2,566 m² = 10,743 against 10,721
// published (+0.21%, the same 0.15–0.19% bias every ring in the sample carries). Barcelona-old
// 12215: 4,875 − 102 = 4,773 against 4,763 (+0.21%). Live Barcelona 14378: 11,064 − 0.5 = 11,064
// against 11,046 (+0.16%). Across all 18 rings this newly produces, the void-corrected error is
// p50 0.13% / worst 0.59% — indistinguishable from the population that already dissolved.
//
// ⚠ AND THE COUNTER-EXAMPLES, BECAUSE THE FIRST READING OF THIS DATA WAS WRONG. Live Barcelona
// 06276 (outer 12,723.5, small loop 5.52, parcels 12,729.03) and 01306 (6,997.3 + 22.76 = 7,020.07)
// look like holes and are not: the identity ADDS, so the small loop is a detached fragment sitting
// OUTSIDE the block. 97208 and 98191 add too, with the small loop INSIDE — two parcels overlapping
// by 0.25 m² and 1.39 m². All four still refuse, correctly, and they refuse because of the identity
// rather than because anyone eyeballed them. That is the whole reason the gate is an identity.
//
// ⚠ THE GUARD IS THEREFORE AN IDENTITY, NOT A TOLERANCE. A multi-loop perimeter is read as
// outline-plus-voids only when (a) every vertex still has degree exactly 2, (b) every other loop
// lies inside the candidate outline, and (c) `|outer| − Σ|voids|` equals the summed parcel areas to
// within float noise. (c) is the safety: a detached fragment or an overlap misses it by square
// metres, not by rounding. It is an EXACT algebraic identity of any hole-punched tiling, so its
// bound is a float-error bound and not a tuned number — the L-529 failure this module's own header
// warns about.
//
// §DISSOLVE-SIMPLICITY-GATE (L-586) — "IT CLOSED" WAS NEVER "IT CLOSED CORRECTLY".
// -----------------------------------------------------------------------------------------------
// An independent oracle over 956 real manzanas (ring area vs the SUM OF PUBLISHED CADASTRAL PARCEL
// AREAS — a number this module never sees) found 11 of the 874 rings we emitted to be
// SELF-INTERSECTING: Córdoba 4, Valencia 4, Barcelona 1, Madrid-centro 1, Sevilla 1. Every one of
// them passed the degree-2 test, closed in exactly `perimeter.length` steps, and matched the
// published area to 0.00% — the acceptance path had no way to see them.
//
// What they are: a boundary two neighbours store with slightly different endpoints fails to cancel,
// and the chain walks it OUT and BACK along two near-collinear legs — a zero-area antenna, up to
// 29 m long, whose legs cross near the base. The ring is closed, its area is right, and it is not a
// polygon. Downstream it poisons everything: the inset miters an impossible corner, the depth
// solver measures across the fold, and the envelope is confidently wrong.
//
// A refusal is the contract (C58 §1.2 tier 3), but a refusal is the LAST resort, so the gate is
// wired the same way the T-junction repair is: a crossed ring is treated as a failure of the exact
// pass, which lets §DISSOLVE-TJUNCTION-SPLIT — previously unreachable here, because the exact pass
// "succeeded" — have its attempt. Measured: 7 of the 11 then produce a SIMPLE ring whose area moves
// by at most 0.02%, and 4 become honest refusals (−0.46 pp of the dissolve rate for 11 fewer
// poisoned envelopes). See `scratchpad/probe-l586-simplicity-gate.mts`.

import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea, pointInPolygon, pointSegmentDistance } from '@pryzm/site-validators';

/**
 * Vertices within this distance (metres) are treated as the same point when matching shared
 * parcel edges. 1 mm: far below any cadastral distinction, far above the float noise of a
 * reprojection, and small enough that two genuinely different corners can never collapse.
 */
export const VERTEX_MATCH_TOLERANCE_M = 1e-3;

/**
 * §DISSOLVE-TJUNCTION-SPLIT (L-539) — how far off an edge an existing vertex may sit and still be
 * taken as a T-junction on it, in metres.
 *
 * ⚠ THIS NUMBER IS DERIVED FROM THE SOURCE DATA, NOT CHOSEN. It is bounded from BOTH sides by
 * measurements in `SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` (956 manzanas, 5 cities), and every one of
 * the three bounds lands in the same place:
 *
 *  1. **The publisher's own quantum — the upper bound that matters.** Catastro INSPIRE GML rounds
 *     coordinates to 1e-6° ≈ 0.083 m east / **0.111 m north**. A tolerance at or below that is
 *     incapable of introducing a positional error the input does not already contain. 0.10 m is
 *     inside it. Anything above 0.111 m would be asserting more precision than the data has.
 *  2. **The empirical valley.** The perpendicular offsets of candidate T-junctions form two
 *     populations with a gap between them: the defect population runs to ~0.075 m (78 % of 1,057
 *     incidences are ≤ 0.1 m), then the histogram collapses ten-fold across 0.1–0.3 m, then real,
 *     unrelated geometry resumes above 0.3 m. 0.10 m is the floor of that valley.
 *  3. **The success curve's plateau.** 0.05 m → 81.5 %, **0.10 m → 91.6 %**, 0.20 m → 93.4 %,
 *     0.30 m → 93.1 % (falling: over-splitting starts destroying rings). The curve is already
 *     flat at 0.10; the extra 1.8 points at 0.20 would cost a doubling of the deviation and take
 *     it past bound 1, so it is refused. A tolerance is only defensible on a plateau — on a slope
 *     it is a tuned number, which is the L-529 failure this whole probe exists to avoid.
 *
 * Two structural safeties follow from the value rather than being added on top: an edge shorter
 * than 2× the tolerance can never be split (the split point must clear both endpoints by the
 * tolerance), and a mis-split can only ever leave a fragment that fails to cancel — i.e. it
 * degrades to a REFUSAL, never to a plausible-but-wrong ring.
 */
export const TJUNCTION_SPLIT_TOLERANCE_M = 0.1;

/**
 * §DISSOLVE-TJUNCTION-SPLIT — how the ring was obtained, so a caller can tier its provenance
 * (C58 §1.4) exactly as L-537 did for measured street widths.
 *
 * A ring on the `exact` path is bit-for-bit what this module has always produced. A ring on the
 * `t-junction-split` path is the same construction over a tiling that had `splitCount` edges cut
 * at an existing neighbour vertex, and its worst-case departure from the exactly-straight input
 * boundary is `maxOffset_m` (≤ the tolerance, and ≤ the source's own coordinate resolution).
 */
export interface BlockRingQuality {
    readonly path: 'exact' | 't-junction-split';
    /** Edges cut at an existing neighbour vertex. 0 on the exact path. */
    readonly splitCount: number;
    /** Largest perpendicular offset of any applied split, m. 0 on the exact path. */
    readonly maxOffset_m: number;
    /** The tolerance in force, m — reported so a caveat can quote it rather than re-derive it. */
    readonly tolerance_m: number;
}

export interface BlockRingResult {
    /** The block outline, or `[]` when the parcels do not form a conforming tiling. */
    readonly ring: ReadonlyArray<Pt>;
    readonly degenerate: boolean;
    /** Why it failed — for the caveat text, so a user is told which input was wrong. */
    readonly reason:
        | null
        | 'too-few-parcels'
        | 'malformed-parcel'
        /** An edge shared by 3+ parcels: overlapping inputs, not a tiling. */
        | 'non-manifold'
        /** Survivors did not chain into ONE closed loop — T-junctions, slivers, or a gap. */
        | 'open-or-disjoint'
        /**
         * §DISSOLVE-SIMPLICITY-GATE (L-586). The survivors DID chain into one closed loop, but
         * that loop crosses itself, so it is not a polygon and cannot bound an envelope. Kept
         * distinct from `open-or-disjoint` because the input failure is a different one: not a
         * gap in the tiling but a boundary stored twice with mismatched endpoints.
         */
        | 'self-intersecting';
    /**
     * §DISSOLVE-TJUNCTION-SPLIT (L-539). Present on every result, success or failure, so the
     * decision "was this ring repaired, and by how much?" is never inferred from its absence.
     */
    readonly quality: BlockRingQuality;
    /**
     * §DISSOLVE-INTERIOR-VOID (L-586) — closed perimeter loops lying strictly INSIDE `ring`, i.e.
     * land inside the block that no parcel of the manzana covers (a courtyard, light well or
     * passage). Empty on every result the pre-L-586 code produced, and empty on every failure.
     *
     * Each void carries the SAME winding as `ring` (both normalised positive), not the opposite
     * winding a hole conventionally has in a single multi-ring polygon. They are returned as their
     * own polygons, so a caller that needs hole orientation must reverse them itself — stated here
     * because silently inheriting a convention is how a hole becomes a solid two layers away.
     *
     * ⚠ THESE ARE RETURNED, NOT DISCARDED, ON PURPOSE. `ring` is the block OUTLINE and is what
     * Art. 242 depth is measured from, so the voids do not change it — but a caller that reports a
     * buildable area, or that sizes a *pati interior*, must be able to see that the outline is not
     * solid. Silently dropping them would be the C58 §1.4 defect (a measured fact rendered
     * indistinguishably from its absence) one layer down from L-459.
     */
    readonly voids: ReadonlyArray<ReadonlyArray<Pt>>;
}

/** Quantise to the match tolerance so coincident-but-jittery vertices key identically. */
function key(p: Pt): string {
    const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M);
    // `+0` normalises -0 to 0, so a vertex on an axis cannot key two different ways.
    return `${q(p.x) + 0},${q(p.z) + 0}`;
}

/** Undirected edge key — shared edges arrive in OPPOSITE directions, so order must not matter. */
function edgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Drop a trailing vertex that repeats the first (rings arrive both closed and open). */
function openRing(ring: ReadonlyArray<Pt>): ReadonlyArray<Pt> {
    if (ring.length < 2) return ring;
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    return key(first) === key(last) ? ring.slice(0, -1) : ring;
}

/**
 * Drop vertices that lie ON the segment joining their neighbours.
 *
 * Cancellation leaves one of these at every point where two parcels met along a STRAIGHT run of
 * the block perimeter — the geometry is already correct, but a Cerdà manzana of ~20 parcels
 * accumulates dozens of them. Two concrete reasons to remove them, neither cosmetic:
 *
 *  1. **C19 §7.3 vertex budget** (≤50 soft, >200 hard-reject). Collinear noise burns it for
 *     nothing, and this ring is handed to the same inset the parcel ring uses.
 *  2. **Zero-turn miters.** `insetPolygonPerEdge` computes a miter at every vertex; a collinear
 *     vertex is a 180° turn whose miter is numerically the least well-conditioned case there is.
 *     L-462 was a boundary-tolerance defect in exactly that function — no reason to feed it
 *     avoidable degenerate corners.
 *
 * Removing is still EXACT: it deletes an input point, it never constructs one, and the polygon
 * covered is unchanged. Tolerance is the perpendicular distance to the neighbour segment, so a
 * genuine (if shallow) corner on a long edge survives.
 */
function dropCollinear(ring: ReadonlyArray<Pt>): Pt[] {
    if (ring.length < 3) return [...ring];
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
        const prev = ring[(i - 1 + ring.length) % ring.length]!;
        const cur = ring[i]!;
        const next = ring[(i + 1) % ring.length]!;
        if (pointSegmentDistance(cur, prev, next) > VERTEX_MATCH_TOLERANCE_M) out.push(cur);
    }
    // A ring that collapses below a triangle was degenerate to begin with; hand back the original
    // so the caller's own validity checks decide, rather than silently emitting a sliver.
    return out.length >= 3 ? out : [...ring];
}

/**
 * §DISSOLVE-SIMPLICITY-GATE (L-586) — does this closed ring cross itself?
 *
 * O(n²) over the ring's own edges, which is the honest cost: there is no cheaper exact test, and
 * the alternative — shipping a folded ring — is the defect this exists to stop. The ring is bounded
 * by the C19 §7.3 vertex budget (>200 is a hard reject downstream) and the widest ring in the
 * 956-manzana sample is 326 vertices, i.e. ~53k segment tests of pure arithmetic. It runs once per
 * block, behind a cache, on a path that already made two WFS round-trips.
 *
 * Only PROPER crossings count (all four orientations strictly non-zero). A ring that merely touches
 * itself at a shared vertex, or that runs collinearly along itself, is left to `dropCollinear` and
 * the degree-2 test — this predicate must not start refusing rings that have always been fine.
 */
function ringSelfIntersects(ring: ReadonlyArray<Pt>): boolean {
    const n = ring.length;
    if (n < 4) return false;
    const orient = (p: Pt, q: Pt, r: Pt): number =>
        Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        for (let j = i + 2; j < n; j++) {
            // Edges i and j are adjacent through the wrap when i is 0 and j is the last edge.
            if (i === 0 && j === n - 1) continue;
            const c = ring[j]!;
            const d = ring[(j + 1) % n]!;
            const o1 = orient(a, b, c);
            const o2 = orient(a, b, d);
            const o3 = orient(c, d, a);
            const o4 = orient(c, d, b);
            if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;
        }
    }
    return false;
}

/** |shoelace| of a ring, m². Local so the void identity below cannot drift from the winding fix. */
function absArea(ring: ReadonlyArray<Pt>): number {
    return Math.abs(polygonSignedArea(ring));
}

/**
 * §DISSOLVE-INTERIOR-VOID (L-586) — the float-noise bound on the void identity
 * `|outer| − Σ|voids| == Σ|parcels|`.
 *
 * ⚠ NOT A GEOMETRIC TOLERANCE, AND NOT TUNED. The identity is EXACT for any tiling with holes; the
 * only thing that separates the two sides is shoelace round-off, which for coordinates of order
 * 1e2 m over a few hundred vertices is of order 1e-8 m². A relative bound of 1e-6 is a hundredfold
 * margin on that and is still only 0.013 m² on a 13,000 m² Eixample illa — three orders of
 * magnitude below the smallest real void measured (0.014 m²) and six below the smallest overlap
 * this guard has to reject. Widening it would be the L-529 mistake; it does not need widening.
 */
const VOID_IDENTITY_TOLERANCE_RATIO = 1e-6;

/**
 * The EXACT edge-cancellation pass.
 *
 * Kept as its own function rather than folded into the public entry point precisely so the
 * repaired path cannot drift from it: the repair only ever changes the INPUT it is handed, and
 * both paths then run this identical code.
 *
 * §DISSOLVE-INTERIOR-VOID / §DISSOLVE-SIMPLICITY-GATE (L-586) changed two things and nothing else:
 * a perimeter that chains into several loops is now read as outline-plus-voids WHEN the identity
 * above holds, and a ring that crosses itself is refused instead of returned. A single-loop,
 * non-crossing perimeter — every ring this function has ever produced — takes the identical path
 * and yields the identical bytes.
 */
function dissolveExact(
    parcelRings: ReadonlyArray<ReadonlyArray<Pt>>,
    quality: BlockRingQuality,
): BlockRingResult {
    const fail = (reason: BlockRingResult['reason']): BlockRingResult =>
        ({ ring: [], degenerate: true, reason, quality, voids: [] });

    if (parcelRings.length < 1) return fail('too-few-parcels');

    // ── Build the edge multiset. ────────────────────────────────────────────────────────
    // `count` decides interior-vs-perimeter; `pts` remembers the actual coordinates so the
    // output carries input vertices rather than quantised ones.
    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();

    for (const raw of parcelRings) {
        const ring = openRing(raw);
        if (ring.length < 3) return fail('malformed-parcel');
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            const ka = key(a);
            const kb = key(b);
            // A zero-length edge carries no boundary information and would corrupt the chain.
            if (ka === kb) continue;
            const ek = edgeKey(ka, kb);
            const found = edges.get(ek);
            if (found) {
                found.count += 1;
                // 3+ parcels on one edge means the inputs OVERLAP — they are not a tiling, and
                // any outline we produced would be a fiction.
                if (found.count > 2) return fail('non-manifold');
            } else {
                edges.set(ek, { count: 1, a, b, ka, kb });
            }
        }
    }

    // ── Perimeter = edges seen exactly once. ───────────────────────────────────────────
    // Sorted by key so the traversal start and the output vertex order are input-order
    // independent — two callers passing the same parcels in a different order get a
    // byte-identical ring (C58 §1.1).
    const perimeter = [...edges.entries()]
        .filter(([, e]) => e.count === 1)
        .sort(([k1], [k2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : 0))
        .map(([, e]) => e);

    if (perimeter.length < 3) return fail('open-or-disjoint');

    // ── Chain them into ONE closed loop. ───────────────────────────────────────────────
    const byVertex = new Map<string, typeof perimeter>();
    for (const e of perimeter) {
        for (const k of [e.ka, e.kb]) {
            const list = byVertex.get(k);
            if (list) list.push(e);
            else byVertex.set(k, [e]);
        }
    }
    // In a simple closed ring every vertex has exactly two perimeter edges. Anything else is a
    // T-junction, a pinch point, or a hole touching the outline — all `degenerate`.
    for (const [, list] of byVertex) {
        if (list.length !== 2) return fail('open-or-disjoint');
    }

    // ── Walk EVERY closed loop the perimeter contains. ─────────────────────────────────
    // Degree is exactly 2 at every vertex (checked above), so the perimeter is a disjoint union
    // of simple closed loops as an edge set and this enumeration is total.
    //
    // DETERMINISM (C58 §1.1): loops are started from the first not-yet-visited edge of the
    // key-SORTED `perimeter`, so both the set of loops and the vertex order within each are
    // independent of the caller's parcel order. When there is exactly one loop, `perimeter[0]` is
    // its start and the walk below is the original walk, step for step.
    const visited = new Set<(typeof perimeter)[number]>();
    const loops: Pt[][] = [];

    for (const seed of perimeter) {
        if (visited.has(seed)) continue;
        const out: Pt[] = [seed.a, seed.b];
        visited.add(seed);
        let currentKey = seed.kb;
        let previous = seed;
        const startKey = seed.ka;
        let closed = false;

        // Bounded by the edge count — the bound guarantees termination on any malformed input
        // (no unbounded while-loop; same determinism discipline as the block-depth bisection).
        for (let step = 1; step < perimeter.length; step++) {
            const candidates = byVertex.get(currentKey);
            if (!candidates) return fail('open-or-disjoint');
            const next = candidates.find((e) => e !== previous);
            if (!next) return fail('open-or-disjoint');
            const nextKey = next.ka === currentKey ? next.kb : next.ka;
            const nextPt = next.ka === currentKey ? next.b : next.a;
            visited.add(next);
            if (nextKey === startKey) {
                closed = true;
                break;
            }
            out.push(nextPt);
            currentKey = nextKey;
            previous = next;
        }
        if (!closed) return fail('open-or-disjoint');
        // A loop of fewer than 3 distinct vertices bounds nothing.
        if (out.length < 3) return fail('open-or-disjoint');
        loops.push(out);
    }

    // Every perimeter edge must have been consumed exactly once. Anything else means the walk
    // disagreed with the edge set, which is a refusal, never a best-effort ring.
    if (visited.size !== perimeter.length) return fail('open-or-disjoint');

    // Normalise winding so downstream (which is winding-agnostic but easier to reason about)
    // always sees the same orientation for the same block.
    const orient = (r: ReadonlyArray<Pt>): Pt[] => {
        const s = dropCollinear(r);
        return polygonSignedArea(s) < 0 ? [...s].reverse() : s;
    };

    if (loops.length === 1) {
        const ring = orient(loops[0]!);
        // §DISSOLVE-SIMPLICITY-GATE — closed is not the same as simple. See `ringSelfIntersects`.
        if (ringSelfIntersects(ring)) return fail('self-intersecting');
        return { ring, degenerate: false, reason: null, quality, voids: [] };
    }

    // ── §DISSOLVE-INTERIOR-VOID — outline plus holes, or a genuine refusal? ────────────
    const oriented = loops.map(orient);
    // Largest by area is the only candidate outline; ties cannot occur once containment is
    // required, and a tie between two equal-area loops fails containment below anyway.
    let outerIdx = 0;
    for (let i = 1; i < oriented.length; i++) {
        if (absArea(oriented[i]!) > absArea(oriented[outerIdx]!)) outerIdx = i;
    }
    const outer = oriented[outerIdx]!;
    const inner = oriented.filter((_, i) => i !== outerIdx);

    // (b) EVERY other loop must lie strictly inside the candidate outline. One vertex per loop
    // suffices: the loops are edge-disjoint and non-crossing, so a loop that is not wholly inside
    // has no vertex inside.
    for (const loop of inner) {
        if (!loop.every((p) => pointInPolygon(p, outer))) return fail('open-or-disjoint');
    }

    // (c) THE IDENTITY THAT MAKES THIS SAFE. Parcels that tile the outline minus the voids satisfy
    // `|outer| − Σ|voids| == Σ|parcels|` exactly. Two disjoint blocks, or an overlapping pair, miss
    // it by square metres. See `VOID_IDENTITY_TOLERANCE_RATIO` for why its bound is float noise.
    const parcelAreaSum = parcelRings.reduce((s, r) => s + absArea(openRing(r)), 0);
    const voidAreaSum = inner.reduce((s, r) => s + absArea(r), 0);
    const residual = Math.abs(absArea(outer) - voidAreaSum - parcelAreaSum);
    if (residual > VOID_IDENTITY_TOLERANCE_RATIO * Math.max(parcelAreaSum, 1)) {
        return fail('open-or-disjoint');
    }

    if (ringSelfIntersects(outer)) return fail('self-intersecting');
    return { ring: outer, degenerate: false, reason: null, quality, voids: inner };
}

/** The quality record of a ring nothing was done to. */
const EXACT_QUALITY: BlockRingQuality = {
    path: 'exact',
    splitCount: 0,
    maxOffset_m: 0,
    tolerance_m: 0,
};

/**
 * §DISSOLVE-TJUNCTION-SPLIT (L-539) — insert existing neighbour vertices into the edges they sit
 * on, so a boundary two parcels store with different vertex COUNTS can cancel.
 *
 * ⚠ CONSTRUCTS NO VERTEX AND MOVES NONE. Every inserted point is an input vertex of some parcel,
 * taken by reference. The only thing given up is that the path `p → q` becomes `p → r → q`, which
 * departs from the straight line by at most `tol` — see `TJUNCTION_SPLIT_TOLERANCE_M` for why
 * that bound is below the input's own coordinate resolution.
 *
 * DETERMINISM (C58 §1.1) is engineered, not hoped for: the candidate vertex set is de-duplicated
 * by the same quantisation key the cancellation uses and then SORTED, the spatial index is only
 * ever used to narrow the search (never to order it), and the hits on one edge are sorted by
 * position along it with a coordinate tie-break. Same parcels in any order ⇒ same split rings.
 */
function splitTJunctions(
    parcelRings: ReadonlyArray<ReadonlyArray<Pt>>,
    tol: number,
): { rings: Pt[][]; splitCount: number; maxOffset_m: number } {
    // Unique candidate vertices, in a deterministic order.
    const uniq = new Map<string, Pt>();
    for (const ring of parcelRings) for (const p of ring) if (!uniq.has(key(p))) uniq.set(key(p), p);
    const verts = [...uniq.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);

    // Uniform grid, cell = tol, so an edge only ever tests the vertices near it. Without this the
    // scan is O(vertices × edges) — ~600 × ~600 per manzana today, which is survivable but grows
    // quadratically with block size, and this runs on the envelope's critical path.
    const cell = Math.max(tol, 1e-6);
    const grid = new Map<string, Pt[]>();
    for (const p of verts) {
        const gk = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
        const list = grid.get(gk);
        if (list) list.push(p);
        else grid.set(gk, [p]);
    }

    let splitCount = 0;
    let maxOffset = 0;

    const rings = parcelRings.map((ring) => {
        const out: Pt[] = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            out.push(a);
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const len2 = dx * dx + dz * dz;
            if (len2 === 0) continue;
            const len = Math.sqrt(len2);
            // An edge shorter than 2×tol has no interior clear of both endpoints, so it can never
            // be split. That is a safety, not an optimisation: it is what stops the tolerance from
            // reshaping the shortest features in the data.
            if (len <= 2 * tol) continue;

            const hits: Array<{ t: number; p: Pt; perp: number }> = [];
            const cx0 = Math.floor((Math.min(a.x, b.x) - tol) / cell);
            const cx1 = Math.floor((Math.max(a.x, b.x) + tol) / cell);
            const cz0 = Math.floor((Math.min(a.z, b.z) - tol) / cell);
            const cz1 = Math.floor((Math.max(a.z, b.z) + tol) / cell);
            for (let cx = cx0; cx <= cx1; cx++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    for (const v of grid.get(`${cx},${cz}`) ?? []) {
                        const t = ((v.x - a.x) * dx + (v.z - a.z) * dz) / len2;
                        // Must clear BOTH endpoints by the tolerance: a vertex near a corner is a
                        // corner, not a T-junction, and splitting there would emit a fragment
                        // shorter than the tolerance itself.
                        if (t * len <= tol || (1 - t) * len <= tol) continue;
                        const perp = Math.hypot(v.x - (a.x + t * dx), v.z - (a.z + t * dz));
                        if (perp > tol) continue;
                        hits.push({ t, p: v, perp });
                    }
                }
            }
            if (hits.length === 0) continue;
            hits.sort((u, w) =>
                u.t !== w.t ? u.t - w.t : u.p.x !== w.p.x ? u.p.x - w.p.x : u.p.z - w.p.z,
            );
            let lastKey = key(a);
            for (const h of hits) {
                const hk = key(h.p);
                // Two candidates that quantise to the same vertex would emit a zero-length edge,
                // which the cancellation pass discards — and a discarded edge is a hole in the
                // chain. Emit each distinct vertex once.
                if (hk === lastKey) continue;
                out.push(h.p);
                lastKey = hk;
                splitCount++;
                if (h.perp > maxOffset) maxOffset = h.perp;
            }
        }
        return out;
    });

    return { rings, splitCount, maxOffset_m: maxOffset };
}

export interface DissolveOptions {
    /**
     * Override the T-junction split tolerance (m). Production must NOT pass this — the default is
     * derived from the source data's own coordinate resolution and a caller is not in a position
     * to know better. It exists so a test can pin the behaviour at a stated tolerance, and so a
     * future non-Catastro provider with a different published precision can state its own.
     */
    readonly tJunctionTolerance_m?: number;
    /** Set false to get the pre-L-539 behaviour verbatim (used by the regression tests). */
    readonly repairTJunctions?: boolean;
}

/**
 * Dissolve the parcels of one *manzana* into the block outline.
 *
 * PURE + deterministic (C58 §1.1/§1.9). Never throws. Constructs no new vertices and moves none —
 * every output point is an input point.
 *
 * Returns `degenerate` rather than a best-effort ring whenever the inputs are not a conforming
 * tiling, INCLUDING after the §DISSOLVE-TJUNCTION-SPLIT repair. See the header for why that
 * refusal is the whole point, and for what the repair does and does not do.
 */
export function dissolveParcelsToBlockRing(
    parcelRings: ReadonlyArray<ReadonlyArray<Pt>>,
    options: DissolveOptions = {},
): BlockRingResult {
    const exact = dissolveExact(parcelRings, EXACT_QUALITY);

    // ⚠ THE EXACT RESULT WINS WHENEVER IT EXISTS. Measured on 956 real manzanas: repairing
    // unconditionally would have changed 137 of the 607 rings the exact pass already produces —
    // 137 silently moved compliance numbers, which is a worse outcome than any number of new
    // refusals (brief L-539; the ADR-0270/0271 + L-462/L-465/L-529 line of reasoning).
    if (!exact.degenerate) return exact;

    if (options.repairTJunctions === false) return exact;

    // Only the DIGITISATION failure modes are repairable. `non-manifold` means the parcels
    // genuinely overlap and `malformed-parcel` means an input is not a polygon; splitting edges
    // would not make either true, it would only make a fiction closable. `too-few-parcels` has
    // nothing to repair.
    //
    // §DISSOLVE-SIMPLICITY-GATE (L-586) admits `self-intersecting` to that set. It is the same
    // defect in the source — a shared boundary stored twice with mismatched endpoints — and the
    // repair is the same one; the only difference is that the mismatch happened to leave a closed
    // chain rather than an open one. Measured on the 11 crossed rings in the 956-manzana sample:
    // 7 become SIMPLE with an area change of at most 0.02%, 4 remain crossed or stop closing and
    // are refused below.
    if (exact.reason !== 'open-or-disjoint' && exact.reason !== 'self-intersecting') return exact;

    const tol = options.tJunctionTolerance_m ?? TJUNCTION_SPLIT_TOLERANCE_M;
    if (!(tol > 0) || !Number.isFinite(tol)) return exact;

    const opened = parcelRings.map((r) => openRing(r));
    const split = splitTJunctions(opened, tol);
    if (split.splitCount === 0) return exact;

    const repaired = dissolveExact(split.rings, {
        path: 't-junction-split',
        splitCount: split.splitCount,
        maxOffset_m: split.maxOffset_m,
        tolerance_m: tol,
    });
    // A repair that still does not close tells us nothing new about WHY, and the exact pass's
    // reason is the honest one to report (the repair is our intervention, not the input's fault).
    return repaired.degenerate ? exact : repaired;
}

/** A road centreline, as the context engine already holds it (C12 §8). */
export interface RoadPolyline {
    readonly points: ReadonlyArray<Pt>;
}

export interface FrontageOptions {
    /**
     * How close a road centreline must run to a block edge for that edge to count as a street
     * frontage. Default 12 m ≈ half a typical Eixample carriageway plus footway — generous
     * enough to catch a wide street, tight enough that a road on the far side of the block
     * cannot claim this edge.
     */
    readonly maxDistance_m?: number;
    /**
     * How nearly PARALLEL the road must run to the edge, in degrees. A road merely crossing near
     * an edge (a perpendicular side street at a corner) is not that edge's frontage, and without
     * this test every corner block edge would be misclassified.
     */
    readonly maxAngleDeg?: number;
}

const DEFAULT_MAX_DISTANCE_M = 12;
const DEFAULT_MAX_ANGLE_DEG = 25;

/** Smallest angle between two undirected lines, in degrees (0..90). */
function undirectedAngleDeg(ax: number, az: number, bx: number, bz: number): number {
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la === 0 || lb === 0) return 90;
    // |cos| because direction of travel is irrelevant — a street is a street either way.
    const cos = Math.min(1, Math.abs((ax * bx + az * bz) / (la * lb)));
    return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Classify each block edge as a street `front` or a non-street `side`.
 *
 * PURE + deterministic. Roads are INJECTED — this module never fetches (C58 §1.9; and C12 §8
 * forbids a new Overpass query, so they must come from the existing single context fetch).
 *
 * ⚠ THE RESULT IS AN INFERENCE, NOT A LEGAL FACT. See the header. The caller MUST carry it as
 * `fieldProvenance: 'estimated'` and MUST NOT present a depth derived from it as authoritative.
 *
 * Returns one classification per edge, edge `i` spanning vertex `i → i+1`, matching the C19 §2.3
 * convention so it can be handed straight to the envelope engine.
 */
export function classifyBlockFrontages(
    blockRing: ReadonlyArray<Pt>,
    roads: ReadonlyArray<RoadPolyline>,
    options: FrontageOptions = {},
): ParcelEdgeClassification[] {
    const maxDist = options.maxDistance_m ?? DEFAULT_MAX_DISTANCE_M;
    const maxAngle = options.maxAngleDeg ?? DEFAULT_MAX_ANGLE_DEG;

    const ring = openRing(blockRing);
    if (ring.length < 3) return [];

    const out: ParcelEdgeClassification[] = [];

    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        // Sample the MIDPOINT rather than an endpoint: a corner vertex is near two streets, so
        // endpoints would classify both edges of every corner as frontage.
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };

        let isFront = false;
        for (const road of roads) {
            if (isFront) break;
            const pts = road.points;
            for (let j = 0; j + 1 < pts.length; j++) {
                const ra = pts[j]!;
                const rb = pts[j + 1]!;
                if (pointSegmentDistance(mid, ra, rb) > maxDist) continue;
                if (undirectedAngleDeg(ex, ez, rb.x - ra.x, rb.z - ra.z) > maxAngle) continue;
                isFront = true;
                break;
            }
        }
        out.push(isFront ? 'front' : 'side');
    }

    return out;
}
