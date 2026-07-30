# RISK-REGISTER — Aalborg (kommune 0851)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing the national ~96 % as Aalborg's LEGISLATION score | Axis 2 stays `not-assessed`; the ~96 % is the *country* prior, not a per-city measured fill (§CONTEXT-DATA-HONESTY). |
| R2 | Reusing Copenhagen's `dkPerimeterBlock` STUDY band here | It is Copenhagen-specific (L-619); every FAR/height/band value is per-plan (C58 §1.2). ENVELOPE stays `not-assessed`. |
| R3 | Reading `not-assessed` TERRAIN as 0 % | No terrain bake row for this bbox — unmeasured, not absent. `not-assessed ≠ 0 %` (C63 §1.2). |
| R4 | Claiming measured heights before a probe | HEIGHTS `not-assessed`: DHM nDSM join is apikey-gated → OSM `assumed` without the key; no histogram probed. |
| R5 | Rendering an estimated triple where Plandata lacks numbers | `dkPlandataRefusal` returns a cited refusal, never the generic 3/1.5/3·12 m·FAR 2 estimate. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), the `context-data-honesty-family` memory.*
