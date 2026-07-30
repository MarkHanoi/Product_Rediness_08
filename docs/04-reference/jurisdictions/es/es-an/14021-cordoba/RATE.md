# City RATE — master completion scorecard — Córdoba (es-an, 14021)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 (L-649 dossier normalization) — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `66%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed). This is the composite master; the legislation detail lives in
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (~8 % data-fill, OCR-unverified) and FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`), and the COACo pilot adds `coaco:vcatastro_urbanismo` (5,725 parcels). But no `computeParcelConfidence` run has been executed for this bbox, and the block-ring dissolve is **0/3 in Córdoba** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) — the dissolve fails before any rule is consulted (see `LEGISLATION-RATE.md`). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Measured legislation detail = [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): ~8 % municipality-wide, ASSESSED but **OCR-extracted `pipeline-extracted-unverified`** (15-ordinance extraction complete, `SOURCES.md §C` empty). The authored starter pack `esCordobaPGOU2001.ts` is **UNREGISTERED / refusing**. No composite Axis-2 clau-inventory scorecard run; a % here would double-count the sub-rate. |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Catastro national + COACo pilot WFS) · regional-zone-GIS **documented/partial** (COACo `coaco:ordenanzas` calificación **live for 2 of ~10 districts**; national SIU serves *clasificación* only) · building-height nDSM **documented** (`heightSources.mjs` `REGION_SOURCE.cordoba='mds_edificacion'`, per-city bbox configured; per-city bake not confirmed landed) · terrain DEM **live** (`terrain.mjs` TERRAIN_CITY `cordoba`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = (1+0.5+0.5+1+1)/5 = 0.80. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | Starter pack `esCordobaPGOU2001.ts` authored but **UNREGISTERED** (`rulepacks/registry.ts` has no live Córdoba pack); every extracted value is `pipeline-extracted-unverified` and the two dominant families (Manzana Cerrada, Colonia Tradicional Popular) have edificabilidad **DERIVED by algorithm** → `null`, never a number. Solver coverage unmeasured (C58). See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `cordoba` (source `es` = PNOA MDT) + control points (Mezquita / Guadalquivir / North hills). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked (Catastro footprint national; nDSM ❌ per `LEGISLATION-RATE.md`). The CNIG MDS Edificación per-city source is configured (`REGION_SOURCE.cordoba`) but no per-city provenance histogram has been probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (L-642) but recorded as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: inland city, n/a. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro + COACo pilot parcels + baked OSM context (5/9). REFUSES: an envelope — the OCR pack is `pipeline-extracted-unverified` and UNREGISTERED, the dominant families' density is an algorithm not a number (the pipeline emits `null` rather than fabricate). UNKNOWN (typed): PARCEL quality (`not-queried`, dissolve 0/3), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~8 %, OCR-unverified) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`README.md`](./README.md) · `sources/` · `findings/` | governance · citations · L-NNN investigation records | LEGISLATION · — |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Normalized to the C63 7-file standard under audit L-649.*
