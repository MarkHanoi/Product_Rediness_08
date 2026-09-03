// LANE ME-GULF — GULF (GCC) · the routing PRE-FILTER bboxes + predicates for the national
// jurisdiction resolver.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THESE ARE — AND WHAT THEY ARE NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Each `*_BBOX` below is a COARSE candidate PRE-FILTER for `jurisdiction/nationalJurisdictionResolver.ts`
// — the national analogue of `ee/eeJurisdiction.ts`'s `ESTONIA_BBOX` / `isInEstonia`. It only NARROWS
// the candidate set; the resolver then decides on real ne_10m boundary geometry + the measured 1500 m
// tolerance, naming its basis or REFUSING. ⛔ Do NOT route a click on `isIn*` alone — that is the
// smallest-box defect L-12871 removed (a rectangle is not a border).
//
// ⚠ THE COLLISION THAT MOTIVATES THIS FILE. `SAUDI_ARABIA_BBOX` (countryBbox.ts:74,
// lon 34.4..55.7 / lat 16.3..32.2) COVERS Dubai (25.20,55.27), Abu Dhabi (24.45,54.37), Kuwait City
// (29.37,47.98) and Bahrain (26.22,50.58). Before this lane, `SAU` was the ONLY Gulf country modelled
// in the resolver, so a click in the UAE / Kuwait / Bahrain pre-filtered to Saudi alone and — with no
// AE/KW/BH/OM polygon to lose to — could be nearest-polygon-annexed to Saudi (the Vaduz→CHE class of
// mis-claim L-12887 named), or fall to the Saudi `footprint-fallback` row and be LABELLED Saudi. Adding
// ARE/KWT/BHR/OMN as claimable countries (nationalBoundaries.json, same pinned ne_10m source, sha256
// 239eec57…) makes each a RIVAL to Saudi at the border and the CLAIM at its interior. These bboxes are
// the pre-filters that put those four countries into contention.
//
// All four are DECLARED DEFERRALS at the parcel axis (no keyless cadastre reachable — see
// gulfDeferrals.ts for the per-jurisdiction gate transcript + reviewBy). The claim means "this point
// is in the UAE / Kuwait / …"; the registry row's `kind:'footprint-fallback'` means "no cadastre is
// wired yet" — exactly the LU/SE precedent for a modelled-but-deferred country.

/** A coarse WGS84 routing rectangle. Shape shared with `ee/eeJurisdiction.ts`'s local `Bbox`. */
export interface GulfBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

function within(b: GulfBbox, lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

/**
 * United Arab Emirates (ARE → regionCode `AE`). Western Abu Dhabi/Ghuwaifat at the Saudi border
 * ≈ 51.0°E; Fujairah/Kalba on the Gulf of Oman ≈ 56.4°E; Liwa/Saudi border south ≈ 22.6°N; Ras
 * al-Khaimah north ≈ 26.1°N. Emirate competency: parcels are DM (Dubai) / DMT (Abu Dhabi) etc.,
 * both probed and DEFERRED (gulfDeferrals.ts).
 */
export const UAE_BBOX: GulfBbox = { minLat: 22.5, maxLat: 26.15, minLon: 51.0, maxLon: 56.5 };
export const isInUAE = (lat: number, lon: number): boolean => within(UAE_BBOX, lat, lon);

/**
 * Kuwait (KWT → regionCode `KW`). Bubiyan/N border ≈ 30.1°N; SW/Saudi neutral-zone edge ≈ 28.5°N;
 * Gulf coast ≈ 48.5°E; W desert ≈ 46.5°E. PACI owns the parcel/address layer — TCP-unreachable
 * from our vantage (gulfDeferrals.ts).
 */
export const KUWAIT_BBOX: GulfBbox = { minLat: 28.4, maxLat: 30.15, minLon: 46.5, maxLon: 48.5 };
export const isInKuwait = (lat: number, lon: number): boolean => within(KUWAIT_BBOX, lat, lon);

/**
 * Bahrain (BHR → regionCode `BH`). Archipelago lon ≈ 50.3..50.85°E, lat ≈ 25.5..26.4°N — an island
 * state ≈ 25 km off the Saudi coast (beyond the 2000 m coastal tolerance, so a Bahraini point is a
 * clean CLAIM, not a Saudi coastal-rescue annexation). SLRB parcels are eKey-gated (gulfDeferrals.ts).
 */
export const BAHRAIN_BBOX: GulfBbox = { minLat: 25.5, maxLat: 26.4, minLon: 50.3, maxLon: 50.9 };
export const isInBahrain = (lat: number, lon: number): boolean => within(BAHRAIN_BBOX, lat, lon);

/**
 * Oman (OMN → regionCode `OM`). Includes the Musandam exclave (≈ 26.4°N, 56.25°E, separated from the
 * mainland by the UAE) — the bbox spans lat ≈ 16.4..26.5°N (Dhofar/Yemen border to Musandam) and
 * lon ≈ 51.9..60.0°E (Empty-Quarter/Saudi border to Ras al-Hadd). Overlaps UAE_BBOX around the shared
 * border + Musandam by design: the pre-filter is inclusive, the polygon geometry decides. NSDI hosts
 * drop foreign TCP; the krooki authority WAF-403s (gulfDeferrals.ts).
 */
export const OMAN_BBOX: GulfBbox = { minLat: 16.4, maxLat: 26.5, minLon: 51.9, maxLon: 60.0 };
export const isInOman = (lat: number, lon: number): boolean => within(OMAN_BBOX, lat, lon);
