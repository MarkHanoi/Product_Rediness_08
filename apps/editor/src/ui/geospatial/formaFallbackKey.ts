// §FORMA-FALLBACK-KEY-IS-LOCAL (L-12920, founder 2026-09-05 at Cremorne Point and Melbourne) — the
// Forma study light when the REAL sun is below the horizon.
//
// THE DEFECT. `applyFormaSunLight` transforms the real-sun direction from the site's ENU frame into
// ECEF, but its night-time fallback returned a FIXED ECEF vector, (-0.55, -0.7, -0.45), described as
// an "ECEF-agnostic local approximation". A fixed ECEF direction is only local somewhere: light
// travelling along that vector lights the hemisphere whose normals oppose it — centred near
// lon 52° E / lat 27° N. Spain and France sit within ~60° of that and read fine; Sydney and
// Melbourne sit ~100° away, so at night (the founder's 23:00 test) the terrain, the landuse drape
// and every un-shadowed surface received grazing-to-zero light and the 3D Site read as a black
// ground with "no terrain". The real-sun branch never had the problem — it is the fallback that
// forgot the frame.
//
// THE RULE. The fallback key is a LOCAL direction — a warm ~10:00 key from the north-east, above
// the horizon — and it is expressed in the site's East-North-Up frame, then rotated into ECEF at
// the site, exactly as the real sun is. Pure: no Cesium, so the geometry is unit-testable. The
// ENU→ECEF rotation is the standard one (Cesium's `eastNorthUpToFixedFrame` rotation block).

/** Local ENU direction light TRAVELS for the fallback key: from the north-east, ~27° above the
 *  horizon (asin 0.451), towards the ground. (to-sun = (+0.55 E, +0.70 N, +0.45 U) normalised;
 *  light = −to-sun — the same numbers the legacy fixed vector used, now given a frame.) */
export const FORMA_FALLBACK_KEY_ENU: readonly [number, number, number] = (() => {
    const toSun = [0.55, 0.7, 0.45];
    const n = Math.hypot(toSun[0]!, toSun[1]!, toSun[2]!);
    return [-toSun[0]! / n, -toSun[1]! / n, -toSun[2]! / n];
})();

/** Rotate a local ENU vector at (lat, lon) into ECEF (WGS-84 axes; vector transform, no translation). */
export function enuVectorToEcef(
    east: number, north: number, up: number, latDeg: number, lonDeg: number,
): [number, number, number] {
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    const sLat = Math.sin(lat), cLat = Math.cos(lat), sLon = Math.sin(lon), cLon = Math.cos(lon);
    // Columns of the ENU→ECEF rotation: e = (-sLon, cLon, 0), n = (-sLat cLon, -sLat sLon, cLat),
    // u = (cLat cLon, cLat sLon, sLat).
    return [
        -sLon * east + -sLat * cLon * north + cLat * cLon * up,
        cLon * east + -sLat * sLon * north + cLat * sLon * up,
        cLat * north + sLat * up,
    ];
}

/** The unit "up" (ellipsoid normal) at (lat, lon) in ECEF. */
export function upVectorEcef(latDeg: number, lonDeg: number): [number, number, number] {
    return enuVectorToEcef(0, 0, 1, latDeg, lonDeg);
}

/**
 * The fallback key direction in ECEF for a site at (lat, lon): the local NE key rotated into world
 * axes, unit length. Light travels along the returned vector (Cesium `DirectionalLight.direction`).
 * Returns the legacy fixed vector only when no site is known (`null`), which is the only case where
 * "local" has no meaning.
 */
export function formaFallbackKeyDirectionEcef(site: { lat: number; lon: number } | null): [number, number, number] {
    if (!site || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) {
        const v = [-0.55, -0.7, -0.45];
        const n = Math.hypot(v[0]!, v[1]!, v[2]!);
        return [v[0]! / n, v[1]! / n, v[2]! / n];
    }
    const [e, n, u] = FORMA_FALLBACK_KEY_ENU;
    const [x, y, z] = enuVectorToEcef(e, n, u, site.lat, site.lon);
    const len = Math.hypot(x, y, z) || 1;
    return [x / len, y / len, z / len];
}

/** cos of the angle between the surface normal and the direction TO the light: > 0 means the
 *  ground at the site is lit; the fallback key gives sin(40°) ≈ 0.64 everywhere by construction. */
export function groundIlluminationAt(site: { lat: number; lon: number }, lightDirEcef: readonly [number, number, number]): number {
    const [ux, uy, uz] = upVectorEcef(site.lat, site.lon);
    return -(ux * lightDirEcef[0] + uy * lightDirEcef[1] + uz * lightDirEcef[2]);
}
