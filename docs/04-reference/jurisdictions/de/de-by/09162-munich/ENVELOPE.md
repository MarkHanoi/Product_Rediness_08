# ENVELOPE — Munich / München (AGS 09162)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | ALKIS (Germany) | ⚠️ NRW-only; Munich falls to **footprint-fallback** (`isInGermany`→`footprint`, `registry.ts`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for 09162 |
| **S3 — zone source** | B-Plan / XPlanung WFS wired into the solver | ❌ no endpoint discovered (all Munich/Bavaria WFS paths 404); DiPlanung mandatory 31 Oct 2026, API TBD |
| **S4 — rule pack** | `rulepacks/de*.ts` | ❌ none |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none (zero DE packs registered) |

No solver coverage can be measured until a pack exists. Munich is the **highest-potential** German city
(README §"Why Munich scores lower"): its low state is an **endpoint-discovery gap**, not a data-quality gap —
if DiPlanung (mandatory in Bavaria from Oct 2026) returns structured XPlanGML with GRZ/GFZ/Höhe, the legislation
prior jumps materially. One bright spot is already sourced: **BayBO Art. 6 Abstandsflächen = 0.4H (0.2H in GE/GI),
minimum 3 m** (`gesetze-bayern.de/Content/Document/BayBO-6`, valid from 01.05.2026) — the clearest setback rule of
any city studied. **Do NOT reuse another city's GRZ/GFZ/Höhe** — every value is per-plan (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./README.md`, `./LEGISLATION-RATE.md`.*
