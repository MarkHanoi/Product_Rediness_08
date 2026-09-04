// L-613 — COUNTRY-LEVEL bbox predicates for PARCEL-provider routing.
//
// WHY COUNTRY GRANULARITY (and not the city bboxes the ZONING dispatch routes on)
// ------------------------------------------------------------------------------
// The zoning dispatch (`resolveZoneDisposition`) routes on CITY extents — `isInBarcelona`,
// `isInMadrid`, `isInRiyadh` — because a rule pack answers for a municipality's ordinance.
// A cadastral PARCEL service answers for a whole SOVEREIGN STATE: Spain's Catastro serves
// every Spanish parcel, France's IGN serves every French parcel. So parcel routing is
// national-granularity, and these are the national analogue of the city predicates the zoning
// path uses — the SAME shape (`{ COUNTRY_BBOX } + isInCountry`), one layer coarser.
//
// ⚠ A bbox is a COARSE proximity gate, never an authorisation (same caveat as `barcelonaBbox.ts`).
// It only decides WHICH national cadastre proxy to try first; the proxy's own null-result is the
// real "no parcel here" answer, and the universal footprint fallback covers every miss.
//
// PURE + tiny. No I/O. Reuses the existing country predicate where one already exists
// (`isInDenmark` — Denmark's zoning bbox is already national).

import { isInDenmark, DENMARK_BBOX } from '../providers/denmarkBbox.js';

export { isInDenmark, DENMARK_BBOX };

export interface CountryBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

