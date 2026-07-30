# City RATE — master completion scorecard — Greater London (gb-eng, GSS E12000007)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three
     CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is
     not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `51%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Assessed subset = {DATA-SOURCES
> 15, TERRAIN 10, CONTEXT 5}, Σ = 30; overall = (0.50×15 + 0.50×10 + 0.556×5)/30 = 15.28/30 = **51 %**.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | `parcelProviders/registry.ts` has **no GB entry** → a London click resolves via `UNIVERSAL_FOOTPRINT_JURISDICTION` (footprint-fallback), not a cadastre. HM Land Registry INSPIRE Index Polygons are OGL but are **freehold index** extents (not legal parcels); OS MasterMap is licensed. No `computeParcelConfidence` sample has been run, and even when run a footprint-fallback jurisdiction is construction-capped low (C57 §L-640). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for London (`rulepacks/registry.ts` carries no GB pack); `sources/VERIFICATION.md` OPEN. GB planning is **discretionary** — there is no as-of-right numeric zoning envelope (no FAR/height field) to source, so the structured-fill national prior is honestly `NOT YET ASSESSED` (`../../LEGISLATION-RATE.md`). Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **50%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **none** (no keyless GB cadastre wired, `registry.ts` no GB entry → 0.0) · regional-zone-GIS **none** (discretionary planning, no national numeric zoning layer → 0.0) · building-height nDSM **documented** (EA LIDAR DSM−DTM derive, OGL v3, `GEO-DATA-SOURCING-MASTER.md`; `heightSources.mjs` maps `london → no-source` and OS Building Heights is commercial → derive is documented-but-unwired, 0.5) · terrain DEM **live** (`terrain.mjs` `gb` = EA LIDAR Composite DTM 1 m, keyless HTTP 200, live-probed 2026-07-25 → 1.0) · context-OSM **live** (`bake.mjs` REGIONS `london`, greater-london extract → 1.0). Mean = (0+0+0.5+1+1)/5 = 0.5. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack for London; solver coverage unmeasured (C58). GB has **no as-of-right envelope** — permission is discretionary (Local Plan + NPPF), so an envelope would require modelling Permitted Development Rights + Conservation-Area/Listed-Building refusal overlays first (see `ENVELOPE.md`). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `london` (source `gb` = EA LIDAR Composite DTM 1 m, bbox `[-0.20,51.44,0.02,51.55]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE** but unwired: EA LIDAR Composite **DSM** 1 m − DTM 1 m is a derivable nDSM (`GEO-DATA-SOURCING-MASTER.md` names UK "derive EA DSM − DTM"), but `heightSources.mjs` maps `london → {source:null, no-source}` ("OS Building Heights is licensed; GB not in LOD-RATE-MASTER"). Not baked; no per-building `heightProvenance` histogram probed. Capability is never reported as a measurement. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `london` context bake bbox (`bake.mjs` REGIONS `london`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: London sits on the **tidal Thames** (mapped as riverbank/water, not `natural=coastline`) — genuinely absent inland, not fabricated. Score 5/9 = 0.556. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (EA LIDAR Composite DTM 1 m, OGL v3, unverified rung-50) + baked OSM context (5/9 layers). REFUSES:
a parcel cadastre (no keyless GB cadastre → footprint-fallback, honestly labelled) + an envelope (no rule pack;
GB permission is discretionary, no as-of-right numeric envelope) — never a borrowed/invented number. UNKNOWN
(typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`,
measured-capable via EA DSM−DTM derive, unwired). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (NOT YET ASSESSED — discretionary) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (discretionary-planning gate) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (EA DSM−DTM measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · discretionary planning · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; `gb/` country folder + this dossier created this pass.*
