# ENVELOPE — Roma (ISTAT 058091)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Agenzia delle Entrate INSPIRE Catasto WFS (national) | ⚠ source verified-live but NOT wired (`parcelProviders/registry.ts` has no `isInItaly`) |
| **S2 — router predicate** | per-city bbox / `isInItaly` | ❌ none |
| **S3 — zone source** | PRG tessuto / NTA zone-GIS | ❌ no machine-readable WFS confirmed (NTA is PDF) |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none (registry is ES-only) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers** —
every PRG parameter is per-tessuto (C58 §1.2). Rome additionally requires resolving the direct/indirect
intervention classifier and the legally-contested *Carta per la Qualità* precedence before a pack can be
authored (`LEGISLATION-RATE.md`). An absent envelope costs nothing; a confident wrong one costs credibility.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`.*
