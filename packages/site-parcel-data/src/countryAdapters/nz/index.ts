// LANE NZ-EVERYWHERE — THE NEW ZEALAND COUNTRY ADAPTER (skeleton). Today it carries ONLY the routing
// half, in the §J shape the TR/AU adapters established:
//   country      → 'NZ'
//   routing      → isInNewZealand / NEW_ZEALAND_BBOX (a bbox pre-filter — the national resolver
//                  REFUSES every NZ point, so the bbox row survives; see nzJurisdiction.ts)
//   parcel       → SERVER-SIDE ONLY: `/api/parcel/nz` (server/jurisdiction/euCadastreProxy.js, the
//                  LINZ Data Service WFS, layer 50772 "NZ Primary Parcels", CC BY 4.0). LINZ requires
//                  an API key on every service, so per C57 §1.2 the key lives in LINZ_API_KEY on the
//                  BFF and the browser never sees it; the client uses the generic WfsParcelProvider.
//                  ⚠ WIRED-KEY-PENDING (2026-09-05): until the Fly secret is set the leg answers
//                  HTTP 503 `outcome:'unconfigured'` — a distinct, uncached failure, never `empty`.
//   sources()    → NOT in this lane (no typed NZ source rows are minted yet).
//   rules        → NOT in this lane. District plans are council-by-council (no national served-as-data
//                  zoning channel probed); not minted here.
//
// Every export below is Nz-/NEW_ZEALAND_-prefixed or otherwise unique (isInNewZealand,
// NEW_ZEALAND_BBOX), so the src/index.ts star-export cannot collide with a sibling.

export * from './nzJurisdiction.js';
