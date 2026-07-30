# NEXT — Vitoria-Gasteiz (INE 01059, País Vasco)

> Where PRYZM stopped, why, the smallest next step. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
> **Status:** SCAFFOLDED (C63 Phase-1) — terrain + national parcel routing present; NO rule pack; heights unbaked.

## 1 — WHERE WE STOPPED
Scaffolded by the C63 Phase-1 audit. The **cheap** axes are cited-derived from real config (DATA-SOURCES,
TERRAIN, CONTEXT — see `RATE.md`); the **human-gated** axes (PARCEL sample, LEGISLATION,
ENVELOPE, HEIGHTS) are honestly `not-assessed`. No demo has been driven here.

## 2 — BLOCKERS
- 🔴 **No rule pack** → no envelope. Unblock: source the governing instrument + zones (§LEGISLATION-RATE), author `es-01059-vitoria-gasteiz`, sign `sources/VERIFICATION.md` (L-449).
- 🔴 **Heights unbaked** → see `HEIGHT.md`.
- 🔴 **Foral cadastre** → national Catastro does not serve this municipality (`priority_318.csv` `T3-FORAL-CADASTRE-BLOCKER`); a real parcel needs the Basque/Navarra foral cadastre.

## 3 — SMALLEST NEXT STEP
Enumerate the distinct zones over the 01059 extent from the competent planning authority (one query),
cite the most common zone's rule shape in `sources/SOURCES.md`. That first cited clause is the first
honest LEGISLATION data point.

## 4 — ALREADY BUILT (do not redo)
- Terrain bake row `terrain.mjs` TERRAIN_CITY `vitoria` (PNOA MDT).
- National parcel routing `parcelProviders/registry.ts` (`isInSpain`→Catastro, foral-blocked here).
- Baked OSM context via `bake.mjs` REGIONS `spain`.

*See also: `RATE.md` · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md`.*
