# City RATE — master completion scorecard — Ourense (es-ga, 32054)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `61%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · HEIGHTS/LOD) are honestly
`not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`, cadastral · keyless · live), but Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack for this municipality (`rulepacks/registry.ts` holds sourced packs only for Barcelona / Madrid / Córdoba, + refusal-gates for the AMB Catalan set); no clau audit run. Inventing legal parameters is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **70%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Catastro national, `parcelProviders/registry.ts`) · regional-zone-GIS **none** (no wired regional GIS for this CCAA) · building-height nDSM **documented** (`heightSources.mjs` `mds_edificacion` impl:`live`, national CNIG MDS raster; per-city bake not confirmed landed) · terrain DEM **live** (`terrain.mjs` source `es` = PNOA MDT, keyless, HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = 0.7. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for this municipality; solver coverage unmeasured (C58). BCN/Madrid/Córdoba have packs — this city does not. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `ourense` (source `es` = PNOA MDT, §ES-ALL-CAPITALS L-636). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked; context buildings render OSM/assumed. National MDS Edificación (live) could join via the `spain` `heightJoin:'mds'`, but no per-city provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but C63 §3 Axis 7 records that re-bake as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal-only via water/coastline, not tile-probed here → excluded. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro parcel routing + baked OSM context (5/9 layers). REFUSES: an envelope (no rule pack) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
