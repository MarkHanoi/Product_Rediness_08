# ENVELOPE — Berlin (AGS 11000)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | ALKIS (Germany) | ⚠️ NRW-only (`alkis-nrw`); Berlin falls to **footprint-fallback** (`isInGermany`→`footprint`, `registry.ts`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for 11000 (footprint-fallback covers the point) |
| **S3 — zone source** | B-Plan / regime layer wired into the solver | ❌ not wired (FIS-Broker / `gdi.berlin.de/services/wfs/bplan` documented, HTTP 200, but NOT in `siteDispatch`) |
| **S4 — rule pack** | `rulepacks/de*.ts` | ❌ none |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none (zero DE packs registered) |

No solver coverage can be measured until a pack exists. Berlin is **structurally the most expensive** German
city (README §"Why Berlin is last"): a per-parcel **regime classifier** (§30 B-Plan / 1958-60 Baunutzungsplan /
§34 / §35) must run *before* any numeric sourcing, and two of the four regimes (§34, §35) yield **no numeric
rule by law**. Baunutzungsplan-1958/60 figures carry a judicial *funktionslos* voidance risk (OVG Berlin-Brandenburg
2020, Az. 2 B 10.17 — a GFZ 1.5 voided in Neukölln). **Do NOT reuse another city's numbers, and never present a
Baunutzungsplan figure as `published`** — every GRZ/GFZ/Höhe is per-plan (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./README.md` §1, `./LEGISLATION-RATE.md`.*
