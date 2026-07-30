# City RATE — master completion scorecard — Munich / München (de-by, AGS 09162)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the two
     ASSESSED cheap axes (DATA-SOURCES · CONTEXT) are cited-derived per C63 §8.1, every other axis is
     not-assessed with a typed C62 reason. NO cell is a fabricated number. TERRAIN is honestly
     not-assessed (no bake row for Bavaria — the DE DTM source covers NRW only). -->

**Overall completion (assessed subset): `29%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · TERRAIN ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).
> Arithmetic: `(0.20·15 + 0.56·5) / (15+5) = 5.8/20 = 0.29`.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | Munich routes to **footprint-fallback**, NOT cadastre: `parcelProviders/registry.ts` sends non-NRW German points via `isInGermany` → `providerId:'footprint'`, `kind:'footprint-fallback'` ("ALKIS outside NRW is per-Land licence-gated"). Bavaria (Bayerische Vermessungsverwaltung ALKIS) is not keylessly reachable; the open `alkis-nrw` cadastre does not cover it. Axis 1 also needs a `computeParcelConfidence` sample (not run). Footprint-fallback is capped low by construction (C57 §L-640). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | A structured-fill PRIOR exists (**~18 %**, hand-authored — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): **no B-Plan WFS endpoint discovered** — all probed Munich/Bavaria paths 404; DiPlanung mandatory statewide from 31 Oct 2026 but API schema unknown; BayBO Art. 6 Abstandsflächen = 0.4H / min 3 m confirmed). But it is a hand figure with **no signed `sources/VERIFICATION.md`** (L-449) and **no rule pack** (`rulepacks/registry.ts` has zero DE packs), so C63 §1.1/§1.6 keep the composite axis `not-assessed`. |
| 3 | **DATA-SOURCES** | 15 % | **20%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **blocked** (ALKIS Bavaria licence-gated → footprint, `registry.ts`) · regional-zone-GIS **none** (no Munich/Bavaria B-Plan WFS endpoint found — all 404; DiPlanung not yet a reachable API) · building-height LoD2 **blocked** (`heightSources.mjs` `REGION_SOURCE.munich = { source:'lod2de', status:'blocked', reason:'Bavaria LoD2 licence TBD (ZSHH INSPIRE-restricted)' }`) · terrain DEM **none** (no wired DTM for Bavaria — `terrain.mjs` `de`=DGM1 NRW only; Munich BLOCKED) · context-OSM **live** (`bake.mjs` REGIONS `munich`, bbox `11.44,48.09,11.66,48.20`, from `bayern-latest.osm.pbf`). Mean = (0+0+0+0+1.0)/5 = **0.20**. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack for Munich (`rulepacks/registry.ts` = zero DE packs). Solver coverage unmeasured (C58). The §34 fraction is unmeasured (README §"critical scheduling risk"), so even the denominator is unknown. Inventing a value is forbidden (§CONTEXT-DATA-HONESTY). |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `outside-coverage` | **No terrain bake row for Munich.** `terrain.mjs` TERRAIN_CITY has only `koln` (source `de` = DGM1 NRW) for Germany; comment L302-303 explicitly keeps **Berlin/Munich BLOCKED (different Länder, separate portals)**. Bavaria has no wired DTM → cannot reach rung-50. Honest `not-assessed`, never a fabricated rung. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `license-restriction` | Measured source **BLOCKED**: `heightSources.mjs` marks `munich` LoD2-DE `status:'blocked'` — Bavaria LoD2 licence TBD (ZSHH INSPIRE-restricted). ZSHH is hosted at the Bavarian survey office but hosting ≠ open terms (README §6). Context buildings render OSM/`assumed` (9 m). No provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `munich` context bake bbox (`bake.mjs` REGIONS `munich`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (L-642) but recorded as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Munich is inland. Score 5/9 = **0.56**. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM context (5/9 layers, `bake.mjs munich`) + honestly-labelled OSM footprint selection. REFUSES:
an envelope (no rule pack; §34 fraction unknown) — never a borrowed/invented number. UNKNOWN (typed): PARCEL
quality (`not-queried`; footprint-fallback), LEGISLATION + ENVELOPE (`pending-implementation`, ~18 % unverified
prior — no WFS endpoint found), TERRAIN (`outside-coverage` — no DTM for Bavaria), HEIGHTS (`license-restriction`
— Bavaria LoD2 blocked). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~18 % prior) | LEGISLATION |
| [`README.md`](./README.md) | jurisdiction pack — B-Plan/§34 structure, DiPlanung timing, BayBO Art. 6 | all |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations + human sign-off | LEGISLATION / ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded/migrated under audit L-649 Phase-1. AGS from `de/README.md`; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` + `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
