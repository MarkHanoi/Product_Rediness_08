# ENVELOPE — Paris (INSEE 75056)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | IGN PARCELLAIRE EXPRESS (national, `ign-fr`) | ✅ national provider wired (`parcelProviders/registry.ts`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none specific to 75056 (national `isInFrance` only) |
| **S3 — zone source** | GPU `zone-urba` (UG/UGSU/UV/N) | ⚠️ endpoint documented, NOT wired into `siteDispatch.ts` |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for Paris |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Structural blocker (Paris-specific).** Paris does NOT use a street-width height table. The buildable
envelope is a two-layer geometric construction: (1) a **hauteur plafond** read from the graphic plan,
measured from a computed **surface de nivellement de l'îlot** (block-level levelling surface — a derived
datum, not street/sea level), and (2) a **gabarit-enveloppe** oblique formula (`H = P + 3.00 + D` at side
boundaries; `H = P + 4.00` vis-à-vis). The `plub_filet` layer (20,644 records) stores step (1) as a coded
letter (`haut` M/K/C/B/G), and step (2) lives in PLU bioclimatique article UG.10 text. **A new engine KIND
(ADR-0274 — reference-surface + gabarit) is required before any Paris parcel-level envelope is possible.**
See `LEGISLATION-RATE.md` for the full mechanism analysis.

No solver coverage can be measured until a pack (and ADR-0274) exist. **Do NOT reuse another
municipality's numbers** — every height/gabarit value is per-municipality (C58 §1.2). ABF perimeters
(~700 classified monuments → 500 m radii covering a large fraction of private land) and PSMV secteurs
sauvegardés (Le Marais, 1er–7e) are mandatory refusal overlays before any Paris envelope is shippable.

*Cross-refs: C58, ADR-0279, ADR-0274 (proposed), C63 §3 Axis 4, `./LEGISLATION-RATE.md`.*
