# City RATE — master completion scorecard — Aalborg (dk-81, 0851)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the two CHEAP axes (DATA-SOURCES · CONTEXT) are cited-derived per C63 §8.1, every other axis is `not-assessed` with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `66%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · TERRAIN ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

Aalborg (Region Nordjylland) is **nationally covered, not individually baked/packed** — it inherits Denmark's
national providers (keyless Plandata zoning, credential-gated Matrikel parcel, DHM heights, national OSM
context bake) but carries **no city-specific rule pack, STUDY default, or terrain row** (those exist only for
Copenhagen). Every axis derivation below cites the *national* state that reaches this bbox.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | DK cadastral provider IS wired nationally: `parcelProviders/registry.ts` `matrikel-dk` (`isInDenmark`→`/api/parcel/dk`, kind `cadastral`, Datafordeler `mat:Jordstykke`) — but **CREDENTIAL-GATED** (`DATAFORDELER_USERNAME/PASSWORD`; anonymous → HTTP 404). No `computeParcelConfidence` sample has been run for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Resolved by `DkZoningProvider` + `mapPlandataToZoningRecord` over the **keyless national Plandata WFS** (`structured` fidelity-1, C58). The national ~96 % digital-data / ~87 % byzone pure-structured fill (`dk/RATE.md`, L-609/L-611) is a **country prior**, NOT this city's verified-cited axis: no per-city clau audit, and the L-449 sign-off is PENDING (`dk/sources/VERIFICATION.md`). §1.6 forbids `human-reviewed` without it. |
| 3 | **DATA-SOURCES** | 15 % | **70%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **documented** (`matrikel-dk`, credential-gated) · regional-zone-GIS **live** (Plandata national WFS, keyless) · building-height nDSM **documented** (`heightSources.mjs` `geodanmark` impl:`live`, apikey-gated DHM nDSM) · terrain DEM **documented** (`terrain.mjs` source `dk` = DHM `dhm_terraen`, national adapter, apikey-gated) · context-OSM **live** (`bake.mjs` REGIONS `denmark`). Mean = (0.5+1.0+0.5+0.5+1.0)/5 = **0.70**. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | DK builds a **structured-from-provider** envelope (`DkZoningProvider`→`ZoningRulesEngine`, FAR × height inset) nationally, but this city has **no bespoke STUDY default** (the `dkPerimeterBlock` karré band is Copenhagen-specific) and **no per-city solver-coverage measurement** exists (C58). Certified tier needs the PENDING L-449 sign-off. |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `pending-implementation` | **No terrain bake row** for this bbox: `terrain.mjs` TERRAIN_CITIES registers only `copenhagen` for DK. The national DK DHM source (`terrain.mjs` source `dk`, apikey-gated) *could* cover this city, but no city bbox is registered → unmeasured, not 0. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-height-capable nationally via DHM nDSM (`bake.mjs` denmark `heightJoin:'dhm'`; `heightSources.mjs` `stampDhmHeightsOnGeojsonseq`, P90 of `dhm_overflade−dhm_terraen`). Apikey-gated (`DATAFORDELER_API_KEY`): without the key it is `blocked` → OSM `assumed` default; no per-bbox provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `denmark` context bake bbox (`bake.mjs` REGIONS `denmark`, bbox `7.70,54.40,15.30,57.90`). Long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (L-642) but not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal-only via water/coastline, not tile-probed → excluded. Score 5/9 = **0.556**. Validation `not-checked` — the DK context spike is NOT STARTED (`dk/topics/`). |

## §CONTEXT-DATA-HONESTY note

DOES: national **keyless** Plandata `structured` zoning · credential-gated cadastral parcel routing · baked OSM
context (5/9 layers) — all inherited nationally. REFUSES: a fabricated envelope/estimate where Plandata lacks
published numbers (`dkPlandataRefusal`) — never a borrowed number. UNKNOWN (typed): PARCEL quality (`not-queried`),
per-city LEGISLATION + ENVELOPE (`pending-implementation`), TERRAIN (`pending-implementation`, no city row),
HEIGHTS histogram (`not-queried`). `honestyOk: true`.

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
