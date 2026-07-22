// ADR-0270 P2 / §L-451 — PROFUNDIDAD EDIFICABLE: the half-plane depth clip.
//
// WHY THIS IS A SEPARATE HELPER AND NOT A PARAMETER OF THE INSET
// --------------------------------------------------------------
// `insetPolygonPerEdge` erodes inward from EVERY edge by that edge's classified distance.
// *Profundidad edificable* is a different constraint entirely: "you may build at most D metres
// back FROM THE ALIGNED EDGE" — a single half-plane, measured from one specific edge, that says
// nothing about the others.
//
// Trying to express it as a rear setback is wrong and silently so: a rear setback measures from
// the REAR boundary inward, so on a deep parcel it leaves the depth unconstrained, and on a
// shallow one it over-constrains. The two only coincide when the parcel depth happens to equal
// `depth + rear_m`. That is why ADR-0270 models it as its own geometric operation.
//
// THE DECOMPOSITION (C58 §2.4 machinery, reused — no fork):
//   alignment envelope = insetPolygonPerEdge(front = alignmentOffset, sides per treatment,
//                                            rear per rule)
//                        THEN clipToDepthBand(result, alignedEdge, buildableDepth)
//
// Sutherland–Hodgman against one half-plane. Convexity is NOT required — S-H against a single
// half-plane is exact for any simple polygon, which matters because parcel insets are routinely
// concave (the founder's case was a 12-vertex inset).
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG. Deterministic (C58 §1.1).

import type { Pt } from '@pryzm/schemas';

export interface DepthClipResult {
    /** The clipped ring (scene-XZ metres). Empty when `degenerate`. */
    readonly polygon: Pt[];
    /** True when the depth band removed the whole footprint. */
    readonly degenerate: boolean;
    /**
     * True when the band did NOT bite — every vertex was already within `depth` of the aligned
     * edge. Surfaced rather than swallowed: it means the parcel is shallower than the ordinance
     * allows, so *profundidad edificable* is not the binding constraint here. A report that
     * cites a depth limit which never applied would be misleading (C58 §1.3 explain-why).
     */
    readonly bandInactive: boolean;
}

/** Vertices closer than this (metres) are treated as coincident — matches insetPolygon.ts. */
const COINCIDENT_EPS = 1e-6;
const EPS = 1e-9;

function sub(a: Pt, b: Pt): Pt {
    return { x: a.x - b.x, z: a.z - b.z };
}

function dot(a: Pt, b: Pt): number {
    return a.x * b.x + a.z * b.z;
}

function centroid(ring: ReadonlyArray<Pt>): Pt {
    let x = 0, z = 0;
    for (const p of ring) { x += p.x; z += p.z; }
    return { x: x / ring.length, z: z / ring.length };
}

/**
 * Unit inward normal of the segment a→b, relative to `ring`.
 *
 * Winding is NOT assumed. Both candidate normals are tested against the ring centroid and the
 * one pointing into the interior wins. Assuming CCW would silently clip the wrong side on a
 * CW ring — producing a *complementary* envelope that is plausible-looking and completely wrong,
 * exactly the class of silent failure ADR-0270 exists to remove.
 */
function inwardNormal(a: Pt, b: Pt, ring: ReadonlyArray<Pt>): Pt | null {
    const d = sub(b, a);
    const len = Math.hypot(d.x, d.z);
    if (len <= COINCIDENT_EPS) return null;   // degenerate edge — caller must handle
    const n = { x: -d.z / len, z: d.x / len };
    const toInterior = sub(centroid(ring), a);
    return dot(n, toInterior) >= 0 ? n : { x: -n.x, z: -n.z };
}

/**
 * Clip `ring` to the half-plane lying within `depth` metres of the line through `edgeA`→`edgeB`,
 * measured along that edge's inward normal.
 *
 * @param ring   the footprint to clip (typically the per-edge inset result)
 * @param edgeA  start of the aligned edge (the alineación)
 * @param edgeB  end of the aligned edge
 * @param depth  *profundidad edificable*, metres, > 0
 */
export function clipToDepthBand(
    ring: ReadonlyArray<Pt>,
    edgeA: Pt,
    edgeB: Pt,
    depth: number,
): DepthClipResult {
    if (ring.length < 3 || !Number.isFinite(depth) || depth <= 0) {
        return { polygon: [], degenerate: true, bandInactive: false };
    }

    const n = inwardNormal(edgeA, edgeB, ring);
    if (!n) return { polygon: [], degenerate: true, bandInactive: false };

    /** Signed depth of p from the aligned line, positive into the parcel. */
    const depthOf = (p: Pt): number => dot(sub(p, edgeA), n);

    // Does the band actually bite? If every vertex is already inside it, the parcel is shallower
    // than the ordinance permits and the clip is a no-op — reported, not silently discarded.
    let maxDepth = -Infinity;
    for (const p of ring) maxDepth = Math.max(maxDepth, depthOf(p));
    if (maxDepth <= depth + EPS) {
        return { polygon: ring.map((p) => ({ x: p.x, z: p.z })), degenerate: false, bandInactive: true };
    }

    return sutherlandHodgman(ring, depthOf, depth, false);
}

