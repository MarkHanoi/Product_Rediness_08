# RISK-REGISTER — Helsinki (kuntanumero 091)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another plan's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Reporting the national ~55–65 % Ryhti prior as the Axis-2 score | the `LEGISLATION-RATE.md` band is the coarse national prior (Ryhti item schema unconfirmed), NOT the L-449 count; Axis 2 stays `not-assessed`. |
| R4 | Calling the OSM footprint a legal parcel | no `isInFinland` cadastral provider is wired → PARCEL stays `not-assessed`; the footprint is labelled a footprint (C57 §L-640). |
| R5 | Claiming a wired height source | `heightSources.mjs` returns `no-source` for helsinki; the open LoD2 is a documented CANDIDATE, not wired → HEIGHTS `not-assessed`. |
| R6 | Claiming TERRAIN is baked/verified | rung capped at **50**; the FI DEM is FREE-key-gated (`MML_API_KEY`) — 50 asserts "configured", not "confirmed"; no `terrain.verify.mjs` round-trip. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
