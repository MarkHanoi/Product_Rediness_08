# RISK-REGISTER — Munich / München (AGS 09162)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Presenting an OSM footprint as a legal parcel | Munich routes to `footprint-fallback` (`registry.ts`); the verdict `kind` is labelled footprint, never cadastral (C58 §1.4). PARCEL axis stays `not-assessed`. |
| R2 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). The ~18 % prior in `LEGISLATION-RATE.md` is flagged unverified, never laundered into the composite. |
| R3 | Assuming DiPlanung already delivers structured attributes | DiPlanung is mandatory from **31 Oct 2026** but its API schema is unfetched; a pack built now targets an interim system (README §"critical scheduling risk"). Treat as `pending` until the endpoint + attributes are probed. |
| R4 | Claiming a Munich B-Plan WFS exists | Measured negative: all probed Munich/Bavaria WFS paths returned 404 (LEGISLATION-RATE.md). Do not assert a structured zone source until an endpoint is live-confirmed. |
| R5 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. TERRAIN is `not-assessed`/`outside-coverage` (no DTM for Bavaria), NOT a fabricated rung-50. |
| R6 | Claiming measured heights while LoD2 is licence-blocked | HEIGHTS `not-assessed`/`license-restriction`; Bavaria LoD2 terms unconfirmed → never reported as measured. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
