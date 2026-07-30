# City RATE — master completion scorecard — Paris (fr-idf, INSEE 75056)

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
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National IGN cadastre IS wired (`parcelProviders/registry.ts` `isInFrance`→`ign-fr`, provider `Cadastre (France · IGN PARCELLAIRE EXPRESS)`, `data.geopf.fr` WFS `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`, keyless, live — note cites real `idu 75104000AE0003 @ Paris`). But Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Paris (`rulepacks/registry.ts` carries no FR pack); `sources/VERIFICATION.md` is **OPEN** (no signed sign-off). A rich structured-fill PRIOR exists — `~35 %` (`LEGISLATION-RATE.md`) — but that is the COARSE prior, not the L-449-verified per-clau count Axis 2 requires. Paris height is a two-layer geometric construction (`plub_filet` coded gabarit + `surface de nivellement de l'îlot` datum) needing a new engine KIND (ADR-0274) before any parcel-level fill; inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (IGN PARCELLAIRE EXPRESS, `parcelProviders/registry.ts` `ign-fr`) · regional-zone-GIS **documented** (national GPU `apicarto.ign.fr/api/gpu/zone-urba` returns UG/UGSU/UV/N — endpoint corroborated in `README.md`/`LEGISLATION-RATE.md`; wiring into `siteDispatch.ts` NOT confirmed → `documented` not `live`) · building-height nDSM **documented** (`heightSources.mjs` `bdtopo` impl:`live`, IGN BD TOPO® `batiment.hauteur`, `REGION_SOURCE` `paris:'bdtopo'`, live-probe bbox `[2.346,48.852,2.352,48.858]` Paris 8e "LOD-RATE-verified"; per-city bake NOT landed, §BDTOPO-CAP-TRUNCATE) · terrain DEM **live** (`terrain.mjs` source `fr` = RGE ALTI/IGN, keyless, HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `paris`, Île-de-France extract). Mean = (1.0+0.5+0.5+1.0+1.0)/5 = 0.8. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Paris; solver coverage unmeasured (C58). The gabarit-enveloppe + block-reference-surface mechanism needs the ADR-0274 engine KIND first (see `ENVELOPE.md`). BCN/Madrid/Córdoba have packs — Paris does not. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `paris` (source `fr` = RGE ALTI, bbox `[2.22,48.80,2.47,48.91]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: BD TOPO® `hauteur` is wired + live (`heightSources.mjs` `bdtopo` impl:`live`; `REGION_SOURCE` `paris:'bdtopo'`; live-verified 5/5 non-null Paris 8e). But the per-city bake has NOT landed — the Paris bake bbox holds ~317,361 buildings and the single-shot WFS caps at `limit`, so a naïve bake would delete ~98 % (§BDTOPO-CAP-TRUNCATE); no per-building provenance histogram probed. Capability is never reported as a measurement. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `paris` context bake bbox (`bake.mjs` REGIONS `paris`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Paris is inland — genuinely absent (not applicable), not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (RGE ALTI, unverified rung-50) + national IGN cadastre parcel routing + baked OSM context (5/9 layers) + a national GPU zone-GIS endpoint. REFUSES: an envelope (no rule pack; ADR-0274 KIND not built) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, measured-capable via BD TOPO). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~35 % prior; the rich Paris height research) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (ADR-0274 gabarit KIND gate) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (BD TOPO measured-capable) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · zone taxonomy · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; the legacy `RATE.md` (legislation) was migrated to `LEGISLATION-RATE.md` this pass.*
