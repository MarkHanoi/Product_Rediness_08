// LANE ME-OPEN — THE ISRAEL COUNTRY ADAPTER. Assembles the IL parcel arms against the keyless
// govmap channel, in the same §J shape the EE/DK adapters established (mirror the proven executor,
// no rival):
//   country      → 'IL'
//   sources()    → IL_ADAPTER_SOURCES (typed rows, dated live probes; licence YELLOW/UNREAD)
//   parcel       → resolveIlParcelAtWgs84Point (govmap IdentifyByXY, keyless; ITM↔WGS84 in the leg)
//   routing      → isInIsrael / ISRAEL_BBOX (a bbox pre-filter — the national resolver REFUSES every
//                  Israeli point, so the bbox row survives; see ilJurisdiction.ts for the audit)
//   rules        → NOT in this lane. Plan geometry is NATIONAL-NOW at iplan (ags.iplan.gov.il), but
//                  the numeric rights (FAR/heights/units) live in mavat plan documents — Europe-class
//                  F extraction with a perfect pl_number join key (me-sweep §8). Not minted here.
//
// Every export below is Il-/IL_-prefixed or otherwise unique (isInIsrael, ISRAEL_BBOX, wgs84ToItm,
// itmToWgs84, ITM_PARAMS), so the src/index.ts star-export cannot collide with a sibling adapter.

export * from './ilItm.js';
export * from './ilJurisdiction.js';
export * from './ilGovmapClient.js';
export * from './ilParcelProvider.js';
export * from './ilSources.js';
