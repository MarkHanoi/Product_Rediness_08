// D-FLE F6 — pure geometry helpers for placement (SPEC-FURNITURE-LAYOUT-ENGINE §5).
//
// Axis-aligned rectangle overlap, point-in-polygon, and rectangle-in-polygon —
// the primitives the placement solver uses to keep furniture inside the room, off
// the doors, and not overlapping. Pure, deterministic, metres. Furniture placed
// against axis-aligned walls keeps yaw ∈ {0,90,180,270}, so footprints stay
// axis-aligned in world coordinates and AABB tests are exact.

import type { Pt, Rect } from './types.js';

const EPS = 1e-6;

/** Two axis-aligned rectangles overlap (strict — touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
}

/** Ray-cast point-in-polygon (polygon in world XZ, any winding). */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > p.z) !== (zj > p.z)) && (p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi)) hit = !hit;
    }
    return hit;
}

export const rectCorners = (r: Rect): Pt[] =>
    [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];

export const rectCenter = (r: Rect): Pt => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

/** A rectangle lies inside a polygon iff its centre + all four corners are inside.
 *  (Sufficient for convex/rectilinear rooms — the D-FLE target shells.) */
export function rectInPolygon(r: Rect, poly: readonly Pt[]): boolean {
    if (!pointInPolygon(rectCenter(r), poly)) return false;
    for (const c of rectCorners(r)) if (!pointInPolygon(c, poly)) return false;
    return true;
}

/** Build an axis-aligned footprint rect at centre (cx,cz) with extent (w along x,
 *  l along z) for yaw 0/180; swaps w/l for yaw 90/270. yaw in radians. */
export function footprintRect(cx: number, cz: number, w: number, l: number, yaw: number): Rect {
    const q = Math.round(yaw / (Math.PI / 2)) & 3;          // 0,1,2,3
    const ew = (q === 1 || q === 3) ? l : w;                  // extent along x
    const el = (q === 1 || q === 3) ? w : l;                  // extent along z
    return { x0: cx - ew / 2, z0: cz - el / 2, x1: cx + ew / 2, z1: cz + el / 2 };
}

/** True if `r` overlaps any rect in `others`. */
export const overlapsAny = (r: Rect, others: readonly Rect[]): boolean => others.some(o => rectsOverlap(r, o));

// ── §FURNISH-OBB (2026-06-05) — ORIENTED footprints for non-orthogonal rooms ──
//
// The AABB primitives above quantise yaw to {0,90,180,270} (footprintRect snaps
// via Math.round(yaw/(π/2))), so a footprint placed against an ANGLED wall is
// tested as an axis-aligned box that does not match the furniture's true
// rotation. On a non-orthogonal room that box pokes outside the angled polygon →
// rectInPolygon fails → the item is silently dropped (the "minimal furniture on
// non-orthogonal layouts" defect). These oriented (rotated-quad) primitives test
// the TRUE footprint. They are EXACTLY equivalent to the AABB versions at the
// four cardinal yaws (a quad at yaw∈{0,90,180,270} has the AABB's corners and
// SAT reduces to AABB-overlap), so orthogonal rooms are unchanged; only angled
// rooms gain placements. A `Quad` is its 4 world-XZ corners (convex, CCW-ish).
export type Quad = readonly [Pt, Pt, Pt, Pt];

/** The 4 TRUE (un-snapped) world corners of a footprint: extent `w` along the
 *  item's local x and `l` along its local z, rotated by `yaw` about (cx,cz). */
export function footprintCorners(cx: number, cz: number, w: number, l: number, yaw: number): Quad {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const hw = w / 2, hl = l / 2;
    const local: Pt[] = [{ x: -hw, z: -hl }, { x: hw, z: -hl }, { x: hw, z: hl }, { x: -hw, z: hl }];
    const r = local.map((p) => ({ x: cx + p.x * c - p.z * s, z: cz + p.x * s + p.z * c }));
    return [r[0]!, r[1]!, r[2]!, r[3]!];
}

/** Mean of a quad's corners. */
export const quadCenter = (q: Quad): Pt => ({
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    z: (q[0].z + q[1].z + q[2].z + q[3].z) / 4,
});

/** A convex footprint lies inside the polygon iff its centre + all corners are.
 *  Oriented-aware companion to rectInPolygon (works for ANY footprint angle). */
export function quadInPolygon(q: Quad, poly: readonly Pt[]): boolean {
    if (!pointInPolygon(quadCenter(q), poly)) return false;
    for (const c of q) if (!pointInPolygon(c, poly)) return false;
    return true;
}

/** Convex-quad overlap via the Separating Axis Theorem (strict — touching edges
 *  do NOT count, matching rectsOverlap). Reduces to AABB overlap for axis quads. */
export function quadsOverlap(a: Quad, b: Quad): boolean {
    const project = (q: Quad, ax: Pt): [number, number] => {
        let mn = Infinity, mx = -Infinity;
        for (const p of q) { const d = p.x * ax.x + p.z * ax.z; if (d < mn) mn = d; if (d > mx) mx = d; }
        return [mn, mx];
    };
    for (const q of [a, b]) {
        for (let i = 0; i < 4; i++) {
            const p1 = q[i]!, p2 = q[(i + 1) & 3]!;
            const axis: Pt = { x: -(p2.z - p1.z), z: p2.x - p1.x }; // edge normal
            const [minA, maxA] = project(a, axis);
            const [minB, maxB] = project(b, axis);
            if (maxA < minB + EPS || maxB < minA + EPS) return false; // separating axis
        }
    }
    return true;
}

/** True if quad `q` overlaps any quad in `others`. */
export const quadOverlapsAny = (q: Quad, others: readonly Quad[]): boolean => others.some((o) => quadsOverlap(q, o));
