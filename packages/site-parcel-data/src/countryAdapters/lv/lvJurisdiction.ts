// LANE LV — LATVIA (LV) · the routing predicate + the national bbox, on the L-12871/L-12887
// contract (the national-jurisdiction resolver decides sovereignty on boundary geometry; the box
// is a SPECIFICITY metric and a candidate pre-filter, NEVER a decider). Written to mirror the
// europe-adapters-2 sibling `countryAdapters/ro/roJurisdiction.ts` exactly — same brief, same
// two-role box, same DECLARED-DEFERRAL shape for the un-modelled-country gate.
//
// ⛔ TWO THINGS THIS FILE DELIBERATELY IS NOT.
//   1. It is NOT a routing authority. `claimsLatvia` delegates to `resolveNationalJurisdiction`
//      — it never routes on the rectangle. The brief for this lane is explicit: "no bbox of your
//      own — the national-jurisdiction resolver decides (L-12871/12887 closed)". `LATVIA_BBOX`
//      exists for exactly one job the registry needs of every row: a finite specificity number so
//      a contested point has a deterministic order (`parcelRegistryWiring.test.ts` fails a row
//      with no `REGION_BBOX` entry). It is the same role EE/LT/PL/LU/SE/RO's boxes play post-L-12871.
//   2. It is NOT yet able to claim anything. ⚠⚠ GATE 2 (the JURISDICTION gate — see the deferral
//      record below): LATVIA IS A REFUSAL-ONLY NEIGHBOUR IN THE RESOLVER, NOT A CLAIMABLE COUNTRY.
//      Measured 2026-09-03: `jurisdiction/data/nationalBoundaries.json` carries 16 claimable
//      countries (ESP/FRA/NLD/NOR/DEU/CHE/SAU/DNK/ITA/PRT/FIN/EST/LTU/LUX/POL/SWE) and 16
//      refusal-only neighbours (CZE/SVK/AUT/LIE/SVN/SMR/VAT/MCO/AND/GIB/BEL/**LVA**/BLR/UKR/RUS/MAR).
//      LVA is in the NEIGHBOUR list, so `resolveNationalJurisdiction(Rīga)` REFUSES
//      (`claimed-by-unmodelled-neighbour`, owner LVA) and therefore `claimsLatvia` is FALSE
//      EVERYWHERE in Latvia today — exactly the "Rīga (LVA, un-modelled)" state the EE registry
//      note already records (`parcelProviders/registry.ts`, EE row).
//
// ⭐ THIS IS A DECLARED DEFERRAL, NOT A BUG — AND IT IS THE ONLY GATE ON THIS COUNTRY. Unlike RO
// (whose ANCPI service is ALSO dead), LATVIA'S PARCEL SERVICE IS LIVE AND KEYLESS: the geolatvija
// VRAA GeoServer `vraa:parcel` layer was live-probed at the capital on 2026-09-03 and returned a
// real cadastral parcel (see lvParcelProvider.ts / lvSources.ts). So the parcel PROVIDER works
// today; the ONLY thing dormant is this ROUTING predicate, held false by the resolver-geometry
// gate. The predicate is written in its FINAL form: the day a coordinated boundary-set wave
// PROMOTES LVA from `neighbours` to `countries` (regionCode "LV") in `nationalBoundaries.json`
// (the same operation that added EST/LTU/POL/LUX/SWE on 2026-09-02), `claimsLatvia` and the
// registry's `claimsNation('LV')` BOTH start returning true at Latvian points with ZERO change to
// this adapter or the registry row — the single-line flip the L-12871 design promises.
// Extending the resolver is out of this lane's scope by the brief ("L-12871/12887 closed") and is
// a shared-geometry change owned by a boundary wave (the resolver's own header: "Ship a country's
// official boundary in place of the coarse one … converting refusals into claims with no change
// to the logic").
//
// ⛔ DO NOT "fix" this by minting a rectangle router here. A bbox is not a border; that is the
// whole of L-12871. The honest state is: LV cannot be CLAIMED until LVA is modelled as a country.

import { resolveNationalJurisdiction } from '../../jurisdiction/nationalJurisdictionResolver.js';

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Latvia (Nida/Kurzeme west ≈ 20.97°E; Zilupe east ≈ 28.24°E; the Estonian border north ≈ 58.08°N
 * at Ainaži; Demene/Daugavpils south ≈ 55.67°N). A COARSE rectangle, and a SPECIFICITY metric
 * only — it is NOT consulted to decide nationality (that is `resolveNationalJurisdiction`). It
 * intentionally over-covers so a future pre-filter narrows on it without clipping real Latvian
 * territory. It DOES overlap its modelled neighbours' boxes (ESTONIA_BBOX minLat 57.5 reaches
 * into northern Latvia; LITHUANIA_BBOX maxLat 56.5 reaches into southern Latvia; SWEDEN_BBOX
 * extends east over the Latvian coast) — which is precisely why routing is delegated to the
 * boundary-geometry resolver and this box is a pre-filter only. Under smallest-box alone it would
 * misroute; that is L-12871, and it is not this box's job to decide.
 */
