// LANE ME-OPEN — QATAR (QA) · the routing predicate + bbox for the parcel-provider registry.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A BBOX PREDICATE (the SA/AU idiom), NOT `claimsNation`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Qatar has no polygon in `nationalJurisdictionResolver`'s 16-country boundary set and is not one of
// its un-modelled neighbours, so `claimsNation('QA')` can never be true — it would make this row dead
// code. QA therefore routes on a rectangle, like SA and the AU states, with the ArcGIS service's own
// empty answer as the real "no plot here".
//
// THE OVERLAP THAT EXISTS — MEASURED, AND WHY IT IS SAFE
// ───────────────────────────────────────────────────────────────────────────────────────────────
// QATAR_BBOX sits ENTIRELY inside SAUDI_ARABIA_BBOX (SA box = 16.3–32.2 N, 34.4–55.7 E; the Qatar
// peninsula is at ~24.4–26.2 N, 50.6–51.7 E). Doha is therefore inside BOTH rectangles, exactly the
// Portugal-inside-Spain / Brussels-inside-Flanders situation, and it is resolved the same way:
//   • `resolveNationalJurisdiction(Doha)` pre-filters SAU (its box matches) but Doha is NOT inside
//     the Saudi POLYGON (Qatar is a separate country) and the nearest Saudi boundary is ~80 km away,
//     so it returns REFUSE `outside-every-candidate-polygon` (measured 2026-09-02, `cands=[SAU]`). On
//     that refusal the registry keeps BOTH matched rows; QATAR_BBOX (≈1.9 deg²) is far smaller than
//     SAUDI_ARABIA_BBOX (≈340 deg²), so QA wins on specificity and its keyless cadastre is tried
//     first, with the SA footprint as the honest fall-through if the plot query ever misses.
//   • A genuine Saudi point never falls inside QATAR_BBOX (the peninsula box does not reach Saudi
//     soil), so QA cannot claim Saudi ground even before the national filter.
//
// No change to `nationalJurisdictionResolver` is needed or made — "a refusal is not a dead click".
//
// PURE — data + point-in-rectangle. No I/O. Never throws.

/** A WGS84 routing rectangle (mirrors REGION_BBOX's shape — the specificity metric). */
export interface QaBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Qatar — a coarse peninsula rectangle (Ras Abrouq / NW ≈ 51.0 E, Al Ruwais / N tip ≈ 26.15 N, the
 * SE coast ≈ 51.64 E, the Saudi land border / S ≈ 24.48 N; Halul Island included). A router, not a
 * boundary and NOT a sovereignty claim — the CadastrePlots service's own answer decides whether a
 * plot exists at the point.
 */
export const QATAR_BBOX: QaBbox = { minLat: 24.45, maxLat: 26.2, minLon: 50.6, maxLon: 51.7 };

/** True when a WGS84 point should route to the Qatari national cadastre. Pure; never throws. */
export function isInQatar(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= QATAR_BBOX.minLat &&
        lat <= QATAR_BBOX.maxLat &&
        lon >= QATAR_BBOX.minLon &&
        lon <= QATAR_BBOX.maxLon
    );
}
