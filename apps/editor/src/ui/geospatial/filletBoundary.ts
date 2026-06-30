// §FILLET-BOUNDARY — round an existing boundary corner into a tangent arc (PURE).
//
// WHAT THIS IS
// ------------
// The Circle ADR (ADR-0082) seam-marked an ARC/FILLET sibling: let the user round a
// drawn rectangle/polygon CORNER into a curve WITHOUT redrawing. Given a corner
// vertex and its two neighbours (the previous + next ring vertices), and a fillet
// radius in metres, this replaces the single corner vertex with an N-segment arc
// that is TANGENT to the two adjacent edges — the classic CAD "fillet". The arc
// vertices splice back into the boundary ring in place of the corner.
//
// PROJECTION-AWARE (metres, not degrees) — mirrors §CIRCLE-BOUNDARY
// ----------------------------------------------------------------
// A fillet must be computed in a TRUE metric frame (so the radius is real metres and
// the tangent points sit on the actual edges, not lon-stretched ones). The boundary
// projection (`latLonToSceneXZ`) is a per-axis affine map about a centre:
//   x = (lon − lon0)·(π/180)·R·cos(lat0)   (metres East)
//   z = −(lat − lat0)·(π/180)·R            (metres −North)
// We project the three vertices about the CORNER (any common origin gives the same
// local geometry at parcel scale), solve the fillet in metric XZ, then invert each
// arc point back to lat/lon with the SAME per-axis scales. The result is a true
// metric arc regardless of latitude.
//
// FILLET MATH (tangent-arc between two edges meeting at the corner)
// ----------------------------------------------------------------
// Let the corner be C with neighbours P (prev) and Q (next). The two edge unit
// directions FROM the corner are u = (P−C)/|P−C| and v = (Q−C)/|Q−C|. The interior
// half-angle φ satisfies cos(2φ) = u·v, so the tangent length along each edge for a
// fillet of radius r is t = r / tan(φ). The arc centre sits along the bisector at
// distance d = r / sin(φ). The arc runs between the two tangent points T1 = C + t·u
// and T2 = C + t·v, swept about the arc centre.
//
// RADIUS CLAMP (no self-intersection)
// -----------------------------------
// The tangent length t must not exceed either edge's available half-length, else the
// arc would overrun the edge / the adjacent corner. We clamp r so t ≤ min(|P−C|,
// |Q−C|)·EDGE_FRACTION (default 0.5 — never consume more than half an edge, so two
// fillets on the same edge can't collide). `filletCornerArc` returns the clamped
// radius it actually used so the UI can show it.
//
// DEGENERATE CASES → empty arc (caller keeps the original corner)
// --------------------------------------------------------------
// Collinear edges (no real corner), a zero-length edge, a non-positive/non-finite
// radius, or < 1 segment all yield an EMPTY vertex list + a clamped radius of 0 —
// the caller splices nothing and leaves the corner as-is. NEVER throws.
//
// PURE + DETERMINISTIC: no DOM / maplibre / THREE import. (Pure geometry helpers in
// this directory carry no OTel span, consistent with `circleBoundary.ts` /
// `rectBoundary.ts` / `orthoSnap.ts`; the GA OTel gate is scoped to
// `plugins/*/src/handlers/`.)

import type { LatLon } from '../site/boundaryProjection.js';

/** WGS84 equatorial radius (metres) — MUST match boundaryProjection.ts. */
const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

/** Default arc segment count for a filleted corner (smooth at parcel scale). */
export const DEFAULT_FILLET_SEGMENTS = 8;

/**
 * Fraction of the SHORTER adjacent edge the fillet tangent may consume. 0.5 means a
 * fillet never eats more than half an edge, so two fillets sharing an edge can't
 * overrun each other. Kept < 1 by construction.
 */
const EDGE_FRACTION = 0.5;

interface XZ { readonly x: number; readonly z: number; }

/** Local-equirectangular projection of `p` about `origin` (true metres). */
function projXZ(p: LatLon, origin: LatLon): XZ {
    const cosLat0 = Math.cos(origin.lat * DEG2RAD);
    return {
        x: (p.lon - origin.lon) * DEG2RAD * EARTH_RADIUS_M * cosLat0,
        z: -((p.lat - origin.lat) * DEG2RAD * EARTH_RADIUS_M),
    };
}

