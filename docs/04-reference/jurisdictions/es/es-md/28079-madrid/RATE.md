# City RATE — master completion scorecard — Madrid (es-md, 28079)

<!-- generated-by: MANUAL C63-Phase-4-JURISDICTION-DOC-PASS 2026-07-31 — scorecard function not yet
     shipped (C63 §8). FIVE axes are now cited-derived per C63 §8.1: the three CHEAP axes
     (DATA-SOURCES · TERRAIN · CONTEXT) unchanged from the 2026-07-30 audit, plus LEGISLATION and
     ENVELOPE which are now MEASURED ZEROS (their inputs became countable — see the derivations).
     PARCEL and HEIGHTS/LOD remain not-assessed with typed C62 reasons. NO cell is a fabricated
     number; each cell names the inspectable state it was read from. -->

**Overall completion (assessed subset): `28%` · `partial: true`** — renormalised over the five
ASSESSED axes (LEGISLATION · ENVELOPE · DATA-SOURCES · TERRAIN · CONTEXT); PARCEL and HEIGHTS/LOD
are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** — Madrid renders no
fabricated value; every unknown is typed and every buildable zone returns a cited refusal.

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
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National Catastro parcel provider IS wired (`parcelProviders/registry.ts` `isInSpain`→`catastro`), and the planning join is confirmed **spatial** (`CODMANZANA` has no string relation to a refcat — proven false against three real refcats). But the axis measures the *geometry-quality distribution* over an N-parcel sample and **no `computeParcelConfidence` run exists for this bbox**. Known drag: the block-ring dissolve is **2/4 in Madrid** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`, tolerant-mode gap; weaker than Barcelona's 2/2). |
| 2 | **LEGISLATION** | 25 % | **0%** *(measured)* | `not-checked` | — | **`verified_cited_claus / total_claus_present` = 0 / 34.** *Denominator:* the live `NORMAS_ZONALES/0` `AMB_TX_ETIQ` distinct-value read returned **34** claus (`sources/SOURCES.md` §0.3 — a response, not an estimate). *Numerator:* **zero** rows in `sources/SOURCES.md` carry the full citation atom (value·unit·article·document·URL) **and** zero are covered by a signed `sources/VERIFICATION.md` (`§3` = empty; the file's own status line is "NOTHING LEGALLY SIGNED"). ⚠ **This is a MEASURED zero, not `not-assessed`** — both inputs were inspected; the answer is genuinely "we hold no cited, signed clause". |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `not-checked` | — | 5-slot checklist, unchanged: cadastre-parcel **live** (Catastro national) · regional-zone-GIS **live** (`sigma.madrid.es` PGOUM-97, 12 services + the master `NORMAS_ZONALES/0` routing layer — **independently re-confirmed by the founder's 2026-07-31 recon**, which reached the same endpoint) · building-height nDSM **documented** (`heightSources.mjs` `REGION_SOURCE.madrid='mds_edificacion'`; per-city bake not confirmed landed) · terrain DEM **live** (`terrain.mjs` TERRAIN_CITY `madrid`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = (1+1+0.5+1+1)/5 = **0.90**. |
| 4 | **ENVELOPE** | 20 % | **0%** *(measured)* · **honesty 100 %** | `not-checked` | — | **`Σ(buildable_land_share × pack_tier_weight)` = 0.** `rulepacks/registry.ts` registers Madrid with an **EMPTY `packsByZone`** and `noRulePackRefusal → madridNZ1Refusal` for every zone code. Every clau's tier is therefore `cited-refusal`, whose completion weight is **0.0** (C63 §3 Axis 4). ⚠ The unsourced per-NZ land-share split does **not** block this computation: `Σ(share × 0) = 0` for *any* share distribution. `not-assessed` would have been the wrong sentinel — the state was inspectable and it is empty. Per C63 §3.1 the same 0 % scores **100 % on honesty**. See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `madrid` (source `es` = PNOA MDT) + control points (Puerta del Sol / Retiro / North M-30). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed here. Same rasant-datum caveat as Barcelona (L-584) — which is *also* a legislation concern for Madrid, since *altura de cornisa* is measured from rasant at the façade. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked. The CNIG MDS Edificación per-city source is configured (`REGION_SOURCE.madrid`) but **no per-city `heightProvenance` histogram has been probed** — the `tagged` fraction is the axis input and it has not been measured. See [`HEIGHT.md`](./HEIGHT.md). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) but not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: inland, n/a. Score 5/9 = 55.6 %. |

### Overall arithmetic (C63 §4, shown so it can be re-checked)

```
assessed:  LEGISLATION 0.000×25  +  ENVELOPE 0.000×20  +  DATA-SOURCES 0.900×15
         + TERRAIN     0.500×10  +  CONTEXT  0.556×5
         =   0.0 + 0.0 + 13.50 + 5.00 + 2.78  =  21.28
