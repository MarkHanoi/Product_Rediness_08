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

    // Sutherland–Hodgman: keep the side where depthOf(p) <= depth.
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
        const cur = ring[i]!;
        const prev = ring[(i - 1 + ring.length) % ring.length]!;
        const dCur = depthOf(cur) - depth;
        const dPrev = depthOf(prev) - depth;
        const curIn = dCur <= 0;
        const prevIn = dPrev <= 0;

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
