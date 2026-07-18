// C58 §1.5 / L-399a — the Denmark jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-national-bbox test used to pick the DK zoning
// provider vs the estimated default (C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine). Loosely bounds mainland Denmark + Bornholm
// so a plot outside Denmark short-circuits without a pointless proxy round-trip
// (mirrors the Spanish-bbox guard in `server/parcelZoningProxy.js`).

/** Loose national bounding box for Denmark (incl. Bornholm at ~lon 15.2). */
export const DENMARK_BBOX = {
    minLat: 54.4,
    maxLat: 57.9,
    minLon: 7.7,
    maxLon: 15.3,
} as const;

/** True when a WGS84 point falls within the loose Denmark bounding box. */
export function isInDenmark(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= DENMARK_BBOX.minLat &&
        lat <= DENMARK_BBOX.maxLat &&
        lon >= DENMARK_BBOX.minLon &&
        lon <= DENMARK_BBOX.maxLon
    );
}
