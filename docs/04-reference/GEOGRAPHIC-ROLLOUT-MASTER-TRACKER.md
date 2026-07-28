# PRYZM — Geographic Rollout Master Tracker

**LIVING DOCUMENT.** The single place to answer *"how far along are we — in Barcelona, in Spain, and
beyond?"* Created 2026-07-22.

> **This tracker owns ONE axis: JURISDICTION COVERAGE.** It is deliberately not another product
> roadmap. Where a row needs product context it links out; it never restates.
>
> | For | Read |
> |---|---|
> | **What is broken / reported** (issue log L-NN) | [V1-LAUNCH-READINESS-AUDIT.md](./V1-LAUNCH-READINESS-AUDIT.md) |
> | **What we are building, phased** | [V1-LAUNCH-IMPLEMENTATION-PLAN.md](./V1-LAUNCH-IMPLEMENTATION-PLAN.md) |
> | **How the system works + how it scales** | [SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md](./SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md) |
> | **How to REPLICATE a city end-to-end (all 8 layers, the golden recipe)** | [CITY-REPLICATION-STANDARD.md](./CITY-REPLICATION-STANDARD.md) |
> | **Product phases A–D (all features)** | [master-execution-tracker.md](../03-execution/plans/master-execution-tracker.md) |
> | **Sources: what exists, what we're missing** | [spain/SPAIN-GEODATA-SOURCE-COVERAGE.md](./spain/SPAIN-GEODATA-SOURCE-COVERAGE.md) |
> | **⚠ Read before assuming a dataset exists** | [jurisdictions/es/es-ct/08019-barcelona/BARCELONA-DATA-PIPELINE.md](./jurisdictions/es/es-ct/08019-barcelona/BARCELONA-DATA-PIPELINE.md) |

---

## §0 — How to read this tracker

**Status legend**

| | Meaning |
|---|---|
| ✅ **DONE** | shipped, live, and **measured** — a number is cited |
| 🟢 **LIVE-PARTIAL** | shipped and working, with a known measured ceiling |
| 🟡 **IN FLIGHT** | actively being worked |
| 🔵 **READY** | unblocked, specified, not started |
| ⏸ **HELD** | deliberately not done — a reason is given, not an omission |
| 🔴 **BLOCKED** | cannot proceed; the blocker is named |
| ❔ **UNVERIFIED** | believed true, never checked — **treat as false until probed** |

### ⚠ Three rules that govern every number in this file

1. **Percentages here are RESOLUTION rates, not ACCURACY rates.** A layer scores when it *produced*
   an answer — never when the answer was checked against reality. Do not present them as accuracy.