export const LATVIA_BBOX: Bbox = { minLat: 55.6, maxLat: 58.1, minLon: 20.9, maxLon: 28.3 };

/**
 * True when a WGS84 point falls inside {@link LATVIA_BBOX}. Pure; never throws. Used for the
 * registry SPECIFICITY metric and for tests ONLY — it is NOT the router (a rectangle is not a
 * border). The router is {@link claimsLatvia}.
 */
export function isInLatvia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= LATVIA_BBOX.minLat &&
        lat <= LATVIA_BBOX.maxLat &&
        lon >= LATVIA_BBOX.minLon &&
        lon <= LATVIA_BBOX.maxLon
    );
}

/**
 * The ROUTING predicate — TRUE only where the national-jurisdiction resolver CLAIMS Latvia.
 * Reuses the L-12871 decider exactly as the registry's `claimsNation('LV')` does; the two are the
 * same computation, kept here as well so the adapter is self-contained and its dormancy is
 * testable in isolation. Pure; never throws.
 *
 * ⭐ LIVE SINCE 2026-09-03 (lane BOUNDARY-WAVE): LVA was PROMOTED from refusal-only neighbour to
 * claimable country (rings verbatim, regionCode 'LV') and `['LVA', isInLatvia]` entered the
 * resolver pre-filters, exactly as {@link LV_JURISDICTION_DEFERRAL}.retiredBy specified — with no
 * edit to this adapter's parcel leg. Rīga/Daugavpils/Liepāja now CLAIM LV by polygon containment;
 * border-band points (Valka, 452 m from the EST boundary) still refuse within-tolerance, which is
 * the dataset being honest, not a routing defect.
 */
export function claimsLatvia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    const v = resolveNationalJurisdiction(lat, lon);
    return v.ok && v.regionCode === 'LV';
}

/**
 * GATE 2, as an assertable DATA record (the RO/SE C74 §3.4 scaffold shape): the JURISDICTION gate
 * is that LVA is modelled as a refusal-only NEIGHBOUR, not as a claimable COUNTRY. This is the
 * ONLY gate on Latvia — GATE 1 (the SERVICE) is OPEN: the VZD/geolatvija cadastre WFS is live and
 * keyless (proven at the capital, 2026-09-03). So this deferral holds only the ROUTING predicate
 * dormant, never the parcel provider.
 */
export const LV_JURISDICTION_DEFERRAL = Object.freeze({
    gate: 'GATE 2 — Latvia is a refusal-only neighbour in the resolver, not a claimable country',
    owner: 'lane LV (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** The exact, measured state that keeps `claimsLatvia` false. */
    evidence:
        'jurisdiction/data/nationalBoundaries.json (retrieved 2026-09-01) lists LVA under ' +
        '`neighbours` (refusal-only), not under `countries`; resolveNationalJurisdiction refuses ' +
        'at every Latvian point with reason claimed-by-unmodelled-neighbour (owner LVA), so ' +
        'claimsNation("LV") / claimsLatvia are false everywhere.',
    /** What flips this predicate live with no adapter change. */
    retiredBy:
        'a coordinated boundary-set wave PROMOTES LVA from nationalBoundaries.json.neighbours to ' +
        '.countries (regionCode "LV", ne_10m ring at the shipped 100 m simplification) and adds ' +
        '["LVA", isInLatvia] to the resolver CANDIDATE_PREFILTERS — exactly as EST/LTU/POL/LUX/SWE ' +
        'were added on 2026-09-02; then claimsLatvia and claimsNation("LV") both start claiming ' +
        'Latvian points with no edit here. (The resolver test suite must move Rīga/Daugavpils/Valka ' +
        'from its L-12887 refusal witnesses to LV claims in the same commit — that is a boundary-wave ' +
        'change to a shared test, not this lane\'s to make.)',
    reviewBy: '2026-12-01',
    /** ⭐ Distinct from RO: the parcel SERVICE is NOT gated — only this routing predicate is dormant. */
    serviceGate: 'NONE — VZD/geolatvija vraa:parcel WFS live + keyless, probed 2026-09-03 at Rīga',
    /**
     * ⭐ RETIRED 2026-09-03 (lane BOUNDARY-WAVE): the exact retiredBy steps landed — LVA promoted
     * neighbours→countries (regionCode 'LV'), ['LVA', isInLatvia] added to CANDIDATE_PREFILTERS,
     * and the resolver test moved Rīga/Daugavpils to LV claims. The record stays as the dated
     * history of the gate; `claimsLatvia` is live.
     */
    retiredOn: '2026-09-03',
});
