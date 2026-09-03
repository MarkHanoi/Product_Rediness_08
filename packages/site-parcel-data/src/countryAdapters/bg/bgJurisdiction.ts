// LANE BG — BULGARIA (BG) · the routing predicate seat + national bbox, mirroring the GR/EE/LT
// exemplars (`countryAdapters/gr/grJurisdiction.ts`): a coarse WGS84 rectangle that ONLY serves as
// the specificity metric for the parcel registry. It NEVER decides nationality — routing is
// `claimsNation('BG')` (boundary geometry), per the L-12871/L-12887 national-jurisdiction resolver.
// The cadastre's own `absent` is the real "no parcel here" answer; this box never asserts coverage.
//
// ⛔ MEASURED ROUTING BLOCKER — 2026-09-03 (LANE BG). BULGARIA IS NOT ONE OF THE COUNTRIES THE
// NATIONAL-JURISDICTION RESOLVER MODELS. `jurisdiction/data/nationalBoundaries.json` `countries`
// carries CH·DE·DK·EE·ES·FI·FR·IT·LT·LU·NL·NO·PL·PT·SE + the four Gulf states (ARE·KWT·BHR·OMN),
// and BGR is NOT among them — nor is it a refusal-only `neighbours` entry (measured this machine:
// `"BGR" in countries` → false; `"BGR" in neighbours` → false). THEREFORE `claimsNation('BG')` —
// the `contains` predicate the BG registry row uses — is FALSE at every Bulgarian point today, and
// the row is REGISTERED-BUT-INERT: a Sofia click falls to the universal OSM footprint (honest),
// never to a wrong-country cadastre (the resolver refuses cleanly rather than mis-claiming a
// neighbour, so there is no misroute to self-correct).
//
// ⭐ THIS IS A DECLARED, NAMED DEFERRAL OF THE *ROUTING* LEG — NOT of the parcel DATA. The GCCA/AGKK
// INSPIRE Cadastral-Parcels service is LIVE and KEYLESS and was PROVEN at Sofia
// (bgCadastreClient.ts / bgParcelProvider.ts carry the endpoint + the identifier proof
// `68134.100.5`). What is deferred is the two shared-infrastructure wiring steps this lane may not
// perform under the barrel protocol, each named in {@link BG_ROUTING_DEFERRAL}:
//   (1) add a BG boundary polygon (+ resolver prefilter row) to
//       `jurisdiction/data/nationalBoundaries.json` so `claimsNation('BG')` can become true — the
//       L-12871 resolver's job (with the RS/RO/GR/TR/MK land-neighbour integrity requirement, so a
//       coastal-rescue never annexes a Serbian/Romanian/Greek/Turkish/N-Macedonian border point);
//   (2) add a `bg` row to `server/jurisdiction/euCadastreProxy.js` so `/api/parcel/bg` forwards to
//       the ArcGIS REST cadastral-parcel query — the PROXY-EE-LT-PL lane's job for a new country.
// Until BOTH land, the registry row is correct and dormant. It is written as `claimsNation('BG')`
// exactly so it lights up automatically the moment step (1) lands — never on a rectangle.
//
// ⚠ THIS MODULE DOES NOT REGISTER ITSELF beyond the single row the orchestrator applies from
// audit/europe-adapters-2/2026-09-02/barrel-additions-bg.txt (`parcelProviders/registry.ts` is a
// SHARED file). `BULGARIA_BBOX` is exported ONLY as the row's specificity-metric entry in
// `REGION_BBOX`, exactly as GREECE_BBOX / ESTONIA_BBOX are — it is not a routing authority.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Bulgaria — the Timok/Serbia frontier west (≈ 22.36°E), the Black Sea coast east (Cape Shabla
 * ≈ 28.61°E), the Rhodope/Maritsa border with Greece & Turkey south (≈ 41.24°N) up to the Danube
 * with Romania north (≈ 44.22°N). A COARSE rectangle that deliberately includes slivers of Serbia /
 * Romania / Greece / Turkey / North Macedonia rather than clipping real Bulgarian land — safe
 * precisely because routing is `claimsNation('BG')`, never this box (and none of those neighbours is
 * a registered cadastral row that this rectangle could misfeed).
 */
