// LANE ME-OPEN — THE TURKEY COUNTRY ADAPTER. Assembles the TR parcel arms against the keyless TKGM
// channel, in the same §J shape the EE/DK adapters established:
//   country      → 'TR'
//   sources()    → TR_ADAPTER_SOURCES (typed rows, dated live probe; licence YELLOW/UNREAD)
//   parcel       → resolveTrParselAtWgs84Point (TKGM megsiswebapi.v3, keyless; WGS84 geometry;
//                  storey hint extracted from the `nitelik` description, never a normative height)
//   routing      → isInTurkey / TURKEY_BBOX (a bbox pre-filter — the national resolver REFUSES every
//                  Turkish point, so the bbox row survives; see trJurisdiction.ts for the audit)
//   rules        → NOT in this lane. İmar/zoning is document-only + municipal e-Devlet-gated
//                  (me-sweep §10), no national served-as-data channel; not minted here.
//
// Every export below is Tr-/TR_-prefixed or otherwise unique (isInTurkey, TURKEY_BBOX,
// extractStoreyHintFromNitelik), so the src/index.ts star-export cannot collide with a sibling.

export * from './trJurisdiction.js';
export * from './trTkgmClient.js';
export * from './trParcelProvider.js';
export * from './trSources.js';
