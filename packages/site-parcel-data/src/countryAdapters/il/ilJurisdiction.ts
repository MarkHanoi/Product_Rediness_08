// LANE ME-OPEN — ISRAEL (IL) · the routing predicate + bbox for the parcel-provider registry.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A BBOX PREDICATE (the SA/AU idiom), NOT `claimsNation` (the EE/LT/PL idiom)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The five L-12871 rows route on `claimsNation(cc)` because their rectangles overlap each other's
// SOVEREIGN soil and only boundary geometry can separate them. That idiom is UNAVAILABLE to Israel
// and would be WRONG here: `nationalJurisdictionResolver` bundles polygons for 16 countries + 16
// un-modelled neighbours, and Israel is in NEITHER set. `claimsNation('IL')` can therefore never be
// true — it would make this row dead code. So IL routes on a rectangle, exactly like SA
// (`isInSaudiArabia`) and the AU states, and the service's own empty answer is the real "no parcel
// here".
//
// THE OVERLAP THAT EXISTS — MEASURED, NOT ASSUMED (and why it is already safe)
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ISRAEL_BBOX's southern half sits INSIDE SAUDI_ARABIA_BBOX (SA box = 16.3–32.2 N, 34.4–55.7 E), so
// Tel Aviv (32.08 N), Jerusalem (31.77 N) and Eilat (29.56 N) are inside BOTH rectangles. That does
// NOT misroute, and the reason is the national resolver, not luck:
//   • For any Israeli point, `resolveNationalJurisdiction` pre-filters SAU (its box matches) but the
//     point is NOT inside the Saudi POLYGON and the nearest Saudi boundary is hundreds of km away
//     (Jordan/Egypt between), so it returns REFUSE `outside-every-candidate-polygon` — measured
//     2026-09-02 for Tel Aviv, Jerusalem AND Eilat (all `cands=[SAU]`). On that refusal the registry
//     keeps the full matched set, so both the IL row and the SA row survive; ISRAEL_BBOX is far
//     smaller than SAUDI_ARABIA_BBOX, so IL wins on specificity and is tried first, with the SA
//     footprint as the honest fall-through. A real Saudi point in the overlap band (e.g. Haql on the
//     Gulf of Aqaba) IS inside the Saudi polygon, so the resolver CLAIMS SAU and the claim-filter
//     drops the IL row entirely — the overlap is decided by geometry, never by which rectangle is
//     smaller.
//   • No other registered box reaches Israel (every European box is west of ~31°E at these
//     latitudes; the US boxes are Western-hemisphere), so IL never collides with anything but SA.
//
// This is the SAME "a refusal is not a dead click" path the AU lane documents; no change to
// `nationalJurisdictionResolver` is needed or made (adding an ISR prefilter without an ISR polygon
// would be inert — the resolver guards prefilters by `set.countries[iso3]`).
//
// PURE — data + point-in-rectangle. No I/O. Never throws.

/** A WGS84 routing rectangle (mirrors REGION_BBOX's shape — the specificity metric). */
export interface IlBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Israel — a coarse mainland rectangle (Metula north ≈ 33.28 N; Eilat south ≈ 29.49 N; the
 * Mediterranean coast west ≈ 34.27 E; the Dead Sea / Jordan-valley east ≈ 35.90 E). A router, not a
 * boundary and NOT a sovereignty claim — the govmap PARCEL_ALL service's own answer decides whether
 * a parcel exists at the point. Deliberately excludes the offshore Mediterranean; a sea click
 * self-corrects to the universal footprint.
 */
export const ISRAEL_BBOX: IlBbox = { minLat: 29.45, maxLat: 33.35, minLon: 34.25, maxLon: 35.92 };

/** True when a WGS84 point should route to the Israeli national cadastre. Pure; never throws. */
export function isInIsrael(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= ISRAEL_BBOX.minLat &&
        lat <= ISRAEL_BBOX.maxLat &&
        lon >= ISRAEL_BBOX.minLon &&
        lon <= ISRAEL_BBOX.maxLon
    );
}
