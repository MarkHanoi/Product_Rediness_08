# NEXT — Aarhus (kommune 0751, Region Midtjylland)

> Where PRYZM stopped, why, the smallest next step. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
> **Status:** SCAFFOLDED (C63 Phase-1) — nationally covered (keyless Plandata zoning + credential-gated Matrikel
> + DHM heights + national OSM context), NO city-specific pack / STUDY default / terrain row.

## 1 — WHERE WE STOPPED
Scaffolded by the C63 Phase-1 audit. The **cheap** axes are cited-derived (DATA-SOURCES 70 %, CONTEXT 56 % —
see `RATE.md`); the **probe-/human-gated** axes are honestly `not-assessed`. No demo has been driven here — the
substantive Denmark work lives at the country level + Copenhagen.

## 2 — BLOCKERS
- 🟠 **Repo secrets not confirmed set** → PARCEL (`DATAFORDELER_USERNAME/PASSWORD`), HEIGHTS + TERRAIN
  (`DATAFORDELER_API_KEY`) degrade to OSM/footprint without the credential.
- 🔴 **No terrain bake row** → `terrain.mjs` registers only `copenhagen`; add a aarhus bbox row to bake DHM
  terrain here.
- 🔴 **L-449 VERIFICATION PENDING** (national) → gates LEGISLATION + ENVELOPE `human-reviewed` (C63 §1.6).

## 3 — SMALLEST NEXT STEP
Run the byzone click-weighted dimensional-fill probe scoped to the 0751 bbox (reuse the L-609 harness) —
the first honest per-city LEGISLATION data point, no new source needed.

## 4 — ALREADY BUILT (do not redo)
- `DkZoningProvider` + `mapPlandataToZoningRecord` + `server/plandataZoningProxy.js` (national keyless zoning).
- `parcelProviders/registry.ts` `matrikel-dk` (national credential-gated cadastral routing).
- `bake.mjs` REGIONS `denmark` (OSM context, whole country) + `heightJoin:'dhm'` (DHM nDSM, apikey-gated).

*See also: `RATE.md` · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` · `../../DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`.*