/** Inverse of `projXZ`: a metric XZ point about `origin` → lat/lon. */
function invXZ(pt: XZ, origin: LatLon): LatLon {
    const cosLat0 = Math.cos(origin.lat * DEG2RAD);
    const metresPerDegLon = DEG2RAD * EARTH_RADIUS_M * cosLat0;
    const metresPerDegLat = DEG2RAD * EARTH_RADIUS_M;
    return {
        lon: origin.lon + pt.x / metresPerDegLon,
        lat: origin.lat - pt.z / metresPerDegLat,
    };
}

/**
 * The result of filleting one corner: the arc vertices (lat/lon, ordered from the
 * prev-edge tangent point toward the next-edge tangent point) to SPLICE in place of
 * the corner vertex, plus the clamped radius (metres) actually used.
 *
 * An EMPTY `arc` (with `radiusUsed === 0`) means the corner could not be filleted
 * (degenerate / collinear / clamped to nothing) — the caller keeps the original
 * corner vertex untouched.
 */
export interface FilletArc {
    readonly arc: LatLon[];
    readonly radiusUsed: number;
}

/**
 * The MAXIMUM fillet radius (metres) that fits at a corner without the tangent
 * overrunning EDGE_FRACTION of either adjacent edge — i.e. the value the requested
 * radius is clamped to. Pure; returns 0 for a degenerate / collinear corner.
 *
 * For a fillet of radius r the tangent length is t = r / tan(φ), where φ is the
 * interior half-angle. We cap t at tMax = EDGE_FRACTION·min(|P−C|, |Q−C|), giving
 * rMax = tMax · tan(φ).
 */
export function maxFilletRadiusMetres(prev: LatLon, corner: LatLon, next: LatLon): number {
    if (
        !Number.isFinite(prev.lat) || !Number.isFinite(prev.lon) ||
        !Number.isFinite(corner.lat) || !Number.isFinite(corner.lon) ||
        !Number.isFinite(next.lat) || !Number.isFinite(next.lon)
    ) {
        return 0;
    }
    const C = projXZ(corner, corner); // → {0,0}
    const P = projXZ(prev, corner);
    const Q = projXZ(next, corner);
    const upx = P.x - C.x, upz = P.z - C.z;
    const uqx = Q.x - C.x, uqz = Q.z - C.z;
    const lenP = Math.hypot(upx, upz);
    const lenQ = Math.hypot(uqx, uqz);
    if (lenP < 1e-6 || lenQ < 1e-6) return 0; // zero-length edge.
    // Unit edge directions from the corner.
    const ux = upx / lenP, uz = upz / lenP;
    const vx = uqx / lenQ, vz = uqz / lenQ;
    // Interior angle 2φ between the two edges; cos(2φ) = u·v (clamped for safety).
    let cos2phi = ux * vx + uz * vz;
    cos2phi = Math.max(-1, Math.min(1, cos2phi));
    const twoPhi = Math.acos(cos2phi);
    // Collinear (straight, 2φ≈π) or folded back (2φ≈0) → no real corner to round.
    if (twoPhi < 1e-4 || twoPhi > Math.PI - 1e-4) return 0;
    const phi = twoPhi / 2;
    const tanPhi = Math.tan(phi);
    const tMax = EDGE_FRACTION * Math.min(lenP, lenQ);
    return tMax * tanPhi;
}

/**
 * Replace a boundary corner with a tangent fillet arc of metric `radiusMetres`.
 *
 * @param prev    the previous ring vertex (lat/lon).
 * @param corner  the corner vertex to round (lat/lon).
 * @param next    the next ring vertex (lat/lon).
 * @param radiusMetres requested fillet radius in metres (clamped to fit; see header).
 * @param segments arc segment count (default 8; clamped to ≥ 1, i.e. ≥ 2 arc points).
 * @returns the arc vertices to splice IN PLACE OF the corner + the clamped radius.
 *          Empty arc + radiusUsed 0 ⇒ keep the original corner. NEVER throws.
 */
