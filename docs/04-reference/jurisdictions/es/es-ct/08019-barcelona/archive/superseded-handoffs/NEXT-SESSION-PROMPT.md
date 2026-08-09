# NEXT SESSION — paste everything below the line

*Rewritten clean 2026-07-22 at session close, live = **v281**. Single source of truth. The previous
version had accumulated 8 stacked corrections over a stale body and contradicted itself; it is
archived as `NEXT-SESSION-PROMPT-v280-superseded.md` — **do not read it**, everything true in it is
here.*

---

You are picking up PRYZM mid-stream. **Read `CLAUDE.md`, then this entire prompt, before touching
code.** Every number here was measured live, not estimated.

## 1 · WHERE THINGS STAND

**The 3D Site is FIXED and the founder confirmed it** — *"the loading buildings is sound! super
quick"*. Context reads pre-baked PMTiles byte-ranges from Cloudflare R2 **directly** (CORS is live).
**42 tiles · 13.4 MB · 9,762 footprints · ~1 s.** **Do not reopen this, and do not add anything to
the runtime load path.**

Barcelona's buildable envelope is a **six-layer** product. Layers MULTIPLY — four at 90% is 65%.

| # | Layer | Live | Note |
|---|---|---|---|
| 1–3 | parcel · zone · block dissolve | **83.0%** (n=100) | measured |
| 4 | depth (Art. 242.2) | in the 83.0% | measured |
| 5 | height (Art. 327) | **78.3%** (n=83) | measured |
| 6 | render / inset volume | **36.9%** (n=65) | **⚠ THE BOTTLENECK** |
| | **END-TO-END** | **5.8%** | |

**Coverage** (share of private buildable land whose clau has a rule pack): **33.0%** with 13b
unblocked. Ceiling ~75.8% constructed / **~88% definitive**.

### ⚠⚠ TWO THINGS ABOUT THESE NUMBERS THAT MUST NOT BE LOST

1. **THEY ARE *RESOLUTION* RATES, NOT *ACCURACY* RATES.** Layer 5 counts 78.3% because a height was
   **produced** — it never asks whether the height was measured **from the right datum**. See §4.
   **Never present these as accuracy.**
2. **5.8% SUPERSEDES AN EARLIER 15.7%** that I published and retracted the same day — the layer-6
   probe had been **tautological** (it computed `maxVolume`, then compared it to itself). If you
   find 15.7% anywhere, it is stale. **Do not quote a coverage figure you have not personally
   re-measured.**

## 2 · YOUR TASK — L-581, AND ESSENTIALLY ONLY L-581

**It is the ONLY open item that moves the scoreboard: 5.8% → ~20.4%.** Zero external dependency,
and it unblocks Madrid and Córdoba (same code path).

**The defect.** `interiorFreeAt()` in
`packages/site-parcel-data/src/geometry/blockDerivedDepth.ts` returns `0` **both** when the courtyard
is genuinely consumed **and** when `insetPolygonPerEdge()` structurally FAILS. The solver cannot tell
them apart, so a **geometry failure is published as a legal conclusion** — `binding:
'interior-ratio'`, or `degenerate: true`, which the UI renders to a paying architect as *"Art. 242.2
cannot be satisfied on this block."* (§CONTEXT-DATA-HONESTY: failure and empty are the same VALUE and
must never be the same ANSWER.)

**The cascade.** When an inset segment reverses, the code **DROPS** that edge's line and re-mitres.
Dropping *abandons the constraint*: neighbours mitre deeper, more edges reverse, the ring drains
below 3 lines. It scales with the **MAGNITUDE OF THE DIFFERENCE** between adjacent setbacks — same
block, `front=5`: `side=5`→48 verts · `4.9`→40 · `4`→24 · `2`→**DEGENERATE**. Art. 242 calls it with
`{front: d, side: 0}` — the worst case in the space.

**Measured on the 65-block fixture:**
- **63.1% collapse at the 11 m ORDINANCE FLOOR** — the gentlest depth the solver is ever asked for
- 45/65 collapse and **stay** collapsed at every depth · 11/65 recover · 9/65 never collapse

### THE FIX

**CLAMP a reversed edge's contribution instead of DROPPING its line.** Verify **offline** against
`scratchpad/l581-blocks.fixture.json` (65 real blocks; front/total edge counts and convexity
recorded; **no network**).

### ⚠⚠ FOUR THINGS THAT WILL WASTE YOUR SESSION IF YOU SKIP THEM

