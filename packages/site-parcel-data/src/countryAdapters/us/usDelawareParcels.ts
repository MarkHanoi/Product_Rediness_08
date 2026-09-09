// LANE USA-DELAWARE-DEMO (2026-09-09) — DELAWARE, the 22nd US parcel jurisdiction.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A home-builder demo at 38.781987, -75.089744 (Lewes / Cape Henlopen, Sussex County) needs a
// CLICKABLE cadastral parcel, and Delaware was the one Mid-Atlantic state with no row: US-MD, US-NJ,
// US-VA, US-NY and US-CT all resolve, and the state between them did not.
//
// ⭐ THIS IS A DATA ROW, NOT A NEW IDIOM. The client is the shared `usArcgisParcelClient.ts` point
// query every one of the other 21 US rows uses, and the server leg is one more entry in
// `euCadastreProxy.js`'s config table. Nothing about the parcel path is Delaware-specific. That
// matters: the alternative — a bespoke "Sussex County provider" — would have been this repo's
// dominant defect (one rule, two implementations) for no gain, since the county's own id arrives
// verbatim through the state layer anyway (see PIN, below).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ TWO HOSTS WERE NAMED IN THE INCOMING RESEARCH AND BOTH WERE THE WRONG ONE TO DEPEND ON
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder's research (docs/04-reference/geospatial/USA-DELAWARE-DEMO-SOURCES.md) named:
//
//   1. `https://map.sussexcountyde.gov/trdserver/rest/services/Geographic_Information_Office/
//      Parcels_PIN/MapServer` — the COUNTY's own parcel server, as the primary parcel door.
//      ⛔ MEASURED 2026-09-09: **HTTP 403 on EVERY path tried**, and it is not a path error — the
//      body is a RedShield WAF interstitial ("At RedShield, we take security very seriously … we
//      have blocked this request", ~4,616–4,625 B, with a support id). Probed `/trdserver/rest/
//      services?f=json`, the Parcels_PIN MapServer root with and without `?f=json`, `/server/rest/
//      services?f=json`, the Hosted/Zoning_View FeatureServer, and `/arcgis/rest/services?f=json`
//      — five paths, two user-agents (curl default and a Chrome UA), 403 every time. A WAF that
//      blocks a server-to-server GET is not a source PRYZM can put on a demo critical path.
//
//   2. `https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services` — the state host, but
//      note the spelling: **firstmapTEST**. It answers HTTP 200 (currentVersion 11.3, 12 folders),
//      which is exactly what makes it dangerous: a test host that works today is the kind of thing
//      that is fine on Tuesday and gone on Thursday. The research's own margin flagged this.
//
// ⭐ THE PRODUCTION HOST EXISTS AND IS WHAT THIS ROW USES:
//   `https://enterprise.firstmap.delaware.gov/arcgis/rest/services` — measured 2026-09-09, HTTP
//   200, `{"currentVersion":11.3,"folders":["Basemaps","Biota","Boundaries","Elevation",
//   "Environmental","Geology","Hydrology","Location","PlanningCadastre","Society","Transportation",
//   "Utilities"]}`. Same folder set as the test host, no `test` in the name.
//   ⚠ `https://firstmap.delaware.gov/arcgis/rest/services?f=json` (no `enterprise.` prefix) is a
//   DIFFERENT and WRONG hostname — it answers HTTP 404 with a meta-refresh to
//   `delaware.gov/topics/404Error.shtml`. Do not "simplify" the URL to it. This is the same shape
//   as the US-MD `geodata` vs `mdgeodata` correction recorded in `usStatewideParcelsWave2.ts`, and
//   it is the third time in this codebase that a state's parcels were one hostname away from being
//   recorded as absent.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE COUNTY ID SURVIVES — which is the whole reason the state layer is sufficient
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `DE_StateParcels` is a STATE aggregation of the THREE county fabrics, and it carries each
// county's own PIN verbatim rather than minting a state surrogate. Measured 2026-09-09, one point
// per county, and the three id GRAMMARS are visibly different — which is the proof that no
// re-keying happened:
//   • Sussex      335-5.00-12.00               (map-block-lot, the Sussex County grammar)
//   • Kent        2-05-07709-05-0101-00001     (a longer hyphenated Kent grammar)
//   • New Castle  1802000032                   (a flat 10-digit New Castle grammar)
// So a user verifying against the Sussex County record has the id the county itself uses. That is
// the "never discard the originating jurisdiction's parcel id" rule in
// `USA-PARCEL-ZONING-DEVELOPMENT-ENGINE.md` satisfied by the state layer, not in spite of it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// COVERAGE MEASURED AGAINST DELAWARE'S OWN DENOMINATOR — 3 of 3 counties, and the sum is exact
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   `where=1=1&returnCountOnly=true`            → 451,344
//   `where=COUNTY='Sussex'`                     → 164,523
//   `where=COUNTY='Kent'`                       → 83,004
//   `where=COUNTY='New Castle'`                 → 203,817
//                                        sum    = 451,344  ✔ EXACT
// The sum matching the total is worth stating: it proves there is no fourth bucket and no unlabelled
// residue, so "3 of 3 counties" is a measurement and not a reading of the service title. Delaware
// has exactly three counties, so this is full statewide coverage.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THERE IS NO ADDRESS, AND THAT IS THE SOURCE'S ANSWER, NOT A GAP IN THIS ADAPTER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Layer 0's ENTIRE field list is `OBJECTID · PIN · ACRES · COUNTY · UPDATED · Shape__Area ·
// Shape__Length`. There is no street address in it, so `addressFields` is EMPTY and every Delaware
// parcel card renders address-less. That is the honest outcome (§CONTEXT-DATA-HONESTY): an absent
// address must read as absent, never be back-filled from something that is not one.
// ⚠ AND THE OBVIOUS "FIX" IS DELIBERATELY NOT TAKEN. Layer 1 (`Parcel Centroids`) carries TOWN,
// ZIP_CODE, COMMUNITYNAME, SCHOOL_DISTRICT, WASTEWATERCPCN and more, keyed by the same PIN — but
// joining it would be a SECOND upstream round-trip on every click, and it still holds no street
// address (measured: no address-shaped field in its 23 columns). Paying a doubled latency for a
// locality string is the wrong trade on a click path; US-CT already ships address-less across whole
// towns and the card tolerates it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// AREA IS GEOMETRY-DERIVED — and here it was independently cross-checked
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every US row derives area from the ring rather than trusting a tax-roll acreage, and Delaware
// keeps that rule. Unusually, the two AGREE here, which is worth recording as evidence that the
// ring is being read correctly rather than as a reason to switch:
//   demo parcel 335-5.00-12.00 — source `ACRES` 477.69334699 → 1,933,156 m²
//                                ring spherical shoelace     → 1,935,982 m²   (Δ 0.146 %)
// A 0.146 % agreement between an independent attribute and our own polygon maths is a real check on
// the ring parse. `ACRES` is still NOT used: it is an assessment acreage, and the US-NJ/US-VT/US-CT
// rows all record cases where such a field diverges from the surveyed polygon.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ WHAT THIS ROW DOES *NOT* DELIVER — READ BEFORE QUOTING IT IN A DEMO
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This row resolves parcel GEOMETRY and IDENTITY. It emits NO zoning, NO setback, NO height and NO
// FAR, and none may be inferred from it. Sussex County zoning is county ordinance (Sussex County
// Code Ch. 115, enabled by Del. Code tit. 9 ch. 69) and PRYZM holds NO verified rule pack for it,
// so the envelope card's honest-absence arm is the CORRECT rendering at this site (C58 §1.20
// §ENVELOPE-NOT-A-GATE — massing, BIM and the 3D site all work without a solved envelope).
// ⚠ Shipping a plausible-looking AR-1 setback to a builder who knows their own setbacks is strictly
// worse than showing "no determination held for Sussex County".

