# City RATE — master completion scorecard — Lyon (fr-ara, INSEE 69123)

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
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National IGN cadastre IS wired (`parcelProviders/registry.ts` `isInFrance`→`ign-fr`, `data.geopf.fr` WFS PARCELLAIRE EXPRESS, keyless, live). But Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for the Lyon bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Lyon (`rulepacks/registry.ts` carries no FR pack); `sources/VERIFICATION.md` is OPEN. A structured-fill PRIOR exists — `~42 %` (`LEGISLATION-RATE.md`, the highest of the studied FR cities) — but that is the COARSE prior, not the L-449-verified per-clau count Axis 2 requires. Lyon's cheaper path: `data.grandlyon.com` `pluhauteur` gives **direct absolute-metre** heights (no decoding step), but CES/setbacks are PDF-only and the Lyon/Villeurbanne height-perimeter overlay is a structural exception. Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (IGN PARCELLAIRE EXPRESS, `ign-fr`) · regional-zone-GIS **documented** (national GPU `zone-urba` + Grand Lyon `data.grandlyon.com` `pluzone`/`pluhauteur` — endpoints corroborated/live-verified in `LEGISLATION-RATE.md`; wiring into `siteDispatch.ts` NOT confirmed → `documented` not `live`) · building-height nDSM **documented** (`heightSources.mjs` `bdtopo` impl:`live`, `REGION_SOURCE` `lyon:'bdtopo'`; per-city bake NOT confirmed landed) · terrain DEM **live** (`terrain.mjs` source `fr` = RGE ALTI/IGN, keyless, HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `lyon`, Rhône-Alpes extract). Mean = (1.0+0.5+0.5+1.0+1.0)/5 = 0.8. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Lyon; solver coverage unmeasured (C58). See `ENVELOPE.md` — the numeric `pluhauteur` layer makes Lyon the cheapest FR envelope path, but no pack exists yet and CES/setback values are unsourced. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `lyon` (source `fr` = RGE ALTI, bbox `[4.78,45.70,4.92,45.80]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: BD TOPO® `hauteur` wired + live (`heightSources.mjs` `bdtopo` impl:`live`; `REGION_SOURCE` `lyon:'bdtopo'`). Per-city bake NOT landed; no per-building provenance histogram probed. Capability is never reported as a measurement. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `lyon` context bake bbox (`bake.mjs` REGIONS `lyon`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Lyon is inland — genuinely absent (not applicable), not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (RGE ALTI, unverified rung-50) + national IGN cadastre parcel routing + baked OSM context (5/9 layers) + national GPU + Grand Lyon zone-GIS endpoints. REFUSES: an envelope (no rule pack) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, measured-capable via BD TOPO). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~42 % prior; the Lyon `pluhauteur` numeric-height research) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (BD TOPO measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · zone taxonomy · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; the legacy `RATE.md` (legislation) was migrated to `LEGISLATION-RATE.md` this pass.*
