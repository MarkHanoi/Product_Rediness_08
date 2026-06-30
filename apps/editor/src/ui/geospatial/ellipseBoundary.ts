// §ELLIPSE-BOUNDARY — centre + two radii → closed N-gon polygon boundary (PURE).
//
// WHAT THIS IS
// ------------
// The Circle ADR (ADR-0082) seam-marked an ELLIPSE sibling for tower massing. The
// user clicks ONCE to drop the ellipse CENTRE, drags to define the semi-major (X /
// East) radius `rx` with a live readout, then a SECOND drag/click defines the
// semi-minor (Y / North) radius `ry`. An elliptical footprint feeds the same
// downstream parcel-boundary pipeline as the circle does — so we APPROXIMATE the
// ellipse as a closed regular N-gon (default 64 segments) of lat/lon corners, which
// `buildBoundaryFromLatLonRing` projects to a clean CCW XZ polygon exactly like the
// circle's corners.
//
// WHY AN N-GON (NOT TRUE CURVE GEOMETRY)
// --------------------------------------
// The C19 `ParcelBoundary` is a straight-edged XZ polygon (no arc/ellipse primitive).
// Every consumer (setback checks, stair carve, generators) expects a vertex ring. A
// 64-gon is visually indistinguishable from an ellipse at parcel scale and flows
// through the EXISTING pipeline with zero new geometry types — exactly the rationale
// §CIRCLE-BOUNDARY uses. The segment count is a parameter so callers can trade
// fidelity for vertex count.
//
// PROJECTION-AWARE RADII (metres, not degrees) — PER-AXIS, mirrors the circle
// ---------------------------------------------------------------------------
// The boundary projection (`latLonToSceneXZ`) is a per-axis affine map:
//   x = (lon − lon0)·(π/180)·R·cos(lat0)   (metres East)
//   z = −(lat − lat0)·(π/180)·R            (metres −North)
// To place perimeter points at TRUE metric radii `rx` (along East/X) and `ry`
// (along North/Z) — so the projected XZ shape is a real, axis-true ellipse and NOT a
// longitude-stretched one — we invert that map per axis. A perimeter point at metric
// angle θ is (dx, dz) = (rx·cos θ, ry·sin θ); we convert each metric offset to a
// lat/lon delta about the centre with the SAME per-axis scales the circle uses:
//   dLon = dx / (R·cos(lat0)·(π/180))      dLat = −dz / (R·(π/180)).
// The result projects back to a true XZ ellipse with semi-axes rx (East) and ry
// (North) — a circle is the special case rx === ry.
//
// WINDING — counter-clockwise in scene XZ (signed shoelace `x·z' − x'·z` > 0)
// --------------------------------------------------------------------------
// Sampling θ from 0 with dx = rx·cos θ, dz = ry·sin θ steps the point CCW in the XZ
// plane (standard math positive orientation, same as the circle), giving a positive
// signed area — the CCW convention the rectangle + circle emit, so `classifyEdges`
// sees a consistent outward normal.
//
// PURE + DETERMINISTIC: no DOM / maplibre / THREE import. Centre `LatLon` + two
// metric radii in → N lat/lon corners out (or null when the inputs are degenerate —
// a non-finite/non-positive radius, non-finite centre, geographic pole, or < 3
// segments). NEVER throws. (Pure geometry helpers in this directory carry no OTel
// span, consistent with `circleBoundary.ts` / `rectBoundary.ts` / `orthoSnap.ts`;
// the GA OTel gate is scoped to `plugins/*/src/handlers/`.)

import type { LatLon } from '../site/boundaryProjection.js';

/** WGS84 equatorial radius (metres) — MUST match boundaryProjection.ts. */
const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

/** Default perimeter segment count — a 64-gon ≈ an ellipse at parcel scale. */
export const DEFAULT_ELLIPSE_SEGMENTS = 64;

/**
 * The metric radius (metres) along ONE projected axis between an ellipse centre and
 * a perimeter point, via the boundary's own local-equirectangular projection.
 * `axis: 'x'` measures the East/X distance (|Δlon| projected); `axis: 'z'` measures
 * the North/Z distance (|Δlat| projected). Used to read back the semi-major (X) and
 * semi-minor (Z) radii live as the user drags each handle.
 *
 * @returns the per-axis radius in metres (≥ 0), or 0 when either input is non-finite.
 */
