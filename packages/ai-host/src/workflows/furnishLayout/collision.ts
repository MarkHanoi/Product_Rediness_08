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
