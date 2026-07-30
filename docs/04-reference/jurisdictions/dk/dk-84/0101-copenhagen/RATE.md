# City RATE — master completion scorecard — Copenhagen / København (dk-84, 0101)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the two CHEAP axes (DATA-SOURCES · CONTEXT) are cited-derived per C63 §8.1, every other axis is `not-assessed` with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `66%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · TERRAIN ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

Copenhagen is Denmark's **deeply-tackled reference city** — the anchor of `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`
and the only DK city carrying **bespoke** envelope/refusal code (`dkPerimeterBlock.ts` L-619, `dkPlandataRefusal.ts`)
and a terrain bake row. That work raises no axis *number* here (the scorecard function has not run), but it is why
the derivations below cite real Copenhagen-specific state, not just national coverage.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | DK cadastral provider IS wired: `parcelProviders/registry.ts` `matrikel-dk` (`isInDenmark`→`/api/parcel/dk`, kind `cadastral`, Datafordeler `mat:Jordstykke` EPSG:25832→WGS84) — but **CREDENTIAL-GATED** (`DATAFORDELER_USERNAME/PASSWORD` server-side; NOT keyless — anonymous probes → HTTP 404). Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | DK is resolved by `DkZoningProvider` + `mapPlandataToZoningRecord` over the **keyless national Plandata WFS** (`server/plandataZoningProxy.js`) — the FIRST genuine-data / `structured` fidelity-1 jurisdiction (C58 §1.2). The national data-fill is high (`dk/RATE.md`: ~96 % digital-data / ~87 % pure-structured byzone, L-609/L-611) but that is the **country LEGISLATION-RATE prior**, NOT this city's verified-cited axis: **no per-city clau audit run** and the L-449 sign-off is **PENDING** (`dk/sources/VERIFICATION.md`, 2 open items). §1.6 forbids `human-reviewed` without it. |
| 3 | **DATA-SOURCES** | 15 % | **70%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **documented** (`matrikel-dk` wired, credential-gated) · regional-zone-GIS **live** (Plandata national WFS, keyless, `DkZoningProvider`) · building-height nDSM **documented** (`heightSources.mjs` `geodanmark` impl:`live`, apikey-gated DHM `dhm_overflade−dhm_terraen`; per-bbox bake not confirmed landed) · terrain DEM **documented** (`terrain.mjs` source `dk` = DHM `dhm_terraen` WCS, apikey-gated) · context-OSM **live** (`bake.mjs` REGIONS `denmark`). Mean = (0.5+1.0+0.5+0.5+1.0)/5 = **0.70**. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | DK builds a **structured-from-provider** envelope (`DkZoningProvider`→`ZoningRulesEngine`), and Copenhagen specifically has a **block-derived perimeter-band STUDY default** (`rulepacks/dkPerimeterBlock.ts`, L-619 — the *karré* courtyard, reusing the BCN `block-derived-alignment` solver) + an honest refusal (`rulepacks/dkPlandataRefusal.ts`). BUT the STUDY band is **human-gated, NOT a certified ordinance number**, and **no per-city solver-coverage measurement** (buildable-land share × tier) exists (C58). Certified tier needs the PENDING L-449 sign-off. |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `license-restriction` | Terrain bake row present: `terrain.mjs` TERRAIN_CITIES `copenhagen` (source `dk` = DHM `dhm_terraen`, bbox `12.50,55.63,12.65,55.72`) — but the DK DHM WCS is **apikey-gated** (`DATAFORDELER_API_KEY`) and the adapter note states *"Copenhagen skips loudly until the key is in env."* Cannot confirm baked: **no `layer.json` 200 nor `terrain.verify.mjs` round-trip** was probed, and without the repo secret the bake produces nothing. Not rung-50 (which asserts *baked*). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Denmark is **measured-height-capable nationally** via DHM nDSM (`bake.mjs` denmark `heightJoin:'dhm'`; `heightSources.mjs` `stampDhmHeightsOnGeojsonseq` / `geodanmark` impl:`live`, P90 of `dhm_overflade−dhm_terraen`). But the join is **apikey-gated** (`DATAFORDELER_API_KEY`): without the key it is `blocked` → footprints keep the honest OSM `assumed` default, and **no per-bbox provenance histogram was probed** (`tagged` fraction unmeasured). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `denmark` context bake bbox (`bake.mjs` REGIONS `denmark`, bbox `7.70,54.40,15.30,57.90`; Copenhagen's own clip was removed 2026-07-26 — it rides the national region). Long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but recorded as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal-only via water/coastline, not tile-probed here → excluded. Score 5/9 = **0.556**. Validation `not-checked` — the DK context spike is NOT STARTED (`dk/topics/`). |

## §CONTEXT-DATA-HONESTY note

DOES: national **keyless** Plandata `structured` zoning (`DkZoningProvider`) · a Copenhagen block-derived
perimeter-band STUDY envelope (`dkPerimeterBlock`, human-gated) · credential-gated cadastral parcel routing
(`matrikel-dk`) · baked OSM context (5/9 layers). REFUSES: a fabricated estimated triple where Plandata resolves
a plan but publishes no structured height/FAR (`dkPlandataRefusal`) — a reasoned, cited refusal, never a borrowed
number. UNKNOWN (typed): PARCEL quality (`not-queried`), per-city LEGISLATION + ENVELOPE (`pending-implementation`),
TERRAIN (`license-restriction`, apikey-gated), HEIGHTS histogram (`not-queried`). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

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
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1 (Denmark).*
