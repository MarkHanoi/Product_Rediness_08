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

import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea, pointSegmentDistance } from '@pryzm/site-validators';

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
        | 'open-or-disjoint';
    /**
     * §DISSOLVE-TJUNCTION-SPLIT (L-539). Present on every result, success or failure, so the
     * decision "was this ring repaired, and by how much?" is never inferred from its absence.
     */
    readonly quality: BlockRingQuality;
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
 * The EXACT edge-cancellation pass — the original algorithm, unchanged.
 *
 * Kept as its own function rather than folded into the public entry point precisely so the
 * repaired path cannot drift from it: the repair only ever changes the INPUT it is handed, and
 * both paths then run this identical code.
 */
function dissolveExact(
    parcelRings: ReadonlyArray<ReadonlyArray<Pt>>,
    quality: BlockRingQuality,
): BlockRingResult {
    const fail = (reason: BlockRingResult['reason']): BlockRingResult =>
        ({ ring: [], degenerate: true, reason, quality });

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

    const start = perimeter[0]!;
    const out: Pt[] = [start.a, start.b];
    let currentKey = start.kb;
    let previous = start;

    // Bounded by the edge count: a well-formed chain closes in exactly `perimeter.length` steps,
    // and the bound guarantees termination on any malformed input (no unbounded while-loop —
    // same determinism discipline as the block-depth bisection).
    for (let step = 1; step < perimeter.length; step++) {
        const candidates = byVertex.get(currentKey);
        if (!candidates) return fail('open-or-disjoint');
        const next = candidates.find((e) => e !== previous);
        if (!next) return fail('open-or-disjoint');
        const nextKey = next.ka === currentKey ? next.kb : next.ka;
        const nextPt = next.ka === currentKey ? next.b : next.a;
        // Closing early means we walked a sub-loop, so the perimeter is disjoint.
        if (nextKey === key(out[0]!)) {
            if (step !== perimeter.length - 1) return fail('open-or-disjoint');
            break;
        }
        out.push(nextPt);
        currentKey = nextKey;
        previous = next;
    }

    if (out.length !== perimeter.length) return fail('open-or-disjoint');

    // Normalise winding so downstream (which is winding-agnostic but easier to reason about)
    // always sees the same orientation for the same block.
    const simplified = dropCollinear(out);
    const ring = polygonSignedArea(simplified) < 0 ? [...simplified].reverse() : simplified;
    return { ring, degenerate: false, reason: null, quality };
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

    // Only ONE failure mode is a digitisation artefact. `non-manifold` means the parcels
    // genuinely overlap and `malformed-parcel` means an input is not a polygon; splitting edges
    // would not make either true, it would only make a fiction closable. `too-few-parcels` has
    // nothing to repair.
    if (exact.reason !== 'open-or-disjoint') return exact;

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
