# City RATE — master completion scorecard — New York City (us-ny, FIPS 3651000)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three
     CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is
     not-assessed with a typed C62 reason. NO cell is a fabricated number. The legacy `RATE.md` (legislation
     data-fill) was migrated to `LEGISLATION-RATE.md` this pass (L-649). -->

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
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | `parcelProviders/registry.ts` has **no US entry** → an NYC click resolves via `UNIVERSAL_FOOTPRINT_JURISDICTION` (footprint-fallback), not a cadastre. NYC **MapPLUTO** (BBL tax lots, ~862k parcels, ODbL) is a rich free parcel source but is **NOT wired** as a parcel provider. No `computeParcelConfidence` sample run; footprint-fallback is construction-capped low (C57 §L-640). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for NYC (`rulepacks/registry.ts` carries no US pack); `sources/VERIFICATION.md` OPEN. A rich structured-fill PRIOR exists — MapPLUTO `MaxAllwFAR`/`ResidFAR` (858,602 parcels, 99.5 % FAR fill per the national probe) — but that is the COARSE prior (`LEGISLATION-RATE.md`), NOT the L-449-verified per-clau count Axis 2 requires, and SPDs/air-rights make even MapPLUTO's FAR non-final. Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **50%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **none** (no keyless US cadastre wired; MapPLUTO not wired into `registry.ts` → 0.0) · regional-zone-GIS **none** (~33,000 fragmented ordinances; MapPLUTO `ZoneDist1` not wired as zone dispatch → 0.0) · building-height nDSM **documented** (`heightSources.mjs` `overture_us` impl:`documented`, Overture height + USGS 3DEP nDSM → 0.5) · terrain DEM **live** (`terrain.mjs` `us` = 3DEP 1 m DEM, keyless HTTP 200, live-probed → 1.0) · context-OSM **live** (`bake.mjs` REGIONS `newyork`, NY state extract → 1.0). Mean = (0+0+0.5+1+1)/5 = 0.5. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack for NYC; solver coverage unmeasured (C58). The NYC Zoning Resolution (FAR + sky-exposure-plane + SPD overlays + floor-area bonuses + TDR) is one of the most complex regimes in the corpus and needs a dedicated pack + SPD/air-rights handling before any parcel-level envelope (see `ENVELOPE.md`). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `newyork` (source `us` = USGS 3DEP 1 m DEM, bbox `[-74.03,40.70,-73.91,40.82]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. ⚠ 3DEP geoidSepM is NEGATIVE in CONUS (`terrain.mjs` note). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE** but unwired: `heightSources.mjs` `overture_us` (impl:`documented`) = Overture height + USGS 3DEP DSM−DTM nDSM; `REGION_SOURCE` maps `newyork:'overture_us'`. But the NYC bake uses the **OSM** state extract (not Overture buildings) and the 3DEP nDSM join is not implemented (impl documented, not live); no per-building `heightProvenance` histogram probed. Capability is never reported as a measurement. |
| 7 | **CONTEXT** | 5 % | **67%** | `not-checked` | — | Inside the `newyork` context bake bbox (`bake.mjs` REGIONS `newyork`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**), **+ sea** — NYC is coastal (Upper/Lower Bay, Hudson/East Rivers), and `natural=coastline` ways ride the baked water layer → the client sea mask builds (L-637): **6/9**. rail + trees are config-added (L-642) but that re-bake is not-yet-landed → excluded. pedestrian: not a baked layer. Score 6/9 = 0.667. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (USGS 3DEP 1 m DEM, public domain, unverified rung-50) + baked OSM context (6/9 layers, coastal → sea
present). REFUSES: a parcel cadastre (no keyless US cadastre → footprint-fallback; MapPLUTO exists but is NOT
wired) + an envelope (no rule pack; NYC Zoning Resolution not packed) — never a borrowed/invented number. UNKNOWN
(typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`,
measured-capable via Overture + 3DEP nDSM, unwired). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (NOT YET ASSESSED; MapPLUTO FAR prior) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (NYC Zoning Resolution complexity) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (Overture + 3DEP measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · zone taxonomy · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; the legacy `RATE.md` (legislation) was migrated to `LEGISLATION-RATE.md` this pass.*
