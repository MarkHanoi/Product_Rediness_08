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
> | **Product phases A–D (all features)** | [master-execution-tracker.md](../03-execution/plans/master-execution-tracker.md) |
> | **Sources: what exists, what we're missing** | [spain/SPAIN-GEODATA-SOURCE-COVERAGE.md](./spain/SPAIN-GEODATA-SOURCE-COVERAGE.md) |
> | **⚠ Read before assuming a dataset exists** | [spain/barcelona-catalonia/BARCELONA-DATA-PIPELINE.md](./spain/barcelona-catalonia/BARCELONA-DATA-PIPELINE.md) |

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
| **End-to-end envelope resolution, Barcelona** | **5.8%** | `scratchpad/l576-layer6.json` |
| **Zone (*clau*) coverage of private buildable land** | **33.0%** *(with 13b)* | `bcn-clau-distribution.json` |
| Constructed ceiling | ~75.8% | — |
| Definitive ceiling *(incl. "no envelope applies")* | ~88% | — |
| **Cities end-to-end proven** | **1 of 3 attempted** *(BCN 2/2 · Madrid 2/4 · Córdoba 0/3)* | dissolve probe |

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
| 6 | **Render / inset volume** | 🟢 LIVE-PARTIAL | **41.5%** live (n=65) — was 36.9% | **L-581 shipped** |
| | **END-TO-END** | ❔ **STALE — must be re-derived** | *(was 5.8% when layer 6 was 36.9%)* | see below |

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

⚠⚠ **END-TO-END IS NOW UNQUOTABLE UNTIL RE-DERIVED.** 5.8% was computed with layer 6 at 36.9%. It is
**not** the product of the layer percentages (0.83 × 0.783 × 0.369 ≈ 24%, not 5.8%), so the chain
involves conditioning this tracker does not record. **Do not multiply the layers and publish the
result** — re-derive it from `probe-l576-*` and cite the derivation here. Until then this cell reads
STALE, which is the honest state; a stale number that says "stale" is safe, one that says "5.8%" is
not.

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
| Unblocks | **Madrid and Córdoba, same code path** |
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

| City | Dissolve | Rule pack | Status | Blocker |
|---|---|---|---|---|
| **Barcelona** | 2/2 | 13a ✅ · 13b 🔵 · 12b ⏸ | 🟢 LIVE-PARTIAL | L-581 |
| **Madrid** | **2/4** | ❌ none | 🔴 BLOCKED | **L-581 clamp**, then PGOU pack |
| **Córdoba** | **0/3** | ❌ none | 🔴 BLOCKED | **L-581 clamp** |
| Rest of Spain | — | ❌ | 🔵 not started | per-municipality sourcing |

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
| **Switzerland** | `OerebParcelProvider` 🔵 | `OerebZoningProvider` / `TerraraZoningProvider` 🔵 | 🔵 / gated | Terrara is buy-vs-build, ADR-0269, **API ❔ UNVERIFIED** |

⚠ **Denmark is strategically more interesting than its size suggests**: it is the case where the
envelope is a **lookup, not a construction**, so it proves the *other* half of the engine and it is
where `confidence: 'structured'` can actually be claimed.

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
