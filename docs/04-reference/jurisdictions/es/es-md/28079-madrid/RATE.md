# City RATE — master completion scorecard — Madrid (es-md, 28079)

> ⚠⚠ **SUPERSEDED 2026-08-01 (§MADRID-NZ1-DECERTIFIED, L-677) — THE ENVELOPE AXIS IS A MEASURED 0 %, NOT ≤4.7 %.**
> The ≤4.7 % was `0.11695 × 0.4`, the NZ-1 slice, and it was authorised by `MADRID_NZ1_CERTIFIED = true` —
> a gate whose docstring credited *"the L-608 sign-off, 2026-07-25"* while `sources/VERIFICATION.md §3
> "Signed off (legal)"` was **empty**. `git log -S` locates the flip in ONE commit — `3e571724`,
> *"fix(madrid): ship the parcel ring on compound COEF_Z + flip NZ1 gate ON"*, **`Co-Authored-By: Claude
> Opus 4.8`** — whose message is entirely about the COEF_Z parse. **The gate cited as its authority the
> very commit that opened it, and the signatory was a machine.** The gate is now `false`; every NZ-1
> parcel receives the cited refusal the path was designed to give, and **no Madrid parcel receives a
> numeric envelope from any path today**.
> ⚠ **This is a correction, not a regression, and it is not a finding against NZ 1's geometry** — the
> footprint is real published municipal data and `sources/VERIFICATION.md` SIG-M2 may well be answered
> *"reading published geometry is not a transcription, so no L-449 signature is owed"*, which would
> restore the 4.7 % legitimately. It has to be answered **by a person, in writing, with a date**.
> ⇒ **Every `≤4.7 %` below reads as `0 %` until SIG-M2 is answered.** [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) row 5.


<!-- generated-by: MANUAL C63-Phase-4-JURISDICTION-DOC-PASS 2026-07-31 — scorecard function not yet
     shipped (C63 §8). FIVE axes are now cited-derived per C63 §8.1: the three CHEAP axes
     (DATA-SOURCES · TERRAIN · CONTEXT) unchanged from the 2026-07-30 audit, plus LEGISLATION and
     ENVELOPE which are now MEASURED ZEROS (their inputs became countable — see the derivations).
     PARCEL and HEIGHTS/LOD remain not-assessed with typed C62 reasons. NO cell is a fabricated
     number; each cell names the inspectable state it was read from. -->

**Overall completion (assessed subset): `43.0%` · `partial: true` — over 90 % of the ratified weight**
*(corrected from `41.9%` on 2026-08-01: ENVELOPE was reported as a measured 0 % on a derivation that
`40c80164` had already falsified — see Axis 4 and [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).)*
— renormalised over the six ASSESSED axes (LEGISLATION · ENVELOPE · **PARCEL** · DATA-SOURCES ·
TERRAIN · CONTEXT); only HEIGHTS/LOD is `not-assessed`, and that is not 0 % (C63 §1.2/§1.5).
**`honestyOk: true`** — Madrid renders no fabricated value; every unknown is typed and every buildable
zone returns a cited refusal.

> **2026-08-01 (L-658):** PARCEL is now **MEASURED** from a live 120-point sample against the
> ratified buildable-land denominator, and DATA-SOURCES was re-derived from config + live probes.
> Madrid now carries the **widest assessed weight of any city (90 %)** — see the arithmetic block.

