# RISK-REGISTER — Paris (INSEE 75056)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Treating the ~35 % structured-fill prior as the Axis-2 score | The `LEGISLATION-RATE.md` ~35 % is a COARSE prior; Axis 2 needs L-449-verified per-clau counts + a signed `VERIFICATION.md` (still OPEN). |
| R4 | Claiming measured heights before a bake | HEIGHTS `not-assessed` — BD TOPO is measured-CAPABLE but the per-city bake is blocked by §BDTOPO-CAP-TRUNCATE (317k buildings > WFS cap). |
| R5 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. |
| R6 | Overstating a Paris envelope (ABF / PSMV) | Any Paris envelope MUST carry ABF (500 m monument radii) + PSMV (secteurs sauvegardés) refusal overlays; absent the ADR-0274 gabarit KIND, ENVELOPE refuses rather than guesses. |
| R7 | Over-claiming zone-GIS as `live` | GPU `zone-urba` rated `documented` (0.5) in DATA-SOURCES — endpoint confirmed, `siteDispatch.ts` wiring NOT confirmed. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
