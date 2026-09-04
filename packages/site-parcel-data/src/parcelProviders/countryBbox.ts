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

// ── LANE PARCEL-REACH (2026-09-04) — the 14 OTHER German Länder ─────────────────────────────────
// ⚠ THE `NRW_BBOX` COMMENT ABOVE IS NOW WRONG WHERE IT SAYS "every other Land's ALKIS is per-Land
// licence-gated". That was measured false on 2026-09-04: FOURTEEN of the remaining fifteen Länder
// serve a KEYLESS parcel WFS (nine INSPIRE `cp:CadastralParcel`, three adv `ave:Flurstueck` in the
// exact DE-NRW schema, Bremen's `app:` twin, and Berlin as GeoJSON), all live-probed and all
// resolving a real Flurstück at their capital. The endpoint knowledge lives with the proxy legs in
// server/jurisdiction/euCadastreProxy.js; these are only the routing rectangles.
//
// ⛔ BAYERN IS THE ONE GENUINE GAP and is deliberately absent: its INSPIRE ALKIS WFS answers
// `401 Unauthorized · WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"`, and Bayern's whole
// open-data catalogue was ENUMERATED rather than guessed (35 products) — its only ALKIS entries are
// raster, the Parzellarkarte declaring `"abgabe_datenformate":["PNG","JPEG"]` and "keine
// Flurstücksnummern", with every WMS layer `queryable="0"` and no GetFeatureInfo advertised at all.
// A Bavarian click therefore falls to the whole-Germany footprint row, honestly labelled.
export const DE_LAND_BBOX: Readonly<Record<string, CountryBbox>> = {
    'DE-BW': { minLat: 47.5, maxLat: 49.8, minLon: 7.5, maxLon: 10.5 },
    'DE-HE': { minLat: 49.3, maxLat: 51.7, minLon: 7.7, maxLon: 10.3 },
    'DE-NI': { minLat: 51.2, maxLat: 54.0, minLon: 6.6, maxLon: 11.7 },
    'DE-SN': { minLat: 50.1, maxLat: 51.7, minLon: 11.8, maxLon: 15.1 },
    'DE-SH': { minLat: 53.3, maxLat: 55.1, minLon: 7.8, maxLon: 11.4 },
    'DE-BB': { minLat: 51.3, maxLat: 53.6, minLon: 11.2, maxLon: 14.8 },
    'DE-ST': { minLat: 50.9, maxLat: 53.1, minLon: 10.5, maxLon: 13.2 },
    'DE-MV': { minLat: 53.1, maxLat: 54.8, minLon: 10.5, maxLon: 14.5 },
    'DE-SL': { minLat: 49.1, maxLat: 49.7, minLon: 6.3, maxLon: 7.5 },
    'DE-HH': { minLat: 53.3, maxLat: 54.0, minLon: 8.4, maxLon: 10.4 },
    'DE-RP': { minLat: 48.9, maxLat: 51.0, minLon: 6.0, maxLon: 8.6 },
    'DE-TH': { minLat: 50.2, maxLat: 51.7, minLon: 9.8, maxLon: 12.7 },
    'DE-HB': { minLat: 53.0, maxLat: 53.7, minLon: 8.4, maxLon: 9.0 },
    // ⚠ TIGHTENED to Berlin's REAL extent after a measured collision: at minLon 13.0 this box
    //   swallowed POTSDAM (52.3906, 13.0645) — which is Brandenburg — and, being the SMALLER box,
    //   BEAT Brandenburg on specificity. Berlin's western edge is ~13.088E; a city-state box must
    //   be tight precisely BECAUSE its smallness is what makes it win.
    'DE-BE': { minLat: 52.33, maxLat: 52.68, minLon: 13.088, maxLon: 13.77 },
};

/**
 * A `contains` predicate for one German Land. The boxes OVERLAP at every internal border and at the
 * city-states (Berlin sits inside Brandenburg's box; Hamburg and Bremen inside Niedersachsen's) —
 * that is intended and is resolved by SPECIFICITY, not by order: `parcelJurisdictionSpecificity`
 * ranks the smallest enclosing box first, so Berlin (0.32 deg²) wins over Brandenburg (8.28 deg²)
 * and Bremen (0.42) over Niedersachsen (14.28). Where a genuine border band is ambiguous the loser's
 * WFS simply answers zero features — a self-correcting miss, never a fabricated ring.
 */
