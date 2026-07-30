# RISK-REGISTER — Berlin (AGS 11000)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Presenting an OSM footprint as a legal parcel | Berlin routes to `footprint-fallback` (`registry.ts`); the verdict `kind` is labelled footprint, never cadastral (C58 §1.4). PARCEL axis stays `not-assessed`. |
| R2 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). The ~28 % prior in `LEGISLATION-RATE.md` is flagged unverified, never laundered into the composite. |
| R3 | Shipping a Baunutzungsplan-1958/60 figure as current | Any Baunutzungsplan-derived value carries *funktionslos* voidance risk (OVG Bln-Bbg 2020, Az. 2 B 10.17); treat as `regime-undetermined` / refusal-with-caveat until a per-area case-law check (README §5). |
| R4 | "XPlanung exists → all parcels have numeric rules" | FALSE for Berlin: large former-East-Berlin areas are §34 (no numeric table by law); the regime classifier must run first. §34 fraction is unmeasured — the denominator is honest-unknown. |
| R5 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. TERRAIN is `not-assessed`/`outside-coverage` (no DTM for Berlin's Land), NOT a fabricated rung-50. |
| R6 | Claiming measured heights before a bake | HEIGHTS `not-assessed`: LoD2-DE Berlin is documented-not-wired; capability ≠ measurement. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
