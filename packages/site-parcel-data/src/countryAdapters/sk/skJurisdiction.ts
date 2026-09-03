// LANE SK — SLOVAKIA (SK) · the routing predicate seat + the national bbox, on the
// L-12871/L-12887 contract (the national-jurisdiction resolver decides sovereignty on boundary
// geometry; the box is a SPECIFICITY metric and a candidate pre-filter, NEVER a decider).
//
// ⛔ TWO THINGS THIS FILE DELIBERATELY IS NOT.
//   1. It is NOT a routing authority. `claimsSlovakia` delegates to `resolveNationalJurisdiction`
//      — it never routes on the rectangle. The brief for this lane is explicit: "no bbox of your
//      own — the national-jurisdiction resolver decides (L-12871/12887 closed)". `SLOVAKIA_BBOX`
//      exists for exactly one job the registry needs of every row: a finite specificity number so
//      a contested point has a deterministic order (`parcelRegistryWiring`-class tests fail a row
//      with no `REGION_BBOX` entry). It is the same role EE/LT/PL/RO/GR's boxes play post-L-12871.
//   2. It is NOT yet able to claim anything. ⚠⚠ SVK IS PRESENT IN THE RESOLVER'S BOUNDARY SET —
//      BUT AS A REFUSAL-ONLY NEIGHBOUR, NOT A CLAIMABLE COUNTRY. Measured 2026-09-03 by parsing
//      `jurisdiction/data/nationalBoundaries.json` (retrieved 2026-09-01): 20 CLAIMABLE countries
//      (ARE BHR CHE DEU DNK ESP EST FIN FRA ITA KWT LTU LUX NLD NOR OMN POL PRT SAU SWE) and 16
//      REFUSAL-ONLY neighbours (AND AUT BEL BLR CZE GIB LIE LVA MAR MCO RUS SMR **SVK** SVN UKR
//      VAT). SVK is in the SECOND list. A refusal-only member can NEVER be claimed, so
//      `claimsSlovakia` is FALSE EVERYWHERE in Slovakia today — but the REFUSAL REASON differs by
//      location, MEASURED 2026-09-03 and worth stating exactly (never assumed — the prefilter gates
//      the neighbour check):
//        • Bratislava (48.1436,17.1077) + Košice → `no-national-candidate` (candidates: []): NO
//          prefilter bbox covers them, so the point short-circuits before any polygon test — the
//          same refusal GR/RO give at their capitals.
//        • Northern Slovakia INSIDE POLAND_BBOX (Žilina, Poprad, Orava, Bardejov) →
//          `claimed-by-unmodelled-neighbour` naming SVK (candidates: ["POL"]): here the point IS a
//          POL candidate, and the SVK neighbour polygon holds it and REFUSES the POL claim. This is
//          the L-12887 protection SVK-as-neighbour buys — WITHOUT it those points would misroute to
//          Poland. It is why SVK belongs in the boundary set even before it is promoted.
//
// ⭐ THIS IS A DECLARED DEFERRAL OF THE *ROUTING* LEG — NOT OF THE PARCEL DATA. Slovakia's cadastre
// is LIVE and KEYLESS and was LIVE-PROVEN at Bratislava (skParcelProvider.ts / skEsknClient.ts
// carry the endpoint + the recorded-live parcel proof: register-C id 2090872505, parcel №15,
// k.ú. 2933, 832 m²). What is deferred is the shared-geometry PROMOTION this lane may not perform
// under the barrel protocol, named in {@link SK_ROUTING_DEFERRAL}: SVK must be moved from
// `neighbours` to `countries.SVK` (regionCode 'SK') in `nationalBoundaries.json`, a `['SVK',
// isInSlovakia]` pre-filter added to the resolver's `CANDIDATE_PREFILTERS`, and — the L-12887
// border-integrity requirement — Hungary (HUN) added as a NEW refusal-only neighbour (SK's only
// land neighbour not already modelled: CZE/AUT/UKR are refusal-only, POL is claimable, HUN is in
// NEITHER list — measured 2026-09-03), so promoting SVK cannot annex a Komárno/Štúrovo SK↔HU
// border point to Slovakia. The predicate is written in its FINAL form: the day that boundary wave
// lands, `claimsSlovakia` and the registry's `claimsNation('SK')` BOTH start returning true at
// Slovak points with ZERO change to this adapter or the registry row — the single-line flip the
// L-12871 design promises.
//
// ⛔ DO NOT "fix" this by minting a rectangle router here. A bbox is not a border; that is the whole
// of L-12871. The honest state is: SK cannot be CLAIMED until SVK is PROMOTED from neighbour to
// modelled country.

import { resolveNationalJurisdiction } from '../../jurisdiction/nationalJurisdictionResolver.js';

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Slovakia (Záhorie/Bratislava west ≈ 16.83°E; Nová Sedlica/UA border east ≈ 22.57°E; Tatras/PL
 * border north ≈ 49.61°N; Patince/Štúrovo HU border south ≈ 47.73°N). A COARSE rectangle, and a
 * SPECIFICITY metric only — it is NOT consulted to decide nationality (that is
 * `resolveNationalJurisdiction`). It intentionally over-covers so a future `['SVK', isInSlovakia]`
 * pre-filter narrows on it without clipping real Slovak territory. It slivers into AT/CZ/PL/HU/UA,
 * which is harmless precisely because routing is `claimsNation('SK')`, never this box (and none of
 * those neighbours is a registered cadastral row).
 */
