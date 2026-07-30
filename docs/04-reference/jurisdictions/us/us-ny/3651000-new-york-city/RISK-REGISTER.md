# RISK-REGISTER — New York City (FIPS 3651000)

> Fail-safe honesty guardrails (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk (how it could silently lie) | Axis | Guard (the honest default) |
|---|---|---|---|
| R1 | MapPLUTO `MaxAllwFAR` presented as a final per-parcel envelope | LEGISLATION + ENVELOPE | Stay `not-assessed`; SPDs + floor-area bonuses + TDR/air-rights make base FAR non-final (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | all | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | OSM/`assumed` 9 m carpet rendered as measured height | HEIGHTS/LOD | HEIGHTS `not-assessed`; `overture_us` is measured-CAPABLE but impl:`documented` (unwired); L-647 wireframe + C62 tier. |
| R4 | A footprint-fallback click presented as a legal parcel | PARCEL | `registry.ts` has no US entry → footprint-fallback labelled honestly (C57 §L-640); MapPLUTO exists but is not wired. |
| R5 | Claiming TERRAIN is verified | TERRAIN | Rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip; ⚠ 3DEP geoidSepM is NEGATIVE in CONUS. |
| R6 | Treating the ~12 % free / ~55 % commercial national prior as the Axis-2 score | LEGISLATION | The `LEGISLATION-RATE.md` prior is COARSE; Axis 2 needs L-449-verified per-clau counts + a signed `VERIFICATION.md` (OPEN). |
| R7 | Counting `sea` where a city is inland | CONTEXT | NYC IS coastal (Bay + rivers) → sea present via baked `natural=coastline` (L-637); this credit is city-specific, not universal. |

## Trip-wires

- If MapPLUTO / 3DEP nDSM is wired → LEGISLATION/HEIGHTS re-open (probe the fill/histogram).
- If the L-642 rail/trees re-bake lands → recompute CONTEXT (6/9 today).
- If the free NYC 3D model is confirmed LOD2 → HEIGHTS shortcut (re-rate).

---
*Authority: C63 §3.1 · C62. Protects: `RATE.md honestyOk`.*
