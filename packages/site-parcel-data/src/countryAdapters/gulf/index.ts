// LANE ME-GULF — GULF (GCC) parcel adapter · curated public surface (C74 §3.8 — the deferrals are
// declared IN the barrel, not only in a report). Every export is GULF_*/isIn<Country>/UAE_*/… named,
// so the package barrel's `export * from './countryAdapters/gulf/index.js'` cannot collide with an
// existing symbol (verified: grep of the package finds no prior definition of any name below).
//
// SIX PROBED JURISDICTIONS, ALL DECLARED DEFERRALS at the parcel axis:
//   AE-DU  Dubai        — vantage-network-fence  (Dubai Pulse / geodubai.dm.gov.ae TCP-timeout)
//   AE-AZ  Abu Dhabi    — waf                     (data.abudhabi F5 "Request Rejected" + AD-SDI NXDOMAIN)
//   SA     Saudi Arabia — token-sso               (Balady/momah ArcGIS 499 Token Required — L-606 delta)
//   KW     Kuwait       — no-open-channel          (PACI hosts TCP-unreachable / cert-expired)
//   BH     Bahrain      — ekey-identity            (SLRB behind national eKey; data.gov.bh = statistics)
//   OM     Oman         — no-open-channel          (NSDI drops foreign TCP; housing ministry WAF-403)
//
// The four Gulf COUNTRIES (AE/KW/BH/OM) are added to the national-jurisdiction resolver's boundary
// set (nationalBoundaries.json, same pinned ne_10m source) as CLAIMABLE rivals to Saudi, so the
// bboxes/predicates below are the resolver PRE-FILTERS — never a rival router (L-12871).

// ── the routing PRE-FILTER bboxes + predicates (for nationalJurisdictionResolver.ts) ──
export {
    type GulfBbox,
    UAE_BBOX,
    isInUAE,
    KUWAIT_BBOX,
    isInKuwait,
    BAHRAIN_BBOX,
    isInBahrain,
    OMAN_BBOX,
    isInOman,
} from './gulfJurisdiction.js';

// ── the DECLARED-DEFERRAL registry (gate class, transcript, reviewBy, retirement) ──
export {
    GULF_DEFERRED_TOKEN,
    type GulfGateClass,
    type GulfDeferral,
    GULF_DEFERRALS,
    assertGulfDeferralsNotExpired,
    gulfDeferredRefusal,
} from './gulfDeferrals.js';

// ── the parcel arm (one deferred resolver parameterised by regionCode) ──
export {
    GULF_PARCEL_PROVIDER_ID,
    type GulfCadastralParcel,
    GULF_PARCEL_REGION_CODES,
    type GulfParcelRegionCode,
    resolveGulfParcelAtWgs84Point,
    resolveGulfParcelById,
    isGulfDeferredRegion,
} from './gulfParcelProvider.js';
