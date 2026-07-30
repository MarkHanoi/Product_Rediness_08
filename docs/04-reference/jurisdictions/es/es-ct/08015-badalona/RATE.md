# City RATE — master completion scorecard — Badalona (es-ct, 08015)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 (L-649 dossier normalization) — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `71%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed). Badalona is a **Phase-2 AMB refusal city**: ROUTED + WIRED, envelope gate
CLOSED (cited refusal). Legislation detail = [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)
(NOT MEASURED — typed-unknown) and FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (shared with Barcelona, S1). No `computeParcelConfidence` run; block-ring dissolve success **not-queried** for 08015 (`ENVELOPE.md`). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `not-queried` | [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) is **NOT MEASURED** — no per-clau audit has been run for 08015. Borrowing Barcelona's ~48 % would be a fabrication about another municipality's land (the honesty gate in `esBadalona.ts` forbids it). |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Catastro national, S1) · regional-zone-GIS **live** (Generalitat MUC, per-parcel clau, S3 — shared with Barcelona) · building-height nDSM **documented** (national CNIG MDS `mds_edificacion` exists but 08015 is **NOT** in the per-city `REGION_SOURCE` list; per-08015 join not-started) · terrain DEM **live** (`terrain.mjs` TERRAIN_CITY `badalona`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = (1+1+0.5+1+1)/5 = 0.90. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | ROUTED + WIRED (S1–S5 present, `esBadalona.ts`) but the honesty gate `BADALONA_ENVELOPE_VERIFIED = false` → `badalonaUnverifiedRefusal` (`code:'no-rule-pack'`) for **every** parcel. This is a PRYZM verification-status statement, NOT law (the PGM-1976 does grant an envelope). Barcelona's tables do NOT transfer. See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `badalona` (source `es` = PNOA MDT). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip recorded; same rasant caveat as Barcelona (L-584). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Heights ESTIMATED (OSM `levels`×3.2 m or the 9 m `assumed` default); the split for 08015 is **not-queried** (H1 probe output). The CNIG MDS source exists nationally but 08015 has **no per-city bbox configured** + no confirmed join. See [`HEIGHT.md`](./HEIGHT.md). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) not-yet-landed → excluded. pedestrian: not a baked layer. sea: coastal-adjacent, not tile-probed here → excluded. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro + live MUC zone GIS + baked OSM context (5/9). REFUSES: an envelope — `BADALONA_ENVELOPE_VERIFIED = false`, a cited refusal on every parcel (a verification-status statement, never "the law forbids building"). UNKNOWN (typed): PARCEL (`not-queried`), LEGISLATION (`not-queried` — not measured), ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`). `honestyOk: true`. "Same instrument (PGM-1976)" is NOT "same numbers" — reusing a Barcelona figure here would be a confident mis-citation on another municipality's land.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (NOT MEASURED) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (gate CLOSED) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (estimated) | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite master added under audit L-649; existing refusal-envelope content retained unchanged.*
