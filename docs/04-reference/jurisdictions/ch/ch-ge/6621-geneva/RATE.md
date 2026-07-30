# City RATE — master completion scorecard — Genève (ch-ge, BFS 6621)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `66%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; the national CH zoning pack REFUSES the envelope rather than borrow a number).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National swisstopo **Amtliche Vermessung** cadastre IS wired (`parcelProviders/registry.ts` `isInSwitzerland`→`swisstopo-av`, keyless, all-canton; **GE live-verified 2026-07-26** per the registry note). CH is cadastral-capable (not footprint-fallback). But Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | **No city rule pack for Genève** — only the national zone-ID pack (`chZoning.ts`, `ch-national-grundnutzung`). Canton GE IS `full` in the geodienste `ms:grundnutzung` WFS (zone code + label + main-use, structured) and the ÖREB/**RDPPF** cadastre `ge.ch/terecadastrews/RdppfSVC.svc` is VERIFIED-LIVE (WCF SOAP). But the Ausnützungsziffer/height is model+PDF-bound (national Outcome B) and NO GE Baureglement values are transcribed or signed (`../../sources/VERIFICATION.md` OPEN for named parcels). Coarse national prior ~20–25 % (`../../RATE.md`), not the Axis-2 count. |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (swisstopo AV, keyless, GE live-verified) · regional-zone-GIS **documented** (national geodienste `ms:grundnutzung` — canton GE `full`; ÖREB GE RDPPF `RdppfSVC.svc` live; rated `documented` not `live` — `siteDispatch.ts` wiring unconfirmed, and RDPPF is SOAP/WCF not REST) · building-height nDSM **documented** (`heightSources.mjs` `swissbuildings3d`, `REGION_SOURCE` `geneva`; keyless swisstopo nDSM via STAC, but the wiring is a BUILD, §SWISS-NDSM-STAC-BUILD) · terrain DEM **live** (`terrain.mjs` `ch` = swissALTI3D STAC, keyless HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `geneva`). Mean = (1.0+0.5+0.5+1.0+1.0)/5 = 0.8. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No city buildable-envelope pack for Genève. The national `chZoning.ts` pack identifies the zone (structured) and returns a **cited REFUSAL** (`chZoningEnvelopeRefusal` — names the missing Nutzungsziffer/height) — 100 % honest (C63 §3.1) but 0 % complete. Unlike Zürich (which has a BZO catalogue), GE has no transcribed FAR. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain row present: `terrain.mjs` REGIONS `geneva` (source `ch` = swissALTI3D STAC, keyless HTTP 200; bbox `[6.09,46.17,6.18,46.25]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: swisstopo nDSM (swissSURFACE3D DSM − swissALTI3D DTM) keyless, STAC-live (`heightSources.mjs` `swissbuildings3d`, impl:`documented`; `REGION_SOURCE` `geneva`). But the per-city bake has NOT landed and the wiring is a BUILD (STAC→COG-stitch + LV95 reprojection, §SWISS-NDSM-STAC-BUILD) — region keeps the honest OSM default. No provenance histogram probed. See `HEIGHT.md`. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `geneva` context bake bbox (`bake.mjs` REGIONS `geneva`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: landlocked — genuinely absent (Lac Léman rides the `water` layer), not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (swissALTI3D, rung-50) + national swisstopo AV cadastre routing (cadastral, GE live-verified) + baked OSM context (5/9) + a national/cantonal zone-GIS (geodienste GE + ÖREB GE RDPPF). REFUSES: a buildable envelope (no city FAR pack; national pack cites the missing density) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, measured-capable via swisstopo nDSM). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~20–25 % national prior) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (national cited-refusal) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (swisstopo nDSM measured-capable) | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; both the composite `RATE.md` and the per-axis `LEGISLATION-RATE.md` are authored new this pass.*
