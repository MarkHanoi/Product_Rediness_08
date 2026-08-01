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
| 4 | **ENVELOPE** | 20 % | **0%** | **`checked`** | — | ⬇ was `not-assessed`; now MEASURED, and the measurement is zero. ⬆ **2026-08-01: the pack is now REGISTERED** (`rulepacks/registry.ts` §MURCIA-PACK-REGISTERED — 14 calificaciones + 2 published sub-variants), which makes it **signable in one act** and visible to the C60 coverage probe. **Registration published nothing:** `MURCIA_ENVELOPE_VERIFIED = false`, and the L5 dispatch refuses every parcel from `murciaEnvelopeDisposition` **before** the registry is ever consulted — established by driving the real dispatch (`apps/editor/__tests__/murciaSiteDispatch.test.ts`) and pinned by `murciaWiring.test.ts` §"REGISTRATION IS NOT AUTHORISATION". Solver coverage after sign-off would be **≤ 33.0 %** of buildable land (16.5 % excluding the expressly *interim* `RL` regime, Art. 5.14.3). ⚠ **The 14 packed calificaciones sum to 38.7 % of buildable land BY CALIFICACIÓN CODE** (Σ `ENVELOPE.md` §3.1; RM1 + RM2 unmeasured inside the 7.77 % `RM` family) — *higher* than the ceiling, and that is **not** over-coverage: the disposition applies the clase-de-suelo / ámbito delegation test **first** (Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.3), so a packed code inside *urbanizable* land or a delegating ámbito still refuses. **The intersection — packed code AND not delegated — is `UNMEASURED`; it is bounded above by 33.0 %.** The remaining **67.0 %** is delegated by the PGOU to a Plan Parcial / PERI / ED and is unreachable by any transcription of this instrument. ⚠ On the orchestrator's census method (published `superficie`, *Urbano* = 56.0 M m²) the same reading gives **39.5–61.8 %** direct / 38.2 % delegated; the gap is 41.4 pp of delegation published on the `calificacion` attribute, which a sectores-layer census cannot see. Both refute the census's projected ~75 %. See `ENVELOPE.md` §2 and `findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `murcia` (source `es` = PNOA MDT, §ES-ALL-CAPITALS L-636). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked; context buildings render OSM/assumed. National MDS Edificación (live) could join via the `spain` `heightJoin:'mds'`, but no per-city provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but C63 §3 Axis 7 records that re-bake as not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal-only via water/coastline, not tile-probed here → excluded. Score 5/9. |

## §CLOSURE — how far is this city from CLOSED? (mandatory, trackable — L-662)

> A city is **CLOSED** when all four hold: every axis MEASURED · every axis AT ITS CEILING · every
> remaining gap STRUCTURAL (no `EFFORT`) · `honestyOk: true`. **100 % is not the target** — Murcia's
> ceiling is fixed by the PGOU's own design, not by our effort. Gap-type vocabulary and the full
> definition: [`../../_TEMPLATE/_CITY/RATE.md`](../../_TEMPLATE/_CITY/RATE.md) §CLOSURE.

| Axis | W | Measured today | **Ceiling (cited)** | Gap | Gap type | What closes it |
|---|---:|---|---|---:|---|---|
| LEGISLATION | 25 | **33 %** | **33.0 %** — the PGOU-DIRECT share of private buildable land: **24.800 M m² of 75.145 M m²**, measured over **23 066** in-force `pgou_alineaciones` polygons, shoelace areas in native **EPSG:25830**, joined to `pgou_sectores` for `clase_suelo` (join rate 99.74 %), snapshot 2026-08-01 | **0 pp** | `STRUCTURAL-LAW` | nothing. The other **67.0 %** is delegated by the plan itself (Arts. 6.6.2 · 5.24.5.1 · 5.25.3.3 · 5.26.3.3 · 6.2.2.3). ⚠ **One reconciliation is owed** (below) |
| **ENVELOPE** | 20 | **0 %** — every parcel refuses | **≤ 33.0 %** (same measurement). **Firm floor 16.5 %** excluding `RL`, whose Art. 5.14.3 regime is expressly *«antes de la aprobación de Planes Especiales»* — an **interim** regime whose expiry per ámbito is not published | **all of it** | `SIGNATURE` | founder signs [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-1 **and**, in the same change, L5 learns the `kind: 'envelope'` branch. The pack, the registration and the gate are already in place — nothing else is engineering |
| PARCEL | 15 | `not-assessed` | `not-composable` | — | `UNMEASURED` | run `computeParcelConfidence` over the Murcia bbox (the national Catastro provider is already wired and live) |
| DATA-SOURCES | 15 | **90 %** | **100 %** — every slot has a live keyless source; nothing is access-gated | 10 pp | `EFFORT` | land the per-city CNIG MDS Edificación height bake (`heightSources.mjs` `mds_edificacion`, configured but not confirmed landed) |
| HEIGHTS/LOD | 10 | `not-assessed` | `not-composable` | — | `UNMEASURED` | probe a per-city height-provenance histogram after that bake |
| TERRAIN | 10 | **50 %** | **100 %** — PNOA MDT is live and keyless | 50 pp | `EFFORT` | run `terrain.verify.mjs` round-trip + re-probe the deployed `layer.json` |
| CONTEXT | 5 | **56 %** (5/9) | **78 %** (7/9) — pedestrian is not a baked layer; sea reduces to the water/coastline layer for a near-coastal inland municipality | 22 pp | `EFFORT` | land the rail + trees re-bake already configured in `bake.mjs` (L-642) |
| **CITY** | 100 | **`39 %`** (assessed subset) | **`not-composable`** — 2 of 7 axes are `UNMEASURED` | — | — | — |

**Closure verdict:** `OPEN` · **Blocking gaps: 6** — 2 × `UNMEASURED` (PARCEL · HEIGHTS/LOD) +
3 × `EFFORT` (DATA-SOURCES · TERRAIN · CONTEXT) + 1 × `SIGNATURE` (ENVELOPE).
**LEGISLATION is at its ceiling and its residual gap is `STRUCTURAL-LAW` — it does not block closure.**

### ⚠ The one reconciliation this table owes (do not let it go quiet)

Three numbers are in play and only two of them are reconciled:

| | share of the 75.145 M m² buildable denominator | how measured |
|---|---:|---|
| PGOU-DIRECT (clase-de-suelo / ámbito test) | **33.0 %** | `findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md` §3b |
| The 14 packed calificaciones, **by code** | **38.7 %** | Σ `ENVELOPE.md` §3.1 (RM1 + RM2 unmeasured) |
| The 11 refused-but-PGOU-direct codes freed by a **street-width resolver** | **~4 %** | `ENVELOPE.md` §3.3 |

The 38.7 % and the 33.0 % are measured on **different tests** and the smaller one governs, because
`murciaEnvelopeDisposition` applies delegation first. What has **not** been computed is the
**calificación × clase-de-suelo cross-tab** that would turn "≤ 33.0 %" into a point value — and until
it is, the ~4 pp street-width `EFFORT` gap cannot be placed either inside or outside the 33.0 %.
⚠ **Do not quote a single coverage number for Murcia until that cross-tab is run.** Running it is the
cheapest remaining measurement in this dossier and it is pure arithmetic over data already fetched.

## §CONTEXT-DATA-HONESTY note

DOES: terrain (PNOA MDT, unverified) + national Catastro parcel routing + **live municipal zoning
(calificación · ámbito · clase de suelo · validity interval)** + baked OSM context (5/9 layers).
REFUSES: an envelope — on **two structurally different grounds**, kept apart: (a) on PGOU-direct
land the numbers are transcribed but the transcription is **unsigned** (a statement about PRYZM);
(b) on the delegated 67 % the general plan is the **wrong instrument** and no signature helps (a
statement about the law, `legallyGrounded: true`). Never a borrowed or invented number — a test
asserts the pack cites no Catalan instrument. UNKNOWN (typed): PARCEL quality (`not-queried`),
HEIGHTS (`not-queried`); PGOU **BORM approval reference** (`not-located-in-source` — *not*
"does not exist"); concordance of the **2017 re-edition** with the 2012 TR (unverified); and — new on
2026-08-01 — the **packed-code × not-delegated intersection** (`UNMEASURED`, see §CLOSURE).
`honestyOk: true`.

⚠ **One honesty risk is LATENT, not live, and is recorded rather than hidden.** Now that `packsByZone`
is non-empty, `classifyAnswerability(MURCIA_JURISDICTION_ID, 'RM1')` returns `'full-envelope'` — a
claim no Murcia parcel can honour while the gate is shut. `answerabilityClass.ts` is not re-exported
from the package index and no shipping surface consumes it, so it flips nothing today and
`honestyOk` stands. It must be fixed **in the classifier** (teach it the verification gate) before
that classifier reaches a user surface — never by de-registering the pack. Identical statement for
Córdoba (`../../es-an/14021-cordoba/`).

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
| [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | the L-449 human sign-off ledger — what §SIG-1 would and would **not** authorise | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-08-01 (PGOU TR-2012 transcription; LEGISLATION + ENVELOPE first measured; DATA-SOURCES corrected 70→90; pack REGISTERED behind the closed gate; `sources/VERIFICATION.md` created; §CLOSURE added per L-662). Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
