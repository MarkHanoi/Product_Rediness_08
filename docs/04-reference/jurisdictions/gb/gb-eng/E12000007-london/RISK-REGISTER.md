# RISK-REGISTER — Greater London (GSS E12000007)

> Fail-safe honesty guardrails (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk (how it could silently lie) | Axis | Guard (the honest default) |
|---|---|---|---|
| R1 | A London Plan density-matrix figure presented as an as-of-right envelope | ENVELOPE + LEGISLATION | Stay `not-assessed`; GB permission is discretionary — no by-right numeric envelope (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | all | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | OSM/`assumed` 9 m carpet rendered as measured height | HEIGHTS/LOD | HEIGHTS `not-assessed`; EA DSM−DTM derive is measured-CAPABLE but UNWIRED (`heightSources.mjs` = no-source); L-647 wireframe + C62 tier. |
| R4 | A footprint-fallback click presented as a legal parcel | PARCEL | `registry.ts` has no GB entry → footprint-fallback labelled honestly (C57 §L-640); HMLR index polygons are freehold index, not cadastre. |
| R5 | Claiming TERRAIN is verified | TERRAIN | Rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded this audit. |
| R6 | Wrong subdivision unit (City of London vs Greater London) | identity | Folder = `E12000007-london` (Greater London / GLA area), explicitly NOT the City of London LAU `E09000001`; documented in `COUNTRY-RATE.md §0`. |
| R7 | OS Building Heights assumed free | HEIGHTS · DATA-SOURCES | OS Building Heights is **commercial** — deliberately skipped; the free path is the EA DSM−DTM derive. |

## Trip-wires

- If `heightSources.mjs` gains a GB DSM−DTM fetcher → HEIGHTS re-opens (probe the histogram).
- If a Scottish/Welsh/NI city is tackled → EA terrain does NOT cover it; add its own source row.
- If the L-642 rail/trees/sea re-bake lands → recompute CONTEXT (currently 5/9).

---
*Authority: C63 §3.1 · C62. Protects: `RATE.md honestyOk`.*
