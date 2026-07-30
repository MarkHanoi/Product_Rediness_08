# City RATE — master completion scorecard — San Francisco (us-ca, FIPS 0667000)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three
     CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is
     not-assessed with a typed C62 reason. NO cell is a fabricated number. Scaffolded this pass — SF is
     bake-covered but was previously unscaffolded (per governance). -->

**Overall completion (assessed subset): `53%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Assessed subset = {DATA-SOURCES
> 15, TERRAIN 10, CONTEXT 5}, Σ = 30; overall = (0.50×15 + 0.50×10 + 0.667×5)/30 = 15.83/30 = **53 %**.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | `parcelProviders/registry.ts` has **no US entry** → an SF click resolves via `UNIVERSAL_FOOTPRINT_JURISDICTION` (footprint-fallback), not a cadastre. SF (a consolidated city-county) publishes an **Assessor parcel** layer (public record, free ArcGIS) but it is **NOT wired**. No `computeParcelConfidence` sample run; footprint-fallback is construction-capped low (C57 §L-640). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for SF (`rulepacks/registry.ts` carries no US pack); `sources/VERIFICATION.md` OPEN. SF's Planning Code zoning + **height-and-bulk districts** (the "40-X"-style designations) are published on the city open-data portal but have NOT been sourced per-clau or L-449-verified; the national ~12 % free / ~55 % commercial prior (`LEGISLATION-RATE.md`) is the COARSE prior, not the Axis-2 count. Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **50%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **none** (no keyless US cadastre wired; SF assessor parcels not wired into `registry.ts` → 0.0) · regional-zone-GIS **none** (per-municipality; SF zoning/height-bulk layers not wired as zone dispatch → 0.0) · building-height nDSM **documented** (`heightSources.mjs` `overture_us` impl:`documented`, Overture height + USGS 3DEP nDSM → 0.5) · terrain DEM **live** (`terrain.mjs` `us` = 3DEP 1 m DEM, keyless HTTP 200, live-probed → 1.0) · context-OSM **live** (`bake.mjs` REGIONS `sanfrancisco`, California extract → 1.0). Mean = (0+0+0.5+1+1)/5 = 0.5. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack for SF; solver coverage unmeasured (C58). SF envelope = zoning-district use + **height-and-bulk district** (numeric height + bulk) + overlays (Coastal Zone, specific plans) — publishable but needs a dedicated pack (see `ENVELOPE.md`). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `sanfrancisco` (source `us` = USGS 3DEP 1 m DEM, bbox `[-122.52,37.70,-122.36,37.83]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. ⚠ 3DEP geoidSepM is NEGATIVE in CONUS (`terrain.mjs` note); SF's steep hills make relief correctness load-bearing. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE** but unwired: `heightSources.mjs` `sanfrancisco:'overture_us'` (impl:`documented`) = Overture height + USGS 3DEP DSM−DTM nDSM. The SF bake uses the **OSM** California extract (not Overture buildings) and the 3DEP nDSM join is not implemented (impl documented, not live); no per-building `heightProvenance` histogram probed. Capability is never reported as a measurement. |
| 7 | **CONTEXT** | 5 % | **67%** | `not-checked` | — | Inside the `sanfrancisco` context bake bbox (`bake.mjs` REGIONS `sanfrancisco`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**), **+ sea** — SF is a peninsula (Pacific + SF Bay), and `natural=coastline` ways ride the baked water layer → the client sea mask builds (L-637): **6/9**. rail + trees are config-added (L-642) but that re-bake is not-yet-landed → excluded. pedestrian: not a baked layer. Score 6/9 = 0.667. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (USGS 3DEP 1 m DEM, public domain, unverified rung-50) + baked OSM context (6/9 layers, coastal →
sea present). REFUSES: a parcel cadastre (no keyless US cadastre → footprint-fallback; SF assessor parcels exist
but are NOT wired) + an envelope (no rule pack; SF Planning Code / height-bulk not packed) — never a
borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE
(`pending-implementation`), HEIGHTS (`not-queried`, measured-capable via Overture + 3DEP nDSM, unwired).
`honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (NOT YET ASSESSED; SF height-bulk) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (SF Planning Code / height-bulk) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (Overture + 3DEP measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · zone/height-bulk taxonomy · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Fully scaffolded under audit L-649 Phase-1 (SF was bake-covered but previously unscaffolded).*