2. **Do not quote a figure you have not personally re-measured.** Two numbers in this subsystem were
   published, believed and retracted (15.7% end-to-end from a *tautological* probe; "we have no
   terrain", contradicted by the first grep). Both were stated confidently in several documents
   before anyone checked.
3. **Layers MULTIPLY.** Four layers at 90% is 65%. A per-layer win is not an end-to-end win.

---

## §1 — THE HEADLINE

| | Value | Source |
|---|---|---|
| **End-to-end envelope resolution, Barcelona** | **20.9%** *(5.8% → 6.5% L-581 → 8.8% 13b → **20.9% L-586**)* — §2.0.1 | measured 2026-07-22 |
| **Zone (*clau*) coverage of private buildable land** | **32.7% MEASURED** *(was 24.0%; 13b shipped)* | `bcn-clau-distribution.json` |
| Constructed ceiling | ~75.8% | — |
| Definitive ceiling *(incl. "no envelope applies")* | ~88% | — |
| **Block dissolve, all Spain** | **91.4%** (n=956 manzanas) — Madrid 92.6/99.0% · Córdoba 90.8% | `probe-dissolve-accept.mts` |
| **Cities live in production** | **1** — Barcelona only, and a jurisdiction router is why | §4 |

⚠ **100% is neither achievable nor desirable.** 24.2% of private buildable land is in zones where the
ordinance **grants no private envelope** (parks, motorways, clau 18). *"No envelope applies, here is
the citation"* is a **correct answer**.

---

## §2 — BARCELONA — the six layers

*This is the reference implementation. Everything in §3 and §4 is "make this work somewhere else".*

| # | Layer | Status | Measured | Owner doc |
|---|---|---|---|---|
| 1 | Cadastral parcel (Catastro) | ✅ DONE | part of 83.0% (n=100) | C57 |
| 2 | Zone code / *clau* (MUC) | 🟢 LIVE-PARTIAL | part of 83.0% | C58 |
| 3 | Block dissolve (*manzana*) | 🟢 LIVE-PARTIAL | part of 83.0% | `blockRing.ts` |
| 4 | Depth — Art. 242.2 | ✅ DONE | inside the 83.0% | ADR-0271 |
| 5 | Height — Art. 327.2 | 🟢 LIVE-PARTIAL | **78.3%** (n=83) | L-525a |
| 6 | Render / inset volume | ✅ **DONE** | **98.5%** live (n=65) — was 36.9% | **L-586 shipped** |
| | **END-TO-END** | **20.9%** *(was 5.8% this morning)* | derivation §2.0.1 | |

### §2.0 — ⚠ Post-L-581 re-measurement (2026-07-22), and what it does NOT license

Re-run on the **live** path over the same 65 parcels, before vs after the clamp:

| | before | after |
|---|---|---|
| geometry sound (contained + non-degenerate) | 24/65 · 36.9% | **27/65 · 41.5%** |
| `min-floor` — *"Art. 242.2 cannot be satisfied on this block"* | **40** | **28** |
| `interior-ratio` — the real Art. 242 construction | 16 | **28** |
| `max-cap` | 9 | 6 |

**The headline is the middle row, not the top one: 12 blocks that were being told the ordinance
cannot be satisfied now get a real derived depth — a 30% cut in false refusals — and the count of
answers actually produced BY the Art. 242 construction went 16 → 28.**

⚠ **41.5% (live) and the 55.4% quoted for the offline fixture are DIFFERENT MEASUREMENTS and must
not be compared.** The fixture measures one inset call at the 11 m floor; this measures the full
solve plus a containment check. Quoting whichever is larger would be exactly the aggregate-shopping
that produced the retracted 92.3%.

### §2.0.5 — ⇒ L-586: THE MITER WAS REPLACED, AND LAYER 6 IS EFFECTIVELY SOLVED

Live re-run, same 65 parcels, after replacing the miter offset with the **boundary of the capsule
union** (`inset = parcel \ ⋃(edgeᵢ ⊕ disk(sᵢ))` — no new dependency):

| | this morning | after the L-581 clamp | **after L-586** |
|---|---|---|---|
| geometry sound | 36.9% | 41.5% | **98.5%** |
| *"Art. 242.2 cannot be satisfied"* | **40/65** | 28/65 | **0/65** |
| not-contained | 41 | 38 | **0** |
| ratio-violated | — | — | **0** |
| bound by the real Art. 242 construction | 16 | 28 | **63 (96.9%)** |

*(1/65 is a network error, not a geometry outcome — counted separately, per §CONTEXT-DATA-HONESTY.)*

### ⚠⚠ THE FINDING THAT MATTERS MORE THAN THE RATE

**The previous code was OVER-STATING buildable area on 31 of 65 blocks — worst by 2,577 m², a ratio
of 1.652 (65% over).** That is telling a client they may build MORE than the ordinance allows: the
direction C58 §1.4 forbids. **It is now 0/65** at 11, 15, 20 and 30 m, party-wall and uniform.

**And every check we had was blind to it, including the one written specifically to catch it.** The
soundness gates compared the inset to the **PARCEL**, never to the **TRUE EROSION** — and a fold can
inflate buildable area by 65% while still sitting inside the parcel. The verification probe written
this afternoon inherited the same blind spot: it asserted *"inset not larger than the parcel"* and
called that a conservatism check. **The invariant was WRONG, not merely unmet, and the 55.4% figure
published this afternoon was measured through it.**

⇒ **Three times in one day an aggregate looked healthy while the geometry was wrong, and three times
only an INDEPENDENT ORACLE caught it** (`scratchpad/probe-l586-oracle-65.mts` — grid rasterisation, a
different algorithm, not a replica). **Never accept an aggregate as proof of a geometry change, and
check that your invariant is the RIGHT one before trusting that it holds.**

**Why no patch to the miter could ever have worked:** a miter vertex sits at
`|M−V| = |a−b| / sin θ`. Dissolved cadastral rings turn **< 1°** at half their vertices, and the Art.
242 party-wall call puts `a=11` beside `b=0` across exactly those. **`11/sin(1°) = 630 m`** — from
correct data and a legal input. The L-403 drop loop, the L-581 clamp and the reverted collinear-merge
were all fighting an identity.

### §2.0.6 — ⇒ THE BALANCE HAS FLIPPED. ENGINEERING IS NO LONGER THE LEVER.

Recomputed from measured values (coverage 32.7% · L1–3 83.0% · L5 78.3% · L6 98.5%):

| lever | gain | owner |
|---|---|---|
| **22a rule pack** | **+11.2** | 🔴 legal sourcing |
| **clau 12 pack** | **+17.3** *(cumulative)* | 🔴 legal sourcing |
| **20a family** | **+24.0** *(cumulative)* | 🔴 legal sourcing |
| height 78.3 → 95% | +4.5 | engineering |
| layers 1–3 → 95% | +3.0 | engineering |
| **all packs + every layer at 95%** | **62.4%** | — |

⚠ **This morning layer 6 was worth more than everything else combined. It is now 98.5% and the
remaining engineering is worth +7.5 points total, while 22a ALONE is worth +11.2.** Every rung above
this is **rule packs**, i.e. human-gated legal sourcing that does not parallelise with engineers
(§4.1). **Any plan that funds only engineering now tops out at ~28%.**

### §2.0.1 — ⇒ THE END-TO-END DERIVATION, RECOVERED AND NOW RECORDED

The chain was never written down, which is why it briefly became unquotable. It is **four factors,
and the missing one was COVERAGE**:

```
end-to-end  =  clau coverage  ×  layers 1–3  ×  layer 5 (height)  ×  layer 6 (geometry)
```

Confirmed against the published figure to two decimals:

| | coverage | L1–3 | L5 | L6 | = |
|---|---|---|---|---|---|
| **before the clamp** | 24.2% | 83.0% | 78.3% | 36.9% | **5.80%** ✓ *matches the published 5.8%* |
| **TODAY** *(13b not yet encoded)* | 24.2% | 83.0% | 78.3% | **41.5%** | **6.5%** |
| with the 13b pack | **33.0%** | 83.0% | 78.3% | 41.5% | **8.9%** |

⚠ **Note the coverage column: 33.0% is NOT today's number.** It is what coverage becomes once the
13b pack is encoded. Today it is **24.2%**. Several documents quote 33.0% as current — it is a
FORECAST, and the two must not be interchanged.

### §2.0.2 — ⇒ WHAT EACH REMAINING LEVER IS ACTUALLY WORTH, from today's 6.5%

| Lever | Gain | |
|---|---|---|
| **Layer 6 → 80%** *(finish what L-581 started)* | **+6.1 pts** | ⟵ **still the biggest single lever, by 2.5×** |
| 13b rule pack | +2.4 pts | cheapest, fully unblocked |
| Layer 5 → 95% *(height coverage)* | +1.4 pts | |
| Layers 1–3 → 95% *(dissolve)* | +0.9 pts | |
| **all four together** | **≈ 23.8%** | the realistic ceiling of the current architecture |

⚠⚠ **THE UNCOMFORTABLE READ: L-581 IS NOT FINISHED.** The clamp moved layer 6 from 36.9% to 41.5% —
roughly a third of the distance to a healthy offset — and layer 6 remains worth more than every other
lever combined. Treating L-581 as "done" because a fix shipped would leave the largest lever on the
table. **The next unit of engineering effort belongs here, not on data acquisition.**

### §2.0.3 — ⇒ THE DESTINATION: what we are actually working towards in Barcelona

Each rung is a distinct workstream. This is the whole Barcelona programme on one ladder:

| | end-to-end | gain | workstream |
|---|---|---|---|
| today | **6.5%** | — | — |
| + 13b rule pack | 8.9% | +2.4 | legal sourcing (done, needs encoding) |
| + layer 6 healthy (80%) | 17.2% | **+8.3** | **engineering only — finish L-581** |
| + height coverage 95% | 20.8% | +3.7 | Art. 327 edge cases |
| + dissolve 95% | 23.8% | +3.0 | geometry |
| **+ ALL remaining clau packs** | **54.7%** | **+30.9** | ⟵ **THE BIGGEST ITEM ON THE BOARD** |
| + every layer at 95% | **65.0%** | +10.3 | engineering polish |

**⇒ Barcelona's destination is ~65% constructed, ~88% definitive** (the rest being the 24.2% that
correctly answers *"no envelope applies"*).

