# ENVELOPE — Lyon (INSEE 69123)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | IGN PARCELLAIRE EXPRESS (national, `ign-fr`) | ✅ national provider wired (`parcelProviders/registry.ts`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none specific to 69123 (national `isInFrance` only) |
| **S3 — zone source** | GPU `zone-urba` + Grand Lyon `pluzone`/`pluhauteur` | ⚠️ endpoints documented/live-verified, NOT wired into `siteDispatch.ts` |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for Lyon |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Cheapest FR envelope path — but still no pack.** Unlike Paris (coded gabarit letters needing ADR-0274)
and Marseille (graphic-primacy), Lyon's `data.grandlyon.com` `plu_h_opposable.pluhauteur` layer gives
**direct absolute-metre** max heights (VERIFIED LIVE 2026-07-23, `last_update_fme` 2026-04-23) — no
decoding step. The blockers to a pack are: (1) `pluhauteur` null-rate / parcel-coverage fraction UNPROBED
(the single most important remaining probe); (2) `emprise au sol` (CES) + setbacks are confirmed NULL in
the GIS attributes → PDF règlement sourcing required; (3) the **Lyon + Villeurbanne** communes use a
separate `périmètres de hauteurs de façades` overlay (a structural exception inside the 58-commune PLU-H),
not the `pluhauteur` attribute path — an independent overlay-join integration.

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers** —
every value is per-municipality (C58 §1.2). See `LEGISLATION-RATE.md` for the full field-by-field analysis.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`.*
