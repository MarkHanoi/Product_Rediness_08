// C58 §3.2 — per-edge setback INSET (the `parcel ⊖ setbacks` geometry).
//
// L2-pure, deterministic (C58 §1.1 / §1.9): scene-XZ metres in, scene-XZ metres
// out. No THREE / DOM / I-O / RNG / clock. Reuses the pure geometry helpers from
// @pryzm/site-validators (polygon signed area + point-in-polygon).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A METRIC EDGE-OFFSET, NOT TURF (deliberate, documented):
//   C58 §3.2 suggests "Turf negative buffer". Turf's `buffer` is GEODESIC — it
//   assumes WGS84 lng/lat degrees and projects to a local metric plane. The C19
//   parcel spine is already in scene-XZ METRES (an LTP-ENU planar frame), not
//   degrees, so feeding it to Turf would be metrically wrong; and SPEC §4
//   forbids re-projecting to WGS84 and back (the envelope must stay in the exact
//   frame the parcel renders in). A pure metric half-plane edge-offset is the
//   correct tool here: it is deterministic, per-edge (front/side/rear each get
//   their own inward offset — C58 can't do that with a single uniform buffer),
//   metric-exact in scene-XZ, and adds no dependency.
// ─────────────────────────────────────────────────────────────────────────────

import type { Pt } from '@pryzm/schemas';
import type { ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea, pointInPolygon } from '@pryzm/site-validators';

export interface PerEdgeSetbacks {
    readonly front: number;
    readonly side: number;
    readonly rear: number;
    /** Applied to edges classified `unclassified` (C58 §10.3 uniform fallback). */
    readonly unclassified: number;
}

export interface InsetResult {
    /** The inset ring (scene-XZ metres). Empty when `degenerate`. */
    readonly polygon: Pt[];
    /** True when the setbacks consumed the whole parcel (no buildable area). */
    readonly degenerate: boolean;
}

const EPS = 1e-9;

function sub(a: Pt, b: Pt): Pt {
    return { x: a.x - b.x, z: a.z - b.z };
}
/** 2D cross product of (x,z) vectors. */
function cross(a: Pt, b: Pt): number {
    return a.x * b.z - a.z * b.x;
}
function length(v: Pt): number {
    return Math.hypot(v.x, v.z);
}

/**
 * Intersect two lines, each given by a point + a direction. Returns null when
 * the lines are (near-)parallel.
 */
function lineIntersect(p0: Pt, d0: Pt, p1: Pt, d1: Pt): Pt | null {
    const denom = cross(d0, d1);
    if (Math.abs(denom) < EPS) return null;
    const t = cross(sub(p1, p0), d1) / denom;
    return { x: p0.x + t * d0.x, z: p0.z + t * d0.z };
}

/**
 * Inset a simple polygon by a PER-EDGE setback, keyed by each edge's
 * classification. Deterministic + metric-exact in scene-XZ metres.
 *
 * Method: offset each edge's supporting line inward by its own setback, then
 * re-intersect consecutive offset lines to place the new vertices. Robust for
 * rectangular + convex parcels (the pilot case) and mild concavity. Over-inset
 * (setbacks ≥ half the parcel width, so the offset lines cross the far side) is
 * detected by a winding-sign flip or a collapsed area → `degenerate: true` with
 * an empty polygon (no crash, no self-intersecting garbage).
 *
 * @param polygon              closed ring, ≥ 3 vertices, scene-XZ metres.
 * @param edgeClassifications  one per edge (`edge i` = `polygon[i]→polygon[i+1]`).
 * @param setbacks             per-classification inward distances (metres).
 */
export function insetPolygonPerEdge(
    polygon: ReadonlyArray<Pt>,
    edgeClassifications: ReadonlyArray<ParcelEdgeClassification>,
    setbacks: PerEdgeSetbacks,
): InsetResult {
    const n = polygon.length;
    if (n < 3) return { polygon: [], degenerate: true };

    const signed = polygonSignedArea(polygon);
    if (Math.abs(signed) < EPS) return { polygon: [], degenerate: true };
    // For CCW (signed > 0) in the (x,z) shoelace, the inward (interior) normal of
    // a directed edge (dx,dz) is the left normal (-dz, dx); for CW, flip.
    const ccw = signed > 0;

    const setbackForEdge = (i: number): number => {
        const cls = edgeClassifications[i] ?? 'unclassified';
        switch (cls) {
            case 'front':
                return setbacks.front;
            case 'side':
                return setbacks.side;
            case 'rear':
                return setbacks.rear;
            default:
                return setbacks.unclassified;
        }
    };

    // Build each edge's inward-offset supporting line: a point on it + its dir.
    const offsetLines: Array<{ p: Pt; d: Pt } | null> = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % n]!;
        const dir = sub(b, a);
        const len = length(dir);
        if (len < EPS) {
            offsetLines[i] = null; // zero-length edge — skip; handled below.
            continue;
        }
        const ux = dir.x / len;
        const uz = dir.z / len;
        // Inward unit normal.
        const nx = ccw ? -uz : uz;
        const nz = ccw ? ux : -ux;
        const s = Math.max(0, setbackForEdge(i));
        offsetLines[i] = {
            p: { x: a.x + nx * s, z: a.z + nz * s },
            d: { x: ux, z: uz },
        };
    }

    // New vertex j = intersection of offset-line(edge j-1) and offset-line(edge j).
    const out: Pt[] = [];
    for (let j = 0; j < n; j++) {
        const prev = offsetLines[(j - 1 + n) % n];
        const curr = offsetLines[j];
        if (!prev || !curr) {
            // A degenerate edge — fall back to the current edge's offset start.
            if (curr) out.push({ ...curr.p });
            continue;
        }
        const x = lineIntersect(prev.p, prev.d, curr.p, curr.d);
        if (!x) {
            // Parallel consecutive edges (straight vertex): take the offset point.
            out.push({ ...curr.p });
        } else {
            out.push(x);
        }
    }

    if (out.length < 3) return { polygon: [], degenerate: true };

    // Over-inset detection #1 — EDGE DIRECTION PRESERVATION. Each inset edge must
    // still run in the SAME direction as its parent edge; if an offset line
    // crossed past the far side, that edge REVERSES (negative dot product). This
    // is the robust catch for a symmetric over-inset (e.g. a 6 m square inset by
    // 4 m), where the collapsed inner ring keeps the original winding + a positive
    // area and would otherwise slip past the sign/centroid checks below.
    for (let j = 0; j < n; j++) {
        const line = offsetLines[j];
        if (!line) continue;
        const a = out[j]!;
        const b = out[(j + 1) % n]!;
        const edge = sub(b, a);
        if (edge.x * line.d.x + edge.z * line.d.z <= EPS) {
            return { polygon: [], degenerate: true };
        }
    }

    // Over-inset detection #2 — the inset must keep the SAME winding and a
    // positive area. A sign flip means the offset lines crossed past the far side.
    const insetSigned = polygonSignedArea(out);
    if (Math.abs(insetSigned) < EPS) return { polygon: [], degenerate: true };
    if (insetSigned > 0 !== ccw) return { polygon: [], degenerate: true };

    // Sanity: the inset centroid must lie inside the original parcel. This
    // catches pathological offsets that keep winding but escape the parcel.
    let cx = 0;
    let cz = 0;
    for (const p of out) {
        cx += p.x;
        cz += p.z;
    }
    cx /= out.length;
    cz /= out.length;
    if (!pointInPolygon({ x: cx, z: cz }, polygon)) {
        return { polygon: [], degenerate: true };
    }

    return { polygon: out, degenerate: false };
}
