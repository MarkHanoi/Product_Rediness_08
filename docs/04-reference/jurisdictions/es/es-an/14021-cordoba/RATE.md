# City RATE — master completion scorecard — Córdoba (es-an, 14021)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 (L-649 dossier normalization) — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `40%` · `partial: true`** — renormalised over the ASSESSED
axes (ENVELOPE · DATA-SOURCES · TERRAIN · CONTEXT, weights summing to 50); the missing axes
(PARCEL · LEGISLATION · HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5).
**`honestyOk: true`** (no fabricated value; every unknown typed). This is the composite master; the
legislation detail lives in [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (~8 % data-fill,
OCR-unverified) and FEEDS Axis 2.

> ⚠ **THIS WENT DOWN FROM 66 %, AND THAT IS THE SCORECARD WORKING** (the same correction Murcia took
> on 2026-08-01). The 66 % was renormalised over only the three CHEAP axes (DATA-SOURCES · TERRAIN ·
> CONTEXT), with the 20-weight ENVELOPE axis excluded as `not-assessed`. ENVELOPE is now **measured**,
> and it measures **0 %** because the verification gate is shut. A composite that rises when you
> measure a weak axis is a composite that was flattering you. Arithmetic:
> `(20·0 + 15·80 + 10·50 + 5·56) / 50 = 1980 / 50 = 39.6 %`.

> ⚠ **AND ONE STALE FACT WAS CORRECTED ON 2026-08-01:** this file (and `ENVELOPE.md`, and
> `sources/VERIFICATION.md`) said the pack was **UNREGISTERED**. It is **registered** — 13 subzones,
> `rulepacks/registry.ts`. It publishes nothing only because `CORDOBA_ENVELOPE_VERIFIED = false`. The
> live state was re-established by **driving the real dispatch**
> (`apps/editor/__tests__/cordobaSiteDispatch.test.ts`), which is the only way to answer the question
> "is this city rendering numbers today?" — reading either file gave the wrong answer.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`), and the COACo pilot adds `coaco:vcatastro_urbanismo` (5,725 parcels). But no `computeParcelConfidence` run has been executed for this bbox, and the block-ring dissolve is **0/3 in Córdoba** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) — the dissolve fails before any rule is consulted (see `LEGISLATION-RATE.md`). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Measured legislation detail = [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): ~8 % municipality-wide, ASSESSED but **OCR-extracted `pipeline-extracted-unverified`** (15-ordinance extraction complete, `SOURCES.md §C` empty). ⬆ **CORRECTED 2026-08-01:** `esCordobaPGOU2001.ts` is **REGISTERED** (13 subzones) — the earlier "UNREGISTERED" claim was stale — but it is **gated and refusing**: `CORDOBA_ENVELOPE_VERIFIED = false`. No composite Axis-2 clau-inventory scorecard run; a % here would double-count the sub-rate. |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (Catastro national + COACo pilot WFS) · regional-zone-GIS **documented/partial** (COACo `coaco:ordenanzas` calificación **live for 2 of ~10 districts**; national SIU serves *clasificación* only) · building-height nDSM **documented** (`heightSources.mjs` `REGION_SOURCE.cordoba='mds_edificacion'`, per-city bbox configured; per-city bake not confirmed landed) · terrain DEM **live** (`terrain.mjs` TERRAIN_CITY `cordoba`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = (1+0.5+0.5+1+1)/5 = 0.80. |
| 4 | **ENVELOPE** | 20 % | **0%** | **`checked`** | — | ⬇ was `not-assessed`; **now MEASURED, and the measurement is zero.** ⚠ **The pack IS registered** (`rulepacks/registry.ts`, 13 subzones — the earlier "UNREGISTERED" claim was **stale**), but `CORDOBA_ENVELOPE_VERIFIED = false`, so **every Córdoba parcel gets a cited machine-extracted-unverified refusal and NO number reaches the panel, the massing or the persisted C19 Parcel**. Established by DRIVING the real dispatch, not by reading the code: `apps/editor/__tests__/cordobaSiteDispatch.test.ts`. Every value is `pipeline-extracted-unverified` (scanned PDFs, single-pass vision); MC height is a per-street-width TABLE and MC/CTP-1 edificabilidad is **DERIVED by algorithm** → `null`, never a number. See [`ENVELOPE.md`](./ENVELOPE.md) + [`sources/VERIFICATION.md`](./sources/VERIFICATION.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `cordoba` (source `es` = PNOA MDT) + control points (Mezquita / Guadalquivir / North hills). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked (Catastro footprint national; nDSM ❌ per `LEGISLATION-RATE.md`). The CNIG MDS Edificación per-city source is configured (`REGION_SOURCE.cordoba`) but no per-city provenance histogram has been probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (L-642) but recorded as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: inland city, n/a. Score 5/9. |

## §CLOSURE — how far is this city from CLOSED? (mandatory, trackable — L-662)

> A city is **CLOSED** when all four hold: every axis MEASURED · every axis AT ITS CEILING · every
> remaining gap STRUCTURAL (no `EFFORT`) · `honestyOk: true`. **100 % is not the target** — most
> cities have a ceiling fixed by law and by what the publisher publishes. Gap-type vocabulary and the
> full definition: [`../../_TEMPLATE/_CITY/RATE.md`](../../_TEMPLATE/_CITY/RATE.md) §CLOSURE.

| Axis | W | Measured today | **Ceiling (cited)** | Gap | Gap type | What closes it |
|---|---:|---|---|---:|---|---|
| LEGISLATION | 25 | `not-assessed` (sub-rate ~8 %) | **not-composable** — no municipal buildable-land denominator has been computed for Córdoba (contrast Murcia's measured 75.145 M m²) | — | `UNMEASURED` | run the Axis-2 calificación-inventory census over `coaco:ordenanzas` + a municipal denominator |
| **ENVELOPE** | 20 | **0 %** — every parcel refuses; proven by driving the real dispatch | **≈ 19 % fully-numeric / ≈ 89 % partial, WITHIN the Sur + Noroeste pilot ONLY** (`coaco:distritos` = exactly **2** features of ~10 districts; ordenanzas bbox ≈ 3.4 × 4.8 km; Σ `sup_m2` ≈ **1.63 km²**; `ENVELOPE.md` quoting `findings/OCR-EXTRACTION-RESULTS.md`). **Municipality-wide ceiling: `not-composable`** — same missing denominator | **all of it** | `SIGNATURE` (primary) + `EFFORT` (secondary) + `STRUCTURAL-DATA` (bounding) | ① founder signs `sources/VERIFICATION.md` §SIG-1 (OCR fidelity of 15 scanned ordinances) **and** ② the COACo subzone resolver ships in the same change — a signature alone renders nothing, because no parcel can bind a subzone today. ③ The 2-of-10-district publication limit is the publisher's, not ours |
| PARCEL | 15 | `not-assessed` | `not-composable` | — | `UNMEASURED` | run `computeParcelConfidence` over the pilot bbox; ⚠ block-ring dissolve is **0/3** here |
| DATA-SOURCES | 15 | **80 %** | **90 %** — the regional-zone-GIS slot is capped at 0.5 by the 2-of-10-district COACo publication, which no PRYZM work changes | 10 pp | `EFFORT` (the 10 pp) + `STRUCTURAL-DATA` (the cap) | land the per-city CNIG MDS Edificación height bake (0.5 → 1.0) |
| HEIGHTS/LOD | 10 | `not-assessed` | `not-composable` | — | `UNMEASURED` | probe a per-city height-provenance histogram after the MDS bake |
| TERRAIN | 10 | **50 %** | **100 %** — PNOA MDT is live and keyless; nothing structural blocks verification | 50 pp | `EFFORT` | run `terrain.verify.mjs` round-trip + re-probe the deployed `layer.json` |
| CONTEXT | 5 | **56 %** (5/9) | **78 %** (7/9) — pedestrian is not a baked layer and sea is n/a for an inland city, so 9/9 is unreachable by definition | 22 pp | `EFFORT` | land the rail + trees re-bake already configured in `bake.mjs` (L-642) |
| **CITY** | 100 | **`40 %`** (assessed subset) | **`not-composable`** — 3 of 7 axes are `UNMEASURED` | — | — | — |

**Closure verdict:** `OPEN` · **Blocking gaps: 7** — 3 × `UNMEASURED` (LEGISLATION · PARCEL ·
HEIGHTS/LOD) + 3 × `EFFORT` (DATA-SOURCES · TERRAIN · CONTEXT) + 1 × `SIGNATURE` (ENVELOPE).

⚠ **The ENVELOPE line is the one to read twice.** Córdoba is the only PRYZM city where a **registered**
pack sits behind a closed gate with an **OCR** provenance tier. Signing it is not a formality: it
asserts that a Spanish-planning-literate human has checked machine-vision output from **scanned
images** against the source crops, per ordenanza. And even a perfect signature leaves the tier at
`pipeline-extracted-unverified` — the permanent bottom rung — because a single OCR pass is not a
second source.

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro + COACo pilot parcels + baked OSM context
(5/9). REFUSES: an envelope — the OCR pack is `pipeline-extracted-unverified` and, though **REGISTERED**
(13 subzones), is held behind `CORDOBA_ENVELOPE_VERIFIED = false`, so every parcel gets a cited
refusal and no number reaches the panel, the massing or the persisted C19 Parcel; and the dominant
families' density is an **algorithm, not a number** (the pipeline emits `null` rather than fabricate).
UNKNOWN (typed): PARCEL quality (`not-queried`, dissolve 0/3), LEGISLATION (`pending-implementation`),
HEIGHTS (`not-queried`); municipality-wide envelope ceiling (`UNMEASURED` — no denominator).
`honestyOk: true`.

⚠ **One honesty risk is LATENT, not live, and is recorded rather than hidden**: because the pack is
registered, `classifyAnswerability(CORDOBA_JURISDICTION_ID, 'PAS-1')` returns `'full-envelope'` — a
claim no Córdoba parcel can honour. `answerabilityClass.ts` is not re-exported from the package index
and no shipping surface consumes it, so it flips nothing today. It must be fixed **in the classifier**
(teach it the verification gate) before that classifier reaches a user surface. See
[`sources/VERIFICATION.md`](./sources/VERIFICATION.md).

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~8 %, OCR-unverified) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`README.md`](./README.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) · `findings/` | governance · the L-449 human sign-off ledger · L-NNN investigation records | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-08-01 (ENVELOPE first MEASURED at 0 % by driving the real dispatch; the stale "pack UNREGISTERED" claim corrected; §CLOSURE added per L-662). Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Normalized to the C63 7-file standard under audit L-649.*