/**
 * §L-590b / ADR-0273 — the COMPLEMENT of `clipToDepthBand`: keep the part of `ring` lying BEYOND
 * `depth` from the aligned edge.
 *
 * ⚠ **WHY THIS BELONGS HERE AND IS NOT A NEW MODULE.** PGM Art. 350.2 divides a parcel into two
 * tiers at ONE line — inside the block band (Art. 350.2.c height) and beyond it, in the block
 * interior (Art. 350.2.e, 5 m). The two tiers must tile the footprint exactly, with no sliver lost
 * and no overlap double-counted. That is guaranteed only if both sides are clipped against the
 * *same* line by the *same* arithmetic: the inward normal is resolved once by `inwardNormal`
 * (which tests the ring centroid rather than assuming a winding — assuming CCW would silently
 * hand back the complementary tier), and both sides run the same Sutherland–Hodgman pass with the
 * predicate flipped. A separate module could not make that promise; two implementations of "which
 * side of the line" would be free to disagree, and they would disagree on a compliance number.
 *
 * ⚠ `bandInactive` MEANS THE OPPOSITE THING HERE AND IS DELIBERATELY NOT REUSED FOR THE EMPTY
 * CASE. A parcel entirely within `depth` of its alignment has NO block-interior tier, and that is
 * `degenerate: true` — an empty region — not "the constraint did not bite". Reporting it as
 * inactive would let a caller render the WHOLE parcel as the 5 m tier, which is the complement of
 * the truth. `bandInactive: true` is returned only for the genuine no-op: a ring lying wholly
 * beyond the depth, so nothing was removed.
 */
export function clipBeyondDepthBand(
    ring: ReadonlyArray<Pt>,
    edgeA: Pt,
    edgeB: Pt,
    depth: number,
): DepthClipResult {
    if (ring.length < 3 || !Number.isFinite(depth) || depth <= 0) {
        return { polygon: [], degenerate: true, bandInactive: false };
    }

    const n = inwardNormal(edgeA, edgeB, ring);
    if (!n) return { polygon: [], degenerate: true, bandInactive: false };

    const depthOf = (p: Pt): number => dot(sub(p, edgeA), n);

    let maxDepth = -Infinity;
    let minDepth = Infinity;
    for (const p of ring) {
        const d = depthOf(p);
        if (d > maxDepth) maxDepth = d;
        if (d < minDepth) minDepth = d;
    }
    // Wholly inside the band ⇒ there is no block-interior part of this parcel at all. An empty
    // region, reported as such (see the note above on why this is NOT `bandInactive`).
    if (maxDepth <= depth + EPS) {
        return { polygon: [], degenerate: true, bandInactive: false };
    }
    // Wholly beyond the band ⇒ the clip removed nothing. The genuine no-op.
    if (minDepth >= depth - EPS) {
        return { polygon: ring.map((p) => ({ x: p.x, z: p.z })), degenerate: false, bandInactive: true };
    }

    return sutherlandHodgman(ring, depthOf, depth, true);
}

/**
 * Sutherland–Hodgman against ONE half-plane. `keepBeyond` selects which side survives.
 *
 * Exact for any simple polygon, convex or not — which matters because parcel insets are routinely
 * concave. Shared by both public clips so the two tiers of an Art. 350.2 envelope are cut by
 * identical arithmetic and cannot drift apart (see `clipBeyondDepthBand`).
 */
function sutherlandHodgman(
    ring: ReadonlyArray<Pt>,
    depthOf: (p: Pt) => number,
    depth: number,
    keepBeyond: boolean,
): DepthClipResult {
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
        const cur = ring[i]!;
        const prev = ring[(i - 1 + ring.length) % ring.length]!;
        const dCur = depthOf(cur) - depth;
        const dPrev = depthOf(prev) - depth;
        const curIn = keepBeyond ? dCur >= 0 : dCur <= 0;
        const prevIn = keepBeyond ? dPrev >= 0 : dPrev <= 0;

        if (curIn !== prevIn) {
            // Crossing — emit the exact intersection. Guarded against the degenerate
            // denominator so a coincident pair cannot produce NaN coordinates that would
            // propagate silently into an area calculation.
            const denom = dCur - dPrev;
            if (Math.abs(denom) > EPS) {
                const t = -dPrev / denom;
                out.push({ x: prev.x + (cur.x - prev.x) * t, z: prev.z + (cur.z - prev.z) * t });
            }
        }
        if (curIn) out.push({ x: cur.x, z: cur.z });
    }

    // Drop consecutive duplicates the clip can introduce when a vertex sits exactly on the line.
    const dedup: Pt[] = [];
    for (const p of out) {
        const last = dedup[dedup.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > COINCIDENT_EPS) dedup.push(p);
    }
    if (dedup.length > 1) {
        const first = dedup[0]!;
        const last = dedup[dedup.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) <= COINCIDENT_EPS) dedup.pop();
    }

    return dedup.length < 3
        ? { polygon: [], degenerate: true, bandInactive: false }
        : { polygon: dedup, degenerate: false, bandInactive: false };
}
