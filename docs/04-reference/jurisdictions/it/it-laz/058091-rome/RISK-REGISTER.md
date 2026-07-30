# RISK-REGISTER — Roma (ISTAT 058091)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Reporting the verified-live Catasto WFS as `live` | It is verified-live but NOT wired in `parcelProviders/registry.ts` → DATA-SOURCES cadastre slot scored **`documented` (0.5)**, not `live`; PARCEL axis `not-assessed`. |
| R4 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded for `rome`. |
| R5 | Claiming measured heights where none exist | HEIGHTS `not-assessed` — Rome is a structural `no-source` (Lazio layer unconfirmed); never OSM-9 m presented as measured. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
