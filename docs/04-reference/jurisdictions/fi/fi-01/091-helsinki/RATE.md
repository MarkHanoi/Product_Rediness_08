# City RATE — master completion scorecard — Helsinki (fi-01, kuntanumero 091)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `56%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | **No Finnish cadastral provider is wired** — `parcelProviders/registry.ts` has no `isInFinland` predicate, so a Helsinki click falls to the `Unknown → building footprint (OSM)` fallback (a footprint is never a legal parcel, C57 §L-640). MML Kiinteistörekisteri + Helsinki's open kiinteistökartta exist but are NOT wired. No `computeParcelConfidence` sample run. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Helsinki (`rulepacks/registry.ts` carries no FI pack); no `sources/VERIFICATION.md`. A national structured-fill PRIOR exists — `~55–65 %` (Ryhti live regions, est.) / `~30–35 %` (non-Ryhti) ([`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md), from `../../RATE.md`) — but the Ryhti item-level property schema is unconfirmed and this is the COARSE prior, not the L-449-verified per-clau count Axis 2 requires. Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **60%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **documented** (MML Kiinteistörekisteri / Helsinki open kiinteistökartta exist; NOT wired in `parcelProviders/registry.ts` → `documented` not `live`) · regional-zone-GIS **documented** (Ryhti kaavatietomalli OGC API **confirmed live + public** at `paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`, `ryhti_building` sub-service live NATIONWIDE incl. Helsinki — see `../../RATE.md`; NOT wired into `siteDispatch.ts` + item schema unconfirmed → `documented`) · building-height nDSM **documented** (`heightSources.mjs` `REGION_SOURCE helsinki` = `{status:'no-source', reason:'FI not in LOD-RATE-MASTER (Helsinki has open LoD2 — candidate to add)'}` — no source WIRED, but an open LoD2 CityGML is documented-available → `documented`) · terrain DEM **documented** (`terrain.mjs` source `fi` = MML WCS `avoin-karttakuva.maanmittauslaitos.fi`, verdict `token` — needs a FREE `MML_API_KEY`, not keyless-live → `documented`) · context-OSM **live** (`bake.mjs` REGIONS `helsinki`, `finland-latest.osm.pbf`, bbox `24.88,60.14,25.02,60.20`). Mean = (0.5+0.5+0.5+0.5+1.0)/5 = 0.6. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Helsinki; solver coverage unmeasured (C58). See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `helsinki` (source `fi` = MML WCS, bbox `[24.88,60.14,25.02,60.20]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 re-probed. ⚠ CAVEAT: the FI DEM is gated on a FREE `MML_API_KEY` (repo secret); if unset the bake cannot run — rung 50 asserts "configured + capable", validation stays `not-checked` until the key + a `layer.json` 200 are confirmed. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No height source WIRED (`heightSources.mjs` `REGION_SOURCE helsinki` returns `status:'no-source'`). But the reason string documents that **Helsinki has open LoD2** — a candidate to add. Measured-CAPABLE-BUT-UNWIRED: no bake, no `heightProvenance` histogram. Capability is never reported as a measurement. See [`HEIGHT.md`](./HEIGHT.md). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `helsinki` context bake bbox (`bake.mjs` REGIONS `helsinki`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Helsinki IS coastal (Gulf of Finland) so sea is APPLICABLE and rides the water/`natural=coastline` bake, but the standing sea-layer tile was not independently probed here → excluded (honest 0). Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM context (5/9 layers) + a national terrain DEM (MML WCS, key-gated, unverified rung-50) + a live+public national zone-GIS (Ryhti kaavatietomalli, documented — not wired). REFUSES: an envelope (no rule pack) + a legal parcel (no wired cadastral provider — falls to labelled OSM footprint) + a wired height source (open LoD2 exists but is not wired) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`, provider UNWIRED), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, LoD2 candidate unwired). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: [`../../../_TEMPLATE/NAMING-CONVENTION.md`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (inherits the ~55–65 %/~30–35 % national prior) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (open LoD2 candidate, unwired) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · pack status · open questions | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
