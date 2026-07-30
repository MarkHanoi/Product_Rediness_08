# ENVELOPE — Oslo (kommune 0301)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Matrikkelen Eiendomskart Teig (national, Kartverket) | ✅ national provider wired + live (`isInNorway`→`matrikkel-no`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for 0301 |
| **S3 — zone source** | reguleringsplan / SOSI Plan zone-GIS | ⚠️ Planinnsyn viewer only; programmatic WFS UNCONFIRMED — not wired |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

No solver coverage can be measured until a pack exists. The Norwegian mechanism is a `grad av utnytting`
(%-BYA / BRA) + plan-set height (`mønehøyde`/`gesimshøyde`), with a national §29-4 default
(`gesimshøyde ≤ 8 m` / `mønehøyde ≤ 9 m`; setback `max(½H, 4 m)`) applying only to no-plan parcels. The
per-parcel numeric utilisation lives in bestemmelser PROSE (national SOSI stub unfilled) — so an envelope
needs either the plan-text NLP pipeline or the faktaark automation confirmed first (see `NEXT.md`).
**Do NOT reuse another municipality's numbers** — every value is per-plan (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `LEGISLATION-RATE.md`.*
