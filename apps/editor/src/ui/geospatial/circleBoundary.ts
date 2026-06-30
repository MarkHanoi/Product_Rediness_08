// §CIRCLE-BOUNDARY — centre + radius → closed N-gon polygon boundary (PURE).
//
// WHAT THIS IS
// ------------
// The founder's spec adds a CIRCLE draw tool alongside Rectangle / Linear /
// Orthogonal (§BND-MODE-STRIP). The user clicks ONCE to drop the circle's CENTRE,
// then clicks a SECOND point on the circumference (radius = centre→cursor distance).
// A circular footprint feeds the same downstream parcel-boundary pipeline as the
// rectangle does — so we APPROXIMATE the circle as a closed regular N-gon (default
// 64 segments) of lat/lon corners, which `buildBoundaryFromLatLonRing` projects to
// a clean CCW XZ polygon exactly like the rectangle's four corners.
//
// WHY AN N-GON (NOT TRUE CURVE GEOMETRY)
// --------------------------------------
// The C19 `ParcelBoundary` is a straight-edged XZ polygon (no arc primitive). Every
// consumer (setback checks, stair carve, apartment generator) expects a vertex ring.
// A 64-gon is visually indistinguishable from a circle at parcel scale (max chord
// sagitta error < 0.13 % of the radius) and flows through the EXISTING pipeline with
// zero new geometry types. The segment count is a parameter so callers can trade
// fidelity for vertex count.
//
// PROJECTION-AWARE RADIUS (metres, not degrees)
// ---------------------------------------------
// The boundary projection (`latLonToSceneXZ`) is a per-axis affine map:
//   x = (lon − lon0)·(π/180)·R·cos(lat0)   (metres East)
//   z = −(lat − lat0)·(π/180)·R            (metres −North)
// To place circumference points at a TRUE metric radius `r` (so the projected XZ
// shape is a real circle, not an ellipse stretched by the cos(lat) factor), we
// invert that map per axis: a metric offset (dx, dz) about the centre becomes
//   dLon = dx / (R·cos(lat0)·(π/180))      dLat = −dz / (R·(π/180)).
// We sample the circumference in METRIC angle θ (dx = r·cos θ, dz = r·sin θ) and
// convert each sample to lat/lon. The result projects back to a true XZ circle.
//
// WINDING — counter-clockwise in scene XZ (signed shoelace `x·z' − x'·z` > 0)
// --------------------------------------------------------------------------
// Sampling θ from 0 with dx = r·cos θ, dz = r·sin θ steps the point (x, z) =
// (r·cos θ, r·sin θ) counter-clockwise in the XZ plane (standard math positive
// orientation), giving a positive signed area — the same CCW convention the
// rectangle emits, so `classifyEdges` sees a consistent outward normal.
//
// PURE + DETERMINISTIC: no DOM / maplibre / THREE import. Centre `LatLon` + metric
// radius in → N lat/lon corners out (or null when the inputs are degenerate — a
// non-finite/non-positive radius, non-finite centre, or < 3 segments).

import type { LatLon } from '../site/boundaryProjection.js';

/** WGS84 equatorial radius (metres) — MUST match boundaryProjection.ts. */
const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

/** Default circumference segment count — 64-gon ≈ a circle at parcel scale. */
export const DEFAULT_CIRCLE_SEGMENTS = 64;

/**
 * The metric radius (metres) between a circle's centre and a circumference point,
 * via the boundary's own local-equirectangular projection. Projecting both points
 * about the centre and taking the Euclidean XZ distance is invariant to the origin
 * choice at parcel scale — the same approach `edgeMetres` uses for edge lengths.
 *
 * @returns the radius in metres (≥ 0), or 0 when either input is non-finite.
 */
