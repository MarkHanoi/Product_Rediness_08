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
| 4 | **ENVELOPE** | 20 % | **0%** | **`checked`** | — | ⬇ was `not-assessed`; now MEASURED, and the measurement is zero. ⬆ **2026-08-01: the pack is now REGISTERED** (`rulepacks/registry.ts` §MURCIA-PACK-REGISTERED — 14 calificaciones + 2 published sub-variants), which makes it **signable in one act** and visible to the C60 coverage probe. **Registration published nothing:** `MURCIA_ENVELOPE_VERIFIED = false`, and the L5 dispatch refuses every parcel from `murciaEnvelopeDisposition` **before** the registry is ever consulted — established by driving the real dispatch (`apps/editor/__tests__/murciaSiteDispatch.test.ts`) and pinned by `murciaWiring.test.ts` §"REGISTRATION IS NOT AUTHORISATION". Solver coverage after sign-off is **23.51 %** of buildable land (**MEASURED 2026-08-01**, `tools/murcia-coverage-crosstab/`; firm floor **6.97 %** excluding the expressly *interim* `RL` regime, Art. 5.14.3). ⚠ **The 14 packed calificaciones sum to 38.95 % of buildable land BY CALIFICACIÓN CODE** (RM1 0.11 % + RM2 0.18 % now measured, closing the last `UNMEASURED` inside the `RM` family) — *higher* than the 33.0 % ceiling, and that is **not** over-coverage: the disposition applies the clase-de-suelo / ámbito delegation test **first** (Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.3), so a packed code inside *urbanizable* land or a delegating ámbito still refuses — **15.45 % of buildable land is a packed code that refuses on that ground.** The remaining **67.0 %** is delegated by the PGOU to a Plan Parcial / PERI / ED and is unreachable by any transcription of this instrument. ⚠ On the orchestrator's census method (published `superficie`, *Urbano* = 56.0 M m²) the same reading gives **39.5–61.8 %** direct / 38.2 % delegated; the gap is 41.4 pp of delegation published on the `calificacion` attribute, which a sectores-layer census cannot see. Both refute the census's projected ~75 %. See `ENVELOPE.md` §2 and `findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md`. |
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
| LEGISLATION | 25 | **33 %** | **33.0 %** — the PGOU-DIRECT share of private buildable land: **24.800 M m² of 75.145 M m²**, measured over **23 066** in-force `pgou_alineaciones` polygons, shoelace areas in native **EPSG:25830**, joined to `pgou_sectores` for `clase_suelo` (join rate 99.74 %), snapshot 2026-08-01 | **0 pp** | `STRUCTURAL-LAW` | nothing. The other **67.0 %** is delegated by the plan itself (Arts. 6.6.2 · 5.24.5.1 · 5.25.3.3 · 5.26.3.3 · 6.2.2.3). ✅ **The reconciliation it owed is now run** (below) — and the 33.0 % is reproduced from the live layers by `tools/murcia-coverage-crosstab/` |
| **ENVELOPE** | 20 | **0 %** — every parcel refuses | **23.51 %** — ⬇ **MEASURED 2026-08-01, no longer a bound.** The calificación × clase-de-suelo cross-tab: packed calificación **AND** not delegated = **17.663 M m² of 75.145 M m²** (`tools/murcia-coverage-crosstab/`). **Firm floor 6.97 %** excluding `RL`, whose Art. 5.14.3 regime is expressly *«antes de la aprobación de Planes Especiales»* — an **interim** regime whose expiry per ámbito is not published. ⚠ the previously published firm floor of 16.5 % was wrong; see the reconciliation below | **all of it** | `SIGNATURE` | founder signs [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-1 **and**, in the same change, L5 learns the `kind: 'envelope'` branch — 🔴 **and the disposition learns the clase-de-suelo + `UE`/`UD`/`P*` delegation test**, without which a signature publishes on 13.09 pp of delegated land (`RISK-REGISTER.md` §R-7) |
| PARCEL | 15 | `not-assessed` | `not-composable` | — | `UNMEASURED` | run `computeParcelConfidence` over the Murcia bbox (the national Catastro provider is already wired and live) |
| DATA-SOURCES | 15 | **90 %** | **100 %** — every slot has a live keyless source; nothing is access-gated | 10 pp | `EFFORT` | land the per-city CNIG MDS Edificación height bake (`heightSources.mjs` `mds_edificacion`, configured but not confirmed landed) |
| HEIGHTS/LOD | 10 | `not-assessed` | `not-composable` | — | `UNMEASURED` | probe a per-city height-provenance histogram after that bake |
| TERRAIN | 10 | **50 %** | **100 %** — PNOA MDT is live and keyless | 50 pp | `EFFORT` | run `terrain.verify.mjs` round-trip + re-probe the deployed `layer.json` |
| CONTEXT | 5 | **56 %** (5/9) | **78 %** (7/9) — pedestrian is not a baked layer; sea reduces to the water/coastline layer for a near-coastal inland municipality | 22 pp | `EFFORT` | land the rail + trees re-bake already configured in `bake.mjs` (L-642) |
| **CITY** | 100 | **`39 %`** (assessed subset) | **`not-composable`** — 2 of 7 axes are `UNMEASURED` | — | — | — |

**Closure verdict:** `OPEN` · **Blocking gaps: 6** — 2 × `UNMEASURED` (PARCEL · HEIGHTS/LOD) +
3 × `EFFORT` (DATA-SOURCES · TERRAIN · CONTEXT) + 1 × `SIGNATURE` (ENVELOPE).
**LEGISLATION is at its ceiling and its residual gap is `STRUCTURAL-LAW` — it does not block closure.**

### ✅ The reconciliation this table owed — RUN 2026-08-01. The number is **23.51 %**.

The **calificación × clase-de-suelo cross-tab** has been computed. It is re-runnable —
[`tools/murcia-coverage-crosstab/`](../../../../../../tools/murcia-coverage-crosstab/README.md),
artefact `out-crosstab.json`, pinned by
`packages/site-parcel-data/__tests__/murciaCoverageCrosstab.test.ts`.

| | share of the 75.145 M m² buildable denominator | how measured |
|---|---:|---|
| PGOU-DIRECT (clase-de-suelo / ámbito test) | **33.00 %** (24.800 M m²) | reproduced live by the tool ✅ |
| The 14 packed calificaciones, **by code** | **38.95 %** (29.270 M m²) | reproduced live; = the old 38.7 % **plus** RM1 (0.11 %) + RM2 (0.18 %), which were `UNMEASURED` and now are not |
| **⭐ THE INTERSECTION — packed AND not delegated** | **23.51 %** (17.663 M m²) | **the point value; the `≤ 33.0 %` bound is retired** |
| … of it that is the **expressly interim `RL`** regime (Art. 5.14.3) | 16.53 % (12.425 M m²) | every m² of RL is PGOU-direct |
| … **⇒ the FIRM FLOOR** | **6.97 %** (5.238 M m²) | ⬇ **the previously published 16.5 % was WRONG — see below** |
| Packed code sitting on **delegated** land, refusing anyway | 15.45 % (11.607 M m²) | 38.95 − 23.51 |
| Refused **but PGOU-direct** — the headroom above the intersection | **9.49 %** (7.137 M m²) | 33.00 − 23.51 |
| … of which a **street-width resolver** would free (`RC` `RM` `RN` on direct land) | **8.81 %** (6.620 M m²) | ⬆ `ENVELOPE.md` §3.3's *~4 %* omitted the **`RM` base zone** (7.48 % of buildable, 4.790 M m² of it PGOU-direct), which refuses on the *same* street-width table as `RC` |

**The tool reproduces the entire prior baseline before computing anything new** — the 75.145 M m²
denominator, the 33.00/67.00 split, all four delegation grounds (30.16 · 20.54 · 11.22 · 5.08), the
99.74 % join rate and every per-family share in `ENVELOPE.md` §3.1 to two decimals. That
reproduction is the new number's warrant.

#### ⚠ CORRECTION — the "firm floor 16.5 %" was arithmetic on the wrong set

`16.5 %` was computed as `33.0 % − 16.53 % (RL)`. That subtraction leaves the **PGOU-direct land
that is not RL**, which is not the same thing as **land a signature would render**: 9.49 pp of it is
`RB` `RC` `RM` `RN` `RT` `RU` `MZ` `MX` — codes refused on a **CONSTRUCTED or UNKNOWN parameter**
(`ENVELOPE.md` §3.2), which no signature touches. **The firm floor is 6.97 %.** The honest range for
this city is **6.97 % – 23.51 %**, not 16.5 % – 33.0 %.

#### 🔴 AND THE CROSS-TAB FOUND A DEFECT: the code would publish **36.59 %**, above the legal ceiling

`murciaEnvelopeDisposition` applies **only** the `REMITTED_AMBITO_PREFIXES` test (`TA TM UA UH UM`).
It applies **no clase-de-suelo test** and does not know `UE` (Unidad de Actuación, Art. 5.25.1),
`UD` (Estudio de Detalle, Art. 5.25.2) or `P*` (Planes Especiales, Art. 5.26.2). So on the day both
gates open it would render an envelope on **36.59 %** of buildable land — **above the 33.00 % the
PGOU orders directly** — of which:

| would publish a general-plan number on… | M m² | pp | article |
|---|---:|---:|---|
| *urbanizable* land, ordered by a **Plan Parcial** | 7.993 | **10.64** | Art. 6.2.2.3 |
| a **delegating ámbito** the prefix list does not carry (`UE` `UD` `P*`) | 1.841 | **2.45** | Arts. 5.25.1 / 5.25.2 / 5.26.2 |
| **total** | **9.834** | **13.09** | |

That is the *«proxy PGOU»* error the dossier was written to prevent, latent in our own dispatch.
It is **not live** — two gates are shut (`MURCIA_ENVELOPE_VERIFIED = false`, and L5 does not consume
the `envelope` branch) — but it is a **named pre-signature blocker**: see `RISK-REGISTER.md` §R-7 and
`NEXT.md`. `murciaCoverageCrosstab.test.ts` fails if the gap changes size without the measurement
being re-run.

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
✅ The **packed-code × not-delegated intersection** is no longer `UNMEASURED` — it is **23.51 %**
(§CLOSURE). 0.26 % of buildable land is `UNJOINED` (a calificación polygon whose `sector` the
sectores layer does not carry): reported as its own bucket, **never** defaulted into "direct" or
"delegated". `honestyOk: true`.

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
*Last updated: 2026-08-01 (PGOU TR-2012 transcription; LEGISLATION + ENVELOPE first measured; DATA-SOURCES corrected 70→90; pack REGISTERED behind the closed gate; `sources/VERIFICATION.md` created; §CLOSURE added per L-662. **Same day, second pass: the calificación × clase-de-suelo CROSS-TAB run — ENVELOPE ceiling 23.51 % point value replaces the ≤ 33.0 % bound; firm floor corrected 16.5 % → 6.97 %; a 13.09 pp over-publication defect found in `murciaEnvelopeDisposition` and registered as R-7**). Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
