# City RATE — master completion scorecard — Oslo (no-03, kommune 0301)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `66%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Matrikkelen parcel provider IS wired + LIVE (`parcelProviders/registry.ts` `isInNorway`→`matrikkel-no`, `label: 'Matrikkelen (Norway · Kartverket)'`, `wfs.geonorge.no matrikkelen-eiendomskart-teig app:Teig` — HTTP 200 GML 3.2.1, real teig polygon `0301/208/644 @ Oslo`, keyless). But Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Oslo (`rulepacks/registry.ts` carries no NO pack); no `sources/VERIFICATION.md` sign-off. A structured-fill PRIOR exists — `~33 %` ([`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)) — but that is the COARSE prior, not the L-449-verified per-clau count Axis 2 requires. Oslo's numeric utilisation lives in `reguleringsbestemmelser` prose (the national `BestemmelseUtnyttingsgrad` SOSI stub is unfilled, confirmed 2026-07-24) and Planinnsyn is a click-viewer, not a queryable WFS — inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Matrikkelen national, `parcelProviders/registry.ts` `isInNorway`, keyless) · regional-zone-GIS **documented** (national SOSI Plan legally mandated + Geonorge planregister framework + Oslo Planinnsyn viewer confirmed live; a programmatic WFS + `siteDispatch.ts` wiring is UNCONFIRMED → `documented` not `live`, see `LEGISLATION-RATE.md`) · building-height nDSM **documented** (`heightSources.mjs` `ndh_no` impl:`documented`, "Matrikkelen point + NDH nDSM (free path)", `REGION_SOURCE oslo:'ndh_no'`, coverage `partial`; per-city bake not landed) · terrain DEM **live** (`terrain.mjs` source `no` = Kartverket NHM DTM `wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833`, keyless, HTTP 200 WCS 1.1 Capabilities live) · context-OSM **live** (`bake.mjs` REGIONS `oslo`, `norway-latest.osm.pbf`, bbox `10.66,59.88,10.83,59.96`). Mean = (1.0+0.5+0.5+1.0+1.0)/5 = 0.8. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Oslo; solver coverage unmeasured (C58). BCN/Madrid/Córdoba have packs — Oslo does not. See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `oslo` (source `no` = Kartverket NHM DTM, keyless HTTP-200, bbox `[10.66,59.88,10.83,59.96]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: NDH nDSM is a free national bare-earth+surface source (`heightSources.mjs` `ndh_no` impl:`documented`, coverage `partial` → APPEND top-up; `REGION_SOURCE oslo:'ndh_no'`). But no per-city bake has landed and no per-building `heightProvenance` histogram was probed. FKB-Bygning footprint+height is licence-gated (commercial reseller/Kartverket agreement). Capability is never reported as a measurement. See [`HEIGHT.md`](./HEIGHT.md). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `oslo` context bake bbox (`bake.mjs` REGIONS `oslo`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Oslo IS coastal (Oslofjord) so sea is APPLICABLE (unlike inland Paris) and rides the water/`natural=coastline` bake, but the standing sea-layer tile was not independently probed here → excluded (honest 0, not fabricated). Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (Kartverket NHM DTM, keyless, unverified rung-50) + national Matrikkelen parcel routing (LIVE) + baked OSM context (5/9 layers) + a national SOSI Plan zone-GIS framework (viewer-confirmed). REFUSES: an envelope (no rule pack) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`, provider LIVE), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, measured-capable via NDH). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: [`../../../_TEMPLATE/NAMING-CONVENTION.md`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~33 % prior; SOSI Plan / Planinnsyn research) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (NDH measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · pack status · open questions | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; the legacy `RATE.md` (legislation) was migrated to `LEGISLATION-RATE.md` this pass.*