### ⚠⚠ THE STRATEGIC FACT THIS LADDER EXPOSES

**The ~23.8% I have been quoting is only the ceiling of WHAT IS ALREADY BUILT.** The gap between
23.8% and 65% is **one thing: rule packs.** At **+30.9 points it is worth 3.7× the largest
engineering item** — and it is precisely the workstream that **cannot be accelerated by hiring
engineers**, because its cost is human-gated legal SOURCING (§4.1: AMB 403s scripted fetch,
Barcelona's ordinance page is robots-disallowed, the authoritative viewers are interactive).

⇒ **Engineering effort and coverage effort are not substitutes, and the binding constraint is the
one we cannot parallelise.** Any plan that funds only engineering tops out at 23.8%.

⇒ **This is also the moat.** A competitor cannot buy these packs either — see §1.7 of the
architecture doc.

### §2.0.4 — ⇒ MEASURED after 13b shipped (2026-07-22), and the clau-18 discovery

**Coverage 24.0% → 32.7% (+8.7 pts), MEASURED not forecast.** Verified by reproducing the original
probe's denominator exactly (n=275 private-buildable points, INE 08019, MUC prefix `R*`/`A*`/`M*`;
`S*` = sistemes = the ordinance grants no private envelope). **End-to-end: 8.8%.**

⚠ A first attempt at this used a hand-written zone list, put **Collserola natural park** in the
private-buildable set and produced a false 20.2%. That is the **wrong-PROPERTY** probe error from
[[probe-can-be-wrong-three-ways]] — measuring something adjacent to the intended thing. The MUC
classification is the authoritative partition; do not hand-roll one.

