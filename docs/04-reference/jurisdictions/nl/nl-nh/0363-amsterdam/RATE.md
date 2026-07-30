# City RATE — master completion scorecard — Amsterdam (nl-nh, CBS 0363)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `71%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: the national **Kadaster BRK** cadastre IS wired (`parcelProviders/registry.ts` provider `pdok-nl`, label `Kadaster (Netherlands · PDOK BRK)`, `isInNetherlands`, `service.pdok.nl` kadastralekaart WFS v5_0 `kadastralekaart:Perceel`, keyless — note cites a real `perceel ASD04 F 6685 @ Amsterdam`). But Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). NL's parcel is genuinely high-authority (national Kadaster, `national-cadastre` rank). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Amsterdam (`rulepacks/registry.ts` carries no NL pack); `sources/VERIFICATION.md` is **OPEN**. NL zoning moved to the **omgevingsplan** under the Omgevingswet (in force 1 Jan 2024, replacing the bestemmingsplan), served via the national **DSO / ruimtelijkeplannen.nl** register — but no per-clau structured-fill audit has been run (`LEGISLATION-RATE.md` = NOT YET ASSESSED). Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Kadaster BRK, `parcelProviders/registry.ts` `pdok-nl`, keyless, real polygon @ Amsterdam) · regional-zone-GIS **documented** (national omgevingsplan register DSO / `ruimtelijkeplannen.nl` — the known national NL zoning register; NOT probed or wired into `siteDispatch.ts` in this audit → `documented` not `live`) · building-height nDSM **live** (`heightSources.mjs` `3dbag` impl:`live`, `REGION_SOURCE.amsterdam:'3dbag'`, 3DBAG BAG×AHN LiDAR roof−ground → `tagged`, footprint ingest built 2026-07-25) · terrain DEM **live** (`terrain.mjs` `nl` = AHN, PDOK WCS `dtm_05m`, keyless CC0, GetCoverage HTTP 200 image/tiff LIVE-VERIFIED 2026-07-25) · context-OSM **live** (`bake.mjs` REGIONS `netherlands`, national). Mean = (1.0+0.5+1.0+1.0+1.0)/5 = 0.9. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Amsterdam; solver coverage unmeasured (C58). The omgevingsplan carries building rules (goothoogte / bouwhoogte / bebouwingspercentage) per gebied, but none are sourced/wired. BCN/Madrid/Córdoba have packs — Amsterdam does not. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` REGIONS `amsterdam` (source `nl` = AHN, bbox `[4.83,52.34,4.97,52.42]`; AHN `dtm_05m` PDOK WCS keyless CC0, GetCoverage HTTP 200 live-verified 2026-07-25). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. (NL is famously flat — relief fidelity is low-stakes here, but the datum lift NAP→WGS84 ellipsoidal `geoidSepM 43.0` is wired.) |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE** — the strongest EU building-height source: **3DBAG** (BAG × AHN LiDAR) is wired + live (`heightSources.mjs` `3dbag` impl:`live`; `REGION_SOURCE.amsterdam:'3dbag'`; roof-50pctile − ground → real metres, `tagged`, LoD2-mesh capable via `b3_dak_type`). But the **whole-country `netherlands` bake refuses 3DBAG per-tile** (the paginated `items` API would truncate a 4°×3° scan at ~5000 arbitrary buildings → `documented`, keeps OSM), so the deployed national tiles render OSM `assumed` for Amsterdam. The Amsterdam per-city bbox `4.83,52.34,4.97,52.42` (0.14°×0.08° < 0.6° guard) **resolves exactly** — but that per-city bake has NOT landed, and no per-building `heightProvenance` histogram was probed. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the national `netherlands` context bake bbox (`bake.mjs` REGIONS `netherlands`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Amsterdam sits on the IJ (former Zuiderzee inlet, now freshwater IJ/IJmeer) with no `natural=coastline` in the bbox — the North Sea coast is ~20 km west — so sea is genuinely absent/not-applicable, not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: national Kadaster BRK parcel routing (wired + live) + baked OSM context (5/9 layers) + AHN terrain
(rung-50 unverified) + a live national measured building-height source (3DBAG). REFUSES: an envelope (no
rule pack) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`, measured-
capable via wired BRK), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, measured-
capable via 3DBAG but whole-country bake keeps OSM). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (omgevingsplan/DSO; NOT YET ASSESSED) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (omgevingsplan; no pack) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (3DBAG measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · zone taxonomy · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1.*