1. **DO NOT PROPOSE HALF-PLANE INTERSECTION.** I measured it (29/30 vs 11/30, median Δdepth 0.00 m),
   recommended it, and it was **demolished** by an adversarial review with **no repo access** — it
   found the error by reading my prose. My load-bearing claim (*"47–89% free after eroding 30 m from
   every frontage is impossible"*) was **wrong**: the call is `{front: d, side: 0}`, so **only front
   edges erode**; the outlier blocks have only **25–36% front-edge fraction**. Worse, half-plane
   **over-states** free area at convex front–front corners ⇒ **over-states buildable depth**, trading
   a *detectable* failure for an *undetectable* one (C58 §1.4 forbids that direction). My "Eixample
   illes are convex-ish" rationale was also false: **all 65 fixture blocks carry 10–43 reflex
   vertices, zero convex.**
2. **THE "MONOTONICITY GUARD" IS NOT HALF THE FIX — I BUILT IT AND IT MEASURED NEARLY WORTHLESS.**
   `interiorFreeNonMonotone` ships (purely diagnostic; changes no depth). Yield: **3.1%, and ZERO
   detections `insetDegenerate` did not already make.** Structural, not tunable — **0 → 0 is
   monotone, so it is blind to the 45/65 that stay collapsed.** ⇒ **Budget L-581 as "clamp", not
   "clamp + guard."**
3. **THE REPO HAS NO BOOLEAN-GEOMETRY DEPENDENCY** — verified: no `polygon-clipping`, `martinez`,
   `turf`, `polybooljs`, `@flatten-js`. Adding one is a real decision.
4. **⚠ ANY REMEDY MOVES REAL DEPTHS IN BOTH DIRECTIONS, INCLUDING UPWARD** (14.3 → 27.1 m observed).
   **Upward is the dangerous direction** — it tells a client they may build deeper than we said
   yesterday. **Measure the full before/after distribution across all 65 blocks and put it in front
   of the founder BEFORE shipping. That is a founder decision, not an engineering one.**

## 3 · THE POST-CITYWEFT DATA PLAN — ⚠ NONE OF IT PRECEDES L-581

Full analysis: `docs/04-reference/jurisdictions/es/SPAIN-GEODATA-SOURCE-COVERAGE.md` §8–§11. Audit row L-584.

**Mapped onto the six layers, this entire workstream barely touches them.** L-581 is the only item
that moves the score. The whole LiDAR/context programme sits **outside** the six layers except the
**+1.8%** that 12b adds to layer 2. **The most exciting workstream from that call buys 1.8% of
coverage and a better-looking scene.** Schedule it against a business reason, never the scoreboard.

**Where we are:** footprints **104–121% of OSM ground truth (solved)**; heights **0.9% surveyed /
79.3% `building:levels` × an assumed 3.2 m / 19.8% fabricated 9 m (not solved)**. We cannot source
them separately because our feature model **welds shape and height into one record** — a
**self-inflicted schema limitation, not a data gap**. Splitting that pair is the enabling change and
it is cheap; do it while the probes run.

**⚠ PERFORMANCE — CHANGE NOTHING AT RUNTIME.** We are at the ceiling. A baked height attribute rides
in requests we **already make** (cost ≈ 0). **Copy the competitor's source SEPARATION, resolve it at
BAKE time, ship ONE fused tileset. Do NOT copy their runtime layer-switching — that is a second
fetch path, which is the shape of L-513.** If anyone proposes a new source *for performance*, the
answer is no.

**Three cheap probes, each of which VETOES a branch (~1 day, in parallel, before any pipeline
code):**
- **V8** ⭐ **terrain posting spacing under Barcelona. GATES V6.** If ~10–30 m it **cannot resolve a
  20 m street** — centroid and façade land in the **same cell**, and V6 reports ~0 delta for
  **instrumental** reasons, closing the rasant question **falsely**.
- **V2** may a **DERIVED** product be redistributed **commercially**? Kills the nDSM branch outright.
- **V3-gate** do Overture/MS ML heights **beat `levels × 3.2 m`** against our **0.9% surveyed**
  ground truth? If not, that path is worthless — **swapping our estimate for theirs is not
  progress.**

⚠ **We need an nDSM (DSM − DTM), not "LiDAR".** And the asymmetry that keeps catching us: **a DTM
upgrade serves the RASANT and does nothing for heights; an nDSM serves HEIGHTS and does nothing for
the rasant.** Separate programmes, separate licences.

## 4 · ⚠ THE RASANT DEFECT (L-584) — small, real, and it lowers no metric

**We DO have terrain.** `CesiumViewport.clampTerrainThenReplace()` samples real Cesium World Terrain
and seats the massing on it (`VITE_CESIUM_TOKEN` ships in prod). *An earlier claim that "we have no
terrain" was wrong — I published it before grepping.*

**The defect is narrower:** we take **ONE sample, at the block CENTROID**, so the envelope is a
**FLAT SLAB at centroid elevation** — while the ordinance measures from the ***rasant* at the
FAÇADE**. Two errors: **wrong DATUM** and **NO SEGMENTATION** (a frontage the ordinance may require
split). **Plus a third: the sample falls back to base 0 SILENTLY** on a keyless provider or a
NaN/rejected sample — "seated on real ground" and "seated on a fallback zero" render identically.

⇒ **This lives inside layer 5, which already counts as 78.3% sound** — so the defect does not lower
the number; it means part of that number is **a correct height on the wrong reference level**
(C58 §1.11). ⚠ **Defects that lower no metric get deferred forever. This one is named so that is a
decision, not a drift.**

⚠ **V7 — how the ordinance fixes the reference level on a slope — is the LONG POLE and no dataset
shortens it.** Ground elevation was never the hard part. It is a reading task: founder/legal.

## 5 · AFTER L-581, IN VALUE ORDER

1. **13b rule pack** — unblocked; coverage **24.2% → 33.0%**. ⚠ **Cite Art. 242 via Art. 326, NEVER
   Art. 328** (Art. 328 has no depth rule — that would be a fabricated attribution of the L-526
   kind). Art. 328 is the 13b **height** table: <8→7,55/PB+1 · 8–11→10,60 · 11–15→13,65 · ≥15→16,70.
2. **Estimated-card render race** — the generic default pack solves and PAINTS before the Barcelona
   resolver refuses (`§ENVELOPE-RESOLVE-DIAG … maxHeight=12 m` precedes `§L-553 REFUSAL` in the
   founder's console). `§ENVELOPE-REINSET` can re-derive it from PERSISTED generic setbacks.
3. **The three probes + the footprint/height schema split + the honest terrain fallback** — all
   cheap, all parallel.
4. **Delete `server/contextTilesProxy.js` + `server/catalogAssetProxy.js`** — CORS is live. ⚠ Confirm
   from the founder's **Network tab** that R2 is read directly first; **a bundle grep cannot
   distinguish a dead fallback constant from an active path** (that ambiguity let §L-570-BUNDLE-PROOF
   pass while every asset was CORS-refused).
5. **13E** — *Conjunt Especial de l'Eixample* overlay, not encoded. Pau Claris 155 is probably 13E.
6. **L-577c** — confirm the "parcel looked wrong" screenshot from a **top-down** camera first.
7. **⚠ 12b STAYS BLOCKED.** Arts. 319/320 set nucli antic height from the **average of existing
   neighbours**, and our context is **0.9% surveyed**. Averaging 79% estimates + 20% fabrications
   into a **legal** height is fabrication wearing the costume of a construction. Encoding it as a
   width→height table would be the wrong **SHAPE** of rule (C58 §1.11).

## 6 · HOUSE RULES THAT PRODUCED TODAY'S RESULTS

- **Probe the CODE before writing a defect down** — especially when it feels obviously true. I
  published "we have no terrain" to the audit, the plan, the hand-off and memory, and **the first
  grep contradicted it**. Same day, same shape as the half-plane retraction.
- **A green job is not a verification.** The bake asserted size + PMTiles magic + a Range probe and
  passed while a third of the buildings were missing. **OSM ground truth caught it.** Ask what your
  check *cannot* see.
- **A probe can be wrong three ways** — wrong RUNTIME (only a browser sees CORS), wrong PROPERTY
  (centroid matching on 10 m-spaced buildings measures density, not identity), wrong SYSTEM (leaf
  resolver vs production tier chain). Demand an **independent** source.
- **Never conflate failure with emptiness** (L-422/457/467/469/579).
- Read `docs/02-decisions/contracts/README.md` for the subsystem you touch. **When code disagrees
  with a contract, the code is wrong.** Edit the canonical `C0N-*.md` in place — never write a new
  `*-AUDIT.md` derivative.

## 7 · DEPLOY PROTOCOL — GET THIS WRONG AND NOTHING SHIPS

**Push, THEN `workflow_dispatch` with `bypass_ci_gate: true`.** A bare push dies silently at the
L-540 CI gate — that cost a deploy today (v277 never shipped; the founder noticed before I did).
Live: **v281**.

## 8 · READ THESE

- `docs/04-reference/ISSUE-LOG.md` — rows **L-576 → L-584**
- `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` — phased plan, per-clau roadmap, the two
  citations the 13b work hangs on, scaling strategy
- `docs/04-reference/jurisdictions/es/SPAIN-GEODATA-SOURCE-COVERAGE.md` — §8 study · §9 "would it be quicker" ·
  §10 the plan · §11 the six-layer mapping
- `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/BARCELONA-DATA-PIPELINE.md` — **read before assuming a
  "Barcelona dataset" exists.** Only 1 of 7 layers is a dataset we own; the envelope is CONSTRUCTED
  per parcel on every selection. *"Six of seven layers are free. The seventh is the whole cost."*
- `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/L-583-LEGAL-PARAMETERS-SOURCED.md` — every legal
  parameter with a confidence tier. **Nothing is `certified`.**
- `docs/02-decisions/adrs/ADR-0271` — Art. 242.2 is an ALGORITHM, not a lookup
- Evidence behind the numbers: `scratchpad/l576-live-dissolve.json`, `l576-layer5.json`,
  `l576-layer6.json`, `bcn-clau-distribution.json`

## 9 · BLOCKED ON THE FOUNDER

The verbatim **Art. 242.2 scoping sentence** from a **real browser** at NUMAMB or BCNROC (both 403 /
robots-disallow scripted fetch). It **upgrades a confidence tier; it changes no answer.** Do not wait
on it.

---

**Start by reading `blockDerivedDepth.ts` end to end.** `insetDegenerate` and
`interiorFreeNonMonotone` are already shipped and additive — no depth or binding has changed yet.
You are picking up a fully diagnosed, fully specified, undone fix.