**The remaining sourcing queue, by measured share of private buildable land:**

| clau | share | cumulative coverage if packed | end-to-end at layer-6 80% |
|---|---|---|---|
| **18** *Ordenació en volumetria específica* | **22.5%** | 55.3% | ⚠ see below |
| **22a** *Zona industrial* | 17.5% | 50.2% | 26.1% |
| **12** *Nucli Antic de Substitució* | 9.5% | 59.7% | 31.0% |
| **20a** family (6 variants) | ~10.5% | 70.2% | 36.5% |
| everything else | ~2% | ~72% | — |

### ✅ CLAU 18 — RESOLVED 2026-07-22. **It is a CORRECT REFUSAL, not a coverage gap.**

Research verdict **(B): the PGM delegates clau 18's volumetry to a site-specific instrument and
states no citywide default.** Confidence ~90%. The verbatim base-PGM article was NOT located — but
**that does not block us, because (B) and "unknown" imply the SAME product behaviour: refuse, with a
citation.** Acting on it is safe in a way acting on a numeric guess never is.

Evidence, all verbatim:
- AMB: *"Comprèn àrees de sòl urbà … en la qual l'edificació correspon al tipus d'ordenació per
  **volumetria específica, segons Pla Parcial o ordenació d'illa definitivament aprovats** o amb
  concreció de volum específic."*
- AMB Geoportal: *"la zona 18 fa referència a una **volumetria aprovada anteriorment** a l'aprovació
  del PGM"* — i.e. clau 18 is a **container for inherited site-specific envelopes**, not a rule.
- MPGM Marina de la Zona Franca: *"El **planejament de desenvolupament en determinarà** la modalitat
  … **fixant l'ocupació, l'altura i la resta de paràmetres**"* — the development plan fixes them, not
  the PGM.
- A Barcelona planning certificate for a clau-18 parcel gives *"Tipus d'ordenació: segons volumetria
  específica"* and then points at the specific MPGM, its plans, annexes and ordering drawings.
- **No fallback found.** Targeted searches for *"en absència de"*, *"mentre no s'aprovi"*,
  *"supletòriament"* returned nothing. ⚠ Absence of evidence, recorded as such.

### ⇒ WHAT THIS DOES TO THE NUMBERS — and it explains a figure nobody could account for

| | |
|---|---|
| private buildable sample | 275 pts |
| clau 18 — **plan-defined ⇒ correct refusal** | 62 pts = **22.5%** |
| **PACKABLE universe** | **213 pts** |

**⇒ If every packable clau were encoded we would reach 213/275 = 77.5% of private buildable land —
and the documented "constructed ceiling" is 75.8%.** That figure has been quoted in our docs for
weeks with no derivation attached. **It matches, and it now has one: whoever computed it had already
excluded clau 18.** Independent corroboration that (B) is the right reading.

⚠ **THE HONEST COVERAGE DENOMINATOR CHANGES.** We have been quoting **32.7% of ALL private buildable
land**. Against the land a rule pack can ever govern it is **90/213 = 42.3%**. Both are true; the
second is the one that measures our progress, the first the one that measures the user's experience.
**State which denominator you mean, every time.**

**⇒ THE DESTINATION, with the uncertainty closed: ~69%** (full packable coverage + layers 1–3 and
height at 95%), not the ~60%/~83% branch pair. **And the 22.5% is ANSWERED, not missing** — *"this
parcel's envelope is set by its own approved plan"*, cited.

### ⇒ ACTION REQUIRED (queued, not yet shipped)

Clau 18 must return a **specific, cited refusal**, not the generic estimated pack and not a bare
coverage-gap card. Wording along the lines of *"This parcel is subject to specific volumetric
planning. Its height, occupation and setbacks are set by the applicable Pla Parcial / Pla Especial /
PMU / Estudi de Detall, not by the PGM."* **Do NOT compute a generic envelope for clau 18.**

⚠ Still open, and worth one more pass if cheap: whether the PGM **caps total edificabilitat even
where a detail plan sets the shape**. Catalan practice commonly lets an *estudi de detall*
redistribute volume without increasing it — but that must be quoted, not assumed. **If such a cap
exists it is encodable even under (B)**, and it would partially reclaim the 22.5%.

### §2.1 — Rule-pack coverage by *clau*

| *clau* | Status | Effect on coverage | Note |
|---|---|---|---|
| 13a / 13E residual | ✅ DONE | in the 24.2% base | 13a has no FAR; pack keys on 13E residual-13a |
| **13b** | 🔵 **READY** | **24.2% → 33.0%** | ⚠ cite Art. 242 via **Art. 326** — **never Art. 328** (Art. 328 has no depth rule; citing it would be a fabricated attribution). Art. 328 *is* the 13b **height** table: <8 m→7,55/PB+1 · 8–11→10,60 · 11–15→13,65 · ≥15→16,70 |
| **12b** (*nucli antic*) | ⏸ **HELD — deliberately** | — | Arts. 319/320 set height from the **average of existing neighbours**, and our context is **0.9% surveyed**. Averaging 79% estimates + 20% fabrications into a *legal* height is fabrication wearing the costume of a construction. **Unblocks only when §4 heights land.** |
| 13E overlay | 🔵 READY | — | *Conjunt Especial de l'Eixample*, not encoded. Pau Claris 155 is probably 13E |
| parks / motorway / 18 | ✅ DONE | 24.2% *correctly* excluded | "No envelope applies", cited |