export const isInDeLand = (code: string) => (lat: number, lon: number): boolean => {
    const b = DE_LAND_BBOX[code];
    if (!b || !within(b, lat, lon)) return false;
    // ⚠ NO PER-LAND SUBTRACTION HERE, AND THAT IS A DELIBERATE REVERSAL — read before adding one.
    // Germany's sixteen Länder INTERLOCK; no set of rectangles separates them. Measured over 41
    // German cities on 2026-09-04, eight rectangles claim a neighbour's city (Köln falls in RP's
    // box, Wiesbaden in RP's, Leipzig in TH's, Halle in TH's, Osnabrück in NW's, Braunschweig in
    // ST's, Potsdam in ST's, and Berlin's original box swallowed Potsdam outright).
    // A subtraction was tried and REVERTED because it made things worse in the direction that
    // actually matters: `DE-RP` minus `NRW_BBOX` restored Köln and Bonn, and in the same stroke
    // took KOBLENZ (50.3569, 7.5890) out of the candidate list entirely — NRW_BBOX reaches down to
    // 50.3°N — so a Rhineland-Palatinate city that HAD a working cadastre fell to the OSM footprint.
    // Trading a wrong LABEL for a lost PARCEL is the wrong trade.
    // The overlaps are harmless where it counts because `resolveParcelWithFallback` WALKS every
    // candidate and returns the jurisdiction that ACTUALLY ANSWERED: proven live 2026-09-04 —
    // Wiesbaden→DE-HE, Osnabrück→DE-NI, Braunschweig→DE-NI, Leipzig→DE-SN, Potsdam→DE-BB,
    // Halle→DE-ST, each answered by the CORRECT Land after the mis-ranked neighbour returned zero
    // features. What stays coarse is the single-verdict LABEL from `resolveParcelJurisdiction`.
    //
    // ⛔ CORRECTED 2026-09-04 (round 4). This paragraph used to end "within Germany that label is
    // always a WRONG LAND, never a wrong SOVEREIGN register — a materially smaller error than the
    // Praha→Germany / Dublin→England class this lane removed". **That is measurably false, and the
    // counter-example is inside this very table**: `DE-BB` reaches to 14.8°E and therefore covers
    // SŁUBICE (52.3481, 14.5606), which is POLAND. A Polish click is offered ALKIS Brandenburg and
    // LABELLED Brandenburg. It is tolerable ONLY because the national resolver has REFUSED at that
    // point — it asserts no nationality there, and its refusal text prescribes exactly this: "try
    // each candidate's cadastre and let the service's own answer decide"; Brandenburg answers zero
    // features on Polish soil and the walk falls through. It would NOT be tolerable as a claim.
    //
    // ⛔ AND THE "REAL FIX" THIS PARAGRAPH NAMED IS ALSO FALSIFIED for the national case. A polygon
    // gate on the national outline cannot help, because ne_10m is wrong on BOTH sides of this border
    // in OPPOSITE directions (measured 2026-09-04): it puts POLISH Słubice INSIDE Germany (POL
    // boundary 216 m away) and GERMAN Görlitz INSIDE Poland (DEU boundary 355 m away). Gating on
    // containment would KEEP the German cadastre at Słubice and TAKE IT AWAY from Görlitz — strictly
    // worse, in both directions at once. The fix that would work is the one the refusal already asks
    // for: let the `claimsNation` rows (here PL) participate as FALL-THROUGH candidates on a
    // REFUSAL, so GUGiK ULDK is tried at Słubice. Recorded, not actioned — a routing-doctrine change
    // with a wide blast radius; pinned as an explicit gap in
    // `__tests__/parcelRegistryNationalWiring.test.ts` §4 rather than left to memory.
    // A LAND-outline polygon gate is still the right refinement for the INTRA-German coarseness.
    return true;
};
