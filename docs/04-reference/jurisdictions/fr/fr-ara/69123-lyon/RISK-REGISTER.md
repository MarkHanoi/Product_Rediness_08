# RISK-REGISTER — Lyon (INSEE 69123)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Treating the ~42 % structured-fill prior as the Axis-2 score | The `LEGISLATION-RATE.md` ~42 % is a COARSE prior; Axis 2 needs L-449-verified per-clau counts + a signed `VERIFICATION.md` (still OPEN). |
| R4 | Over-claiming `pluhauteur` coverage | The `pluhauteur` null-rate / parcel-coverage fraction is UNPROBED — height fill % is not yet known; do not assert it. |
| R5 | Claiming measured context heights before a bake | HEIGHTS `not-assessed` — BD TOPO measured-CAPABLE but the per-city bake is not landed. |
| R6 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. |
| R7 | Missing the Lyon/Villeurbanne overlay exception | The two core communes use a separate `périmètres de hauteurs de façades` overlay, not the `pluhauteur` attribute — a pack MUST branch on it, not assume the outer-commune path. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