---

## §3 — PHASES

*Ordered by **value per unit of effort**, not by appetite. Each phase names what unblocks next.*

### ✅ PHASE 1 — L-581 CLAMP · *shipped; the scoreboard moved less than first claimed*

**Status: ✅ SHIPPED 2026-07-22** (founder: *"just do whatever is right"*). Verified against an independent oracle; all 30 `site-parcel-data` geometry tests green.

| | |
|---|---|
| Defect | The offset **drops ~50% of its own constraints** on the `{front: d, side: 0}` party-wall call — the exact Art. 242 call, and the Barcelona *ensanche* configuration. The survivors mitre to a corner **outside the block** (escapes to **177 m** at the 11 m floor, **5.6 km** at 30 m). |
| ⚠ Correction | The long-standing write-up said the ring "drains below 3 lines". **It does not — that gate fires ZERO times.** Failures land on the *soundness* gates (area>parcel 29.2%, vertex-escaped 33.8%). Measured 2026-07-22, `probe-l581-failure-site.mts`. |
| Result | inset sound at the 11 m floor **36.9% → 55.4%**; Art. 242 answers **24/65 → 31/65**, of which honest (landing AT the 30% rule) **3 → 9** |
| Rejected | **delete the drop** — catastrophic, 1.5%. Step 4 is load-bearing. **Half-plane intersection** — retracted, and a GLOBAL clamp turned out to be the same thing wearing a disguise: it broke four L-403/L-525b/L-529 regression tests at once. The shipped clamp is **LOCAL** — only the dropped edge's own line, and only over that edge's own span. **Monotonicity guard** — now SHIPPED as a refusal (the earlier "3.1% yield, worthless" measurement was taken when the curve was flat at zero, so the test was blind by construction; the clamp made it measurable). |
| ⚠⚠ **RETRACTED** | An earlier draft of this row claimed **92.3% / 34 honest**. Both were ARTEFACTS of an un-gated clamp that OVER-ERODED: eating real courtyard makes the bisection settle where the ratio lands on exactly 30%, so **"lands honestly at 30%" scored HIGHEST when the geometry was most wrong.** Caught only by an INDEPENDENT grid-rasterisation oracle — on real block 02309 a uniform 12 m inset is ~3,227 m²; the shipped code gives 2,921 m² (correctly conservative); the un-gated clamp gave **256 m², wrong by 12×** while every aggregate looked healthy. **Never accept an aggregate as proof of a geometry change.** |
| ⚠⚠ **RETRACTED CLAIM** | *"Unblocks Madrid and Córdoba, same code path."* **FALSE — and structurally impossible, not merely small.** A transitive import-closure walk shows `insetPolygonPerEdge` is **not reachable from the production dissolve** (`blockRing.ts` imports only `@pryzm/schemas` + `@pryzm/site-validators`, neither of which reaches it). Measured L-581 effect on dissolve: **0 blocks, in every city.** The dissolve win that was being attributed here is **L-539** (`§DISSOLVE-TJUNCTION-SPLIT`, ADR-0274) — a different change to a different file that landed *earlier*. See §4. |
| Evidence | `scratchpad/probe-l581-remedies.mts`, `l581-blocks.fixture.json` (65 real blocks, offline, no network) |

### 🔵 PHASE 2 — 13b RULE PACK

Coverage **24.2% → 33.0%**. Unblocked; the two citations are settled (see §2.1). Cheapest coverage
win on the board.

### 🔵 PHASE 3 — THE THREE DECIDING PROBES · *~1 day, parallel, each VETOES a branch*

**Run these before writing any pipeline code.** Each is cheap and can save weeks in either direction.

| Probe | Question | What a bad answer kills |
|---|---|---|
| **V8** ⭐ | terrain **posting spacing** under Barcelona | **GATES V6.** If ~10–30 m it cannot resolve a 20 m street — centroid and façade land in the **same cell**, and V6 reports ~0 delta for **instrumental** reasons, closing the rasant question **falsely**. The wrong-instrument trap. |
| **V2** | may a **DERIVED** product be redistributed **commercially**? | kills the nDSM branch outright |
| **V3-gate** | do Overture/MS ML heights **beat `levels × 3.2 m`** against our 0.9% surveyed ground truth? | if not, path A is worthless — **swapping our estimate for theirs is not progress** |

### 🔵 PHASE 4 — HEIGHTS · *the honest-scene programme*

