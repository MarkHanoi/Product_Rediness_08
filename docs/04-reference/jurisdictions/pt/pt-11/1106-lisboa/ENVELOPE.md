# ENVELOPE — Lisboa (DICOFRE 1106)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | national cadastre provider | ❌ no PT provider wired (`parcelProviders/registry.ts` ES/FR/NL/NO/DE/NRW/CH/DK/SA only); Carta Cadastral misses the Lisboa core |
| **S2 — router predicate** | per-city bbox / `isInPortugal` | ❌ none |
| **S3 — zone source** | SNIT PDM zone WFS (`snit-mais.dgterritorio.gov.pt`) | ❌ not wired (research-lead only) |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none (registry is ES-only) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers** —
every índice/altura/afastamento value is per-PDM-categoria (C58 §1.2). Lisboa additionally requires a new
C58 `transferableRights` overlay kind before a pack can correctly represent achievable FAR (*créditos de
construção*, PDM incentives Arts. 84/88/89 — see `LEGISLATION-RATE.md` Layer 3). An absent envelope costs
nothing; a confident wrong one costs credibility.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`.*
