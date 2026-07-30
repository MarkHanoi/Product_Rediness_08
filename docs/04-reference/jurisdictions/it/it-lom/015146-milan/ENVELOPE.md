# ENVELOPE — Milano (ISTAT 015146)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Agenzia delle Entrate INSPIRE Catasto WFS (national) | ⚠ source verified-live but NOT wired (`parcelProviders/registry.ts` has no `isInItaly`) |
| **S2 — router predicate** | per-city bbox / `isInItaly` | ❌ none |
| **S3 — zone source** | PGT / TUC ledger GIS | ❌ no zone-letter key; perequation ledger not evidently queryable |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none (registry is ES-only) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers** —
Milan's operative model is **parcel-and-ledger** (TUC + perequation), not zone-and-table, so a conventional
FAR/coverage pack cannot represent it; a ledger-aware envelope kind is a prerequisite (`LEGISLATION-RATE.md`).
The only structurally-queryable value today is the DM 1444 national ceiling (useless as an operative value).
An absent envelope costs nothing; a confident wrong one costs credibility.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`.*
