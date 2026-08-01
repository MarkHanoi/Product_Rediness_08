# City RATE — master completion scorecard — Barcelona (es-ct, 08019) — THE PILOT

<!-- generated-by: `node tools/city-completion/computeScorecard.mjs --region barcelona --cc es` (L-658, 2026-08-01) over `tools/city-completion/samples/barcelona.parcel-sample.json`. PARCEL is now MEASURED from a live 120-point sample; DATA-SOURCES/TERRAIN/CONTEXT are config reads; LEGISLATION · ENVELOPE · HEIGHTS/LOD remain not-assessed with typed C62 reasons. NO cell is a fabricated number. -->

> # ⏱ STATUS 2026-08-01 — distance to CLOSED
>
> **`OPEN` · 5 blocking gaps + 2 correctness risks.** Full table in [§CLOSURE](#closure--distance-to-closed-l-662).
>
> ### ✍ FOUNDER SIGNATURE GIVEN 2026-08-01 — clau 18 (L-449 gate)
> **`BCN_REFOS_OV_CERTIFIED` signed.** Authorises an `explicit-area` envelope on the **26.4 %** of clau-18
> land carrying an OV footprint with a parseable storey count, at `estimated-ruleset`, caveated with the
> AMB Refós vintage. **Does NOT authorise** the other 73.6 % (they keep the cited Art. 306 refusal), any
> other clau, or treating the metre height as sourced (`PLANTES` is a storey count converted via
> Art. 327.2). **ENVELOPE 56.0 % → ~60.7 %** once applied.
>
> ### 📜 L-660 — the binding text is now IN THE REPO, and it confirms we ship the WRONG heights
> **DOGC 4893 (29-05-2007) annex retrieved in full** + the RPUC signed *Text d'aprovació definitiva* —
> `corpus/pdf/`. Tables **confirmed against the gazette, zero corrections**. Scope verbatim:
> *«al terme municipal de Barcelona»* — whole municipality, no sector, **no transitional regime**.
> **We ship the BASE table (8,55…23,80); the binding text says 9,00…25,75 for Barcelona.**
> ⚠ Expedient corrected: `2007/028428` is **BADALONA's**; Barcelona's is **`2006/025790/B`**. Badalona's
> instrument states **numerically identical** tables — *a figures-only check cannot tell them apart*,
> which is why this error recurred three times. Both PDFs committed side by side.
> **Awaiting a second founder signature to APPLY.** `BCN_ART327_MPGM_2007.applied === false`.
>
> ### The ceiling, stated once
> **Barcelona's arithmetic maximum is ≈ 78 %**, not 100 %: LEGISLATION caps at ~48 % (**12.0** of 25 pts)
> and ENVELOPE at ~70 % (**14.0** of 20). **≈19 of the 22 missing points are LAW, not effort.**
> **CLOSED ≠ 100 %.** A city reporting 100 % would mean we had stopped being honest about what the
> ordinance does not say.

**Overall completion (assessed subset): `71%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed). Barcelona is **the PILOT** — the one Spanish city with a LIVE constructed

**Overall completion (assessed subset): `87.4%` · `partial: true` — over 45 % of the ratified weight**
— renormalised over the four ASSESSED axes (**PARCEL** · DATA-SOURCES · TERRAIN · CONTEXT, Σ weight
15+15+10+5 = **45**); LEGISLATION · ENVELOPE · HEIGHTS/LOD stay honestly `not-assessed`, not 0 %
(C63 §1.2/§1.5). **`honestyOk: true`**.

> ⚠ **READ THE ASSESSED-WEIGHT FIGURE BEFORE THE HEADLINE.** 87.4 % is a true statement about
> **45 %** of the scorecard. The previous `71 %` was a true statement about **30 %** of it. Neither is
> "how complete Barcelona is": the two heaviest axes (LEGISLATION 25 + ENVELOPE 20 = **45 pts**,
> i.e. as much weight as everything measured here) are still outside the denominator. A rising
> headline that comes from a rising *denominator* is the exact artefact C63 §4 warns about.
>
> ⚠ **CONTEXT sensitivity.** The 87.4 % rides the scorecard's DECLARATION-based CONTEXT read (8/9
> layers that `bake.mjs` LAYERS *can* produce, `validationState: not-checked`). Against the
> tile-VERIFIED 5/9 this dossier audited (rail + trees config-added, re-bake never landed) the
> composite is **83.7 %**. Reproduce either:
> `node computeScorecard.mjs --region barcelona --cc es [--context-layers buildings,roads,water,parks,landuse]`.

Barcelona is **the PILOT** — the one Spanish city with a LIVE constructed
envelope (13a); its legislation detail is [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (~48 % — measured
data-readiness AND realistic full-envelope ceiling) and FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | **99.2%** | `auto-validated` | — | **MEASURED 2026-08-01** (`parcelSampleProbe.mjs --city barcelona`, seed `20260801`). **DENOMINATOR = private buildable land** (L-656), sampled independently of Catastro as **OSM non-public building-footprint area** — 1,969 footprints in 40 uniformly-random 330 m tiles over bbox `[2.09,41.32,2.23,41.47]`, points drawn **∝ footprint area** (unbiased for AREA; a lattice would estimate parcel COUNT). **N = 120: high 118 · medium 2 · low 0 · no-parcel-here 0 · 0 transport failures.** Score = (118·1 + 2·0.5)/120. 95 % Wilson CI on the `high` share: **94.1 %–99.5 %**. Both `medium` are click-landed-outside-ring near-misses (street/courtyard), not broken geometry. Block-ring dissolve 2/2 (L-535) corroborates. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Measured legislation detail = [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md): **~48 %** — the clau is live via MUC, the alineació fabric (13a/13b/12 ≈ 44 % of buildable land) is derivable, 13a **shipped** + **founder-accepted (L-449, 2026-07-20)**. The derived-planning slice (~40 %) is plànol-bound (height ~0 % OCR-extractable, `findings/L-590h`). No composite Axis-2 clau-inventory scorecard run; a % here would double-count the sub-rate. |
| 3 | **DATA-SOURCES** | 15 % | **100%** | `auto-validated` | — | 5/5 slots **live**, derived from config + live-probed 2026-08-01: cadastre-parcel **live** (Catastro; 120/120 real parcels this session) · regional-zone-GIS **live** (`MUC_ZONING_PATH` **mounted** in `server.js` → `server/mucZoningProxy.js` → `sig.gencat.cat/ows/MUC/wms`, GetCapabilities **HTTP 200 2026-08-01**) · building-height nDSM **live** (`heightSources.mjs` `mds_edificacion` `impl:'live'`, `REGION_SOURCE.barcelona`, CNIG MDS WCS live-verified 2026-07-26) · terrain DEM **live** (`terrain.mjs` `barcelona`, source `es` = PNOA MDT) · context-OSM **live** (`bake.mjs` REGIONS `spain`). Mean = 5/5 = 1.00. ⚠ **CORRECTION, +10 pp from the 2026-07-30 audit's 90 %:** that audit scored the building-height slot `documented` because *the shipped tiles* are estimate-heavy (L-582). That is a fact about **Axis 6 (HEIGHTS/LOD)**, not Axis 3 — C63 §3 Axis 3 measures whether the authoritative **feed is WIRED + LIVE**, and this one is (live-probed). Scoring it here double-counted the Axis-6 defect. Axis 6 remains `not-assessed` and still carries it. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | Barcelona is the **only Spanish city with a LIVE constructed envelope**: **13a SHIPPED** (`block-derived-alignment`, ADR-0271, depth per PGM Art. 242.2 + height per Art. 327.2), source founder-accepted (L-449). Systems + coverage-gap claus return a **cited refusal** (L-550/L-553 SHIPPED) — never a fabricated triple. But solver coverage across all claus is unmeasured by the composite Axis-4 function; PRYZM *constructs* on ~24 % of buildable land today. See [`ENVELOPE.md`](./ENVELOPE.md). |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain bake row present: `terrain.mjs` TERRAIN_CITY `barcelona` (source `es` = PNOA MDT) + control points (Port/beach · Montjuïc · Tibidabo · Eixample); Cesium terrain live in production. Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip re-probed here; ⚠ seated on ONE centroid sample, not the façade *rasant* (L-584, a correctness caveat). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | L-582 MEASURED the baked provenance — **0.9 % surveyed (`tagged`) · 79.3 % `levels`×3.2 m · 19.8 % fabricated 9 m** — a real histogram, but the composite Axis-6 scorecard function has not run to convert it to an axis score, and the measured MDS join is not confirmed landed. Recorded as evidence; axis left `not-assessed` pending the scorecard run. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `spain` context bake bbox (`bake.mjs` REGIONS `spain`); footprints MEASURED 104–121 % of OSM ground truth. Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) but not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: coastal — via water/coastline, not tile-probed here → excluded. Score 5/9. |

## §CLOSURE — distance to CLOSED (L-662)

> **Stamp 2026-08-01.** Denominator per **L-656**: **private buildable land = 31,801,618 m²** — only
> **27.1 %** of the city (101.78 M m²). Live AMB census 2026-07-31, cross-checked by the repo's
> independent 275-point MUC grid at 53.5 %.
> **CLOSED** = every axis measured · every axis at its **cited** ceiling · no `EFFORT` / `UNMEASURED` /
> `SIGNATURE` gap left · `honestyOk: true`. **A city may be CLOSED below 100 %.**

| Axis | W | Measured today | **Ceiling (cited)** | Gap type | What closes it |
|---|---:|---|---|---|---|
| **LEGISLATION** | 25 | **~48 %** (sub-rate) | **~48 %** — *the measured rate IS the ceiling; past it is **plànol vectorisation, not OCR**; the derived-planning slice (~40 % of land) is drawing-bound and height is ~0 % OCR-extractable (`findings/L-590h`)* | `STRUCTURAL-DATA` | nothing — **at ceiling** |
| **ENVELOPE** | 20 | **56.0 %** | **~70 %** — *`22a` 15.60 % is **98.9 % `PD*`** ⇒ PGM Art. 350.1 delegates to ~2,595 Pla Parcials; `15/16/17/14a/14b/8a` 3.58 % delegate per-ámbito; **62.8 % of city land is `PD*`*** | `EFFORT` + `SIGNATURE` | clau 18 route ✅ wired → **awaiting `BCN_REFOS_OV_CERTIFIED`** (+4.68 pp); `22@` pack ✅ authored, blocked on a missing *profunditat*; `12b` needs LiDAR; bare `20a` needs a subzone layer |
| **PARCEL** | 15 | `not-assessed` | **HIGH** — *Catastro national + keyless; **block dissolve 2/2**, strongest in the Spanish set (L-535)* | `UNMEASURED` | run `computeParcelConfidence` — **agent in flight** |
| **DATA-SOURCES** | 15 | **90 %** | **100 %** — *4.5/5 slots live; the ½ is `mds_edificacion` configured but not confirmed landed in the shipped tiles* | `EFFORT` | the buildings re-bake (in flight) confirms the 5th slot |
| **HEIGHTS/LOD** | 10 | `not-assessed` — measured histogram **0.9 % surveyed · 79.3 % levels×3.2 m · 19.8 % fabricated 9 m**; shipped tiles report **`measuredMarkerCount: 0`** | **unknown until the MDS join coverage is measured** — *Köln's equivalent join hit 85.4 %; Barcelona's is a different national source and has never been measured* | `EFFORT` | buildings-only re-bake (in flight, L-657) **then re-probe** |
| **TERRAIN** | 10 | **50 %** | **&lt;100 %** — *baked+published ✅, but seated on **ONE centroid sample**, while the ordinance measures from **rasant at the façade** (L-584)* | `EFFORT` | façade-rasant sampling |
| **CONTEXT** | 5 | **56 %** | *unstated* — 5/9 layers; rail+trees config-added not landed | `EFFORT` | remaining layer bakes |
| **CITY** | 100 | **`partial` — 3 of 7 axes assessed** | — | — | — |

**Closure verdict: `OPEN`.** **Blocking gaps: 6** — 2 `UNMEASURED`/`EFFORT` on PARCEL+HEIGHTS (both in
flight), 1 `SIGNATURE` (clau 18), 3 `EFFORT` (envelope tail, terrain rasant, context layers).

**At ceiling already: LEGISLATION.** That is not a failure — ~48 % is what the law and the published
drawings permit, and pushing past it is a vectorisation programme, not extraction. **Recognising an axis
as *finished at its ceiling* is the point of this table.**

⚠ **Two open correctness risks that would block closure even at full score** (`honestyOk` is
launch-blocking, completion % is not): **(1)** clau `12` is mapped with **no geographic predicate**, so a
Ciutat Vella parcel could receive an Art. 320.3a envelope under a citation that does not govern it —
**9.38 % of buildable land on an untested assumption**. **(2) L-660** — Arts. 327.2a/328.2a may be
**superseded** for Barcelona by the MPGM of 02-03-2007 (DOGC 4893), which would make every 13a/13b/12
height wrong by +0,45…+1,95 m across **44.0 %** of buildable land. Both are open.

## The THREE PARCEL numbers — never conflated (L-656 / MASTER-ROI-TRACKER §0.5.2)

All three are true statements about Barcelona on **2026-08-01**; each answers a different question and
carries a different denominator. Reproduce: `node tools/city-completion/summariseSamples.mjs`.

| Metric | Denominator | N | Value | Answers |
|---|---|---:|---|---|
| **Axis score** (C63 PARCEL) | private **buildable** land (OSM non-public footprint-area proxy) | 120 | **99.2 %** | *how good is the cadastre where one may build?* |
| **Click coverage** | **every** point in the region bbox — sea, Collserola, port, streets included | 60 | **83.3 %** | *what does a random click get?* |
| **Answer correctness** | every point in the region bbox | 60 | **100 %** | *did every click get a TRUE answer — a parcel **or** an honest "no parcel here"?* |

The 16.7 % of clicks with no parcel are **measured absences, not failures**: all 10 sit in the sea east
of the Besòs / south over the Llobregat delta, outside the cadastre by construction. **`not-applicable`
≠ 0 %** — they are excluded from the axis, counted in coverage, and correct in correctness.

⚠ **The buildable-land proxy is NOT the legal denominator.** OSM non-public building-footprint area is a
cheap, conservative, cross-city-uniform stand-in; the AUTHORITATIVE Barcelona figure is the AMB
`qualificacio_refos` census (**31,801,618 m² = 27.1 % of the city**, MASTER-ROI-TRACKER §0.5.2). The
proxy under-counts vacant buildable plots, gardens and setbacks, and is footprint-area-weighted rather
than land-area-weighted. Do not swap the two.

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
*Last updated: 2026-08-01 (L-658 — PARCEL measured, DATA-SOURCES re-derived). Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite master added under audit L-649; the pilot's pre-existing rich content (reasoning record, findings, coverage plan) retained unchanged.*
