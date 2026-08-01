# City RATE — master completion scorecard — Paris (fr-idf, INSEE 75056)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `87.7%` · `partial: true` — over 45 % of the ratified weight**
— renormalised over the four ASSESSED axes (**PARCEL** · DATA-SOURCES · TERRAIN · CONTEXT, Σ weight
15+15+10+5 = **45**); LEGISLATION · ENVELOPE · HEIGHTS/LOD stay honestly `not-assessed`, not 0 %
(C63 §1.2/§1.5). **`honestyOk: true`**.

> ⚠ **READ `45 %` BEFORE `87.7 %`.** LEGISLATION 25 + ENVELOPE 20 = **45 pts** — as much weight as
> everything measured here — remain outside the denominator, and Paris's gabarit-enveloppe needs a new
> engine KIND (ADR-0274) before either can move. The jump from `66 %` is almost entirely a *bigger
> denominator plus two stale slot verdicts corrected*, not new capability.
>
> ⚠ **CONTEXT sensitivity:** against the tile-VERIFIED 5/9 this dossier audited (rather than the
> scorecard's declaration-based 8/9) the composite is **84.0 %**. Reproduce either with
> `node tools/city-completion/computeScorecard.mjs --region paris --cc fr [--context-layers buildings,roads,water,parks,landuse]`.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | **100.0%** | `auto-validated` | — | **MEASURED 2026-08-01** (`parcelSampleProbe.mjs --city paris`, seed `20260801`) — **a perfect sample.** **DENOMINATOR = private buildable land** (L-656), sampled independently of IGN as **OSM non-public building-footprint area** — 4,117 footprints in 40 uniformly-random 330 m tiles over bbox `[2.22,48.80,2.47,48.91]`, points drawn **∝ footprint area** (unbiased for AREA, not parcel COUNT). **N = 120: high 120 · medium 0 · low 0 · no-parcel-here 0 · 0 transport failures.** Every point returned a PARCELLAIRE EXPRESS `parcelle` carrying the registry-declared `contenance` **and** the click inside the ring. 95 % Wilson CI on the `high` share: **96.9 %–100 %**. ⚠ **ADAPTER FINDING:** with `SRSNAME=EPSG:4326` the CQL filter must be `POINT(lat lon)`; `POINT(lon lat)` returns a **well-formed empty FeatureCollection** — a mis-axised query is indistinguishable from "no parcel here" unless you already know the answer. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Paris (`rulepacks/registry.ts` carries no FR pack); `sources/VERIFICATION.md` is **OPEN** (no signed sign-off). A rich structured-fill PRIOR exists — `~35 %` (`LEGISLATION-RATE.md`) — but that is the COARSE prior, not the L-449-verified per-clau count Axis 2 requires. Paris height is a two-layer geometric construction (`plub_filet` coded gabarit + `surface de nivellement de l'îlot` datum) needing a new engine KIND (ADR-0274) before any parcel-level fill; inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **100%** | `auto-validated` | — | 5/5 slots **live**. ⚠ **CORRECTION, +20 pp — BOTH downgrades in the 2026-07-30 audit were wrong, for two different reasons.** cadastre-parcel **live** (IGN PARCELLAIRE EXPRESS; 120/120 real parcels this session) · regional-zone-GIS **live** — the audit said "wiring into `siteDispatch.ts` NOT confirmed"; **it is wired**: `PARIS_PLU_PATH` is **mounted in `server.js`** → `server/parisPluProxy.js` → `opendata.paris.fr` PLU bioclimatique (`plub_hauteur`/`plub_hmc`/`plub_filet`/…) + `data.geopf.fr` GPU, and `plub_hauteur` returned **HTTP 200 with 116 real records 2026-08-01** · building-height nDSM **live** — the audit itself records `bdtopo` `impl:'live'` and then scored `documented` because *the per-city bake* has not landed; that is **Axis 6**, not Axis 3, which asks only whether the **feed is WIRED + LIVE** · terrain DEM **live** (`terrain.mjs` `fr` = RGE ALTI) · context-OSM **live** (`bake.mjs` REGIONS `paris`). Mean = 5/5 = 1.00. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Paris; solver coverage unmeasured (C58). The gabarit-enveloppe + block-reference-surface mechanism needs the ADR-0274 engine KIND first (see `ENVELOPE.md`). BCN/Madrid/Córdoba have packs — Paris does not. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `paris` (source `fr` = RGE ALTI, bbox `[2.22,48.80,2.47,48.91]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: BD TOPO® `hauteur` is wired + live (`heightSources.mjs` `bdtopo` impl:`live`; `REGION_SOURCE` `paris:'bdtopo'`; live-verified 5/5 non-null Paris 8e). But the per-city bake has NOT landed — the Paris bake bbox holds ~317,361 buildings and the single-shot WFS caps at `limit`, so a naïve bake would delete ~98 % (§BDTOPO-CAP-TRUNCATE); no per-building provenance histogram probed. Capability is never reported as a measurement. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `paris` context bake bbox (`bake.mjs` REGIONS `paris`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Paris is inland — genuinely absent (not applicable), not fabricated. Score 5/9. |

## The THREE PARCEL numbers — never conflated (L-656 / MASTER-ROI-TRACKER §0.5.2)

All three are true statements about Paris on **2026-08-01**, each with a different denominator.
Reproduce: `node tools/city-completion/summariseSamples.mjs`.

| Metric | Denominator | N | Value | Answers |
|---|---|---:|---|---|
| **Axis score** (C63 PARCEL) | private **buildable** land (OSM non-public footprint-area proxy) | 120 | **100 %** | *how good is the cadastre where one may build?* |
| **Click coverage** | **every** point in the region bbox — streets, Seine, Bois, rail included | 60 | **68.3 %** | *what does a random click get?* |
| **Answer correctness** | every point in the region bbox | 60 | **100 %** | *did every click get a TRUE answer — a parcel **or** an honest "no parcel here"?* |

⚠ **Paris has the widest axis-vs-coverage spread on the board (100 % vs 68.3 %), and it is a LEGAL
fact, not a data gap.** 19 of 60 uniform clicks returned a well-formed **empty** answer. The French
cadastre does not parcel the **domaine public** — roads, the Seine, railway land, many public squares —
so roughly a third of the surface of Paris is *correctly* "not a parcel". These are **measured
absences excluded from the axis** (`not-applicable ≠ 0 %`), counted in coverage, and correct in
correctness. Anyone quoting "Paris parcels ~68 %" as a quality figure has swapped the denominators.

⚠ **The buildable-land proxy is NOT the legal denominator** — no French buildable-land census backs
it; it is a conservative OSM stand-in that under-counts vacant plots, gardens and setbacks.

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
*Last updated: 2026-08-01 (L-658 — PARCEL measured 100 %; TWO stale DATA-SOURCES slot verdicts corrected). Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; the legacy `RATE.md` (legislation) was migrated to `LEGISLATION-RATE.md` this pass.*