import {
    isInUsBbox,
    makeUsArcgisParcelProvider,
    type UsArcgisParcelConfig,
    type UsBbox,
} from './usArcgisParcelClient.js';

/**
 * Delaware's routing box.
 *
 * ⭐ THE SOUTH EDGE IS NOT ROUNDED — 38.45 is the **Transpeninsular Line**, the 1751 survey that is
 * Delaware's southern boundary with Maryland (Fenwick Island, the state's southernmost point, sits
 * at ≈38.4515 N). A lazier 38.3 would have pulled Ocean City and the Maryland Eastern Shore into
 * Delaware's box. The north edge covers the Twelve-Mile Circle (≈39.84).
 *
 * ⚠ THESE ARE THE SAME FOUR NUMBERS as the `delaware` row in `tools/context-bake/bake.mjs`
 * (`bbox: '-75.79,38.45,-74.98,39.85'`), deliberately: the parcel routing box and the context-tile
 * clip describing DIFFERENT extents for the same state is the kind of quiet divergence that is
 * invisible until a click at the edge resolves a parcel with no tiles under it.
 *
 * ⚠ OVERLAPS, both resolved by specificity + the honest `empty` fall-through, both named rather
 * than smoothed over:
 *   • US-MD (≈8.33 deg²) — Maryland's rectangle covers Delaware almost entirely. This box is
 *     ≈1.13 deg², far smaller, so Delaware is tried FIRST on Delaware soil. Correct: the MD SDAT
 *     layer holds no Delaware parcels and would answer `empty` there anyway.
 *   • US-NJ (≈4.4 deg²) — the Delaware River is the state line, so this box's northeast corner
 *     reaches over Salem / Cumberland / Gloucester counties, New Jersey. Being the smaller box,
 *     Delaware is tried first there and answers an honest `empty`, and `resolveParcelWithFallback`
 *     falls THROUGH to US-NJ, which answers. The outcome is right; the cost is ONE WASTED UPSTREAM
 *     CALL per click in southwest New Jersey. This is the identical trade the US-NJ row already
 *     documents for NYC_BBOX overhanging the Hudson, and the fix is the same one: a true-shoreline
 *     predicate, which lives in a different change.
 */
