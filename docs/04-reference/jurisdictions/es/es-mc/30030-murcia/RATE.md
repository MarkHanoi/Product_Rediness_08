# City RATE — master completion scorecard — Murcia (es-mc, 30030)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30, REVISED 2026-08-01 after the PGOU TR-2012 transcription — scorecard function not yet shipped (C63 §8); every scored axis is cited-derived per C63 §8.1, every unscored axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `39%` · `partial: true`** — renormalised over the ASSESSED
axes (LEGISLATION · DATA-SOURCES · ENVELOPE · TERRAIN · CONTEXT, weights summing to 75); PARCEL and
HEIGHTS/LOD remain honestly `not-assessed`, not 0 % (C63 §1.2/§1.5).
**`honestyOk: true`** (no fabricated value; every unknown typed).

> ⚠ **THIS WENT DOWN FROM 61 %, AND THAT IS THE SCORECARD WORKING.** The 61 % was renormalised over
> only the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT), with the two heaviest axes —
> LEGISLATION (25) and ENVELOPE (20) — excluded as `not-assessed`. Both are now **measured**, and
> ENVELOPE measures **0 %** because the verification gate is shut. A composite that rises when you
> measure a weak axis is a composite that was flattering you. Arithmetic:
> `(25·33 + 20·0 + 15·90 + 10·50 + 5·56) / 75 = 2955 / 75 = 39.4 %`.

> ⚠ **AND THE UNDERLYING STATE IMPROVED SUBSTANTIALLY on 2026-08-01**: the governing instrument was
> sourced and transcribed, and DATA-SOURCES rose 70 % → 90 %. Read `ENVELOPE.md` before reading
> this number as a regression.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`, cadastral · keyless · live), but Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | **33%** | `not-checked` | — | ⬆ was `not-assessed`. The governing instrument is SOURCED and TRANSCRIBED: PGOU de Murcia, *Normas Urbanísticas*, Texto Refundido diciembre 2012 (205 pp, `urbanismo.murcia.es`, `TR PG vol_11 NN UU.signed.pdf`). 25 calificaciones classified four-state; **14 packed** with article + verbatim quote (`rulepacks/esMurciaPgou2012.ts`). Score = **share of PRIVATE BUILDABLE land (L-656; 75.145 km², measured over 23 066 in-force polygons) whose governing article is identified AND transcribed = 33.0 %**. ROUTING completeness is separately 100 % — every parcel gets a typed, cited regime. See `LEGISLATION-RATE.md`. |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `not-checked` | — | ⬆ was 70 %. 5-slot checklist: cadastre-parcel **live** (Catastro national) · regional-zone-GIS **live** — ⬆ corrected: Murcia's MUNICIPAL GeoServer (`Murcia:pgou_alineaciones` + `Murcia:pgou_sectores`) is wired through `/api/es/murcia-pgou` and read at every click (`resolveMurciaZoning.ts`); the old `none` was stale · building-height nDSM **documented** (`heightSources.mjs` `mds_edificacion`, national CNIG MDS raster; per-city bake not confirmed landed) · terrain DEM **live** (PNOA MDT, keyless, HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = 0.9. |
| 4 | **ENVELOPE** | 20 % | **0%** | `not-checked` | — | ⬇ was `not-assessed`; now MEASURED, and the measurement is zero. A pack exists (14 zones) but `MURCIA_ENVELOPE_VERIFIED = false`, so **no parcel renders a number** — every one gets a cited refusal. Solver coverage after sign-off would be **33.0 %** of buildable land (16.5 % excluding the expressly *interim* `RL` regime, Art. 5.14.3); the remaining **67.0 %** is delegated by the PGOU to a Plan Parcial / PERI / ED and is unreachable by any transcription of this instrument. ⚠ On the orchestrator's census method (published `superficie`, *Urbano* = 56.0 M m²) the same reading gives **39.5–61.8 %** direct / 38.2 % delegated; the gap is 41.4 pp of delegation published on the `calificacion` attribute, which a sectores-layer census cannot see. Both refute the census's projected ~75 %. See `ENVELOPE.md` §2 and `findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `murcia` (source `es` = PNOA MDT, §ES-ALL-CAPITALS L-636). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked; context buildings render OSM/assumed. National MDS Edificación (live) could join via the `spain` `heightJoin:'mds'`, but no per-city provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but C63 §3 Axis 7 records that re-bake as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal-only via water/coastline, not tile-probed here → excluded. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro parcel routing + **live municipal zoning
(calificación · ámbito · clase de suelo · validity interval)** + baked OSM context (5/9 layers).
REFUSES: an envelope — on **two structurally different grounds**, kept apart: (a) on PGOU-direct
land the numbers are transcribed but the transcription is **unsigned** (a statement about PRYZM);
(b) on the delegated 67 % the general plan is the **wrong instrument** and no signature helps (a
statement about the law, `legallyGrounded: true`). Never a borrowed or invented number — a test
asserts the pack cites no Catalan instrument. UNKNOWN (typed): PARCEL quality (`not-queried`),
HEIGHTS (`not-queried`); PGOU **BORM approval reference** (`not-located-in-source` — *not*
"does not exist"); concordance of the **2017 re-edition** with the 2012 TR (unverified).
`honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

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
*Last updated: 2026-08-01 (PGOU TR-2012 transcription; LEGISLATION + ENVELOPE first measured; DATA-SOURCES corrected 70→90). Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
