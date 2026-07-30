# NEXT — Copenhagen / København (kommune 0101, Region Hovedstaden)

> Where PRYZM stopped, why, the smallest next step. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
> **Status:** SCAFFOLDED (C63 Phase-1) — the DK reference city: live keyless zoning + bespoke envelope/refusal
> code + a terrain row, all present; the axis *measurements* are not yet run.

## 1 — WHERE WE STOPPED
Scaffolded by the C63 Phase-1 audit. The **cheap** axes are cited-derived from real config (DATA-SOURCES 70 %,
CONTEXT 56 % — see `RATE.md`); the **human-gated / probe-gated** axes (PARCEL sample, per-city LEGISLATION,
ENVELOPE coverage, TERRAIN, HEIGHTS histogram) are honestly `not-assessed`. Copenhagen already carries the
substantive Denmark work (`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`, L-609/610/611, L-616, L-619).

## 2 — BLOCKERS
- 🟠 **Repo secrets not confirmed set** → PARCEL (`matrikel-dk`, `DATAFORDELER_USERNAME/PASSWORD`), HEIGHTS +
  TERRAIN (`DATAFORDELER_API_KEY`) all degrade gracefully to OSM/footprint without the credential. Confirm the
  secrets are wired in the bake/deploy env.
- 🔴 **L-449 VERIFICATION PENDING** → `dk/sources/VERIFICATION.md` has 2 open Danish-planner legal items;
  until signed, LEGISLATION + ENVELOPE cannot report `human-reviewed` (C63 §1.6).
- 🟡 **STUDY envelope only** → the `dkPerimeterBlock` karré band is a conservative human-gated study default,
  not a certified ordinance number (`ENVELOPE.md`).

## 3 — SMALLEST NEXT STEP
Run the byzone click-weighted dimensional-fill probe scoped to the 0101 bbox (reuse the L-609 Monte-Carlo
harness) — that is the first honest per-city LEGISLATION data point and needs no new source.

## 4 — ALREADY BUILT (do not redo)
- `DkZoningProvider` + `mapPlandataToZoningRecord` + `server/plandataZoningProxy.js` (keyless national zoning).
- `parcelProviders/registry.ts` `matrikel-dk` (credential-gated cadastral routing).
- `rulepacks/dkPerimeterBlock.ts` (L-619 karré band) + `rulepacks/dkPlandataRefusal.ts` (honest refusal).
- `terrain.mjs` TERRAIN_CITIES `copenhagen` row (DHM, apikey-gated).
- `bake.mjs` REGIONS `denmark` (OSM context) + `heightJoin:'dhm'` (DHM nDSM, apikey-gated).

*See also: `RATE.md` · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` · `../../DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`.*
