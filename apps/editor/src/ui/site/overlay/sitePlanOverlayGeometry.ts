// §SITE-PLAN-OVERLAY (core) — pure geometry + calibration math for a georeferenced
// client-plan overlay (PDF/image) on the site map. HEADLESS: no THREE, no DOM, no
// MapLibre import, so every formula below is unit-testable.
//
// WHY THIS EXISTS
// ---------------
// A surveyor's / architect's site plan (a CAD PDF or a scanned survey image) is the
// most truthful boundary the user has. PRYZM lets them lay it over the GIS basemap,
// scale + position + rotate it so it matches the real world, then trace the boundary
// against BOTH the plan AND the satellite/vector basemap (C19 §1.4 — the parcel
// polygon is the legal lot outline). This module owns the math that turns "the user
// dragged/scaled/rotated the plan" + "two points are 12.5 m apart" into a precise,
// real-world-anchored set of corner lat/lons that MapLibre renders as an image source.
//
// COORDINATE MODEL
// ----------------
// The overlay is modelled in a LOCAL METRIC frame about the site origin (lat0,lon0),
// identical to `boundaryProjection.latLonToSceneXZ` so the overlay shares the exact
// frame the parcel boundary is drawn in (C19 §1.3 LTP-ENU, z = −North). We reuse the
// SAME local-equirectangular projection (accurate < 0.1% at parcel scale):
//
//     x (East,  metres)  =  (lon − lon0) · (π/180) · R · cos(lat0)
//     z (−North, metres) = −(lat − lat0) · (π/180) · R   →   north(metres) = −z
//
// The overlay is positioned by its CENTRE (in metres East/North from the site origin),
// a uniform metres-per-source-pixel SCALE, and a clockwise ROTATION (radians). From
// those three the four image corners are derived in metres, then unprojected to lat/lon
// for MapLibre's `image` source (which takes 4 corner [lon,lat] pairs, TL→TR→BR→BL).
//
// NB: P5/P2/P4 untouched — this is L5 pure math, no schema, no THREE, no window.

/** WGS84 equatorial radius (metres) — same constant as boundaryProjection. */
export const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Metres East (x) / North (n) from the site origin. */
export interface EastNorth {
    readonly east: number;
    readonly north: number;
}

/** A point in SOURCE-image pixels (origin = top-left, y-down), the native frame the
 *  PDF/image rasteriser produces. Used by the 2-point calibration. */
export interface PixelPoint {
    readonly x: number;
    readonly y: number;
}

/**
 * The full placement of an overlay on the map. This is the single source of truth the
 * UI mutates (drag → centre, scale tool → metresPerPixel, rotate handle → rotationRad)
 * and the renderer + persistence read. Pure data.
 */
export interface SitePlanOverlayTransform {
    /** Overlay centre, metres East/North from the site origin. */
    readonly centre: EastNorth;
    /** Metres of real world per SOURCE-image pixel. The calibration scale handle. */
    readonly metresPerPixel: number;
    /** Clockwise rotation in radians (0 = plan-north aligned with scene-north). */
    readonly rotationRad: number;
    /** Source raster width in pixels (the rasterised page/image). */
    readonly widthPx: number;
    /** Source raster height in pixels. */
    readonly heightPx: number;
}

// ── projection (shared frame with boundaryProjection) ────────────────────────

/** Project a WGS84 lat/lon to metres East/North about (originLat, originLon). */
export function latLonToEastNorth(p: LatLon, originLat: number, originLon: number): EastNorth {
    const cosLat0 = Math.cos(originLat * DEG2RAD);
    const east = (p.lon - originLon) * DEG2RAD * EARTH_RADIUS_M * cosLat0;
    const north = (p.lat - originLat) * DEG2RAD * EARTH_RADIUS_M;
    return { east, north };
}

/** Inverse of latLonToEastNorth — metres East/North back to WGS84 lat/lon. */
export function eastNorthToLatLon(en: EastNorth, originLat: number, originLon: number): LatLon {
    const cosLat0 = Math.cos(originLat * DEG2RAD) || 1e-12;
    const lat = originLat + (en.north / EARTH_RADIUS_M) * RAD2DEG;
    const lon = originLon + (en.east / (EARTH_RADIUS_M * cosLat0)) * RAD2DEG;
    return { lat, lon };
}

// ── 2-point calibration (the accuracy key) ───────────────────────────────────

/**
 * 2-POINT SCALE CALIBRATION.
 *
 * The user clicks two points on the overlay that correspond to a known real distance
 * (a dimensioned wall, a scale bar, a plot edge) and enters that distance in metres.
 * The two points are captured in SOURCE-image pixels (so the result is independent of
 * the current on-screen zoom). The metres-per-pixel that makes that pixel distance equal
 * the entered real distance is:
 *
 *     metresPerPixel = realDistanceM / pixelDistance
 *
 * This is THE thing that makes the overlay truthful: once calibrated, every metre on the
 * plan is a real metre on the ground, so a traced boundary inherits the plan's accuracy.
 *
 * Returns null (caller shows a toast) when the inputs are degenerate — the two points
 * coincide, or the real distance is non-positive / non-finite — so the UI never produces
 * a 0 or Infinity scale that would collapse or explode the overlay.
 */
export function computeCalibrationScale(
    pixelA: PixelPoint,
    pixelB: PixelPoint,
    realDistanceM: number,
): number | null {
    if (!Number.isFinite(realDistanceM) || realDistanceM <= 0) return null;
    const dx = pixelB.x - pixelA.x;
    const dy = pixelB.y - pixelA.y;
    const pixelDistance = Math.hypot(dx, dy);
    if (!Number.isFinite(pixelDistance) || pixelDistance < 1e-6) return null;
    const metresPerPixel = realDistanceM / pixelDistance;
    if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return null;
    return metresPerPixel;
}

