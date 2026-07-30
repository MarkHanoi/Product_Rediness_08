# RISK-REGISTER — Porto (DICOFRE 1315)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Presenting an OSM footprint as a legal parcel | No PT provider wired; Carta Cadastral misses the Porto core → PARCEL `not-assessed`, never an OSM stand-in. |
| R4 | Claiming terrain where the DTM is blocked | TERRAIN `not-assessed` (`license-restriction`) — the `pt` DEM source is `blocked`; the `terrain.mjs` `porto` row carries an explicit `blocked` flag. |
| R5 | Claiming measured heights before a bake | HEIGHTS `not-assessed`; `dgt_pt` is documented-and-capable, not baked. |
| R6 | Packing *moda da cércea* without the schema | ENVELOPE blocked until a C58 `fabricDerivedHeight` kind exists — never approximated by a fixed height. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
