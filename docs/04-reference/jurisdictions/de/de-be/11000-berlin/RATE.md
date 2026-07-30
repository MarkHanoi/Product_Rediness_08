# City RATE — master completion scorecard — Berlin (de-be, AGS 11000)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the two
     ASSESSED cheap axes (DATA-SOURCES · CONTEXT) are cited-derived per C63 §8.1, every other axis is
     not-assessed with a typed C62 reason. NO cell is a fabricated number. TERRAIN is honestly
     not-assessed (no bake row for Berlin's Land — the DE DTM source covers NRW only). -->

**Overall completion (assessed subset): `44%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · TERRAIN ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).
> Arithmetic: `(0.40·15 + 0.56·5) / (15+5) = 8.8/20 = 0.44`.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | Berlin routes to **footprint-fallback**, NOT cadastre: `parcelProviders/registry.ts` sends non-NRW German points via `isInGermany` → `providerId:'footprint'`, `kind:'footprint-fallback'` (note: "ALKIS outside NRW is per-Land licence-gated — no keyless national WFS"). The open ALKIS cadastre is **NRW-only** (`alkis-nrw`, `isInNRW`); Berlin is a different Land. Axis 1 also needs a `computeParcelConfidence` sample, which has not been run. Footprint-fallback is **capped low by construction** (C57 §L-640) once assessed. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | A structured-fill PRIOR exists (**~28 %**, hand-authored — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): FIS-Broker/`gdi.berlin.de/services/wfs/bplan` HTTP 200 DL-DE Zero 2.0, but GRZ/GFZ/Höhe absent from schema; four-regime split §30/Baunutzungsplan-1958-60/§34/§35). But it is a hand figure with **no signed `sources/VERIFICATION.md`** (L-449) and **no rule pack** (`rulepacks/registry.ts` has zero DE packs), so C63 §1.1/§1.6 keep the composite axis `not-assessed` — the prior is not laundered into the score. |
| 3 | **DATA-SOURCES** | 15 % | **40%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **blocked** (ALKIS Berlin per-Land licence-gated → footprint, `registry.ts`) · regional-zone-GIS **documented** (`gdi.berlin.de/services/wfs/bplan` confirmed HTTP 200 + open licence, but NOT wired into `siteDispatch`) · building-height LoD2 **documented** (`heightSources.mjs` `REGION_SOURCE.berlin='lod2de'`, `SOURCES.lod2de.impl='documented'`; Berlin Land is open but only the NRW fetch `fetchLod2DeNrw` is live — no Berlin fetcher wired) · terrain DEM **none** (no wired DTM for Berlin's Land — `terrain.mjs` `de` source = DGM1 NRW only; Berlin explicitly BLOCKED) · context-OSM **live** (`bake.mjs` REGIONS `berlin`, bbox `13.28,52.44,13.55,52.58`). Mean = (0+0.5+0.5+0+1.0)/5 = **0.40**. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack for Berlin (`rulepacks/registry.ts` holds only Catalan/Madrid/Córdoba packs + AMB refusal-gates). Solver coverage unmeasured (C58). Inventing a GRZ/GFZ/Höhe is forbidden (§CONTEXT-DATA-HONESTY) — and Berlin's Baunutzungsplan-1958/60 figures additionally carry a judicial *funktionslos* voidance risk (OVG Bln-Bbg 2020, Az. 2 B 10.17). |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `outside-coverage` | **No terrain bake row for Berlin.** `terrain.mjs` TERRAIN_CITY has only `koln` (source `de` = DGM1 NRW) for Germany; comment L302-303 explicitly keeps **Berlin/Munich BLOCKED (different Länder, separate portals)**. Unlike every Spanish capital (which inherits one national PNOA MDT row = rung-50), Berlin has NO wired DTM source → cannot even reach rung-50. Honest `not-assessed`, never a fabricated rung. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-source is **documented but unbaked**: `heightSources.mjs` maps `berlin→lod2de` (`impl:'documented'`, ~58M buildings nationally, ~1 m; Berlin Land open) but the per-Land Berlin CityGML fetcher is not wired (only NRW is live) and no provenance histogram has been probed. Context buildings render OSM/assumed (9 m). Capability ≠ measurement (§CONTEXT-DATA-HONESTY). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `berlin` context bake bbox (`bake.mjs` REGIONS `berlin`, Geofabrik `berlin-latest.osm.pbf`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but recorded as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Berlin is inland — no coastline. Score 5/9 = **0.56**. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM context (5/9 layers, `bake.mjs berlin`) + honestly-labelled OSM footprint selection. REFUSES:
an envelope (no rule pack; Baunutzungsplan voidance risk) — never a borrowed/invented number. UNKNOWN (typed):
PARCEL quality (`not-queried`; routes to footprint-fallback), LEGISLATION + ENVELOPE (`pending-implementation`,
~28 % unverified prior in `LEGISLATION-RATE.md`), TERRAIN (`outside-coverage` — no DTM for Berlin's Land),
HEIGHTS (`not-queried`; LoD2-DE documented-not-wired). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~28 % prior) | LEGISLATION |
| [`README.md`](./README.md) | jurisdiction pack — four-regime structure, governing instruments | all |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations + human sign-off | LEGISLATION / ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded/migrated under audit L-649 Phase-1. AGS from `de/README.md`; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` + `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
