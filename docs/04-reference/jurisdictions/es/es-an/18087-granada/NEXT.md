# NEXT — Granada (INE 18087, Andalucía)

> Where PRYZM stopped, why, the smallest next step. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
> **Status:** SCAFFOLDED (C63 Phase-1) — terrain + national parcel routing present; NO rule pack; heights unbaked.

## 1 — WHERE WE STOPPED
Scaffolded by the C63 Phase-1 audit. The **cheap** axes are cited-derived from real config (DATA-SOURCES,
TERRAIN, CONTEXT — see `RATE.md`); the **human-gated** axes (PARCEL sample, LEGISLATION,
ENVELOPE, HEIGHTS) are honestly `not-assessed`. No demo has been driven here.

## 2 — BLOCKERS
- 🔴 **No rule pack** → no envelope. Unblock: source the governing instrument + zones (§LEGISLATION-RATE), author `es-18087-granada`, sign `sources/VERIFICATION.md` (L-449).
- 🔴 **Heights unbaked** → see `HEIGHT.md`.

## 3 — SMALLEST NEXT STEP
Enumerate the distinct zones over the 18087 extent from the competent planning authority (one query),
cite the most common zone's rule shape in `sources/SOURCES.md`. That first cited clause is the first
honest LEGISLATION data point.

## 4 — ALREADY BUILT (do not redo)
- Terrain bake row `terrain.mjs` TERRAIN_CITY `granada` (PNOA MDT).
- National parcel routing `parcelProviders/registry.ts` (`isInSpain`→Catastro).
- Baked OSM context via `bake.mjs` REGIONS `spain`.

*See also: `RATE.md` · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md`.*
