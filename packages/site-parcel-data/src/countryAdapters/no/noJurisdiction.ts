// E7-NO — NORWAY (NO) · the routing predicate + bbox.
//
// ⚠ THIS FILE DELIBERATELY MINTS NOTHING. It RE-EXPORTS `NORWAY_BBOX` / `isInNorway` from
// `parcelProviders/countryBbox.ts`, which has carried both since L-613 and is the file the
// parcel-provider router actually reads.
//
// WHY, MEASURED: the E7 family-extraction verdict (§7, "recorded, NOT actioned") counted
// `eeJurisdiction.ts`, `ltJurisdiction.ts` and `plJurisdiction.ts` re-declaring
// `countryBbox.ts`'s `CountryBbox` + `within()` byte-for-byte as recurrences THREE, FOUR and
// FIVE of a drift already logged twice (`agenziaEntrateParcelProvider.ts:595`,
// `dgtParcelProvider.ts:67`), and named `countryBbox.ts` as the correct destination. Norway is
// not in EE/LT/PL's position: it is ALREADY REGISTERED — `parcelProviders/registry.ts:349`
// carries the live `geonorge-no` row keyed on `isInNorway`. Copying the box here would make
// recurrence SIX **and** put two spellings of a live router predicate in one package. So the
// §6-A convention ("`interface Bbox` + `<COUNTRY>_BBOX` + `isIn<Country>`") is satisfied by
// RESOLUTION, exactly as `ltSourceRefs.ts` satisfies the sources convention by resolving
// `sourceRegistry/lt.ts` instead of re-minting rows.
//
// ── DATED OVERLAP AUDIT (§6-A requirement; measured 2026-09-01) ───────────────────────────
// `NORWAY_BBOX` = { 57.8..71.4 N, 4.4..31.3 E } (countryBbox.ts:54).
//   • FINLAND_BBOX sits ENTIRELY INSIDE it — `registry.ts:270` already documents this and
//     orders FI BEFORE NO for exactly that reason. UNCHANGED by this lane.
//   • SWEDEN is unregistered; its whole territory lies inside NORWAY_BBOX. A Stockholm point
//     routes to the Norwegian proxy today. Pre-existing, NOT introduced here, and it belongs
//     to the L-12871 precedence work, not to an adapter lane.
//   • DENMARK_BBOX's north edge (~57.8) touches NORWAY_BBOX's south edge at a line.
//   • ⛔ THE BOX IS WIDER THAN THE SERVICE. Kartverket's own WFS GetCapabilities declares
//     `ows:WGS84BoundingBox` **5.114669 58.024832 → 23.692099 70.665014** for every one of
//     its 7 feature types (probed 2026-09-01, transcript 01). So the registered box claims
//     land the cadastre does not serve: 57.8–58.02 °N, 4.4–5.11 °E, 23.69–31.3 °E and
//     70.67–71.4 °N are all OUTSIDE the service's declared extent — and SVALBARD (74–81 °N)
//     is outside BOTH. `NO_MATRIKKEL_SERVICE_BBOX` below carries the SERVICE's own numbers so
//     a caller can tell "outside Norway" from "inside Norway, outside the served extent"
//     WITHOUT either being silently read as "no parcel here" (§CONTEXT-DATA-HONESTY).
//     The registered box is NOT narrowed here — `countryBbox.ts` is a file this lane may not
//     edit (§6-H), and narrowing a live router predicate is a precedence decision, not an
//     adapter one. The proposal is queued in `impl/barrel-additions-no.txt`.

export type { CountryBbox as NoBbox } from '../../parcelProviders/countryBbox.js';
export { NORWAY_BBOX, isInNorway } from '../../parcelProviders/countryBbox.js';

import { NORWAY_BBOX } from '../../parcelProviders/countryBbox.js';

/**
 * The extent Kartverket's Matrikkelen WFS DECLARES it serves, verbatim from its own
 * `ows:WGS84BoundingBox` (GetCapabilities probed live 2026-09-01; identical on all 7 feature
 * types). Mainland + coastal islands. **Svalbard and Jan Mayen are outside it** — Svalbard
 * arealplaner are a separate Geonorge dataset (`Arealplanområder Svalbard`, uuid
 * 982c1c55-…, distribution `GEONORGE:OFFLINE`, i.e. not served online at all).
 */
export const NO_MATRIKKEL_SERVICE_BBOX = Object.freeze({
    minLat: 58.024832,
    maxLat: 70.665014,
    minLon: 5.114669,
    maxLon: 23.692099,
});

/**
 * True when a WGS84 point is inside the extent the Matrikkelen WFS declares. Pure; never
 * throws. A point that is `isInNorway` but NOT `isInNoMatrikkelServiceExtent` is a KNOWN
 * coverage edge — the caller must say so rather than report "no parcel".
 */
export function isInNoMatrikkelServiceExtent(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= NO_MATRIKKEL_SERVICE_BBOX.minLat &&
        lat <= NO_MATRIKKEL_SERVICE_BBOX.maxLat &&
        lon >= NO_MATRIKKEL_SERVICE_BBOX.minLon &&
        lon <= NO_MATRIKKEL_SERVICE_BBOX.maxLon
    );
}

/**
 * The measured gap between the registered router box and the service's declared extent,
 * carried as data so a test can assert it rather than a comment claiming it.
 */
export const NO_BBOX_SERVICE_GAP = Object.freeze({
    registered: NORWAY_BBOX,
    served: NO_MATRIKKEL_SERVICE_BBOX,
    note:
        'parcelProviders/registry.ts routes on NORWAY_BBOX (57.8..71.4 N, 4.4..31.3 E); the ' +
        'Matrikkelen WFS declares 58.024832..70.665014 N, 5.114669..23.692099 E. Points in ' +
        'the difference are inside the ROUTER and outside the SERVICE — report that, never ' +
        '"no parcel here" (probed 2026-09-01).',
});