export const BULGARIA_BBOX: Bbox = { minLat: 41.2, maxLat: 44.25, minLon: 22.3, maxLon: 28.65 };

/**
 * True when a WGS84 point falls inside {@link BULGARIA_BBOX}. Pure; never throws.
 *
 * ⛔ NOT A ROUTING PREDICATE. The registry row's `contains` is `claimsNation('BG')`, decided on
 * boundary geometry by the national-jurisdiction resolver (BGR modelled since the 2026-09-03
 * boundary wave). This helper exists for the specificity metric and for tests that need to name a Bulgarian
 * point without invoking the resolver; using it to route would be exactly the L-12871 defect.
 */
export function isInBulgaria(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= BULGARIA_BBOX.minLat &&
        lat <= BULGARIA_BBOX.maxLat &&
        lon >= BULGARIA_BBOX.minLon &&
        lon <= BULGARIA_BBOX.maxLon
    );
}

/**
 * The routing-leg deferral, AS DATA so a test can assert it rather than trust the header. Bulgaria's
 * PARCEL data is live; its ROUTING waits on two shared-infrastructure edits this lane cannot make.
 * `reviewBy` is the date after which this deferral must be re-decided explicitly (the SE pattern,
 * L-12879) — not silently extended.
 */
export const BG_ROUTING_DEFERRAL = Object.freeze({
    owner: 'lane BG (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** The measured evidence the resolver does not model Bulgaria. */
    evidence:
        'BGR absent from jurisdiction/data/nationalBoundaries.json — "BGR" in countries → false, ' +
        '"BGR" in neighbours → false (measured 2026-09-03). resolveNationalJurisdiction can never ' +
        'return regionCode "BG", so claimsNation("BG") is false at every Bulgarian point.',
    /** What must happen for `claimsNation("BG")` to be able to return true. */
    retiredBy: [
        'add a BG boundary polygon (+ the ["BGR", isInBulgaria] resolver prefilter row) to ' +
            'jurisdiction/data/nationalBoundaries.json so resolveNationalJurisdiction claims BG on ' +
            'boundary geometry — TOGETHER with RS/RO/GR/TR/MK land-neighbour integrity so a coastal ' +
            'rescue never annexes a border-band neighbour point (the L-12887 requirement; the ' +
            'L-12871 resolver owns this shared 1 MB file — do NOT add a rival bbox)',
        'add a `bg` source row to server/jurisdiction/euCadastreProxy.js so /api/parcel/bg forwards ' +
            'to inspire.cadastre.bg Cadastral_Parcel/MapServer/0/query (outSR=4326 point query, ' +
            'normalise nationalcadastralref → refcat + areavalue → areaM2) — the PROXY-EE-LT-PL pattern',
    ] as const,
    /** Assert-by date: after this the routing deferral is a decision that must be re-taken. */
    reviewBy: '2027-03-01',
    /**
     * ⭐ PARTIALLY RETIRED 2026-09-03 (lane BOUNDARY-WAVE): retiredBy[0] landed — BGR entered
     * jurisdiction/data/nationalBoundaries.json as a claimable country (regionCode 'BG') WITH the
     * L-12887 neighbour integrity it demanded: SRB/ROU/MKD/TUR as refusal-only members and GRC
     * claimable in the same wave. ['BGR', isInBulgaria] entered CANDIDATE_PREFILTERS.
     * Sofia/Plovdiv/Varna/Ruse now CLAIM BG; Giurgiu (RO bank of the Danube) refuses naming ROU.
     * retiredBy[1] (the /api/parcel/bg server proxy) is STILL OPEN — until it lands a BG match
     * self-corrects to the footprint on the proxy 404.
     */
    boundaryRetiredOn: '2026-09-03',
});
