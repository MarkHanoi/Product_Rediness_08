// A.21.D24 §RIDGE-PRINCIPAL-AXIS — pure 2D ridge-axis geometry for the gable roof.
//
// Extracted as a THREE-free module so the ridge computation is unit-testable in
// isolation (the rest of RoofGeometryBuilder pulls in renderer-three). NO THREE,
// NO DOM, NO Math.random — deterministic pure math, mirroring the no-span pure
// geometry convention of this package.

export type Pt2 = [number, number]; // [x, z]

/**
 * The footprint's principal axis: the unit direction `u` of the polygon's LONGEST
 * edge (the natural ridge direction for a rectangular / parallelogram plate) plus
 * its in-plane perpendicular `v` = (-u.z, u.x).
 *
 * A rotated rectangle's longest edge encodes its rotation directly, so a gable
 * ridge built along `u` runs parallel to the long façades on ANY orientation. For
 * an axis-aligned rectangle the longest edge is along world X or Z, so `u`/`v`
 * collapse to the world axes — the gable is then byte-identical to the pre-D24
 * bbox build (no regression).
 */
export function principalAxis(pts: ReadonlyArray<Pt2>): { u: Pt2; v: Pt2 } {
    const n = pts.length;
    let bestLen = -1;
    let u: Pt2 = [1, 0];
    for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > bestLen && len > 1e-9) {
            bestLen = len;
            u = [dx / len, dz / len];
        }
    }
    return { u, v: [-u[1], u[0]] };
}

/**
 * Gable ridge endpoints (world XZ) + ridge height for an arbitrarily-oriented
 * footprint. The ridge runs along the principal axis `u` at the centre of the
 * perpendicular (`v`) extent, spanning the full `u` extent; the ridge height is
 * `halfPerpExtent * slope`. Returns world-XZ endpoints so the caller can build
 * the slope faces directly.
 */
export function gableRidge(
    eavePts: ReadonlyArray<Pt2>,
    slope: number,
): { ridge: [Pt2, Pt2]; ridgeH: number; u: Pt2; v: Pt2 } {
    const { u, v } = principalAxis(eavePts);
    const cx = eavePts.reduce((s, p) => s + p[0], 0) / eavePts.length;
    const cz = eavePts.reduce((s, p) => s + p[1], 0) / eavePts.length;

    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const [x, z] of eavePts) {
        const dx = x - cx, dz = z - cz;
        const pu = dx * u[0] + dz * u[1];
        const pv = dx * v[0] + dz * v[1];
        if (pu < uMin) uMin = pu;
        if (pu > uMax) uMax = pu;
        if (pv < vMin) vMin = pv;
        if (pv > vMax) vMax = pv;
    }
    const halfPerp = (vMax - vMin) / 2;
    const ridgeH = halfPerp * slope;
    const vMid = (vMin + vMax) / 2;
    const toWorld = (pu: number, pv: number): Pt2 =>
        [cx + pu * u[0] + pv * v[0], cz + pu * u[1] + pv * v[1]];
    return { ridge: [toWorld(uMin, vMid), toWorld(uMax, vMid)], ridgeH, u, v };
}

/**
 * §ROOF-SHAPE (A.21.D24) — is this footprint a sound GABLE candidate?
 *
 * A gable has ONE straight ridge, so it only reads correctly on a roughly
 * rectangular plate (≤4–5 corners, convex). A rotated / skewed rectangle or
 * parallelogram is fine (the ridge follows the principal axis). An L/T/U or
 * otherwise many-cornered or NON-convex footprint cannot be capped by a single
 * ridge → `false`, and the caller degrades to a hip roof (polygon-offset, any
 * convex shape). Pure + deterministic.
 */
export function isGableFriendly(poly: ReadonlyArray<{ x: number; z: number }>): boolean {
    const n = poly.length;
    if (n < 3) return false;
    if (n > 5) return false; // materially more than a quad → not a single-ridge shape
    let sign = 0;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % n]!;
        const c = poly[(i + 2) % n]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (Math.abs(cross) < 1e-9) continue; // collinear — ignore
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false; // re-entrant corner → non-convex
    }
    return true;
}
