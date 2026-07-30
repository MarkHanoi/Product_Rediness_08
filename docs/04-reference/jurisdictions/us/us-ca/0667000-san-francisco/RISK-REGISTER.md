# RISK-REGISTER — San Francisco (FIPS 0667000)

> Fail-safe honesty guardrails (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk (how it could silently lie) | Axis | Guard (the honest default) |
|---|---|---|---|
| R1 | A DataSF height-and-bulk figure presented as a final envelope | LEGISLATION + ENVELOPE | Stay `not-assessed`; area/specific plans + Discretionary Review supersede the base (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | all | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | OSM/`assumed` 9 m carpet rendered as measured height | HEIGHTS/LOD | HEIGHTS `not-assessed`; `overture_us` measured-CAPABLE but impl:`documented` (unwired); L-647 wireframe + C62 tier. |
| R4 | A footprint-fallback click presented as a legal parcel | PARCEL | `registry.ts` has no US entry → footprint-fallback labelled honestly (C57 §L-640); SF Assessor parcels exist but are not wired. |
| R5 | Claiming TERRAIN is verified | TERRAIN | Rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip; ⚠ 3DEP geoidSepM NEGATIVE in CONUS; steep SF relief makes the datum load-bearing. |
| R6 | Applying NYC's FAR KIND to SF | ENVELOPE | SF uses use-district × height-and-bulk, NOT a citywide FAR — the wrong KIND is a wrong SHAPE (ADR-0270). |
| R7 | Counting `sea` where a city is inland | CONTEXT | SF IS a peninsula (Pacific + Bay) → sea present via baked `natural=coastline` (L-637); city-specific credit. |

## Trip-wires

- If DataSF zoning/height-bulk is wired → LEGISLATION/ENVELOPE re-open (probe schema fill).
- If Overture/3DEP nDSM is wired → HEIGHTS re-opens (probe histogram).
- If the L-642 rail/trees re-bake lands → recompute CONTEXT (6/9 today).

---
*Authority: C63 §3.1 · C62. Protects: `RATE.md honestyOk`.*
