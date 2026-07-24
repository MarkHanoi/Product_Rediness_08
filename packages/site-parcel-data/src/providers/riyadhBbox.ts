// C58 §1.5 / C60 §3 / L-606 — the Riyadh (Saudi Arabia) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-city-bbox test used to route a plot drawn in
// Riyadh to the MOMRAH national residential FOOTPRINT pack (`SA_RIYADH_DEMO_PACK`,
// setbacks resolved per-parcel from the user-supplied street width + class) vs the
// estimated default (C58 §1.5 — jurisdiction selection lives in adapters/data,
// never in the engine). Mirrors `isInBarcelona`/`isInDenmark`: a loose gate that
// short-circuits a plot outside the city before any resolve.
//
// ⚠ This is a proximity gate, NOT a claim of jurisdiction (C60 §3). It never
// authorises a number on its own — the plot class (user dropdown) + the fronting
// street width (user-supplied) do that, via `saRiyadhResolvedPack`. Riyadh centre
// ≈ 24.71 N, 46.68 E; the box is deliberately generous (the whole Amana of Riyadh
// and its urban surrounds), because the real applicability decision is downstream.

/** Loose bounding box for the city of Riyadh and its urban surrounds. */
export const RIYADH_BBOX = {
    minLat: 24.4,
    maxLat: 25.1,
    minLon: 46.4,
    maxLon: 47.1,
} as const;

/** True when a WGS84 point falls within the loose Riyadh bounding box. */
export function isInRiyadh(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= RIYADH_BBOX.minLat &&
        lat <= RIYADH_BBOX.maxLat &&
        lon >= RIYADH_BBOX.minLon &&
        lon <= RIYADH_BBOX.maxLon
    );
}
