# RISK-REGISTER — Stockholm (kommunkod 0180)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another plan's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Reporting the national ~40 % (or ~20–30 %) prior as the Axis-2 score | the `LEGISLATION-RATE.md` band is the coarse national prior (geo-blocked, unprobed for Stockholm), NOT the L-449 count; Axis 2 stays `not-assessed`. |
| R4 | Calling the OSM footprint a legal parcel | no `isInSweden` cadastral provider is wired → PARCEL stays `not-assessed`; the footprint is labelled a footprint, never a parcel (C57 §L-640). |
| R5 | Claiming TERRAIN is baked/verified | rung capped at **50**; the SE DEM is FREE-key-gated (`LANTMATERIET_API_KEY`) — 50 asserts "configured", not "confirmed"; no `terrain.verify.mjs` round-trip. |
| R6 | Claiming measured heights before a bake | HEIGHTS `not-assessed` (measured-CAPABLE via LiDAR nDSM); no measured source baked. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
