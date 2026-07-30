# City RATE — master completion scorecard — Roma (it-laz, 058091)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `51%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Assessed subset here =
> DATA-SOURCES (15) + TERRAIN (10) + CONTEXT (5) = 30; overall = (0.50·15 + 0.50·10 + 0.556·5) / 30 = **51 %**.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | A national cadastre WFS EXISTS and was verified-live — Agenzia delle Entrate INSPIRE `wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php` (CC-BY-4.0; **VERIFIED-LIVE 2026-07-24** for Roma, Belfiore `H501`; `LEGISLATION-RATE.md` field table). BUT it is **not wired** into `parcelProviders/registry.ts` (no `isInItaly`), and no `computeParcelConfidence` sample has been drawn (C57 §2.4). Not survey-grade. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack for Roma (`rulepacks/registry.ts` is ES-only); no clau audit; no signed `sources/VERIFICATION.md`. Every numeric PRG parameter requires the **NTA PDF**; no machine-readable tessuto-classification WFS confirmed; the direct/indirect-intervention classifier + the *Carta per la Qualità* precedence question are unresolved → legacy structured-fill ≈ **~5 %** (`LEGISLATION-RATE.md`). Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **50%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **documented** (Agenzia Entrate INSPIRE WFS verified-live but NOT wired → 0.5, not `live`) · regional-zone-GIS **none** (no wired Lazio/PRG zone-GIS) · building-height nDSM **none** (`heightSources.mjs` REGION_SOURCE `rome` = `piedmont_it` **status `no-source`** — Lazio layer unconfirmed) · terrain DEM **live** (`terrain.mjs` `it` = TINITALY/01 INGV national 10 m, keyless HTTP 200, covers Rome) · context-OSM **live** (`bake.mjs` REGIONS `rome`). Mean = (0.5+0+0+1.0+1.0)/5 = **0.50**. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered (`rulepacks/registry.ts` ES-only); solver coverage unmeasured (C58). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` cities `rome` (`source:'it'` = TINITALY/01 DEM, INGV, national 10 m bare-earth, CC-BY-4.0, keyless, verdict `keyless`/LIVE 2026-07-25). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. (⚠ 10 m grid is coarser than the 0.5–1 m national DTMs elsewhere but a genuine national bare-earth model.) |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked; context buildings render OSM/assumed (9 m). Rome is a **structural no-source**: `heightSources.mjs` REGION_SOURCE `rome` status `no-source` ("Lazio building-height layer unconfirmed"); the only real Italian building-height layer is ARPA Piemonte (Turin only). No provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `rome` city-clip bake (`bake.mjs` REGIONS `rome`, bbox `12.40,41.83,12.60,41.99`). Long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but not yet re-baked → excluded (honest 0). pedestrian: not a baked layer. sea: inland (Tiber) — no coastline in bbox. Score 5/9 = **56 %**. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM context (5/9 layers) + TINITALY national terrain (rung-50 unverified) + points at a
verified-live national Catasto WFS. REFUSES: an envelope (no rule pack), a parcel (Catasto not wired,
no sample), a measured height (Lazio no-source) — never a borrowed/invented number. UNKNOWN (typed):
PARCEL (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`).
`honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (was legacy `RATE.md`; renamed L-649) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · instrument chain · open questions | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| `sources/` | per-field citations + human sign-off (L-449 gate) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