**Where we are:** footprints **104–121% of OSM ground truth (solved)**; heights **0.9% surveyed /
79.3% `building:levels` × an assumed 3.2 m / 19.8% fabricated 9 m (not solved)**.

**⚠ The blocker is OUR SCHEMA, not their data.** Our context feature carries **shape and height as
one record from one provider**. `heightProvenance` records *how good* a height is, but **no field can
say "this shape came from OSM and this height came from LiDAR"** — so a second height source has
nowhere to go. Cityweft's entire layer matrix is downstream of having made the opposite choice early.
**Self-inflicted limitation, not a data gap.** Splitting the pair is **the enabling change, it is a
schema change not a pipeline, and it is cheap — do it while the probes run.**

| Path | Effort | Quality | Blocker |
|---|---|---|---|
| **A** · Overture / MS ML height attributes | **days** — attribute join onto the existing bake | ⚠ **ML-estimated** | licence |
| **B** · nDSM (DSM − DTM) from PNOA LiDAR / ICGC | **weeks** — acquire → difference → zonal stats → bake | **measured** | **G1 licence gate can veto** |

⚠ **Gate A on V3 before ingesting anything** (see Phase 3).
⚠ **We need an nDSM, not "LiDAR".** And the asymmetry that keeps catching us: **a DTM upgrade serves
the RASANT and does nothing for heights; an nDSM serves HEIGHTS and does nothing for the rasant.**
Separate programmes, separate licences — **do not fund them as one line item.**

**⚠ PERFORMANCE — CHANGE NOTHING AT RUNTIME.** We are at the ceiling (42 tiles · 13.4 MB · 9,762
footprints · ~1 s). **Copy the competitor's source SEPARATION; resolve it at BAKE time; ship ONE
fused tileset. Do NOT copy their runtime layer-switching** — that is a second fetch path, the exact
shape of L-513. A baked height attribute rides in requests we already make, at ≈ zero cost.
**If anyone proposes a new source *for performance*, the answer is no.**

⚠ **Phase 4 moves the 5.8% by nothing.** It buys **+1.8%** of coverage (via 12b) and a scene that
stops lying. **Schedule it against a business reason, never the scoreboard.**

### ⏸ PHASE 5 — RASANT / DATUM (L-584)

**We DO have terrain** — real Cesium World Terrain, sampled and seated. *An earlier claim that we had
none was published to four documents and contradicted by the first grep.*

The defect is narrower: **ONE sample at the block CENTROID**, so the envelope is a **flat slab at
centroid elevation**, while the ordinance measures from the ***rasant* at the FAÇADE**. Three errors:
**wrong datum**, **no frontage segmentation**, and a **silent fallback to base 0** — "seated on real
ground" and "seated on a fallback zero" render identically.

⚠ **It lives inside layer 5, which already scores 78.3% — so the defect lowers NO metric.** It is
named here so that deferring it is a **decision**, not a drift.
⚠ **V7 — how the ordinance fixes the reference level on a slope — is the LONG POLE, and no dataset
shortens it.** Ground elevation was never the hard part. It is a reading task: founder/legal.

### 🔵 PHASE 6 — CLEANUP (each small, each unblocked)

- **Estimated-card render race** — the generic default pack solves and **paints** before the Barcelona
  resolver refuses. `§ENVELOPE-REINSET` can re-derive from persisted generic setbacks.
- **Delete `server/contextTilesProxy.js` + `server/catalogAssetProxy.js`** — CORS is live. ⚠ Confirm
  from the founder's **Network tab** that R2 is read directly first; **a bundle grep cannot
  distinguish a dead fallback constant from an active path.**
- **L-577c** — confirm the "parcel looked wrong" screenshot from a **top-down** camera first.
- **Reconcile C58 §3.2/§3.3** — they still specify Turf negative buffer; the shipped engine
  deliberately uses a metric edge-offset (Turf is geodesic, our spine is scene-XZ metres) and **no
  boolean-geometry library is in the tree at all**. Here the **code's reasoning beats the contract**
  — edit C58 in place.

---

## §4 — SPAIN — beyond Barcelona

**Scaling is currently blocked by the BLOCK DISSOLVE, not by the rules.**

| City | Dissolve (n=956 sample) | Zoning source | Rule pack | Status | Binding blocker |
|---|---|---|---|---|---|
| **Barcelona** | Eixample 96.3% · Ciutat Vella 93.5% | ✅ MUC | 13a ✅ · 13b 🔵 · 12b ⏸ | 🟢 LIVE-PARTIAL | layer 6 |
| **Madrid** | **92.6% / 99.0%** ✅ | ❌ none | ❌ none | 🔴 BLOCKED | **G1 router** → G2 source → G3 pack |
| **Córdoba** | **90.8%** ✅ | ❌ none | ❌ none | 🔴 BLOCKED | **G1 router** → G2 source → G3 pack |
| Valencia | 92.7% ✅ | ❌ | ❌ | 🔵 not started | same three gates |
| Sevilla | 82.3% | ❌ | ❌ | 🔵 not started | same three gates |
| **ALL SPAIN** | **91.4%** (874/956) | — | — | — | — |

