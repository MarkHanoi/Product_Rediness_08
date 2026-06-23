// §RECT-BOUNDARY — two-corner axis-aligned rectangle boundary (PURE).
//
// WHAT THIS IS
// ------------
// The founder's spec: drawing a parcel boundary vertex-by-vertex on a map produces
// small/irregular/angled quads, which classify as T/U-shapes downstream and
// fragment the stair carve + force room drops (§DIAG-SHAPE / §FEASIBILITY-ALLOC).
// Rectangle mode replaces that: the user clicks ONE corner, then the OPPOSITE
// corner, and an AXIS-ALIGNED rectangle boundary is committed.
//
// WHY THIS IS AXIS-ALIGNED IN THE SCENE FRAME
// -------------------------------------------
// The downstream parcel boundary is scene-XZ metres. The boundary projection
// (`latLonToSceneXZ`) is a per-axis affine map: x = k·(lon − lon0), z = −m·(lat −
// lat0) with k, m > 0 constant at parcel scale. So a rectangle whose lat/lon
// corners share the two distinct lat values and the two distinct lon values is
// EXACTLY axis-aligned (no rotation) once projected to XZ. We therefore build the
// four lat/lon corners from {minLat, maxLat} × {minLon, maxLon}.
//
// WINDING — counter-clockwise in scene XZ (signed shoelace `x·z' − x'·z` > 0)
// --------------------------------------------------------------------------
// With increasing lon → +x and increasing lat → −z, a CCW-in-XZ ring is:
//   (lon_min, lat_max) → (lon_max, lat_max) → (lon_max, lat_min) → (lon_min, lat_min)
// i.e. in XZ terms (x_min,z_min) → (x_max,z_min) → (x_max,z_max) → (x_min,z_max),
// whose shoelace area is positive. We emit the lat/lon ring in that order so the
// projected polygon is a clean 4-vertex CCW rectangle for `classifyEdges`.
//
// PURE + DETERMINISTIC: no DOM / maplibre / THREE import. The two `LatLon` corners
// in → four `LatLon` corners out (or null when the two corners are degenerate —
// same lat OR same lon → zero-area, which the caller must reject before commit).

import type { LatLon } from '../site/boundaryProjection.js';

/**
 * Build an axis-aligned rectangle's four lat/lon corners from two OPPOSITE corners.
 *
 * Corner order is counter-clockwise in scene XZ (see module header), so the
 * projected polygon (`buildBoundaryFromLatLonRing`) is a clean CCW rectangle —
 * regardless of which diagonal the two clicks describe (top-left↔bottom-right or
 * bottom-left↔top-right etc.).
 *
 * @returns the 4 corners, or `null` when the rectangle is degenerate (the two
 *          corners share a latitude OR a longitude → zero area). NEVER throws.
 */
export function rectCornersFromOpposite(a: LatLon, b: LatLon): LatLon[] | null {
    if (
        !Number.isFinite(a.lat) || !Number.isFinite(a.lon) ||
        !Number.isFinite(b.lat) || !Number.isFinite(b.lon)
    ) {
        return null;
    }
    const minLat = Math.min(a.lat, b.lat);
    const maxLat = Math.max(a.lat, b.lat);
    const minLon = Math.min(a.lon, b.lon);
    const maxLon = Math.max(a.lon, b.lon);
    // Degenerate: no spread in one axis → zero-area sliver. Caller rejects.
    if (maxLat - minLat <= 0 || maxLon - minLon <= 0) return null;

    // CCW in scene XZ (see header): (minLon,maxLat),(maxLon,maxLat),(maxLon,minLat),(minLon,minLat).
    return [
        { lat: maxLat, lon: minLon },
        { lat: maxLat, lon: maxLon },
        { lat: minLat, lon: maxLon },
        { lat: minLat, lon: minLon },
    ];
}