function within(bbox: CountryBbox, lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

/** Spain: peninsular + Balearic + Canary Islands (the extent Catastro serves). */
export const SPAIN_BBOX: CountryBbox = { minLat: 27.4, maxLat: 43.9, minLon: -18.5, maxLon: 4.4 };
export const isInSpain = (lat: number, lon: number): boolean => within(SPAIN_BBOX, lat, lon);

/**
 * France métropole (the extent the IGN PARCELLAIRE EXPRESS WFS serves; DOM-TOM excluded).
 * ⚠ `maxLon` is 8.3, not the Corsican 9.6: a wider box would swallow Zurich (8.54°E) and route it
 * to the French proxy. Mainland France's eastern border is ~8.23°E, so 8.3 keeps Alsace/Strasbourg
 * in while excluding Switzerland. Corsica (≈9.5°E) therefore routes to the footprint fallback — a
 * conscious coarse-router tradeoff; a polygon gate would be needed to include it without CH bleed.
 */
export const FRANCE_BBOX: CountryBbox = { minLat: 41.3, maxLat: 51.2, minLon: -5.3, maxLon: 8.3 };
export const isInFrance = (lat: number, lon: number): boolean => within(FRANCE_BBOX, lat, lon);

/** Netherlands (European mainland; the extent the PDOK Kadaster WFS serves). */
export const NETHERLANDS_BBOX: CountryBbox = { minLat: 50.7, maxLat: 53.7, minLon: 3.3, maxLon: 7.3 };
export const isInNetherlands = (lat: number, lon: number): boolean => within(NETHERLANDS_BBOX, lat, lon);

/** Norway mainland (Kartverket Matrikkel teig WFS; Svalbard excluded). */
export const NORWAY_BBOX: CountryBbox = { minLat: 57.8, maxLat: 71.4, minLon: 4.4, maxLon: 31.3 };
export const isInNorway = (lat: number, lon: number): boolean => within(NORWAY_BBOX, lat, lon);

/** Germany (whole state — used only for the footprint-fallback note; the OPEN cadastre is NRW-only). */
export const GERMANY_BBOX: CountryBbox = { minLat: 47.2, maxLat: 55.1, minLon: 5.8, maxLon: 15.1 };
export const isInGermany = (lat: number, lon: number): boolean => within(GERMANY_BBOX, lat, lon);

/**
 * North Rhine-Westphalia — the ONE German Land whose ALKIS parcel WFS is open + keyless
 * (`wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht`, live-probed 2026-07-24). Every other Land's
 * ALKIS is per-Land licence-gated, so only this box routes to the German cadastral provider.
 */
export const NRW_BBOX: CountryBbox = { minLat: 50.3, maxLat: 52.6, minLon: 5.8, maxLon: 9.5 };
export const isInNRW = (lat: number, lon: number): boolean => within(NRW_BBOX, lat, lon);

/** Switzerland (cadastral since L-627: federal geo.admin.ch identify → real AV Grundstück — see registry). */
export const SWITZERLAND_BBOX: CountryBbox = { minLat: 45.8, maxLat: 47.9, minLon: 5.8, maxLon: 10.6 };
export const isInSwitzerland = (lat: number, lon: number): boolean => within(SWITZERLAND_BBOX, lat, lon);

/** Saudi Arabia (footprint-fallback: Balady/U-Maps is IP geo-fenced — L-606). */
export const SAUDI_ARABIA_BBOX: CountryBbox = { minLat: 16.3, maxLat: 32.2, minLon: 34.4, maxLon: 55.7 };
export const isInSaudiArabia = (lat: number, lon: number): boolean => within(SAUDI_ARABIA_BBOX, lat, lon);

// ── LANE PARCEL-REACH (2026-09-04) — CZ · IE · AT ────────────────────────────────────────────────
// These three had NO REGISTRY ROW AT ALL, which is strictly worse than an unwired row: with no row,
// `resolveParcelCandidates` either returns NOTHING or hands the point to whichever NEIGHBOUR's
// rectangle covers it. Measured 2026-09-04: Praha resolved to `DE:footprint-fallback` (GERMANY_BBOX
// reaches 15.1°E), Brno / Ostrava / Wien returned no candidate at all, and Dublin resolved to
// `GB-ENG:cadastral` (ENGLAND_BBOX reaches −6.5°W). Each of those ASSERTS THE WRONG COUNTRY.
//
// ⚠ WHY A BBOX PREDICATE AND NOT `claimsNation` — read before "modernising" these.
// CZE and AUT are in `nationalBoundaries.json` as REFUSAL-ONLY NEIGHBOURS, not claimable countries,
// so `claimsNation('CZ')` / `claimsNation('AT')` are FALSE at every point in those countries and a
// claimsNation row would never route — the exact authored-but-unwired trap this lane exists to
// close. Promoting CZE/AUT to claimable is a boundary-set change (neighbour integrity, the
// BOUNDARY-WAVE lane's territory), not a parcel change. Until then these use the bbox form that
// FR/NL/CH/IT/DE already use.
//
// ⚠ WHY THE OVERLAP WITH WIRED NEIGHBOURS IS SAFE, and it is not a coincidence:
// `resolveParcelCandidates` asks the national resolver first and, WHEN A COUNTRY IS CLAIMED, filters
// the candidate pool to that country's rows. DEU / POL / SVK / GRC etc. ARE claimable, so a German,
// Polish or Slovak point drops these rows before either is ever tried. What is left is the refusal
// zones (border bands, and Austria itself for the CZ row), where the upstream's own honest `empty`
// decides — measured working: a Wien click inside CZECHIA_BBOX is not, in fact, inside it (see the
// boxes below), and ČÚZK answers zero features anywhere outside Czechia regardless.

/**
 * Czechia — the extent ČÚZK's INSPIRE `cp:CadastralParcel` WFS serves (keyless, live-probed
 * 2026-09-04 at Praha / Brno / Ostrava). The service's own Abstract states parcels exist wherever a
 * DIGITAL cadastral map does — "to the 2026-08-31 it is 99.50% of the Czech territory" — so the
 * residual half-percent is an honest `empty` → footprint, never a failure.
 */
export const CZECHIA_BBOX: CountryBbox = { minLat: 48.5, maxLat: 51.1, minLon: 12.0, maxLon: 18.9 };
export const isInCzechia = (lat: number, lon: number): boolean => within(CZECHIA_BBOX, lat, lon);

/**
 * Ireland — the island box for Tailte Éireann's keyless Cadastral Parcels FeatureServer
 * (live-probed 2026-09-04 at Dublin / Cork / Galway).
 * ⚠ NORTHERN IRELAND falls inside this box and is NOT served: Land & Property Services NI is a
 * separate, non-keyless register, so a Belfast click is an honest `empty` → footprint.
 * ⚠ COVERAGE IS TITLE-BASED, NOT AN EXHAUSTIVE TESSELLATION (unlike ES/CZ/AT): streets, commonage
 * and unregistered land carry NO polygon at all, so `empty` is FREQUENT and TRUE on any road.
 */
export const IRELAND_BBOX: CountryBbox = { minLat: 51.35, maxLat: 55.45, minLon: -10.6, maxLon: -5.3 };
export const isInIreland = (lat: number, lon: number): boolean => within(IRELAND_BBOX, lat, lon);

/**
 * Austria — the extent BEV's INSPIRE Cadastral Parcels layer serves, reachable ONLY through its WMS
 * `GetFeatureInfo` (all three BEV WFS routes are dead — see the `at` row in euCadastreProxy.js).
 * Live-probed 2026-09-04 at Wien / Salzburg / Innsbruck, rings verified WGS84 and containing the click.
 */
export const AUSTRIA_BBOX: CountryBbox = { minLat: 46.3, maxLat: 49.1, minLon: 9.5, maxLon: 17.2 };
export const isInAustria = (lat: number, lon: number): boolean => within(AUSTRIA_BBOX, lat, lon);
