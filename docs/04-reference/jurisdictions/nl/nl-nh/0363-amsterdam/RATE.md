# City RATE — master completion scorecard — Amsterdam (nl-nh, CBS 0363)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `87.7%` · `partial: true` — over 45 % of the ratified weight**
— renormalised over the four ASSESSED axes (**PARCEL** · DATA-SOURCES · TERRAIN · CONTEXT, Σ weight
15+15+10+5 = **45**); LEGISLATION · ENVELOPE · HEIGHTS/LOD stay honestly `not-assessed`, not 0 %
(C63 §1.2/§1.5). **`honestyOk: true`**.

> ⚠ **READ `45 %` BEFORE `87.7 %`.** The two heaviest axes (LEGISLATION 25 + ENVELOPE 20 = **45 pts**,
> as much weight as everything measured here) are still outside the denominator, and both are genuinely
> **zero** for Amsterdam — no NL rule pack is registered. A headline that rises because the
> *denominator* shrank is the artefact C63 §4 warns about, and it is the whole reason `weightAssessed`
> is printed next to it.
>
> ⚠ **CONTEXT sensitivity:** against the tile-VERIFIED 5/9 this dossier audited (rather than the
> scorecard's declaration-based 8/9) the composite is **84.0 %**. Reproduce either with
> `node tools/city-completion/computeScorecard.mjs --region amsterdam --cc nl [--context-layers buildings,roads,water,parks,landuse]`.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | **100.0%** | `auto-validated` | — | **MEASURED 2026-08-01** (`parcelSampleProbe.mjs --city amsterdam`, seed `20260801`) — **the joint-best result on the board, and a PERFECT sample.** **DENOMINATOR = private buildable land** (L-656), sampled independently of the Kadaster as **OSM non-public building-footprint area** — 5,171 footprints in 40 uniformly-random 330 m tiles over bbox `[4.83,52.34,4.97,52.42]`, points drawn **∝ footprint area** (unbiased for AREA, not parcel COUNT). **N = 120: high 120 · medium 0 · low 0 · no-parcel-here 0 · 0 transport failures.** Every point returned a BRK `Perceel` with a registry-declared `kadastraleGrootteWaarde` **and** the click inside the ring. 95 % Wilson CI on the `high` share: **96.9 %–100 %**. ⚠ **ADAPTER FINDING:** `CQL_FILTER` on `begrenzingPerceel` is **silently wrong** on this PDOK service (an Amsterdam point returned a *Teteringen* parcel); the working point query is `BBOX` with `urn:ogc:def:crs:EPSG::4326` (lat,lon). Anything wired against CQL here would have shipped plausible garbage. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Amsterdam (`rulepacks/registry.ts` carries no NL pack); `sources/VERIFICATION.md` is **OPEN**. NL zoning moved to the **omgevingsplan** under the Omgevingswet (in force 1 Jan 2024, replacing the bestemmingsplan), served via the national **DSO / ruimtelijkeplannen.nl** register — but no per-clau structured-fill audit has been run (`LEGISLATION-RATE.md` = NOT YET ASSESSED). Inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **100%** | `auto-validated` | — | 5/5 slots **live**: cadastre-parcel **live** (Kadaster BRK; 120/120 real parcels this session) · regional-zone-GIS **live** (⚠ **CORRECTION, +10 pp** — the 2026-07-30 audit scored this `documented` on the belief it was "NOT probed or wired into `siteDispatch.ts`". **That is stale.** `NL_BESTEMMINGSPLAN_PATH` is **mounted in `server.js`** → `server/nlBestemmingsplanProxy.js` → `service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0`, GetCapabilities **HTTP 200 2026-08-01**, and `siteDispatch.ts` consumes `/api/nl/bestemmingsplan`) · building-height nDSM **live** (`heightSources.mjs` `3dbag` impl:`live`, `REGION_SOURCE.amsterdam`) · terrain DEM **live** (`terrain.mjs` `nl` = AHN `dtm_05m`, keyless CC0) · context-OSM **live** (`bake.mjs` REGIONS `netherlands`). Mean = 5/5 = 1.00. ⚠ The whole-country bake keeping OSM heights is **Axis 6**, not this axis — Axis 3 measures whether the *feed* is wired + live. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Amsterdam; solver coverage unmeasured (C58). The omgevingsplan carries building rules (goothoogte / bouwhoogte / bebouwingspercentage) per gebied, but none are sourced/wired. BCN/Madrid/Córdoba have packs — Amsterdam does not. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` REGIONS `amsterdam` (source `nl` = AHN, bbox `[4.83,52.34,4.97,52.42]`; AHN `dtm_05m` PDOK WCS keyless CC0, GetCoverage HTTP 200 live-verified 2026-07-25). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. (NL is famously flat — relief fidelity is low-stakes here, but the datum lift NAP→WGS84 ellipsoidal `geoidSepM 43.0` is wired.) |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE** — the strongest EU building-height source: **3DBAG** (BAG × AHN LiDAR) is wired + live (`heightSources.mjs` `3dbag` impl:`live`; `REGION_SOURCE.amsterdam:'3dbag'`; roof-50pctile − ground → real metres, `tagged`, LoD2-mesh capable via `b3_dak_type`). But the **whole-country `netherlands` bake refuses 3DBAG per-tile** (the paginated `items` API would truncate a 4°×3° scan at ~5000 arbitrary buildings → `documented`, keeps OSM), so the deployed national tiles render OSM `assumed` for Amsterdam. The Amsterdam per-city bbox `4.83,52.34,4.97,52.42` (0.14°×0.08° < 0.6° guard) **resolves exactly** — but that per-city bake has NOT landed, and no per-building `heightProvenance` histogram was probed. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the national `netherlands` context bake bbox (`bake.mjs` REGIONS `netherlands`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Amsterdam sits on the IJ (former Zuiderzee inlet, now freshwater IJ/IJmeer) with no `natural=coastline` in the bbox — the North Sea coast is ~20 km west — so sea is genuinely absent/not-applicable, not fabricated. Score 5/9. |

## The THREE PARCEL numbers — never conflated (L-656 / MASTER-ROI-TRACKER §0.5.2)

All three are true statements about Amsterdam on **2026-08-01**, each with a different denominator.
Reproduce: `node tools/city-completion/summariseSamples.mjs`.

| Metric | Denominator | N | Value | Answers |
|---|---|---:|---|---|
| **Axis score** (C63 PARCEL) | private **buildable** land (OSM non-public footprint-area proxy) | 120 | **100 %** | *how good is the cadastre where one may build?* |
| **Click coverage** | **every** point in the region bbox — the IJ, canals, port included | 60 | **100 %** | *what does a random click get?* |
| **Answer correctness** | every point in the region bbox | 60 | **100 %** | *did every click get a TRUE answer?* |

**The Netherlands is fully parcelled — including water.** 60/60 uniform clicks across the whole bbox
returned a real BRK `Perceel`; unlike Spain (sea) or France (non-cadastrated public domain), there is
no measured-absence class here. Amsterdam is the cleanest parcel city measured.

⚠ **The buildable-land proxy is NOT the legal denominator** — it is a conservative OSM stand-in, not a
Dutch buildable-land census. With coverage at 100 % on *both* denominators the distinction happens not
to bite here, but it must not be dropped when comparing to a city where it does.

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
*Last updated: 2026-08-01 (L-658 — PARCEL measured 100 %, zone-GIS slot corrected to live). Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1.*
