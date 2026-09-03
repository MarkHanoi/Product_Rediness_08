// LANE ME-OPEN — THE QATAR COUNTRY ADAPTER. Assembles the QA parcel arms against the keyless
// CadastrePlots ArcGIS service, in the same §J shape the EE/DK adapters established:
//   country      → 'QA'
//   sources()    → QA_ADAPTER_SOURCES (typed rows, dated live probes; licence YELLOW/UNREAD)
//   parcel       → resolveQaCadastrePlotAtWgs84Point (CadastrePlots query, keyless; WGS84 geometry)
//   routing      → isInQatar / QATAR_BBOX (a bbox pre-filter — the national resolver REFUSES Doha,
//                  so the bbox row survives; see qaJurisdiction.ts for the audit)
//   rules        → NOT in this lane. Zone geometry is NATIONAL-NOW (Vector/Zoning), but the numeric
//                  rights behind RULEID are document-only (F extraction, me-sweep §4). Not minted here.
//
// Every export below is Qa-/QA_-prefixed or otherwise unique (isInQatar, QATAR_BBOX), so the
// src/index.ts star-export cannot collide with a sibling adapter.

export * from './qaJurisdiction.js';
export * from './qaCadastreClient.js';
export * from './qaParcelProvider.js';
export * from './qaSources.js';
