// LANE ME-OPEN — TURKEY (TR) · the routing predicate + bbox for the parcel-provider registry.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A BBOX PREDICATE (the SA/AU idiom), NOT `claimsNation`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Turkey has no polygon in `nationalJurisdictionResolver`'s 16-country boundary set and is not one of
// its un-modelled neighbours, so `claimsNation('TR')` can never be true — it would make this row dead
// code. TR routes on a rectangle, like SA and the AU states, with the TKGM service's own semantic
// 404 ("Parsel Bulunamadı") as the real "no parcel here".
//
// NO OVERLAP WITH ANY REGISTERED BOX — MEASURED
// ───────────────────────────────────────────────────────────────────────────────────────────────
// Turkey sits at ~35.8–42.2 N, 25.6–44.9 E. SAUDI_ARABIA_BBOX tops out at 32.2 N (below Turkey), and
// every European/US routing box is west of ~31°E at these latitudes or in the Western hemisphere.
// `resolveNationalJurisdiction` therefore returns `no-national-candidate` for every Turkish point
// (measured 2026-09-02 for Istanbul AND Ankara: `cands=[]`), and on that refusal the registry keeps
// the full matched set — so this bbox row routes normally with no change to the national resolver and
// no risk of colliding with a neighbour's cadastre.
//
// PURE — data + point-in-rectangle. No I/O. Never throws.

/** A WGS84 routing rectangle (mirrors REGION_BBOX's shape — the specificity metric). */
export interface TrBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Turkey — a coarse rectangle spanning Anatolia + European Thrace (the Aegean W ≈ 25.7 E; the Black
 * Sea coast N ≈ 42.1 N; the Iranian/Iraqi border E ≈ 44.8 E; the Mediterranean / Syrian border S ≈
 * 35.8 N). A router, not a boundary and NOT a sovereignty claim — TKGM's own 404 decides whether a
 * parcel exists at the point.
 */
export const TURKEY_BBOX: TrBbox = { minLat: 35.8, maxLat: 42.2, minLon: 25.6, maxLon: 44.9 };

/** True when a WGS84 point should route to the Turkish national cadastre. Pure; never throws. */
export function isInTurkey(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= TURKEY_BBOX.minLat &&
        lat <= TURKEY_BBOX.maxLat &&
        lon >= TURKEY_BBOX.minLon &&
        lon <= TURKEY_BBOX.maxLon
    );
}
