# RISK-REGISTER — Amsterdam (CBS 0363)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another gemeente's omgevingsplan numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value. omgevingsplan values are per-gemeente (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset (DATA-SRC · TERRAIN · CONTEXT) + flagged `partial`. |
| R3 | Reporting 3DBAG heights as live on the deployed tiles | HEIGHTS `not-assessed` — 3DBAG is measured-CAPABLE but the whole-country bake refuses it per-tile → deployed tiles render OSM `assumed`; per-city bake unlanded. Never claim the histogram before it is probed. |
| R4 | Claiming a PARCEL quality number | PARCEL `not-assessed` — the Kadaster BRK provider is wired + live (measured-capable) but no `computeParcelConfidence` sample has been run. Capability ≠ measurement. |
| R5 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. |
| R6 | Assuming the omgevingsplan governs (ignoring transitional law) | Under the Omgevingswet transition (1 Jan 2024), a parcel may still be governed by a legacy bestemmingsplan; resolve precedence before shipping. |
| R7 | Over-claiming the zone-GIS as `live` | omgevingsplan / DSO rated `documented` (0.5) in DATA-SOURCES — national register known but NOT probed/wired this audit. |
| R8 | Presenting the 90 % DATA-SOURCES as overall completion | DATA-SOURCES 90 % is one axis (weight 15); overall is 71 % `partial`, and the human-gated axes (LEGISLATION/ENVELOPE/PARCEL/HEIGHTS) remain `not-assessed`. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns).*
