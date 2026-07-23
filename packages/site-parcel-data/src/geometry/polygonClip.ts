// C58 §2.2 (KG-4) — GENERIC convex-clip polygon intersection.
//
// WHY THIS EXISTS, AND WHY IT IS ITS OWN HELPER
// ---------------------------------------------
// The `explicit-area` solver (ADR-0270) needs `parcel ∩ published-footprint`: the buildable area
// on a plot is the part of the ordinance's published footprint that falls inside the parcel. That
// is a polygon–polygon INTERSECTION, which none of the existing helpers do — `depthBandClip` cuts
// against ONE half-plane, `insetPolygon` erodes a single ring.
//
// WHY SUTHERLAND–HODGMAN AND NOT A GENERAL (Greiner–Hormann / Weiler–Atherton) CLIPPER
// -----------------------------------------------------------------------------------
// S-H clips a subject polygon (which MAY be concave) against a CONVEX clip polygon, edge by edge,
// and is EXACT for that case. The two general clippers handle concave-vs-concave but are notorious
// for failing on the exact degeneracy this data ALWAYS contains: a published buildable footprint
// follows the *alineación* — i.e. it SHARES the parcel's street-frontage edge by construction, so
// footprint and parcel are collinear/coincident along a whole edge. Greiner–Hormann's classic
// entry/exit classification breaks on shared edges; S-H's half-plane inclusion (`>= -EPS`) keeps
// boundary points gracefully. For cadastral parcels — reliably convex quadrilaterals far more
// often than manzana footprints are — S-H against the convex member is both exact and robust.
//
// The caller (`explicitArea.ts`) picks whichever of the two rings is convex as the clip and
// REFUSES when neither is — an honest limitation flagged to the user, never a fabricated region
// (C58 §1.4). A future general clipper can lift that restriction without changing this contract.
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG. Deterministic (C58 §1.1). Jurisdiction-
// agnostic (C58 §1.5): plain rings in scene-XZ metres, zero knowledge of any city.

import type { Pt } from '@pryzm/schemas';
import { polygonSignedArea } from '@pryzm/site-validators';

const EPS = 1e-9;
/** Vertices closer than this (metres) are treated as coincident — matches the other clippers. */
const COINCIDENT_EPS = 1e-6;

/**
 * Is `ring` a CONVEX simple polygon? Every turn has the same sign (collinear runs ignored). A
 * ring with fewer than three vertices, or one that is entirely collinear, is NOT convex — it is
 * degenerate, and the caller must refuse rather than clip against it.
 */
export function isConvexRing(ring: ReadonlyArray<Pt>): boolean {
    const n = ring.length;
    if (n < 3) return false;
    let sign = 0;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const c = ring[(i + 2) % n]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (Math.abs(cross) < EPS) continue; // collinear vertex — no information about convexity
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return sign !== 0; // all-collinear ⇒ zero-area ⇒ not a usable clip polygon
}

/** Intersection point of the infinite line through a→b with the segment p→q. */
function lineSegmentIntersect(p: Pt, q: Pt, a: Pt, b: Pt): Pt {
    // Signed distances of p and q from the line a→b (× |a→b|; the scale cancels in `t`).
    const dp = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const dq = (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
    const denom = dp - dq;
    if (Math.abs(denom) < EPS) return { x: q.x, z: q.z }; // near-parallel — clamp to q (guarded)
    const t = dp / denom;
    return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
}

/**
 * Drop consecutive duplicate vertices (and a closing duplicate) a clip can introduce. Mirrors
 * `depthBandClip`'s dedup so the two produce byte-identical rings for the same overlap.
 */
function dedup(ring: ReadonlyArray<Pt>): Pt[] {
    const out: Pt[] = [];
    for (const p of ring) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > COINCIDENT_EPS) out.push({ x: p.x, z: p.z });
    }
    if (out.length > 1) {
        const first = out[0]!;
        const last = out[out.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) <= COINCIDENT_EPS) out.pop();
    }
    return out;
}

/**
 * Intersect `subject` (any simple polygon, convex or concave) with `clip` (which MUST be convex),
 * via Sutherland–Hodgman. Returns the intersection ring, or `[]` when the two do not overlap in a
 * region of ≥ 3 vertices.
 *
 * ⚠ `clip` MUST be convex — the caller guarantees this with `isConvexRing`. Passing a concave clip
 * silently returns a wrong region (the exact ADR-0270 defect), so this is a hard precondition, not
 * a soft one. Winding of either polygon is handled: the clip's signed area picks the interior side.
 */
export function clipPolygonToConvex(
    subject: ReadonlyArray<Pt>,
    clip: ReadonlyArray<Pt>,
): Pt[] {
    if (subject.length < 3 || clip.length < 3) return [];
    // The interior of a CCW ring lies to the LEFT of each directed edge (cross ≥ 0); CW to the
    // right. Resolve it once from the signed area rather than assuming a winding — assuming CCW
    // would clip against the OUTSIDE of a CW parcel and hand back the complement, plausible and
    // wrong (the same failure `inwardNormal` guards against in depthBandClip).
    const ccw = polygonSignedArea(clip) > 0;
    let output: Pt[] = subject.map((p) => ({ x: p.x, z: p.z }));
    const n = clip.length;

    for (let i = 0; i < n && output.length >= 3; i++) {
        const a = clip[i]!;
        const b = clip[(i + 1) % n]!;
        const inside = (p: Pt): boolean => {
            const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
            return ccw ? cross >= -EPS : cross <= EPS;
        };
        const input = output;
        output = [];
        for (let j = 0; j < input.length; j++) {
            const cur = input[j]!;
            const prev = input[(j - 1 + input.length) % input.length]!;
            const curIn = inside(cur);
            const prevIn = inside(prev);
            if (curIn) {
                if (!prevIn) output.push(lineSegmentIntersect(prev, cur, a, b));
                output.push({ x: cur.x, z: cur.z });
            } else if (prevIn) {
                output.push(lineSegmentIntersect(prev, cur, a, b));
            }
        }
    }

    const clean = dedup(output);
    return clean.length < 3 ? [] : clean;
}
