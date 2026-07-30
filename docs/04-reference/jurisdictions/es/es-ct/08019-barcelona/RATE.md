# City RATE — master completion scorecard — Barcelona (es-ct, 08019) — THE PILOT

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 (L-649 dossier normalization) — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `71%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed). Barcelona is **the PILOT** — the one Spanish city with a LIVE constructed
envelope (13a); its legislation detail is [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (~48 % — measured
data-readiness AND realistic full-envelope ceiling) and FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`); block-ring dissolve is **2/2 in Barcelona** (L-535) — the strongest in the Spanish set. But no `computeParcelConfidence` run over an N-parcel sample has been executed for this bbox (C63 §8), so the axis is unmeasured. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Measured legislation detail = [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): **~48 %** — the clau is live via MUC, the alineació fabric (13a/13b/12 ≈ 44 % of buildable land) is derivable, 13a **shipped** + **founder-accepted (L-449, 2026-07-20)**. The derived-planning slice (~40 %) is plànol-bound (height ~0 % OCR-extractable, `findings/L-590h`). No composite Axis-2 clau-inventory scorecard run; a % here would double-count the sub-rate. |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Catastro national, dissolve 2/2) · regional-zone-GIS **live** (AMB MUC WMS `CODI_QUAL_AJUNT` via `server/mucZoningProxy.js`, per-parcel clau) · building-height nDSM **documented** (`heightSources.mjs` `REGION_SOURCE.barcelona='mds_edificacion'` configured; L-582 shows the shipped tiles are still estimate-heavy → not confirmed landed) · terrain DEM **live** (`terrain.mjs` TERRAIN_CITY `barcelona`, source `es` = PNOA MDT; Cesium World Terrain in production) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = (1+1+0.5+1+1)/5 = 0.90. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | Barcelona is the **only Spanish city with a LIVE constructed envelope**: **13a SHIPPED** (`block-derived-alignment`, ADR-0271, depth per PGM Art. 242.2 + height per Art. 327.2), source founder-accepted (L-449). Systems + coverage-gap claus return a **cited refusal** (L-550/L-553 SHIPPED) — never a fabricated triple. But solver coverage across all claus is unmeasured by the composite Axis-4 function; PRYZM *constructs* on ~24 % of buildable land today. See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `barcelona` (source `es` = PNOA MDT) + control points (Port/beach · Montjuïc · Tibidabo · Eixample); Cesium terrain live in production. Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed here; ⚠ seated on ONE centroid sample, not the façade *rasant* (L-584, a correctness caveat). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | L-582 MEASURED the baked provenance — **0.9 % surveyed (`tagged`) · 79.3 % `levels`×3.2 m · 19.8 % fabricated 9 m** — a real histogram, but the composite Axis-6 scorecard function has not run to convert it to an axis score, and the measured MDS join is not confirmed landed. Recorded as evidence; axis left `not-assessed` pending the scorecard run. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`); footprints MEASURED 104–121 % of OSM ground truth. Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) but not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal — via water/coastline, not tile-probed here → excluded. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT / Cesium, unverified rasant) + national Catastro (dissolve 2/2) + live MUC zone GIS + a **LIVE constructed 13a envelope** (founder-accepted) + baked OSM context (5/9). REFUSES: an envelope on the derived-planning slice + systems land — a cited "no envelope applies" / "governed by its own plan" (L-550/L-553), never a fabricated setback triple. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE composite axes (`pending-implementation`), HEIGHTS (`not-queried`, though L-582 measured the histogram). `honestyOk: true`. ⚠ ~48 % is both the measured legislation rate AND the realistic full-envelope ceiling — ~80 % is gated behind plànol vectorisation, not OCR.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~48 %, the pilot ruler) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (13a live) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails (the L-518 real-vs-constructed decision) | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to the ~48 % ceiling | all |
| `findings/` (L-525/L-590 series) · `BARCELONA-REASONING-RECORD.md` · `BARCELONA-COMPLETE-COVERAGE-PLAN.md` · `BARCELONA-DATA-PIPELINE.md` · `L-5xx-*.md` · `RULEPACK-SOURCING-SPEC.md` · `EXPERT-BRIEF.md` · `archive/` · `PGM-NNUU-metropolitana.pdf` | the pilot's deep investigation + sourcing record (retained extras) | LEGISLATION · ENVELOPE · — |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite master added under audit L-649; the pilot's pre-existing rich content (reasoning record, findings, coverage plan) retained unchanged.*