### §4.0 — ⚠⚠ RETRACTED: "the dissolve is the blocker". IT IS NOT, AND IT HAS NOT BEEN FOR A WHILE.

**Measured this session on a frozen 956-manzana sample, production `dissolveParcelsToBlockRing`:
the dissolve is at 91.4% nationally**, including **Madrid 92.6% / 99.0%** and **Córdoba 90.8%**. The
old "Madrid 2/4 · Córdoba 0/3" figure is a **superseded L-535 measurement** and must not be re-quoted;
it is also not reproducible — that probe recorded street names only, no coordinates or refcats.

The win belongs to **L-539** (`§DISSOLVE-TJUNCTION-SPLIT`, ADR-0274), not to L-581. Verified
structurally rather than statistically: an import-closure walk shows `insetPolygonPerEdge` is **not
reachable from `blockRing.ts`**, so L-581's effect on the dissolve is 0 blocks — impossible, not
merely small.

⇒ **THE THREE GATES THAT ACTUALLY BLOCK A SECOND SPANISH CITY**, each independently sufficient, in
the order they fire:

| | Gate | Evidence |
|---|---|---|
| **G1** | **Jurisdiction router.** `siteDispatch.ts` routes on `isInDenmark()` / `isInBarcelona()` and otherwise falls through to `applyEstimatedZoning()`. `BARCELONA_BBOX` = lat 41.2–41.6, lon 1.9–2.4. Madrid and Córdoba test **false**, so the dissolve, the depth solver and the inset **are never called there at all** — their production success rate is currently *unobservable*. | probe, production function |
| **G2** | **The zoning source is Catalonia-only** — `sig.gencat.cat/ows/MUC/wms`. Live-probed: **0/4 Madrid and 0/3 Córdoba** points returned a qualification, 0 network errors. | live probe |
| **G3** | **No rule pack exists.** `rulepacks/registry.ts` `REGISTRATIONS` holds exactly ONE entry, `es-08019-barcelona`. Even given a perfect block ring there is no rule to apply. | source |

⇒ **The geometry was never the thing standing between us and Madrid.** A second city needs a router
change (small), a non-Catalan qualification source (medium), and a hand-sourced rule pack (the
human-gated cost of §4.1). Budget it that way.

⚠ **Two defects the aggregate was hiding**, surfaced by the independent oracle (ring area vs
*published* cadastral area — a number the dissolve never sees): **Valencia's worst ring is 15.85% off**,
and **11 rings across the sample self-intersect** (Córdoba 4, Valencia 4, Barcelona 1, Madrid-centro 1,
Sevilla 1). Both pass every published summary statistic. Logged, not yet fixed.

⚠ **Street width has NO national source** — it must be **CONSTRUCTED** (measured from Catastro),
and only snapped to nominal values if a distribution probe proves quantisation.

### §4.1 — ⚠ Why municipality count does not amortise

The AMB serves per-municipality *refós* pages keyed by INE code, and **`08015` (Badalona) and
`08245` state DIFFERENT NUMBERS for the same PGM article**, because each municipality layers its own
*modificacions* onto shared article numbers. **"Encode the PGM once, get 36 municipalities free" is
false.**

**And the cost is SOURCING, not typing — and sourcing is human-gated.** AMB 403s scripted fetch,
Barcelona's own ordinance page is robots-disallowed, the authoritative viewers are interactive. Two
capable research agents hit that wall from different angles, twice each, in one day. **This line item
cannot be accelerated by hiring engineers** — it is the single most important fact for planning the
rollout.

---

## §5 — BEYOND SPAIN

**Six of seven layers transfer free** (see the architecture doc §1.5). Adding a jurisdiction is
**a new adapter + optional proxy route + an attribution string — never a core edit.**

| Country | Parcel adapter | Zoning adapter | Status | Note |
|---|---|---|---|---|
| **Spain** | `CatastroParcelProvider` ✅ **BUILT** | `MucZoningProvider` 🟢 | 🟢 LIVE-PARTIAL | national, keyless |
| **Denmark** | `DkParcelProvider` 🔵 | `DkZoningProvider` 🔵 | 🔵 READY | **the reference *structured* case** — Plandata publishes numbers, no construction needed. **Keyed** — the template for every keyed source; key stays server-side. `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` |
| **Switzerland** | `OerebParcelProvider` 🔵 | zone-ID only (numbers model+PDF-bound) 🔵 | 🔵 / gated | **API ✅ VERIFIED 2026-07-24** (`geodienste.ch` NOT geo-blocked). **Rules rate ~20–25% (France-class), NOT 88%** — the 88% was the *context/3D* axis (LOD ~95%), a different ruler. National WFS `ms:grundnutzung` gives the ZONE as data but no `nutzungsziffer`/`geschosszahl`/`gebäudehöhe`; FAR is a typed OPTIONAL slot in the federal INTERLIS model (per-canton harvest, not OCR → ceiling ~30–40% beats France); height/setback are Baureglement-PDF-bound. `ch/findings/SWITZERLAND-DATA-RECON-SPIKE.md` |
| **Saudi Arabia** | user-drawn (Balady API exists, **geo-fenced** 🔴) | **none needed for footprint** — class user-picked | 🔵 **READY (demo)** | **founder demo market.** Footprint = `plot ⊖ max(w/5,{3,2})` capped at coverage(class); a `setback` pack of 4 national constants. **Height deferred to municipal plan (the trap, §5.1).** `saudi-arabia/SAUDI-ARABIA-ENTRY-ASSESSMENT.md` · L-606 |

