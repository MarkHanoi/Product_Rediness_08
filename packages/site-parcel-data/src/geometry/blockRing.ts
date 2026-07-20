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
 * Dissolve the parcels of one *manzana* into the block outline.
 *
 * PURE + deterministic (C58 §1.1/§1.9). Never throws. Constructs no new vertices — every output
 * point is an input point, so the ring is exact rather than approximate.
 *
 * Returns `degenerate` rather than a best-effort ring whenever the inputs are not a conforming
 * tiling. See the header for why that refusal is the whole point.
 */
export function dissolveParcelsToBlockRing(
    parcelRings: ReadonlyArray<ReadonlyArray<Pt>>,
): BlockRingResult {
    const fail = (reason: BlockRingResult['reason']): BlockRingResult =>
        ({ ring: [], degenerate: true, reason });

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
    return { ring, degenerate: false, reason: null };
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