export function ellipseAxisRadiusMetres(centre: LatLon, edge: LatLon, axis: 'x' | 'z'): number {
    if (
        !Number.isFinite(centre.lat) || !Number.isFinite(centre.lon) ||
        !Number.isFinite(edge.lat) || !Number.isFinite(edge.lon)
    ) {
        return 0;
    }
    if (axis === 'x') {
        const cosLat0 = Math.cos(centre.lat * DEG2RAD);
        return Math.abs((edge.lon - centre.lon) * DEG2RAD * EARTH_RADIUS_M * cosLat0);
    }
    return Math.abs((edge.lat - centre.lat) * DEG2RAD * EARTH_RADIUS_M);
}

/**
 * Format the two metric radii for the live readout chip — `Rx 20.0 × Ry 12.5 m`.
 * Mirrors the circle tool's `R 12.5 m` readout, extended to the two semi-axes.
 * Non-finite / sub-zero radii read as 0.0.
 */
export function fmtRadiiMetres(rxM: number, ryM: number): string {
    const rx = Number.isFinite(rxM) && rxM > 0 ? rxM : 0;
    const ry = Number.isFinite(ryM) && ryM > 0 ? ryM : 0;
    return `Rx ${rx.toFixed(1)} × Ry ${ry.toFixed(1)} m`;
}

/**
 * Snap a raw metric radius to the nearest "round" value (default 0.5 m) when within
 * `tolM` (default 0.5 m), so tidy elliptical plots are easy to draw — identical
 * intent + defaults to the circle tool's `snapRadiusToRound`. Returns the raw radius
 * unchanged for non-finite / non-positive input.
 */
export function snapRadiusToRound(
    radiusMetres: number,
    stepM = 0.5,
    tolM = 0.5,
): number {
    if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) return radiusMetres;
    if (!Number.isFinite(stepM) || stepM <= 0) return radiusMetres;
    const rounded = Math.round(radiusMetres / stepM) * stepM;
    return Math.abs(rounded - radiusMetres) <= tolM ? rounded : radiusMetres;
}

/**
 * Build a closed regular N-gon's lat/lon corners approximating an ellipse of metric
 * semi-axes `rxMetres` (East/X) and `ryMetres` (North/Z) about `centre`. Corners are
 * ordered counter-clockwise in scene XZ (positive signed area), so the projected
 * polygon (`buildBoundaryFromLatLonRing`) is a clean CCW ring — consistent with the
 * rectangle + circle emitters.
 *
 * The ring is OPEN (no duplicated closing vertex) — `buildBoundaryFromLatLonRing`
 * closes it implicitly, and the draw tool's ring renderer wraps last→first itself.
 *
 * @param centre    the ellipse centre (lat/lon).
 * @param rxMetres  the semi-major (East/X) radius in metres (finite and > 0).
 * @param ryMetres  the semi-minor (North/Z) radius in metres (finite and > 0).
 * @param segments  perimeter segment count (default 64; clamped to ≥ 3).
 * @returns the `segments` lat/lon corners, or `null` when the inputs are degenerate
 *          (non-finite centre, non-finite/non-positive radius, geographic pole).
 */
export function ellipseCornersFromCentreRadii(
    centre: LatLon,
    rxMetres: number,
    ryMetres: number,
    segments: number = DEFAULT_ELLIPSE_SEGMENTS,
): LatLon[] | null {
    if (!Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) return null;
    if (!Number.isFinite(rxMetres) || rxMetres <= 0) return null;
    if (!Number.isFinite(ryMetres) || ryMetres <= 0) return null;

    // Clamp the segment count to a sane integer ≥ 3 (a triangle is the minimum
    // closed ring; below that the result is not a polygon).
    const n = Math.max(3, Math.floor(Number.isFinite(segments) ? segments : DEFAULT_ELLIPSE_SEGMENTS));

    // Per-axis inverse projection scale: a metric offset → a lat/lon delta about the
    // centre (see module header). cos(lat0) guards the equirectangular x-stretch so
    // the projected XZ shape is a true ellipse, not a longitude-stretched one.
    const cosLat0 = Math.cos(centre.lat * DEG2RAD);
    // Degenerate at the geographic poles (cos → 0): no finite lon delta exists.
    if (!Number.isFinite(cosLat0) || Math.abs(cosLat0) < 1e-12) return null;
    const metresPerDegLon = DEG2RAD * EARTH_RADIUS_M * cosLat0;
    const metresPerDegLat = DEG2RAD * EARTH_RADIUS_M;

    const corners: LatLon[] = [];
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const dx = rxMetres * Math.cos(theta); // metres East
        const dz = ryMetres * Math.sin(theta); // metres −North (CCW in XZ)
        const lon = centre.lon + dx / metresPerDegLon;
        // z = −North → lat increases as dz decreases; invert the sign here.
        const lat = centre.lat - dz / metresPerDegLat;
        corners.push({ lat, lon });
    }
    return corners;
}