export const SLOVAKIA_BBOX: Bbox = { minLat: 47.7, maxLat: 49.65, minLon: 16.8, maxLon: 22.6 };

/**
 * True when a WGS84 point falls inside {@link SLOVAKIA_BBOX}. Pure; never throws. Used for the
 * registry SPECIFICITY metric and for tests ONLY — it is NOT the router (a rectangle is not a
 * border). The router is {@link claimsSlovakia}.
 */
export function isInSlovakia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SLOVAKIA_BBOX.minLat &&
        lat <= SLOVAKIA_BBOX.maxLat &&
        lon >= SLOVAKIA_BBOX.minLon &&
        lon <= SLOVAKIA_BBOX.maxLon
    );
}

/**
 * The ROUTING predicate — TRUE only where the national-jurisdiction resolver CLAIMS Slovakia.
 * Reuses the L-12871 decider exactly as the registry's `claimsNation('SK')` does; the two are the
 * same computation, kept here as well so the adapter is self-contained and its dormancy is testable
 * in isolation. Pure; never throws.
 *
 * ⭐ LIVE SINCE 2026-09-03 (lane BOUNDARY-WAVE): SVK was PROMOTED from refusal-only neighbour to
 * claimable country (rings verbatim, regionCode 'SK'), `['SVK', isInSlovakia]` entered the
 * resolver pre-filters, and HUN entered the set as a refusal-only neighbour — the three
 * {@link SK_ROUTING_DEFERRAL}.retiredBy steps, landed together, with no edit to the parcel leg.
 * Bratislava/Košice/Žilina now CLAIM SK by polygon containment; Danube border towns
 * (Komárno 208 m, Štúrovo 780 m from the HUN boundary) refuse within-tolerance naming HUN — the
 * L-12887 border integrity the HUN neighbour exists to provide.
 */
export function claimsSlovakia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    const v = resolveNationalJurisdiction(lat, lon);
    return v.ok && v.regionCode === 'SK';
}

/**
 * The routing-leg deferral, AS DATA so a test can assert it rather than trust the header (the SE
 * pattern, L-12879). Slovakia's PARCEL data is LIVE; its ROUTING waits on one shared-geometry wave
 * this lane cannot make. `reviewBy` is the date after which this deferral must be re-decided
 * explicitly — not silently extended.
 */
export const SK_ROUTING_DEFERRAL = Object.freeze({
    gate: 'JURISDICTION — SVK is a refusal-only NEIGHBOUR, not a claimable country, in the resolver boundary set',
    owner: 'lane SK (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** The exact, MEASURED state that keeps `claimsSlovakia` false (probed 2026-09-03, not assumed). */
    evidence:
        'jurisdiction/data/nationalBoundaries.json (retrieved 2026-09-01) has 20 claimable countries ' +
        '+ 16 refusal-only neighbours; SVK is in the NEIGHBOURS list (with rings), NOT in countries. ' +
        "MEASURED: resolveNationalJurisdiction refuses at Bratislava (48.1436,17.1077) and Košice with " +
        "reason 'no-national-candidate' (no prefilter bbox covers them), and at northern-Slovak points " +
        "inside POLAND_BBOX (Žilina/Poprad/Orava/Bardejov) with 'claimed-by-unmodelled-neighbour' " +
        "naming SVK (the SVK neighbour polygon refuses the POL candidate — the L-12887 protection). " +
        "Either way claimsNation('SK') is false at every Slovak point.",
    /** What flips this predicate live with no adapter change (the L-12887 shared-decider wave). */
    retiredBy: [
        "promote SVK from nationalBoundaries.json.neighbours to .countries (regionCode 'SK', ne_10m ring " +
            'at the shipped 100 m simplification), exactly as EST/LTU/POL/LUX/SWE/SVN were promoted',
        "add ['SVK', isInSlovakia] to nationalJurisdictionResolver.ts CANDIDATE_PREFILTERS (pre-filter only)",
        'add Hungary (HUN) as a NEW refusal-only neighbour — SK’s only land neighbour absent from the set ' +
            '(CZE/AUT/UKR already neighbours, POL already claimable, HUN in neither) — so promoting SVK cannot ' +
            'annex a Komárno/Štúrovo SK↔HU border point to Slovakia (the L-12887 border-integrity requirement); ' +
            'ship red-pin border tests for the SK↔HU/CZ/AT/PL/UA bands with that wave',
    ] as const,
    reviewBy: '2026-12-03',
    /**
     * ⭐ RETIRED 2026-09-03 (lane BOUNDARY-WAVE): all three retiredBy steps landed in one commit —
     * SVK promoted neighbours→countries, the SVK prefilter added, HUN added refusal-only (from the
     * SI lane's pipeline-validated ne_10m fixture), and the SK↔HU/CZ/AT/PL/UA red-pins shipped in
     * the resolver + SK suites. The record stays as the dated history; `claimsSlovakia` is live.
     */
    retiredOn: '2026-09-03',
});
