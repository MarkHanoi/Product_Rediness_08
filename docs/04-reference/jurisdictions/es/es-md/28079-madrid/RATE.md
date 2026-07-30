# City RATE — master completion scorecard — Madrid (es-md, 28079)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 (L-649 dossier normalization) — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `71%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed). The legislation detail lives in [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)
(~68 % data-readiness — the richest Spanish city) and FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`). No `computeParcelConfidence` run for this bbox; the block-ring dissolve is **2/4 in Madrid** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`, tolerant-mode gap, weaker than Barcelona's 2/2). Axis measures the parcel-quality distribution over an N-parcel sample — not yet run (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Measured legislation detail = [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): **~68 % data-readiness** (second only to Denmark) — NZ 1 publishes `COEF_Z` + `Fondo de la Edificación` as live ArcGIS geometry; `PG_ORDENACION` calificación PRIOR-VERIFIED. But per-NZ land-share split UNSOURCED, NZ 4/8/5/7 numbers DOCUMENT-gated (NNUU Compendio 2023). No composite Axis-2 clau-inventory scorecard run; a % here would double-count the sub-rate. |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Catastro national) · regional-zone-GIS **live** (PGOUM-97 planes on `sigma.madrid.es/.../pgoum97`, 12 services; `PG_ORDENACION` PRIOR-VERIFIED) · building-height nDSM **documented** (`heightSources.mjs` `REGION_SOURCE.madrid='mds_edificacion'`, per-city bbox configured; per-city bake not confirmed landed) · terrain DEM **live** (`terrain.mjs` TERRAIN_CITY `madrid`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = (1+1+0.5+1+1)/5 = 0.90. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | Madrid IS **registered** as a refusal jurisdiction (`rulepacks/registry.ts`, L-608); the `explicit-area` solver + NZ 1 provider/adapter have **SHIPPED + tested** (C58 §2.2 **KG-4 now open** — `esMadridNZ1.ts`, `esMadridNZ1Provider.ts`, `findings/L-608-*-SHIPPED.md`). But the **live envelope is still a cited refusal**: `resolveMadridNZ1Ring` has **no same-origin Madrid proxy wired**, so the published footprint can't be fetched, and the `PG_ORDENACION` calificación mapping is UNVERIFIED (HTTP 500). NZ 4/8/5/7 remain document-gated. Shippable resolution today ≈ 0 %; engine ceiling ~60–62 %. See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `madrid` (source `es` = PNOA MDT) + control points (Puerta del Sol / Retiro / North M-30). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed here. Same rasant-datum caveat as Barcelona (L-584). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked (Catastro footprint national; height coarse; nDSM ❌). The CNIG MDS Edificación per-city source is configured (`REGION_SOURCE.madrid`) but no per-city provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) but not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: inland, n/a. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro + live PGOUM-97 zone GIS + NZ 1 published footprint data + a shipped `explicit-area` solver + NZ 1 provider + baked OSM context (5/9). REFUSES: a live envelope — Madrid is registered as a refusal jurisdiction; the ring resolver has no wired same-origin proxy and the calificación mapping is unverified, so every parcel gets the cited NZ 1 refusal; NZ 4/8 are document-gated (NNUU PDF unsourced); NZ 3 = `derived-plan` refusal. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`). `honestyOk: true`. ⚠ The ~68 % legislation rate measures DATA readiness, NOT PRYZM's current wiring (~0 % shippable today) — do not conflate.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~68 %) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`README.md`](./README.md) · `sources/` · `findings/` | governance · citations · L-NNN investigation records | LEGISLATION · — |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Normalized to the C63 7-file standard under audit L-649.*