⚠ **Denmark is strategically more interesting than its size suggests**: it is the case where the
envelope is a **lookup, not a construction**, so it proves the *other* half of the engine and it is
where `confidence: 'structured'` can actually be claimed.

### §5.1 — Saudi Arabia — the cheapest second jurisdiction probed, and why (L-606, 2026-07-22)

**VERIFIED-LIVE against the primary 2024 MOMRAH ministerial decision (قرار 1/4500943139), read
directly — the `ROBOTS_DISALLOWED` negative was the external tool's policy, not a fact; one `curl`
returned a 5 MB PDF.** The MVP question — *"envelope from street width + class alone, no zone
portal?"* — is **YES for the footprint**: setbacks are `max(streetWidth/5, {front 3, side/rear 2})`
and ground coverage is a national constant by class (villa 75 % / apartment 65 %). No FAR in the
residential regime; no block dissolve; no Art.-242-style construction. The single most expensive
Barcelona line item — parcel→zone resolution — **is off the critical path.** Demo effort ≈ **M**
(one `setback` pack + one `street-proportional-setback` solver variant + a router branch), a
fraction of Barcelona.

⚠ **The trap IS present and is written into the primary law:** floors + max height defer to the
municipal `المخطط المعتمد`, and **development-authority regulations (RCRC / ROSHN / NEOM / Diriyah)
prevail on conflict** — so a plot in a giga-project zone is not answered by the national tables. It
bites the **vertical** question only (the footprint stays nationally grounded), which is a smaller,
better-bounded surface than Barcelona's 62.8 % derived-planning. **No free/reachable parcel data**
(the Balady ArcGIS service exists and even publishes per-parcel setbacks+use+floors, but its host is
NXDOMAIN externally and its proxy WAF-blocks non-SA IPs). Demo path = user-drawn plot + class
dropdown. Full analysis: `saudi-arabia/SAUDI-ARABIA-ENTRY-ASSESSMENT.md`,
`saudi-arabia/SAUDI-PRIMARY-DECISION-EXTRACT.md`, `saudi-arabia/SAUDI-UMAPS-API-ENUMERATION.md`.

---

## §6 — THE STANDING RISK REGISTER

| Risk | Why it bites | Mitigation |
|---|---|---|
| **Resolution read as accuracy** | every % here scores "produced an answer", never "checked against reality" | say it every time — §0 rule 1 |
| **A green job is not a verification** | the tile bake asserted size + magic bytes + a range probe and passed **while a third of the buildings were missing**; OSM ground truth caught it | ask what your check *cannot* see |
| **A probe can be wrong three ways** | wrong RUNTIME (only a browser sees CORS) · wrong PROPERTY (centroid matching at 10 m spacing measures density, not identity) · wrong SYSTEM (leaf resolver vs production tier chain) | demand an **independent** source |
| **Failure conflated with emptiness** | L-422/457/467/469/579 — a failure and an empty result are the same VALUE | discriminated results, never a bare `[]` |
| **Defects that lower no metric** | L-584 rasant is real and invisible to every number we track | name them explicitly, as above |
| **Nothing is `certified`** | every legal parameter carries a confidence tier and the top tier is not claimed | `L-583-LEGAL-PARAMETERS-SOURCED.md` |

---

## §7 — Blocked on the founder

| Item | What it changes |
|---|---|
| **L-581 clamp sign-off** (§3 Phase 1) | **the only decision that moves 5.8% → ~20%** |
| Art. 242.2 verbatim scoping sentence, from a **real browser** at NUMAMB / BCNROC | **upgrades a confidence tier; changes no answer.** Do not wait on it |
| **V7** — how the ordinance fixes the reference level on a slope | the long pole on Phase 5; a reading task, not a data task |

---

## §8 — How this tracker updates

- A phase moves status **only when a number moves**, and the number is cited to the file that
  produced it.
- New defects go to the **audit** issue log (L-NN) first; this tracker links, never restates.
- **Edit this file in place.** Do not write a derivative `*-AUDIT.md` — that is how this subsystem
  ended up with the same facts stated four different ways, two of them wrong.