> ⚠ **This number went DOWN from the 71 % recorded 2026-07-30, and that is a correction, not a
> regression.** The 71 % renormalised over the three *cheap* axes only (DATA-SOURCES · TERRAIN ·
> CONTEXT, Σ weight 30), which is exactly the artefact C63 §4 warns about — *"equal weighting would
> let a city look ~43 % done from the three free axes alone while holding zero certified law."*
> Nothing about Madrid got worse. The two **expensive** axes (LEGISLATION 25 + ENVELOPE 20) simply
> entered the denominator at their true measured value, which is zero. No work was undone.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 ·
> ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | **99.6%** | `auto-validated` | — | **MEASURED 2026-08-01** (`parcelSampleProbe.mjs --city madrid`, seed `20260801`). **DENOMINATOR = private buildable land** (L-656), sampled independently of Catastro as **OSM non-public building-footprint area** — 1,659 footprints in 40 uniformly-random 330 m tiles over bbox `[-3.80,40.33,-3.58,40.52]`, points drawn **∝ footprint area** (unbiased for AREA, not for parcel COUNT). **N = 120: high 119 · medium 1 · low 0 · no-parcel-here 0 · 0 transport failures.** Score = (119·1 + 1·0.5)/120. 95 % Wilson CI on the `high` share: **95.4 %–99.9 %**. ⚠ The known **2/4 block-ring dissolve** drag (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) is a *block-aggregation* weakness and is **not** what this axis measures — per-parcel geometry from Catastro is as good in Madrid as in Barcelona; the two must not be conflated. |
| 2 | **LEGISLATION** | 25 % | **0%** *(measured)* | `not-checked` | — | **`verified_cited_claus / total_claus_present` = 0 / 34.** *Denominator:* the live `NORMAS_ZONALES/0` `AMB_TX_ETIQ` distinct-value read returned **34** claus (`sources/SOURCES.md` §0.3 — a response, not an estimate). *Numerator:* **zero** rows in `sources/SOURCES.md` carry the full citation atom (value·unit·article·document·URL) **and** zero are covered by a signed `sources/VERIFICATION.md` (`§3` = empty; the file's own status line is "NOTHING LEGALLY SIGNED"). ⚠ **This is a MEASURED zero, not `not-assessed`** — both inputs were inspected; the answer is genuinely "we hold no cited, signed clause". ⚠ **`AMB_TX_DENOM` does not move this axis** (see note below). |
| 3 | **DATA-SOURCES** | 15 % | **100%** | `auto-validated` | — | 5/5 slots **live**, derived from config + live-probed 2026-08-01: cadastre-parcel **live** (Catastro; 120/120 real parcels this session) · regional-zone-GIS **live** (`MADRID_CONDICIONES_PATH` **mounted** in `server.js` → `server/madridCondicionesProxy.js` → `sigma.madrid.es/hosted/.../PG_CONDICIONES_EDIFICACION/MapServer/6/query`, point-query **HTTP 200 with real `COEF_Z`/`CODMANZANA` fields 2026-08-01**; founder recon 2026-07-31 reached the same endpoint) · building-height nDSM **live** (`heightSources.mjs` `mds_edificacion` `impl:'live'`, `REGION_SOURCE.madrid`) · terrain DEM **live** (`terrain.mjs` `madrid`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = 5/5 = **1.00**. ⚠ **CORRECTION, +10 pp:** the building-height slot was scored `documented` because *the per-city bake* is not confirmed landed. That is **Axis 6 (HEIGHTS/LOD)**, not Axis 3 — C63 §3 Axis 3 measures whether the authoritative **feed is WIRED + LIVE**. Axis 6 remains `not-assessed` and still carries the defect. |
| 4 | **ENVELOPE** | 20 % | **0 %** *(measured)* · **honesty 100 %** | `auto-validated` | `tools/city-completion/measurements/madrid.measurements.json` | ⚠⚠ **CORRECTED TWICE, AND THE SECOND CORRECTION WENT DOWN.** (a) 2026-08-01 morning: the long-standing `0 %` rested on a derivation that had become FALSE (*"`registry.ts` registers Madrid with an EMPTY `packsByZone`"* — superseded by `40c80164`), and was raised to **≤4.7 %**. (b) 2026-08-01 evening: that ≤4.7 % was **withdrawn** — it was `0.11695 × 0.4` for NZ 1, authorised by `MADRID_NZ1_CERTIFIED = true`, **a gate opened by an AI-co-authored commit (`3e571724`) that cited itself as its own sign-off while `sources/VERIFICATION.md §3` was empty** (§MADRID-NZ1-DECERTIFIED, L-677). **`Σ(share × tier_weight)/Σ(share)`**, shares MEASURED (L-676, `SHAPE.STArea()` over all 34 `AMB_TX_ETIQ` codes): NZ 1 `0.11695 × 0.0` + NZ 3 `0.60458 × 0.0` + packed `0.27847 × 0.0 (gated)` = **0.0000**. ⚠ **DENOMINATOR SUBSTITUTED AND DISCLOSED:** 149,577,170 m² of **Norma-Zonal-governed** land, NOT the ratified L-656 private-buildable set (`PG_ORDENACION/4` is polyline-with-OBJECTID-only, V18) ⇒ every figure is an **UPPER BOUND**. The scorecard now PRINTS that substitution (§STATED-DENOMINATOR, scorecard 1.2) instead of asserting L-656 over it — which is what had kept this city's measurement record unwritten (CLOSURE-REGISTER row 9, still OPEN). ⚠ **The 2026-08-01-morning lesson still stands and now cuts both ways: a stale derivation reporting a LOWER number is a fabrication, and so is a number resting on an authority that does not exist.** Arithmetic maximum **≈36.8 %**; ~96 % of that gap is **LAW** (NZ 3). See [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) rows 5–6 and [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `madrid` (source `es` = PNOA MDT) + control points (Puerta del Sol / Retiro / North M-30). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed here. Same rasant-datum caveat as Barcelona (L-584) — which is *also* a legislation concern for Madrid, since *altura de cornisa* is measured from rasant at the façade. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked. The CNIG MDS Edificación per-city source is configured (`REGION_SOURCE.madrid`) but **no per-city `heightProvenance` histogram has been probed** — the `tagged` fraction is the axis input and it has not been measured. See [`HEIGHT.md`](./HEIGHT.md). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) but not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: inland, n/a. Score 5/9 = 55.6 %. |

### Overall arithmetic (C63 §4, shown so it can be re-checked)

```
assessed:  LEGISLATION 0.000×25  +  ENVELOPE 0.0468×20 +  PARCEL 0.9958×15
         + DATA-SOURCES 1.000×15 +  TERRAIN  0.500×10  +  CONTEXT 0.556×5
         =   0.0 + 0.94 + 14.94 + 15.00 + 5.00 + 2.78  =  38.66
Σ weights (assessed only) = 25 + 20 + 15 + 15 + 10 + 5 = 90
overall = 38.66 / 90 = 0.4295  →  43.0 %   ·   partial: true
not-assessed: HEIGHTS/LOD (10) — the ONLY axis left outside the denominator
```

> ⚠ **Corrected 2026-08-01: 41.9 % → 43.0 %.** The +1.1 pp is ENVELOPE entering at its true measured
> value instead of a stale zero (Axis 4 above). **No work was done to earn it** — the number was
> always this; the derivation was out of date. **Madrid's ARITHMETIC MAXIMUM RATE is ≈87 %**, and
> ≈12.1 of the ≈13 missing points are **LAW** (Norma Zonal 3 holds 60.458 % of the city's zoned land
> and the PGOUM declines to state an envelope on it). See [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).

> ⚠ **41.9 % is up from 28 %, and ~9 of those 14 points are a bigger DENOMINATOR, not new work.**
> PARCEL entered at 99.6 % and DATA-SOURCES was corrected upward; nothing about Madrid's *law* moved,
> and LEGISLATION + ENVELOPE are still measured **zeros** carrying 45 of the 90 assessed points. Madrid
> now has the widest assessed coverage of any city (90 % of the ratified weight) — which is exactly why
> its headline is *lower* than Barcelona's 87.4 %-over-45 %. **Compare `weightAssessed` before
> comparing headlines.**

## The THREE PARCEL numbers — never conflated (L-656 / MASTER-ROI-TRACKER §0.5.2)

All three are true statements about Madrid on **2026-08-01**, each with a different denominator.
Reproduce: `node tools/city-completion/summariseSamples.mjs`.

| Metric | Denominator | N | Value | Answers |
|---|---|---:|---|---|
| **Axis score** (C63 PARCEL) | private **buildable** land (OSM non-public footprint-area proxy) | 120 | **99.6 %** | *how good is the cadastre where one may build?* |
| **Click coverage** | **every** point in the region bbox — Casa de Campo, El Pardo, M-30 corridors included | 60 | **88.3 %** | *what does a random click get?* |
| **Answer correctness** | every point in the region bbox | 60 | **100 %** | *did every click get a TRUE answer — a parcel **or** an honest "no parcel here"?* |

⚠ **The buildable-land proxy is NOT the legal denominator.** Madrid has **no** AMB-equivalent
buildable-land census yet (Barcelona's 31.8 M m² / 27.1 % has no Madrid twin — see NEXT.md). Until one
exists, the OSM footprint-area proxy is what the axis rests on, and it under-counts vacant buildable
plots, gardens and setbacks.

## The founder's own figures — recorded, NOT merged (capture-notes C-2 / C-10)

The seven founder captures contain **at least five mutually irreconcilable completeness scales**, and
several disagree *internally*. Per the capture notes they are **not averaged and not silently chosen
between**; C63 above is the ratified basis, and these are preserved as *as-supplied, differing basis*
so the evidence chain stays intact.

| Metric | Recon §2 | Recon §3 | Roadmap §49 | Feasibility (batch 3) | Execution (batches 4–6) | **C63 (ratified, this file)** |
|---|---|---|---|---|---|---|
| Legislation | ~25–35 % | ~35 % / 25 % | ≈35–40 % | law 40 % · citations 30 % | legal structuring 40 % | **0 %** (0 cited+signed of 34 claus) |
| GIS / spatial | — | — | ≈95 % | GIS 95 % · routing 100 % | GIS maturity 95 % | *not a C63 axis* — closest is DATA-SOURCES **90 %** |
| Parcel | ~85–95 % | ~75 % | — | join 100 % | — | **`not-assessed`** (geometry *quality*, a different question from source availability) |
| Meta / sources | ~80–90 % | ~60 % | — | — | — | **90 %** DATA-SOURCES (5-slot wiring) |
| Engine / envelope | — | — | ≈70 % engine | — | engine adaptation 80 % | **0 %** completion / **100 %** honesty |
| **Overall** | **~40–50 %** | **≈55–60 %** | — | **~65 %** total · **35–40 %** engine | **≈45–50 %** production-ready | **28 %** (partial, 5 of 7 axes) |

**Why they diverge, stated plainly rather than reconciled:**

1. **They score different things.** Recon §2 scores schema-field coverage; §3 scores
   "production-ready"; §49 splits spatial/legal/engine; batch 3 scores GIS-vs-law; batches 4–6 score
   an implementation forecast. C63 Axis 2 scores *cited **and** human-signed clauses* — a strictly
   harder bar than "we know where the number lives".
2. **They disagree in direction, not just magnitude.** Recon §3 is *more pessimistic* on PART B and
   PART C yet *more optimistic* overall; batch 3 scores NZ 1 geometry at **100 %** in one table and
   **80–90 %** in the next. Averaging would manufacture a number no pass supports.
3. **The founder's high figures are about DATA AVAILABILITY; C63 Axis 2 is about EVIDENCE HELD.**
   Both are true statements about Madrid. Madrid genuinely has excellent, machine-readable *routing*
   data — and genuinely holds zero signed legal citations. The 0 % is not a judgement on the recon
   quality; the recon is precisely what makes the remaining work *bounded* rather than open-ended.
4. **The forecasts are consistent with each other and are NOT scored here.** Batches 4, 5 and 6
   independently land on ~5–8 weeks to a Madrid first release and ~90–95 % ceiling. That consistency
   is notable — but a forecast is not a measurement, and C63 scores state, not plans. ⚠ The *scope*
   those weeks buy also grew between batches (batch 6 adds heritage, existing-building analysis, the
   use graph, alignment geometry, per-field confidence and version management at the *same* estimate);
   read the 5–8 weeks as covering the GIS provider + legal compiler only.

### ⚠ `AMB_TX_DENOM` — a real gain that must not be misread as legislation progress

Batch 3 asserts (capture-note C-7) that `NORMAS_ZONALES/0` also serves **`AMB_TX_DENOM`** — the
official designation per code (`ZONA 1 GRADO 3º`, `ZONA 8 GRADO 2º NIVEL a`) — which would take the
`officialDesignation` field batch 2 scored at 70 % to complete **with no ordinance read**. This repo's
own 2026-07-24 recon independently recorded the same field on the same layer, which corroborates it.

**It is nonetheless ASSERTED, not verified — nobody has queried the field** (`sources/VERIFICATION.md`
§1a P1, the cheapest open probe in the dossier). And even fully verified it **does not move C63 Axis
2 off 0 %**: a designation is a *label*, not a cited numeric rule, and nothing is L-449-signed. It
closes a naming gap, not a legislation gap. Recording it as legislation progress would be exactly the
completeness inflation this scorecard exists to prevent.

Also distinct, and long-standing in this dossier: [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)'s
**~68 % data-readiness** — the cross-jurisdiction C58/L-449 ruler ("can a parcel query return
zone+density+height without opening a PDF"). ⚠ **Three different rulers, three different numbers,
all honest: ~68 % data-readiness · 0 % cited-and-signed legislation · 0 % shippable envelope.** Do
not conflate them; each names its own denominator.

## §CONTEXT-DATA-HONESTY note

**DOES:** terrain (PNOA MDT, unverified) · national Catastro parcels · live PGOUM-97 zone GIS with
verified parcel→`AMB_TX_ETIQ` routing across all 34 claus · the published NZ 1 footprint *as data* ·
a shipped, tested `explicit-area` solver + NZ 1 provider · baked OSM context (5/9).
**REFUSES:** every buildable envelope. `packsByZone` is empty; every Madrid parcel receives a cited
refusal — NZ 3 and the derived ámbitos a *legal* `derived-plan` refusal, NZ 1 a *transient*
"held rule, footprint not fetched" refusal (distinct codes, deliberately).
**LEAVES UNKNOWN (typed):** PARCEL quality (`not-queried`), HEIGHTS (`not-queried`), every NZ
4/5/7/8/9 parameter (`not extracted`), `COEF_Z`'s legal meaning (**quarantined** — never bound to
`farRatio`, `sources/SOURCES.md` §B2), the cause of the zones 2/6/10/11 absence, NZ 9's identity,
NZ 5's rule kind, whether Madrid needs a Catastro connector at all (§G2), and the contents of four
named-but-unprobed GIS layers (§G3).
`honestyOk: true` — nothing above is rendered as a value.

⚠ **One live hazard is documented rather than fixed:** `geoportal.madrid.es` serves a **superseded**
Compendio consolidation (July 2025) alongside the current one (September 2025) on
`transparencia.madrid.es`, with no on-page signal. Any extraction that quotes a `07_07_2025` filename
is version-suspect (`sources/SOURCES.md` §0.1, `RISK-REGISTER.md` R10).

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~68 %, a *different ruler*) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · execution order · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`README.md`](./README.md) · `sources/` · `findings/` | governance · citations · L-NNN + founder-capture records | LEGISLATION · — |

---
*Last updated: 2026-08-01 (L-658 — PARCEL measured 99.6 %; DATA-SOURCES re-derived; 90 % of the ratified weight now assessed). Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md).
LEGISLATION + ENVELOPE promoted from `not-assessed` to MEASURED ZEROS this pass — their inputs
(`sources/VERIFICATION.md` §3, `rulepacks/registry.ts packsByZone`, the 34-clau inventory) were
inspected and found empty. Founder-recon figures recorded separately as as-supplied, differing basis.*