export function filletCornerArc(
    prev: LatLon,
    corner: LatLon,
    next: LatLon,
    radiusMetres: number,
    segments: number = DEFAULT_FILLET_SEGMENTS,
): FilletArc {
    const empty: FilletArc = { arc: [], radiusUsed: 0 };
    if (
        !Number.isFinite(prev.lat) || !Number.isFinite(prev.lon) ||
        !Number.isFinite(corner.lat) || !Number.isFinite(corner.lon) ||
        !Number.isFinite(next.lat) || !Number.isFinite(next.lon)
    ) {
        return empty;
    }
    if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) return empty;

    // Project about the corner → metric XZ (corner at origin).
    const C: XZ = { x: 0, z: 0 };
    const P = projXZ(prev, corner);
    const Q = projXZ(next, corner);
    const upx = P.x - C.x, upz = P.z - C.z;
    const uqx = Q.x - C.x, uqz = Q.z - C.z;
    const lenP = Math.hypot(upx, upz);
    const lenQ = Math.hypot(uqx, uqz);
    if (lenP < 1e-6 || lenQ < 1e-6) return empty; // zero-length edge.

    const ux = upx / lenP, uz = upz / lenP;
    const vx = uqx / lenQ, vz = uqz / lenQ;

    let cos2phi = ux * vx + uz * vz;
    cos2phi = Math.max(-1, Math.min(1, cos2phi));
    const twoPhi = Math.acos(cos2phi);
    if (twoPhi < 1e-4 || twoPhi > Math.PI - 1e-4) return empty; // collinear / folded.
    const phi = twoPhi / 2;
    const sinPhi = Math.sin(phi);
    const tanPhi = Math.tan(phi);
    if (sinPhi < 1e-9 || tanPhi < 1e-9) return empty;

    // Clamp the radius so the tangent never overruns EDGE_FRACTION of either edge.
    const rMax = maxFilletRadiusMetres(prev, corner, next);
    if (!(rMax > 0)) return empty;
    const r = Math.min(radiusMetres, rMax);
    const t = r / tanPhi;          // tangent length along each edge from the corner.

    // Tangent points on the two edges.
    const t1x = C.x + t * ux, t1z = C.z + t * uz; // toward prev
    const t2x = C.x + t * vx, t2z = C.z + t * vz; // toward next

    // Arc centre: along the interior bisector at distance d = r / sin(φ). The bisector
    // direction is the normalised sum of the two edge unit vectors (points INTO the
    // corner's interior, i.e. away from the corner along the angle bisector).
    let bx = ux + vx, bz = uz + vz;
    const blen = Math.hypot(bx, bz);
    if (blen < 1e-9) return empty; // edges exactly opposite (already excluded, defensive).
    bx /= blen; bz /= blen;
    const d = r / sinPhi;
    const cx = C.x + d * bx, cz = C.z + d * bz; // arc centre.

    // Sweep from T1 → T2 about the arc centre. Use the signed angle between the two
    // centre→tangent vectors, going the SHORT way (|sweep| ≤ π) so the arc hugs the
    // corner rather than wrapping the long way round.
    const a1 = Math.atan2(t1z - cz, t1x - cx);
    const a2 = Math.atan2(t2z - cz, t2x - cx);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;

    const segs = Math.max(1, Math.floor(Number.isFinite(segments) ? segments : DEFAULT_FILLET_SEGMENTS));
    const arc: LatLon[] = [];
    for (let i = 0; i <= segs; i++) {
        const a = a1 + (sweep * i) / segs;
        const px = cx + r * Math.cos(a);
        const pz = cz + r * Math.sin(a);
        arc.push(invXZ({ x: px, z: pz }, corner));
    }
    return { arc, radiusUsed: r };
}

/**
 * Format a fillet radius for the live readout chip — `Fillet 2.5 m`. Non-finite /
 * sub-zero radii read as 0.0. Mirrors the circle tool's `R 12.5 m` readout.
 */
export function fmtFilletRadiusMetres(radiusM: number): string {
    const r = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0;
    return `Fillet ${r.toFixed(1)} m`;
}