export function circleRadiusMetres(centre: LatLon, edge: LatLon): number {
    if (
        !Number.isFinite(centre.lat) || !Number.isFinite(centre.lon) ||
        !Number.isFinite(edge.lat) || !Number.isFinite(edge.lon)
    ) {
        return 0;
    }
    const cosLat0 = Math.cos(centre.lat * DEG2RAD);
    const dx = (edge.lon - centre.lon) * DEG2RAD * EARTH_RADIUS_M * cosLat0;
    const dz = -((edge.lat - centre.lat) * DEG2RAD * EARTH_RADIUS_M);
    return Math.hypot(dx, dz);
}

/**
 * Format a metric radius for the live readout chip (matches the line tool's
 * `${m.toFixed(1)} m` length labels). Sub-zero / non-finite radii read as `R 0.0 m`.
 */
export function fmtRadiusMetres(radiusM: number): string {
    const r = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0;
    return `R ${r.toFixed(1)} m`;
}

/**
 * Build a closed regular N-gon's lat/lon corners approximating a circle of metric
 * `radiusMetres` about `centre`. Corners are ordered counter-clockwise in scene XZ
 * (positive signed area), so the projected polygon (`buildBoundaryFromLatLonRing`)
 * is a clean CCW ring — consistent with the rectangle emitter.
 *
 * The ring is OPEN (no duplicated closing vertex) — `buildBoundaryFromLatLonRing`
 * closes it implicitly, and the draw tool's ring renderer wraps last→first itself
 * (matching how the rectangle's four corners are emitted).
 *
 * @param centre        the circle centre (lat/lon).
 * @param radiusMetres  the radius in metres (must be finite and > 0).
 * @param segments      circumference segment count (default 64; clamped to ≥ 3).
 * @returns the `segments` lat/lon corners, or `null` when the inputs are degenerate
 *          (non-finite centre, non-finite/non-positive radius). NEVER throws.
 */
export function circleCornersFromCentreRadius(
    centre: LatLon,
    radiusMetres: number,
    segments: number = DEFAULT_CIRCLE_SEGMENTS,
): LatLon[] | null {
    if (!Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) return null;
    if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) return null;

    // Clamp the segment count to a sane integer ≥ 3 (a triangle is the minimum
    // closed ring; below that the result is not a polygon).
    const n = Math.max(3, Math.floor(Number.isFinite(segments) ? segments : DEFAULT_CIRCLE_SEGMENTS));

    // Per-axis inverse projection scale: a metric offset → a lat/lon delta about the
    // centre (see module header). cos(lat0) guards the equirectangular x-stretch so
    // the projected XZ shape is a true circle, not a longitude-stretched ellipse.
    const cosLat0 = Math.cos(centre.lat * DEG2RAD);
    // Degenerate at the geographic poles (cos → 0): no finite lon delta exists.
    if (!Number.isFinite(cosLat0) || Math.abs(cosLat0) < 1e-12) return null;
    const metresPerDegLon = DEG2RAD * EARTH_RADIUS_M * cosLat0;
    const metresPerDegLat = DEG2RAD * EARTH_RADIUS_M;

    const corners: LatLon[] = [];
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const dx = radiusMetres * Math.cos(theta); // metres East
        const dz = radiusMetres * Math.sin(theta); // metres −North (CCW in XZ)
        const lon = centre.lon + dx / metresPerDegLon;
        // z = −North → lat increases as dz decreases; invert the sign here.
        const lat = centre.lat - dz / metresPerDegLat;
        corners.push({ lat, lon });
    }
    return corners;
}

/**
 * Snap a raw metric radius to the nearest "round" value to make tidy circular
 * plots easy to draw — mirrors the rectangle tool's snap intent (snap to round
 * numbers / footprint features). The cursor radius snaps to the nearest `stepM`
 * (default 0.5 m) ONLY when it is within `tolM` (default 0.5 m) of that round value;
 * otherwise the raw radius is returned so deliberate odd radii still draw free.
 *
 * Pure: no DOM. Returns the raw radius unchanged for non-finite / non-positive in.
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