export const US_DE_BBOX: UsBbox = { minLat: 38.45, maxLat: 39.85, minLon: -75.79, maxLon: -74.98 };

/** True when a WGS84 point should route to the Delaware FirstMap state parcels. Pure; never throws. */
export function isInDelaware(lat: number, lon: number): boolean {
    return isInUsBbox(US_DE_BBOX, lat, lon);
}

export const US_DE_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-DE',
    providerId: 'us-de-firstmap-stateparcels',
    label: 'DE FirstMap State Parcels (Delaware · statewide)',
    proxyPath: '/api/parcel/us-de',
    upstreamQueryUrl:
        'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0/query',
    layerName: 'State Parcels',
    nativeWkid: 102100,
    // PIN is the county's OWN parcel id, carried through verbatim (three distinct county grammars
    // measured — see the header). There is no state-level surrogate to prefer over it, and no
    // secondary id in the layer, so `altIdFields` is empty rather than padded with OBJECTID (an
    // ArcGIS row number is not a parcel identifier and must never be shown as one).
    idFields: ['PIN'],
    altIdFields: [],
    // ⚠ EMPTY ON PURPOSE — layer 0 publishes no address at all. See the header: this is the
    // source's answer, and layer 1 does not carry one either.
    addressFields: [],
    localityFields: ['COUNTY'],
    licence:
        'Delaware FirstMap (Delaware Department of Technology and Information / Delaware Geographic Data Committee) — State Parcels, aggregated from the New Castle, Kent and Sussex County parcel fabrics. Delaware open data; attribution "Delaware FirstMap".',
    bbox: US_DE_BBOX,
    note: 'Delaware statewide parcels — VERIFIED-LIVE 2026-09-09 on the PRODUCTION FirstMap host. ⛔ THE INCOMING RESEARCH NAMED TWO HOSTS AND NEITHER WAS THE RIGHT ONE TO DEPEND ON: (a) the Sussex COUNTY server map.sussexcountyde.gov is HTTP 403 behind a RedShield WAF on ALL FIVE paths probed, under two user-agents — a blocked WAF interstitial (~4.6 kB, support id), not a path error, so the county door is CLOSED to server-to-server traffic; (b) the state host given was enterprise.firstmapTEST.delaware.gov, a TEST hostname that does answer 200 but must not carry a demo. The PRODUCTION host is enterprise.firstmap.delaware.gov (HTTP 200, currentVersion 11.3, 12 folders) and is what this row uses; ⚠ firstmap.delaware.gov WITHOUT the `enterprise.` prefix is a different, WRONG hostname answering HTTP 404 with a meta-refresh to delaware.gov/topics/404Error.shtml — the same one-hostname-away shape as the US-MD geodata/mdgeodata correction. SERVICE: keyless ArcGIS FeatureServer PlanningCadastre/DE_StateParcels/FeatureServer/0 "State Parcels", capabilities Query, maxRecordCount 2000, native EPSG:102100, 451,344 features. Point-intersect @ the Lewes / Cape Henlopen demo site (38.781987,-75.089744) → HTTP 200, 3,647 bytes: PIN "335-5.00-12.00", COUNTY Sussex, ACRES 477.69334699, UPDATED 2026-09-01, single ring of 68 WGS84 vertices. COVERAGE MEASURED against Delaware\'s own denominator: COUNTY counts Sussex 164,523 + Kent 83,004 + New Castle 203,817 = 451,344, EXACTLY the unfiltered total — so 3 of 3 counties with no unlabelled residue, i.e. full statewide. ⭐ THE COUNTY ID SURVIVES THE STATE AGGREGATION: the three counties\' PIN grammars are visibly different (Sussex "335-5.00-12.00", Kent "2-05-07709-05-0101-00001", New Castle "1802000032"), which is the proof that PIN is the county\'s own key and not a state surrogate — a user can verify against the county record. ⚠ THERE IS NO ADDRESS FIELD: layer 0 publishes only OBJECTID/PIN/ACRES/COUNTY/UPDATED/Shape__Area/Shape__Length, so every DE card is address-less by the source\'s own answer; layer 1 (Parcel Centroids) carries TOWN/ZIP_CODE/COMMUNITYNAME but ALSO no street address, and joining it would double the click latency for a locality string — not taken. Area is geometry-derived; independently cross-checked at the demo parcel, ring shoelace 1,935,982 m² vs source ACRES 477.69334699 → 1,933,156 m², Δ 0.146 % (ACRES is an assessment acreage and is NOT used). HONEST EMPTIES CONFIRMED, so an outage can never be mistaken for open water: Atlantic off Lewes (38.78,-74.95) → 0 features, New Jersey across the bay (39.10,-75.10) → 0, Maryland side of the line (38.78,-75.75 and -75.80) → 0, while 38.78,-75.70 → 1 Sussex parcel. Wilmington resolved at 3 of 4 sampled points; the 0 is Rodney Square (39.7459,-75.5466), a public square/street, not a coverage hole. ⛔ ZONING IS NOT IN THIS LAYER AND IS NOT INFERRED: Sussex County zoning is county ordinance (Sussex County Code Ch. 115 under Del. Code tit. 9 ch. 69) and PRYZM holds NO verified Delaware rule pack, so the envelope card\'s honest-absence arm is the correct rendering at this site (C58 §1.20 §ENVELOPE-NOT-A-GATE).',
};

/** The bound Delaware provider handle, mirroring `usStatewideParcelsWave2.ts`. */
export const usDeParcelProvider = makeUsArcgisParcelProvider(US_DE_PARCELS);

/**
 * Lane USA-DELAWARE-DEMO's jurisdiction configs — one state. Kept as its own array (rather than
 * appended to `USA_PARCELS_WAVE2_CONFIGS`) for the same reason the earlier waves are separate: a
 * wave's live-probe evidence should stay legible beside the rows it actually measured, and this
 * lane's evidence is about a WAF-blocked county and a test-vs-production hostname, not about the
 * five states wave 2 measured. `US_ALL_PARCEL_CONFIGS` in `index.ts` is the union.
 */
export const USA_PARCELS_DELAWARE_CONFIGS: readonly UsArcgisParcelConfig[] = [US_DE_PARCELS];