// ── transform compose → map corners ──────────────────────────────────────────

/**
 * Compose an overlay transform into its FOUR corner positions in metres East/North,
 * ordered TL, TR, BR, BL (MapLibre `image` source order). The source image is treated
 * as a `widthPx × heightPx` rectangle whose real-world size is
 * `(widthPx · mpp) × (heightPx · mpp)` metres, centred at `centre`, rotated clockwise
 * by `rotationRad`.
 *
 * Image-Y is DOWN (top-left origin). North is UP. So the image's top edge maps to the
 * +North side: local corner offsets (before rotation) are
 *   TL = (−w/2, +h/2)   TR = (+w/2, +h/2)   BR = (+w/2, −h/2)   BL = (−w/2, −h/2)
 * in (East, North) metres, where w = widthPx·mpp, h = heightPx·mpp.
 *
 * Clockwise rotation by θ (viewed with North up, East right) rotates an (E,N) offset by:
 *   E' = E·cosθ + N·sinθ
 *   N' = −E·sinθ + N·cosθ
 */
export function overlayCornersEastNorth(t: SitePlanOverlayTransform): EastNorth[] {
    const w = t.widthPx * t.metresPerPixel;
    const h = t.heightPx * t.metresPerPixel;
    const hw = w / 2;
    const hh = h / 2;
    const cos = Math.cos(t.rotationRad);
    const sin = Math.sin(t.rotationRad);
    // local offsets (East, North) before rotation, TL→TR→BR→BL
    const local: ReadonlyArray<readonly [number, number]> = [
        [-hw, hh],
        [hw, hh],
        [hw, -hh],
        [-hw, -hh],
    ];
    return local.map(([e, n]) => ({
        east: t.centre.east + (e * cos + n * sin),
        north: t.centre.north + (-e * sin + n * cos),
    }));
}

/**
 * Compose an overlay transform into its four corner lat/lons (TL,TR,BR,BL) about the
 * site origin — the exact array MapLibre's `image` source `coordinates` field wants as
 * `[lon, lat]` pairs (see toMapLibreCoordinates). Returns lat/lon objects; the renderer
 * maps them to `[lon,lat]`.
 */
export function overlayCornerLatLons(
    t: SitePlanOverlayTransform,
    originLat: number,
    originLon: number,
): LatLon[] {
    return overlayCornersEastNorth(t).map((en) => eastNorthToLatLon(en, originLat, originLon));
}

/** MapLibre `image` source wants `[[lon,lat] TL, TR, BR, BL]`. */
export function toMapLibreCoordinates(
    t: SitePlanOverlayTransform,
    originLat: number,
    originLon: number,
): [[number, number], [number, number], [number, number], [number, number]] {
    // overlayCornerLatLons returns exactly 4 corners (TL,TR,BR,BL); MapLibre's image
    // `coordinates` requires a strict 4-tuple, so assert the fixed length.
    const lngLats = overlayCornerLatLons(t, originLat, originLon).map(
        (ll) => [ll.lon, ll.lat] as [number, number],
    );
    return [lngLats[0]!, lngLats[1]!, lngLats[2]!, lngLats[3]!];
}

// ── default placement ────────────────────────────────────────────────────────

/**
 * A sensible first placement when an overlay is freshly uploaded and not yet
 * calibrated: centred on the site origin, sized so its LONGEST side spans
 * `targetSpanM` metres (default 50 m — a typical urban lot), zero rotation. The user
 * then drags/rotates and runs the 2-point calibration to make it exact.
 */
export function defaultOverlayTransform(
    widthPx: number,
    heightPx: number,
    targetSpanM = 50,
): SitePlanOverlayTransform {
    const longestPx = Math.max(1, widthPx, heightPx);
    const metresPerPixel = targetSpanM / longestPx;
    return {
        centre: { east: 0, north: 0 },
        metresPerPixel,
        rotationRad: 0,
        widthPx,
        heightPx,
    };
}

// ── transform mutators (pure — return a new transform) ───────────────────────

/** Move the overlay centre by (dEast, dNorth) metres. */
export function translateOverlay(t: SitePlanOverlayTransform, dEast: number, dNorth: number): SitePlanOverlayTransform {
    return { ...t, centre: { east: t.centre.east + dEast, north: t.centre.north + dNorth } };
}

/** Set an absolute clockwise rotation (radians), normalised to (−π, π]. */
export function setOverlayRotation(t: SitePlanOverlayTransform, rotationRad: number): SitePlanOverlayTransform {
    let r = rotationRad % (2 * Math.PI);
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r <= -Math.PI) r += 2 * Math.PI;
    return { ...t, rotationRad: Number.isFinite(r) ? r : 0 };
}

/**
 * Apply a calibration result (metres-per-pixel) while keeping the overlay CENTRE fixed,
 * so the plan scales about its own middle rather than jumping. Guards a non-positive /
 * non-finite scale to a no-op.
 */
export function applyCalibration(t: SitePlanOverlayTransform, metresPerPixel: number): SitePlanOverlayTransform {
    if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return t;
    return { ...t, metresPerPixel };
}

/** Multiply the current scale by `factor` (a relative zoom of the overlay), centre-fixed. */
export function scaleOverlay(t: SitePlanOverlayTransform, factor: number): SitePlanOverlayTransform {
    if (!Number.isFinite(factor) || factor <= 0) return t;
    return { ...t, metresPerPixel: t.metresPerPixel * factor };
}
