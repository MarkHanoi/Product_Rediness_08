# San Francisco (0667000) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No rule pack exists and no numeric development value has been read from a primary source and
verified. Only the cheap physical axes (terrain, context) are live-verified and do not require the L-449 gate.

## Minimum checks before any SF pack value is shippable

| Check | Against | Verdict |
|---|---|---|
| 3DEP terrain live for SF bbox | `terrain.mjs` `us` / TNM products API | ✅ verified (national probe) — terrain only |
| DataSF height-and-bulk numeric field | live DataSF FeatureServer probe | ⬜ pending |
| DataSF zoning-district numeric attributes | live DataSF FeatureServer probe | ⬜ pending |
| Area-plan / DR overlay coverage | DataSF overlay layer probe | ⬜ pending |

## Caveats that must be visible in the product

- **Discretionary Review:** SF permits are subject to DR + conditional use — a computed height/bulk envelope is
  not a guaranteed entitlement; the product must state this.
- **Datum:** SF's steep hills make the 3DEP DTM datum (NEGATIVE geoidSepM in CONUS) load-bearing — terrain,
  buildings, and any envelope must share one vertical datum (L-584/C12).
- **Parcel:** an SF click resolves to an OSM **footprint**, not the Assessor parcel — labelled honestly.

**Sign-off:** OPEN — LEGISLATION + ENVELOPE stay `not-assessed`; nothing may be promoted to pack-shippable.