Σ weights (assessed only) = 25 + 20 + 15 + 10 + 5 = 75
overall = 21.28 / 75 = 0.284  →  28 %   ·   partial: true
not-assessed: PARCEL (15) · HEIGHTS/LOD (10)
```

## The founder's own figures — recorded, NOT merged (capture-note C-2)

The founder's captures contain **two mutually irreconcilable completeness scales**. Per the capture
note they are **not averaged and not silently chosen between**; C63 above is the ratified basis, and
these are preserved here as *as-supplied, differing basis* so the evidence chain stays intact.

| Metric | Recon §2 (as supplied) | Recon §3 (as supplied) | Roadmap §49 (as supplied) | C63 (ratified, this file) |
|---|---|---|---|---|
| Legislation | ~25–35 % | ~35 % (table) / 25 % (prose) | ≈35–40 % weighted residential | **0 %** (0 cited+signed of 34 claus) |
| Parcel / spatial | ~85–95 % | ~75 % | ≈95 % spatial | **`not-assessed`** (different definition: geometry *quality*, not source availability) |
| Meta / sources | ~80–90 % | ~60 % | — | **90 %** DATA-SOURCES (5-slot wiring checklist) |
| Engine / envelope | — | — | ≈70 % engine | **0 %** completion / **100 %** honesty |
| **Overall** | **~40–50 %** | **≈55–60 % production-ready** | — | **28 %** (partial, 5 of 7 axes) |

**Why they diverge, stated plainly rather than reconciled:**

1. **They score different things.** §2 scores schema-field coverage; §3 scores "production-ready";
   §49 splits spatial/legal/engine. C63 Axis 2 scores *cited **and** human-signed clauses* — a
   strictly harder bar than "we know where the number lives".
2. **§2 and §3 disagree in direction.** §3 is *more pessimistic* on PART B and PART C yet *more
   optimistic* overall. That is not a rounding difference; it means the two passes are not
   commensurable and averaging them would manufacture a number neither pass supports.
3. **The founder's high figures are about DATA AVAILABILITY; C63 Axis 2 is about EVIDENCE HELD.**
   Both are true statements about Madrid. Madrid genuinely has excellent, machine-readable
   *routing* data — and genuinely holds zero signed legal citations. The 0 % is not a judgement on
   the recon quality; the recon is what makes the remaining work *bounded*.

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
`farRatio`, `sources/SOURCES.md` §B2), the cause of the zones 2/6/10/11 absence, NZ 9's identity, and
NZ 5's rule kind.
`honestyOk: true` — nothing above is rendered as a value.

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
*Last updated: 2026-07-31. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md).
LEGISLATION + ENVELOPE promoted from `not-assessed` to MEASURED ZEROS this pass — their inputs
(`sources/VERIFICATION.md` §3, `rulepacks/registry.ts packsByZone`, the 34-clau inventory) were
inspected and found empty. Founder-recon figures recorded separately as as-supplied, differing basis.*
