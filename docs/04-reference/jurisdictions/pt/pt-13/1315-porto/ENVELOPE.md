# ENVELOPE — Porto (DICOFRE 1315)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | national cadastre provider | ❌ no PT provider wired (`parcelProviders/registry.ts` ES/FR/NL/NO/DE/NRW/CH/DK/SA only); Carta Cadastral misses the Porto core |
| **S2 — router predicate** | per-city bbox / `isInPortugal` | ❌ none |
| **S3 — zone source** | SNIT PDMP zone WFS (`snit-mais.dgterritorio.gov.pt`) | ❌ not wired (research-lead only) |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none (registry is ES-only) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers** —
every índice/cércea/afastamento value is per-PDMP-categoria (C58 §1.2). Porto additionally requires a new
C58 `fabricDerivedHeight` GeometricRule kind before its dominant *moda da cércea* (fabric-derived height)
zones can be packed — even a complete OCR pipeline cannot represent them without the schema amendment
(`LEGISLATION-RATE.md`). An absent envelope costs nothing; a confident wrong one costs credibility.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`.*
