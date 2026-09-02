// §PIP-EVEN-ODD — the ONE even-odd point-in-polygon test in this package.
//
// ⚠ EXTRACTED, NOT MINTED (L-12871). This is the body that lived inside
// `providers/resolveElSauzalZone.ts` since the Canarias SIPU lane, moved here UNCHANGED so a
// second caller (`jurisdiction/nationalJurisdictionResolver.ts`) can reuse it instead of
// re-declaring it. `resolveElSauzalZone.ts` now imports and RE-EXPORTS `pointInRingsEvenOdd`
// from this module, so its public API is unchanged and `resolveTeldeZone.ts` — which imports the
// symbol FROM `resolveElSauzalZone.js` — keeps working untouched.
//
// WHY THE MOVE INSTEAD OF AN IMPORT FROM `resolveElSauzalZone.js`: that module statically bundles
// `./data/elSauzalZuso.json` (1.0 MB) at the top level, so importing it purely for a 12-line ray
// cast would drag the whole El Sauzal zoning extract into every consumer. Extraction keeps the
// single implementation AND keeps the payload where it belongs.
//
// ⭐ THE TEST IS CRS-AGNOSTIC. It is planar ray casting over `[x, y]` pairs and carries no opinion
// about what the axes mean — El Sauzal passes EPSG:32628 metres, the jurisdiction resolver passes
// WGS84 `[lon, lat]` degrees. Both are correct uses; the function only requires that the ring
// coordinates and the query point are in the SAME frame. It is NOT a metric test: do not read a
// "distance" out of it (the jurisdiction resolver measures margins separately, in metres).
//
// PURE. No I/O, no clock, no RNG. Never throws.

/** A planar point in whatever 2-D frame the caller's rings are expressed in. */
export interface PlanarPoint {
    readonly x: number;
    readonly y: number;
}

/** Standard even-odd ray-casting test: is `[px,py]` inside the single ring `ring`? */
export function pointInRingEvenOdd(
    px: number,
    py: number,
    ring: ReadonlyArray<readonly [number, number]>,
): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i]![0];
        const yi = ring[i]![1];
        const xj = ring[j]![0];
        const yj = ring[j]![1];
        const crosses = yi > py !== yj > py;
        if (!crosses) continue;
        const xIntersect = ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        if (px < xIntersect) inside = !inside;
    }
    return inside;
}

/**
 * Point-in-polygon-with-holes: XOR the per-ring even-odd result across every ring in the record.
 * Correct regardless of each ring's winding direction (shell CW/hole CCW is an ESRI convention,
 * not a requirement this test relies on).
 */
export function pointInRingsEvenOdd(
    point: PlanarPoint,
    rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): boolean {
    let inside = false;
    for (const ring of rings) {
        if (ring.length < 3) continue;
        if (pointInRingEvenOdd(point.x, point.y, ring)) inside = !inside;
    }
    return inside;
}
