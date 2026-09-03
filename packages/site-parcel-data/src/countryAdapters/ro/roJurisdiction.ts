// LANE RO — ROMANIA (RO) · the routing predicate + the national bbox, on the L-12871/L-12887
// contract (the national-jurisdiction resolver decides sovereignty on boundary geometry; the box
// is a SPECIFICITY metric and a candidate pre-filter, NEVER a decider).
//
// ⛔ TWO THINGS THIS FILE DELIBERATELY IS NOT.
//   1. It is NOT a routing authority. `claimsRomania` delegates to
//      `resolveNationalJurisdiction` — it never routes on the rectangle. The brief for this lane
//      is explicit: "no bbox of your own — the national-jurisdiction resolver decides
//      (L-12871/12887 closed)". `ROMANIA_BBOX` exists for exactly one job the registry needs of
//      every row: a finite specificity number so a contested point has a deterministic order
//      (`parcelRegistryWiring.test.ts` fails a row with no `REGION_BBOX` entry). It is the same
//      role EE/LT/PL/LU/SE's boxes play post-L-12871.
//   2. It is NOT yet able to claim anything. ⚠⚠ GATE 2 (the JURISDICTION gate — see the deferral
//      record below): ROMANIA IS NOT IN THE RESOLVER'S BOUNDARY SET. Measured 2026-09-03:
//      `jurisdiction/data/nationalBoundaries.json` carries 16 claimable countries
//      (ESP/FRA/NLD/NOR/DEU/CHE/SAU/DNK/ITA/PRT/FIN/EST/LTU/LUX/POL/SWE) and 16 refusal-only
//      neighbours (CZE/SVK/AUT/LIE/SVN/SMR/VAT/MCO/AND/GIB/BEL/LVA/BLR/UKR/RUS/MAR). ROU is in
//      NEITHER list. So `resolveNationalJurisdiction(Bucharest)` REFUSES (no candidate claims the
//      point), and therefore `claimsRomania` is FALSE EVERYWHERE in Romania today.
//
// ⭐ THIS IS A DECLARED DEFERRAL, NOT A BUG. The predicate is written in its FINAL form: the day a
// coordinated boundary-set wave adds ROU to `nationalBoundaries.json` (the same wave that added
// EST/LTU/POL/LUX/SWE on 2026-09-02), `claimsRomania` and the registry's `claimsNation('RO')`
// BOTH start returning true at Romanian points with ZERO change to this adapter or the registry
// row — the single-line flip the L-12871 design promises. Until then the RO registry row is a
// DORMANT, honestly-labelled footprint-fallback (see roParcelProvider.ts / roAncpiGate.ts for the
// SERVICE gate, GATE 1). Extending the resolver is out of this lane's scope by the brief
// ("L-12871/12887 closed") and is a shared-geometry change owned by a boundary wave.
//
// ⛔ DO NOT "fix" this by minting a rectangle router here. A bbox is not a border; that is the
// whole of L-12871. The honest state is: RO cannot be CLAIMED until its geometry is modelled.

import { resolveNationalJurisdiction } from '../../jurisdiction/nationalJurisdictionResolver.js';

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Romania (Sulina east ≈ 29.69°E; Beba Veche west ≈ 20.26°E; Horodiștea north ≈ 48.27°N; Zimnicea
 * south ≈ 43.62°N). A COARSE rectangle, and a SPECIFICITY metric only — it is NOT consulted to
 * decide nationality (that is `resolveNationalJurisdiction`). It intentionally over-covers so that
 * a future pre-filter narrows on it without clipping real Romanian territory. No existing
 * registered parcel box overlaps it (POLAND_BBOX ends at 54.84–49.0°N, north of Romania's 48.27°N
 * ceiling), so it introduces no new cross-border ambiguity even as a pre-filter.
 */
export const ROMANIA_BBOX: Bbox = { minLat: 43.5, maxLat: 48.4, minLon: 20.2, maxLon: 29.8 };

/**
 * True when a WGS84 point falls inside {@link ROMANIA_BBOX}. Pure; never throws. Used for the
 * registry SPECIFICITY metric and for tests ONLY — it is NOT the router (a rectangle is not a
 * border). The router is {@link claimsRomania}.
 */
export function isInRomania(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= ROMANIA_BBOX.minLat &&
        lat <= ROMANIA_BBOX.maxLat &&
        lon >= ROMANIA_BBOX.minLon &&
        lon <= ROMANIA_BBOX.maxLon
    );
}

/**
 * The ROUTING predicate — TRUE only where the national-jurisdiction resolver CLAIMS Romania.
 * Reuses the L-12871 decider exactly as the registry's `claimsNation('RO')` does; the two are the
 * same computation, kept here as well so the adapter is self-contained and its dormancy is
 * testable in isolation. Pure; never throws.
 *
 * ⚠ RETURNS FALSE EVERYWHERE TODAY (GATE 2): ROU is absent from the resolver's boundary set, so
 * every Romanian point REFUSES. See {@link RO_JURISDICTION_DEFERRAL}. This is deliberate and
 * documented, not a defect to route around.
 */
export function claimsRomania(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    const v = resolveNationalJurisdiction(lat, lon);
    return v.ok && v.regionCode === 'RO';
}

/**
 * GATE 2, as an assertable DATA record (the SE C74 §3.4 scaffold shape): the JURISDICTION gate is
 * that ROU is not modelled in the resolver. This is separate from GATE 1 (the ANCPI SERVICE is
 * unreachable — roAncpiGate.ts); either gate alone is enough to keep the RO parcel row dormant,
 * and BOTH are open today.
 */
export const RO_JURISDICTION_DEFERRAL = Object.freeze({
    gate: 'GATE 2 — national-jurisdiction resolver has no Romania geometry',
    owner: 'lane RO (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** The exact, measured state that keeps `claimsRomania` false. */
    evidence:
        'jurisdiction/data/nationalBoundaries.json (retrieved 2026-09-01) has 16 claimable ' +
        'countries + 16 refusal-only neighbours; ROU is in neither, so ' +
        'resolveNationalJurisdiction refuses at every Romanian point (no candidate contains it).',
    /** What flips this predicate live with no adapter change. */
    retiredBy:
        'a coordinated boundary-set wave adds ROU to nationalBoundaries.json.countries (regionCode ' +
        '"RO", ne_10m ring at the shipped 100 m simplification) exactly as EST/LTU/POL/LUX/SWE were ' +
        'added on 2026-09-02; then claimsRomania and claimsNation("RO") both start claiming Romanian ' +
        'points with no edit here.',
    reviewBy: '2026-12-01',
});
