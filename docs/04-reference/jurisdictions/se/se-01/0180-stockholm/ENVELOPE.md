# ENVELOPE — Stockholm (kommunkod 0180)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Lantmäteriet Fastighetsindelning (national) | ❌ NOT wired (`registry.ts` has no `isInSweden`) → OSM footprint fallback |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for 0180 |
| **S3 — zone source** | NGP / detaljplan provision codes | ⚠️ documented, geo-blocked from non-SE IPs, not wired |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. The Swedish envelope is a detaljplan-declared use +
a density metric (`byggnadsarea`/`exploateringstal`) + a `nockhöjd`/`byggnadshöjd` — expressed as structured
provision codes for post-2022 plans, PDF prose for pre-2022. A pack additionally needs the wired parcel
provider (S1) that Sweden currently lacks. **Do NOT reuse another plan's numbers** (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4.*
