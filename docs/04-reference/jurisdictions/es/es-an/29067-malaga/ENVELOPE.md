# ENVELOPE — Málaga (INE 29067)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national) | ✅ national provider wired |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for 29067 |
| **S3 — zone source** | no wired regional zone-GIS | ❌ none |
| **S4 — rule pack** | `rulepacks/es*.ts` | ❌ none |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers** —
every height/FAR/coverage/street-width value is per-municipality (C58 §1.2). An absent envelope costs
nothing; a confident wrong one costs credibility.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4.*
