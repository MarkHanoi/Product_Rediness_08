// LANE GR — GREECE (GR) · the routing predicate seat + national bbox, mirroring the EE/LT
// exemplars (`countryAdapters/ee/eeJurisdiction.ts`, `countryAdapters/lt/ltJurisdiction.ts`):
// a coarse WGS84 rectangle that ONLY serves as the specificity metric for the parcel registry.
// It NEVER decides nationality — routing is `claimsNation('GR')` (boundary geometry), per the
// L-12871/L-12887 national-jurisdiction resolver. The cadastre's own `absent` is the real "no
// parcel here" answer; this box never asserts coverage.
//
// ⛔ MEASURED ROUTING BLOCKER — 2026-09-03 (LANE GR). GREECE IS NOT ONE OF THE 16 COUNTRIES THE
// NATIONAL-JURISDICTION RESOLVER MODELS. `jurisdiction/data/nationalBoundaries.json` carries
// CH·DE·DK·EE·ES·FI·FR·IT·LT·LU·NL·NO·PL·PT·SA·SE and NO GR polygon. Measured live from this
// machine:
//     resolveNationalJurisdiction(37.9755, 23.7348 /* Athens/Syntagma */)
//       → { ok:false, reason:'no-national-candidate',
//           detail:'No national routing bbox contains this point; the universal footprint
//                   fallback owns it.' }
//     resolveNationalJurisdiction(40.6401, 22.9444 /* Thessaloniki */) → same refusal.
// THEREFORE `claimsNation('GR')` — the `contains` predicate the GR registry row uses — is FALSE
// at every Greek point today, and the row is REGISTERED-BUT-INERT: a Greek click falls to the
// universal OSM footprint (honest), never to a wrong-country cadastre (the resolver refuses
// cleanly rather than mis-claiming Italy across the sea, so there is no misroute to self-correct).
//
// ⭐ THIS IS A DECLARED, NAMED DEFERRAL OF THE *ROUTING* LEG — NOT of the parcel DATA. The
// Hellenic Cadastre operating-cadastre parcels are LIVE and KEYLESS and were PROVEN at Athens
// (grKtimatologioClient.ts / grParcelProvider.ts carry the endpoint + the KAEK proof). What is
// deferred is the two shared-infrastructure wiring steps this lane may not perform under the
// barrel protocol, each named in {@link GREECE_ROUTING_DEFERRAL}:
//   (1) add a GR boundary polygon to `jurisdiction/data/nationalBoundaries.json` (+ its resolver
//       row) so `claimsNation('GR')` can become true — the L-12871 resolver's job;
//   (2) add a `gr` row to `server/jurisdiction/euCadastreProxy.js` so `/api/parcel/gr` forwards
//       to the ArcGIS FeatureServer — the PROXY-EE-LT-PL lane's job for a new country.
// Until BOTH land, the registry row is correct and dormant. It is written as `claimsNation('GR')`
// exactly so it lights up automatically the moment step (1) lands — never on a rectangle.
//
// ⚠ THIS MODULE DOES NOT REGISTER ITSELF beyond the single row the orchestrator applies from
// audit/europe-adapters-2/2026-09-02/barrel-additions-gr.txt (`parcelProviders/registry.ts` is a
// SHARED file). `GREECE_BBOX` is exported ONLY as the row's specificity-metric entry in
// `REGION_BBOX`, exactly as ESTONIA_BBOX / SWEDEN_BBOX are — it is not a routing authority.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Greece — mainland + the Ionian (Othonoi/Corfu west ≈ 19.3°E), the Aegean and the Dodecanese
 * (Kastellorizo/Megisti east ≈ 29.65°E), Crete + Gavdos (south ≈ 34.8°N, the southernmost point
 * of Europe) up to the Evros/Macedonia frontier (north ≈ 41.75°N). A COARSE rectangle that
 * deliberately includes slivers of Albania / North Macedonia / Bulgaria / Turkey rather than
 * clipping real Greek land — safe precisely because routing is `claimsNation('GR')`, never this
 * box (and none of those four neighbours is a registered cadastral row).
 */
export const GREECE_BBOX: Bbox = { minLat: 34.7, maxLat: 41.8, minLon: 19.3, maxLon: 29.7 };

/**
 * True when a WGS84 point falls inside {@link GREECE_BBOX}. Pure; never throws.
 *
 * ⛔ NOT A ROUTING PREDICATE. The registry row's `contains` is `claimsNation('GR')`, decided on
 * boundary geometry by the national-jurisdiction resolver (GRC modelled since the 2026-09-03
 * boundary wave). This helper exists for the specificity metric and for tests that need to name a Greek
 * point without invoking the resolver; using it to route would be exactly the L-12871 defect.
 */
export function isInGreece(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= GREECE_BBOX.minLat &&
        lat <= GREECE_BBOX.maxLat &&
        lon >= GREECE_BBOX.minLon &&
        lon <= GREECE_BBOX.maxLon
    );
}

/**
 * The routing-leg deferral, AS DATA so a test can assert it rather than trust the header. Greece's
 * PARCEL data is live; its ROUTING waits on two shared-infrastructure edits this lane cannot make.
 * `reviewBy` is the date after which this deferral must be re-decided explicitly (the SE pattern,
 * L-12879) — not silently extended.
 */
export const GREECE_ROUTING_DEFERRAL = Object.freeze({
    owner: 'lane GR (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** The measured evidence the resolver does not claim Greece. */
    evidence:
        'resolveNationalJurisdiction(37.9755,23.7348 Athens) → {ok:false, reason:"no-national-candidate"}; ' +
        'GR absent from jurisdiction/data/nationalBoundaries.json (16 modelled: CH DE DK EE ES FI FR IT LT LU NL NO PL PT SA SE)',
    /** What must happen for `claimsNation("GR")` to be able to return true. */
    retiredBy: [
        'add a GR boundary polygon (+ resolver row) to jurisdiction/data/nationalBoundaries.json so ' +
            'resolveNationalJurisdiction claims GR on boundary geometry (the L-12871 resolver owns this file)',
        'add a `gr` source row to server/jurisdiction/euCadastreProxy.js so /api/parcel/gr forwards to the ' +
            'GEOTEMAXIA_LEITOURGOUN FeatureServer and normalises to WGS84 (the PROXY-EE-LT-PL lane pattern)',
    ] as const,
    /** Assert-by date: after this the routing deferral is a decision that must be re-taken. */
    reviewBy: '2027-03-01',
    /**
     * ⭐ PARTIALLY RETIRED 2026-09-03 (lane BOUNDARY-WAVE): retiredBy[0] landed — GRC entered
     * jurisdiction/data/nationalBoundaries.json as a claimable country (regionCode 'GR', ne_10m
     * pipeline validated against the SI lane's fixture) together with its land neighbours
     * ALB/MKD/TUR as refusal-only members (BGR promoted claimable in the same wave), and
     * ['GRC', isInGreece] entered CANDIDATE_PREFILTERS. Athens/Thessaloniki/Heraklion/Rhodes now
     * CLAIM GR; Edirne/İzmir/Kaş refuse naming TUR. retiredBy[1] ALSO landed 2026-09-03 — lane
     * PROXY-LEGS wired the euCadastreProxy.js `gr` row, so /api/parcel/gr serves clicks. Both
     * halves closed; the record stays as dated history.
     */
    boundaryRetiredOn: '2026-09-03',
});
