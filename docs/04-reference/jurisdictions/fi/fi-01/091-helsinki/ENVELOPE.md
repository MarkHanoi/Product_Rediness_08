# ENVELOPE — Helsinki (kuntanumero 091)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | MML Kiinteistörekisteri (national) | ❌ NOT wired (`registry.ts` has no `isInFinland`) → OSM footprint fallback |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for 091 |
| **S3 — zone source** | Ryhti `kaavatietomalli` OGC API | ⚠️ documented (live+public), item schema TBD, not wired |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. The Finnish envelope is an asemakaava-declared use +
an efficiency ratio (`tehokkuusluku` e-luku) + a storey count (`kerrosluku`) / height — carried structurally
in the Ryhti model for live regions. A pack additionally needs the wired parcel provider (S1) Finland
currently lacks, and the Ryhti item schema (S3) resolved. **Do NOT reuse another plan's numbers** (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4.*
