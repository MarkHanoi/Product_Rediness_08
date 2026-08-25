# C108 — Facade Reconstruction From Image

> **Stamp**: 2026-08-24 · **Lane**: FACADE53 · **Amended**: 2026-08-25 · **Lane**: FACADEREAL60
> **Status**: CANONICAL — deliberately **NOT ACTIVE**
> **Ratified by**: [ADR-0371](../adrs/ADR-0371-a-facade-reconstruction-is-a-measurement-not-a-likeness.md)
> **Specced by**: [SPEC-FACADE-RECONSTRUCTION-PIPELINE](../../03-execution/specs/SPEC-FACADE-RECONSTRUCTION-PIPELINE.md)
> **Issue block**: [L-11000 … L-11013](../../04-reference/ISSUE-LOG.md) · first-real-photograph
> block [L-10970 … L-10978](../../04-reference/ISSUE-LOG.md) (lane FACADEREAL60, 2026-08-25)
> **Governs**: `packages/facade-reconstruction/**`, `tools/facade-reconstruct/**`,
> `apps/editor/src/ui/facade/**`, and every consumer of the **Facade IR**.
> **Binds**: `C62` (confidence & typed unknowns — the vocabulary this subsystem INHERITS)
> · `C11` (element creation, for the eventual BIM leg) · `C16` (command authoring)
> · `C73` (geometry determinism & tolerance) · `C75` (provenance) · `C84` (element integrity —
> binding only when the BIM leg lands, see §10) · `C23` (AI audit — vacuous today by §5)
> **Source of requirements**: the founder's brief *"Reconstruct This Facade From the Attached
> Photo"*, 2026-08-24, §1–§24. Where this contract and that brief disagree, **the brief wins and
> this contract is the defect** — every clause below cites the brief section it implements.

---

## §0 — What this contract owns, and what it explicitly does NOT

### §0.1 Refusal table — read this before adding a clause

| Question | Owner, not this contract |
|---|---|
| How trustworthy a value is; the word for *unknown* | **C62** — §4 below is an INSTANCE of C62, never a rival scale |
| Where a value came from | **C75** / `ValueOrigin` |
| What a wall / window / slab **is** once created | **C84** + the `C85`–`C99` per-element block |
| How an element gets created from a proposal | **C11** (pipeline) + **C16** (command authoring) |
| The legal parcel, the site, the zoning envelope | **C19**, **C57**, **C58** — a facade photo says nothing about any of them |
| Photoreal render / textured mesh output | **not PRYZM's target at all** — brief §24, and the [GenRecon spike](../../03-execution/spikes/spike-genrecon-generative-reconstruction.md) §6 |
| Multi-view / posed capture, COLMAP, splats | out of scope — [GenRecon spike](../../03-execution/spikes/spike-genrecon-generative-reconstruction.md), [Gaussian-splatting spike](../../03-execution/spikes/spike-gaussian-splatting-photoreal-3d.md) |
| Tolerance constants and determinism rules for geometry | **C73** — §5.2 below defers to it |

### §0.2 — ⛔ THE PHOTOGRAPH IS NOT IN THIS REPOSITORY. STATED, NOT HIDDEN.

The brief was written around **one attached photograph**. **That image was attached to a
conversation and is not on disk.** Measured 2026-08-24 at HEAD:

```
find . -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' | grep -iv node_modules | grep -i facade   →   0
```

⚠ **Therefore every quantitative claim this subsystem makes today is a claim about SYNTHETIC
inputs with known ground truth (brief §19), and about nothing else.** No clause in this contract
may be read as evidence that the algorithm works on the founder's building, and no test in
`packages/facade-reconstruction/__tests__/**` asserts anything about it.

This is not a caveat, it is the **primary honesty invariant of the subsystem**, and it inverts the
usual risk: this repository's dominant failure mode is a confident verdict computed from an
assumption nobody re-measured ([[confident-register-rows-are-the-wrong-ones]],
[[probe-can-be-wrong-three-ways]]). A pipeline that passes A–J synthetically and then **fails** on
the real photograph is a **good** outcome — it names exactly which assumption reality breaks. A
pipeline tuned to one photograph proves nothing at all, and §9 forbids it.

**L-11001 stays OPEN until a real photograph has been run and its result recorded.**

> ⭐ **2026-08-25 — IT HAS BEEN RUN, AND IT FAILED, AND THAT IS THE OUTCOME THIS SECTION PREDICTED.**
> The founder put a ~7-storey × ~5-bay Barcelona street block with a five-arch ground arcade through
> the pipeline with hand-placed corners. **The lattice came back 2 zones × 2 bays.** Four cells on a
> building with roughly thirty-five openings; 34 detections in `outliers[]`; the five arches never
> examined. The paragraph above says *"a pipeline that passes A–J synthetically and then FAILS on
> the real photograph is a GOOD outcome — it names exactly which assumption reality breaks"*, and
> the assumption it named is now recorded as **L-10971** and fixed in §3.4.
>
> ⛔ **L-11001 DOES NOT CLOSE, and the reason matters more than the fix.** Its exit condition is
> that a real photograph *has been run and its result recorded* — both are now true, and the run is
> recorded in L-10971/L-10973/L-10975. But:
>
> 1. **The photograph is still not in this repository** and is not ours to redistribute, so nothing
>    here is reproducible by anyone else, and no test asserts anything about it.
> 2. **Every fix made in response is proven against SYNTHETIC case L**, a facade of the same CLASS
>    with ground truth this repository drew. Case L reproduced *two* of the three reported defects
>    on first run and reproduced the third only once noise was added. **A synthetic sibling is not
>    the photograph**, and reading "case L passes" as "his building works" is exactly the
>    substitution §0.2 exists to forbid.
> 3. **The correct next step is another real run**, not another synthetic one.
>
> ⚠ And one measurement corrected the brief that commissioned the fix: the symmetry axis was
> believed correct because his run reported 0.511 on a symmetric building. **It is wrong on nine of
> the fourteen A–K cases**, all drawn symmetric about 0.500 — see **L-10978**. *One plausible
> reading from an un-asserted stage is not evidence that the stage works.*

### §0.3 — The one sentence this contract defends

> **A facade reconstruction is a MEASUREMENT of a photograph, reported with its uncertainty —
> never a LIKENESS of a building.**

Everything below is a consequence. `scale.status = "unknown"` is a **correct answer**, not a
failure (brief §5, §16). A refused crop is a correct answer (brief §1). An opening that does not
fit the grid stays out of the grid (brief §10, §15). The output is *"here is what the pixels
support, and here is how much"* — nothing more.

---

## §1 — The IR is the contract, and its shape is the founder's, verbatim

### §1.1 — The §17 shape is BINDING and is reproduced without paraphrase

```jsonc
{ "version":"0.1","units":"normalized",
  "scale":{"status":"unknown","metersPerUnit":null,"confidence":0},
  "facade":{ "width":1,"height":1,"confidence":0,
    "zones":[{"y":0,"height":0,"confidence":0,
      "cells":[{"x":0,"y":0,"width":0,"height":0,"confidence":0,
        "opening":{"a":0,"b":0,"n":0,"archness":0},
        "protrusion":{"depth":0,"profile":[]}}]}],
    "features":[], "outliers":[] } }
```

Brief §17 says *"extend only when necessary; do NOT create building-type-specific schemas"*.
**Every extension is enumerated in §1.2 with the brief clause that forces it.** An extension not
in that table is a contract breach, and a building-type-specific field (`isMediterranean`,
`hasArcade`, `floorCount`) is forbidden outright by §9.

### §1.2 — The complete, closed list of extensions, each with its forcing clause

| Extension | Forced by | Why the §17 shape cannot carry it |
|---|---|---|
| `scale.unknownReason` | **C62 §1.1** | An unknown MUST carry a typed reason. `status:"unknown"` alone is an untyped null, which C62 forbids in as many words. |
| `scale.status` widened to `unknown \| user-supplied` | brief §16 | §16 requires a user-supplied reference dimension to convert the whole facade; the resulting state is not `"unknown"`. **No third value exists** — there is no automatic scale estimator (L-11009). |
| `facade.symmetry { axisX, score, confidence }` | brief §7 | *"test whether this is statistically supported … measure the symmetry"*. A measured scalar with no slot to live in is a measurement that gets dropped. |
| `facade.periodicity { repeatX, repeatY, periodX, periodY, confidence }` | brief §14 | §14 names this output literally: `{ pattern: { repeatX, repeatY, confidence } }`. |
| `facade.surface { pattern, scaleX, scaleY, confidence }` | brief §13 | §13 names this output literally and forbids per-tile geometry. |
| `facade.curvature { left, right }` | brief §12 | *"Do not represent the entire facade as a flat rectangle if the evidence supports curvature."* §17's `facade` node is flat by construction. |
| `cells[].opening.width/height` | brief §9 | §9 asks for `{ width, height, n, archness, confidence }`; §17's `a`/`b` are the superellipse **semi-axes**. Both are kept and `width = 2a`, `height = 2b` — see §3.6. |
| `confidence` sibling `evidence` on every node | **C62 §1.2** | See §4. The scalar stays exactly where §17 put it; the C62 record sits beside it. |

### §1.3 — What is NOT in the IR, on purpose

**Diagnostics are not IR.** `reconstructFacade()` returns `{ ir, diagnostics }`. Every overlay
layer brief §18 demands lives in `diagnostics`, so the IR stays byte-shaped like §17 and a
consumer serialising it never ships megabytes of intermediate rasters into a project file.

**Semantic labels are not IR.** Brief §3 and §8: no `window`, `door`, `arcade`, `entrance`,
`balcony`, and no style label. Every detected aperture is an `opening`. A future semantic pass is
a *separate* stage that reads the IR; it may not edit these words into it.

### §1.4 — The IR is versioned, and `version` is not decoration

`version: "0.1"` is the founder's. Any change to §1.1's shape or §1.2's table **bumps it and adds a
row to §1.2**. The IR is not persisted into a `.pryzm` project today (§10, L-11002), so no C47
migration is owed yet — **and that is exactly why the promotion to `packages/schemas` (L0) is
deferred rather than done quietly**: moving it changes what validates a persisted project.

---

## §2 — Coordinates and scale

### §2.1 — Facade coordinate system (brief §5)

`X` left→right, `Y` bottom→top, `Z` facade depth (positive = toward the viewer). **Normalized**:
the rectified facade occupies `x ∈ [0,1]`, `y ∈ [0,1]`. `units: "normalized"` is the only value
until §2.2 fires.

⚠ **`Y` is bottom→top and image rows are top→bottom.** Every conversion crosses that flip exactly
once, at the rectification boundary, and nowhere else. This is called out because it is the single
most likely silent defect in the subsystem and it produces plausible, upside-down output.

### §2.2 — Scale is USER-SUPPLIED or UNKNOWN. There is no third source. (brief §5, §16)

> *"If no reliable real-world scale exists, do NOT invent metric dimensions."*

- Default: `{ status:'unknown', metersPerUnit:null, confidence:0, unknownReason:'not-queried' }`.
- `applyReferenceDimension(ir, p0, p1, meters)` — the brief §16 interaction — returns a NEW IR with
  `status:'user-supplied'`, a computed `metersPerUnit`, `validationState:'human-reviewed'` and
  `authorityRank:'user'` (C62's own tokens; the user is authoritative for their own measurement).
- ⛔ **No stage may write `metersPerUnit` from any other evidence.** Not from storey-height priors,
  not from door-height priors, not from EXIF, not from a street-view lookup. Each of those is a
  *guess dressed as a measurement*, which is [[envelope-solid-overstates-partial-data]] applied to
  a facade. If such an estimator is ever wanted it is a **new `status` value, a new row in §1.2,
  and its own `authorityRank`** — never a silent write into the existing slot.

### §2.3 — `confidence: 0` and `unknown` are DIFFERENT ANSWERS

C62's own comment on `DomainConfidenceSchema` is binding here: *"Never default an unknown to 0 —
that is the fabrication the honesty rule forbids."* A `0` is the claim **"we are certain this is
wrong"**. Not knowing is a `null` score plus an `unknownReason`.

⚠ Brief §17's literal seed shows `"confidence":0` in the empty template. That is a **template
placeholder, not a computed value**, and the engine never emits `0` for "we did not look" — it
emits the C62 unknown record in the `evidence` sibling and leaves the scalar `null`. This is the
one place where following §17's literal bytes would violate C62, and it is resolved by reading §17
as a *shape*, which is what it is.

---

## §3 — The pipeline: what each stage MEASURES, and what it REFUSES

Every stage is deterministic (§5). Every stage emits a diagnostic layer (§6.2). Every stage may
answer *"not from this image"*, and that answer propagates as an `unknownReason` rather than a
number.

### §3.1 — Crop (brief §1)

Isolate the photograph from screenshot chrome. Chrome is detected as **near-uniform border bands
terminated by a full-width step edge**, never as "the top 12 % of the image".

⛔ **Three refusals are binding, and the second is the one that matters:**

1. **A clean photograph must survive untouched.** The stage is a **no-op** when no border band
   satisfies the test. *(The orchestrator's correction to brief §1: the supplied image may well
   carry no chrome at all.)*
2. **A crop may never exceed `maxTrimFraction` (default 0.35) on any side, and may never reduce
   area below 25 %.** A candidate that would is **refused**: the full frame is returned with
   `crop.applied = false` and `crop.refusedReason = 'cap-exceeded'`. *A wrongly cropped building is
   an unrecoverable error that every downstream stage then measures confidently.*
3. **Sky is not chrome.** A uniform sky band is separated from a UI bar by **inter-row variation**:
   a UI bar's rows are near-identical to each other; sky drifts. A stage that cannot tell them
   apart trims the top of every outdoor photograph, so this is an explicit, tested criterion and
   not an emergent one.

### §3.2 — Facade plane (brief §6)

Edges → lines → vanishing points → quadrilateral. Output: source quad, homography, inverse
homography, confidence.

⛔ **"Do not force automatic detection."** When vanishing-point support is below threshold the
stage emits `facadePlane.status = 'needs-user'` **and no quad**, and the UI asks for four clicks.
`options.facadeQuad` (a user-supplied quad) **always wins** over detection — brief §6 requires the
manual path to exist, and §23 step 5 requires it in Milestone 1.

> ⭐ **AMENDED 2026-08-25 (L-10973) — THE CORNERS ARE ASKED FOR EVERY TIME, NEVER ASSUMED.** On the
> first real run, detection scored **0.64** and the founder's four hand-placed corners scored
> **1.00**, with a visibly better rectification. Because §4.3 makes the plane confidence a **cap on
> every downstream confidence**, a 0.64 plane is not a slightly worse answer — it is a ceiling on
> the entire reading, and it arrived without anyone choosing it. The founder asked for *"Set facade
> corners"* to become **MANDATORY**.
>
> **`options.autoDetectFacadePlane`** (engine default `true`) governs this. With it `false` and no
> quad supplied, the stage emits `needs-user` **without running detection at all**, and the
> downstream stages still run so brief §18 has something to show.
>
> ⛔ **The binding rule is on the UI, not the engine.** `apps/editor/src/ui/facade/**` passes
> `false` on **every newly loaded photograph** and arms the four-corner pick; automatic detection is
> offered as a **labelled shortcut that states its own cost**; and clearing the corners returns to
> **asking**, never to guessing. The engine default stays `true` so the CLI and the corpus still
> measure. *"Mandatory" implemented as a refusal with no way past it would be its own defect*
> ([[refusing-half-needs-its-escape-hatch]]), so skipping remains possible — it is simply never the
> thing that happens by default.
>
> ⚠ **What the no-plane path actually delivers (L-10977).** It finds **ZERO** openings: on the
> un-rectified frame Otsu separates SKY from WALL rather than OPENING from WALL, so the same grid
> that yields 20 openings with a plane yields none without one. The crop, edge and line layers do
> survive — which is precisely what a user needs in order to place the four corners.

### §3.3 — Rectification (brief §6)

4-point DLT homography, inverse-mapped resample. The **target aspect ratio** is recovered from the
two vanishing points where they are non-degenerate, and falls back to the source quad's mean
edge-length ratio otherwise. ⚠ **The aspect carries its OWN confidence**, separate from the quad's:
a correct quad with a wrong aspect produces a rectified image that looks right and measures wrong,
and collapsing the two confidences hides exactly that case.

### §3.4 — Structure lines and zones (brief §7)

⛔ **Geometric, not semantic** — `zone 0: y = 0.00 → 0.20`, never `"ground floor"`. Values come
from a measurement; a zone boundary that no measurement supports does not exist.

> ⭐ **AMENDED 2026-08-25 (lane FACADEREAL60, L-10971) — THE PRIMARY SOURCE CHANGED.** This clause
> used to read, in full: *"Row/column gradient projections on the rectified image → peaks →
> horizontal zones and vertical bays."* On the **first real photograph ever run** through this
> subsystem, that produced a **2 zone × 2 bay** lattice on a seven-storey, five-bay building, and
> every downstream number inherited it. **Read §0.2 again: this is the outcome that clause was
> written to make discoverable, and it worked.**

**THE LATTICE IS DERIVED FROM THE DETECTED OPENINGS.** Opening-box centres are clustered along each
axis; boundaries fall midway between adjacent lines; lines are interpolated into gaps that are an
integer multiple of the measured pitch, and extended outward while a whole pitch still fits inside
the facade. The founder's own reading of his first run is the argument:

> *"it clearly can identify the windows — so therefore the levels too? same with vertical [bays] —
> as it understands the opening also the vertical lines?"*

~40 opening boxes on a 5 × 7 grid **already encode** the floor lines and the bay lines. Computing
the lattice from a second, weaker signal and then fitting the openings into it was the defect.

**⛔ THE PROJECTION PROFILE IS RETAINED, AND ITS TWO ROLES ARE BINDING:**

1. **FALLBACK.** When the openings support no lattice — too few, no repetition, nothing inside the
   size band — the derivation **REFUSES with a named reason** and the profile answers. Corpus
   **K4** takes this path and is the test that keeps it reachable. A fallback nothing exercises is
   dead code.
2. **CROSS-CHECK.** Both readings are computed on every run, and when they disagree the stage notes
   and the UI readout **say so, with both numbers**. ⭐ *A disagreement is information* — it is the
   pipeline saying "the wall says one thing and the windows say another", which is the single most
   useful sentence it can offer a human looking at a facade it got wrong.

**Why the profile could not stay primary, measured rather than asserted (L-10971):** `scoreComb`
scores a comb as *mean-at-teeth / mean-everywhere*, and that ratio **rewards fewer teeth** — a comb
at twice the true period hits half the lines and may hit the strongest half. On a uniform synthetic
the fundamental and its first harmonic tie and the *"shortest period within 5%"* tie-break rescues
it; with ±6 levels of noise on corpus case L the harmonic scores **strictly better** (0.822 vs
0.800), the tie-break never runs, and the lattice halves. **The bias is structural, not incidental.**

⛔ **Anti-overfit (§9) is preserved, and that is why this is a rule rather than a tuning.** Every
threshold in the derivation is a fraction of a quantity **measured from this image** — the median
opening size, the median cluster support, the median line spacing. There is no floor count, no bay
count, no pixel size and no building property anywhere in it.

### §3.5 — Periodicity (brief §14) — the stage that replaces every hard-coded count

Normalised autocorrelation of each projection profile → candidate period → **phase-locked comb
fit** (grid-search phase, parabolic refinement of period) → fit score → **sliding-window break
detection**.

⭐ **`repeatY` is derived from the comb, and the ground-floor zone is discovered as a BREAK in the
comb** — which is precisely why the pipeline does not need to know that ground floors are
different. `if (fiveFloors)` and `if (archedGroundFloor)` are the two things brief §22 names first,
and this stage is the reason neither is ever written.

### §3.6 — Openings and archness (brief §8, §9)

Per-cell local threshold → connected components → filter by area fraction and rectangularity.
Every aperture is an `opening` (§1.3). The upper boundary of each mask is fitted with a
**superellipse** `|x/a|^n + |y/b|^n = 1`, `n` recovered by a deterministic 1-D search:

- `n → ∞` approaches a rectangle; `n = 2` is an ellipse/arch.
- `archness ∈ [0,1]` is the normalised **rise** of the top boundary over its half-width.

⛔ **There is no arcade rule, no arch classifier and no threshold at which an opening "becomes an
arch".** Brief §9 in as many words: *"Do not create a special 'Mediterranean arcade' rule — fit
their geometry."* `archness` is continuous, and a consumer that wants a boolean computes one
itself, downstream, and owns the threshold.

### §3.7 — Symmetry (brief §7)

Normalised cross-correlation of the column profile against its mirror, over candidate axes. Output
`{ axisX, score, confidence }`. ⛔ **A low score is REPORTED as low.** The brief's own hypothesis —
that the building is symmetrical about a central element — is a hypothesis to be tested, and the
test is allowed to fail. `score` is never floored, and `axisX` is never defaulted to `0.5`.

### §3.8 — Features and outliers (brief §10, §15) — one rule, not two

After the comb fit, a detected opening is **matched** to a comb node within tolerance, or it is
not. An unmatched detection is:

- a **feature** (`facade.features[]`) when it is **vertically continuous across ≥ 2 zones** — the
  signature brief §10 describes for the central glass-block element; or
- an **outlier** (`facade.outliers[]`) otherwise: `{ bbox, confidence, note: "unclassified" }`.

⭐ **This is one measured rule that satisfies both §10 and §15**, and it is the anti-overfit design
in miniature: nothing in the code knows what a lightwell is. Brief §10's *"Do NOT force it into the
standard window grid"* is enforced by the matcher, not by a special case.

### §3.9 — Curvature (brief §12) — measured as a RESIDUAL, and not overclaimed

After rectification, floor lines are fitted straight across the **central** region; the systematic,
same-signed deviation in the outer bands on each side is the curvature evidence. Output
`{ left, right }`, each `{ normalizedDeviation, normalizedRadius | null, confidence }`.

> ⚠ **AMENDED 2026-08-25 (L-10975) — THE CODE HAD DISAGREED WITH THIS CLAUSE'S OWN WORDS.**
> `normalizedDeviation` was computed as `mean(|d|)`, which is **strictly positive by construction**,
> so a flat facade could never report flat however unanimously its storeys agreed it was. The clause
> above says **"the SYSTEMATIC, SAME-SIGNED deviation"**, and that is `|mean(d)|` — random signs
> cancel, a real wrap does not. Per the governance rule, the code was the defect.
>
> **And `consistency` is NOT a confidence as measured.** It is the fraction of storeys sharing the
> majority sign, so it **cannot fall below 0.5** — a coin flip scores exactly 0.50. Reported raw, it
> made pure noise arrive downstream as *"0.5 confident"*. It is rescaled about its own chance level
> before it becomes a confidence: chance → 0, unanimity → 1.
>
> Measured: corpus case L, drawn **dead flat**, read 0.0195 / 0.0199 at 0.62 and now reads
> 0.0119 / 0.0143 at **0.23**; case E, drawn bent, is unchanged at 0.73. The founder's flat street
> facade read 0.0164 / 0.0207 at 0.61 / 0.57 — the same wrong shape of answer on an unrelated
> building. ⛔ **`curvatureMinDeviation` was NOT raised to make case L pass** (§9.3). The residual
> itself is unexplained and stays open as **L-10976**.

⚠ **`normalizedRadius` is `null` in Milestone 1 and that is the honest value** (L-11004). A single
uncalibrated image does not determine a radius; it determines that the edges bend and by roughly
how much. Reporting a radius here would be [[envelope-solid-overstates-partial-data]] — an UNKNOWN
constraint drawn as a number. Brief §12 anticipates this: *"If a single image cannot reliably
recover the curvature radius, estimate a normalized curvature and mark confidence appropriately."*

### §3.10 — Projections / balconies (brief §11) — depth is UNKNOWN, the CUE is measured

⛔ **`protrusion.depth` is `null` in Milestone 1.** A single image with no calibration, no sun
vector and no scale does not carry depth. What it *does* carry is a **soffit/shadow band** beneath
a projecting slab, and that band's height is measurable. So:

> ⚠ **AMENDED 2026-08-25 (L-10974) — THE CUE WAS MISSED ON EXACTLY THE BUILDINGS THAT HAVE IT.**
> The band was searched for **downward only**, from a row-gradient peak. But a shadow band has
> **two** edges, and peak suppression drops one of them as soon as the band is thinner than
> `minPeakSeparationFraction × height` — **a threshold that scales with the image, so the failure
> grows with the storey count.** Corpus case D (4 storeys) kept both edges and found all three
> balconies; case L (7 zones) kept only the band's **bottom** and found none of five. Separately,
> the reference "wall in daylight" was a **mean** over a band that contains windows, which on a
> facade with 60% glazing reads ~104 where the wall reads ~200 and erases the drop entirely.
>
> The search now runs **both ways** (the longer run wins), the reference is a **high percentile** of
> an immediately-adjacent band, and — because a soffit is a **band and therefore has a far side** —
> a run that stopped at the image edge or the search cap is **REFUSED**. That last clause is not
> optional: without it, fixing the first two turns the sky above a parapet into a balcony.
>
> ⛔ None of this changes what is CLAIMED. `depth` is still `null` with its `unknownReason`.

```
protrusion: { depth: null, unknownReason: 'geometry-incomplete',
              profile: [], evidence: { soffitBandHeight, confidence } }
```

Brief §11 closes with *"Never hallucinate exact dimensions."* This clause is that sentence made
structural. When depth becomes recoverable (a second view, a user-supplied scale plus sun
elevation, or a user-drawn depth), it arrives as a **new** `unknownReason`-clearing write with its
own provenance — not as a number quietly appearing in the existing field (L-11005).

### §3.11 — Surface (brief §13)

High-pass residual over wall regions → 2-D autocorrelation → pitch peaks. Output
`surface: { pattern: 'grid' | 'none', scaleX, scaleY, confidence }`.
⛔ **No per-tile geometry, ever.** Brief §13: *"Do NOT model every tile individually."*

### §3.12 — Foreground rejection (brief §2)

⚠ **This clause is stated as a REQUIREMENT and is NOT-YET-TRUE as an implementation.**
Brief §2 requires that people, bicycles, cars, plants, street furniture, trees, sky and
neighbouring buildings never become facade elements. Milestone 1's defence is **structural, not
classificatory**: a detection survives only if it matches the comb, and foreground clutter is
aperiodic — so it lands in `outliers[]` rather than in a cell. **That is a partial defence and this
contract says so**: clutter that happens to sit on a comb node is not rejected today, and a
neighbouring building with its own regular grid is rejected only by the facade quad. The honest
status is *mitigated by periodicity, not solved*, and the corpus proves the mitigation (case H)
rather than the requirement.

---

## §4 — Confidence is a C62 instance, never a rival scale

### §4.1 — The rule

**C62 §1.2 is binding and is not negotiable by this contract:** *"New subsystems MUST express
confidence through `DomainConfidence`, not a bespoke scalar."*

`FacadeConfidence` is therefore an **alias** of C62's `DomainConfidence`, following the exact
precedent of `packages/schemas/src/provenance/ElementConfidence.ts` (*"this name exists to make the
usage greppable, NOT to fork the shape"*). The §17 wire scalar `confidence` **IS**
`DomainConfidence.score` — the same number, not a second one.

### §4.2 — Every node carries one, and unknown is expressible at every node

Brief §17 puts `confidence` on every node deliberately: this pipeline is often uncertain. Each node
therefore carries the scalar (§17's shape) plus an `evidence: FacadeConfidence` sibling that can
say `score: null` + `unknownReason` — the thing a bare scalar cannot say. Where the two could
disagree they cannot: `confidence === evidence.score`, asserted by the corpus.

### §4.3 — ⛔ Confidence is never derived from confidence alone

A stage's confidence is computed from **its own measurement's support** (fit residual, peak
prominence, cluster tightness, matched fraction) and then **capped** by its inputs' confidences.
Capping is a `min`, not a product and not an average: a chain of four 0.9s must not read 0.66, and
a stage whose input is unknown must not read "moderately confident". **If an input is unknown, the
output is unknown** — that propagation is the whole reason the field exists.

---

## §5 — Determinism, and the absence of model inference

### §5.1 — ⛔ NO MODEL INFERENCE. This is an invariant, not a preference.

Milestone 1 contains **zero** learned models, zero weights, zero inference calls, local or remote.
Every stage is classical CV: gradients, Hough, homography, autocorrelation, least squares. This is
the founder's standing ruling that **PRYZM relies on algorithmic engines, with any model call as a
fallback only**.

Consequences that are easy to miss and are binding:

- **C23 (Provenance & AI Audit) is vacuously satisfied** — there is no AI event to audit. It stops
  being vacuous the moment a model appears, and that PR owes C23 §-compliance in the same commit.
- **The subsystem is testable in Node with no network, no GPU and no fixtures.** That is what makes
  the synthetic corpus (§6) meaningful rather than decorative.
- **A stage that "needs" a model is a stage that must STOP and ask**, not a stage that adds one.

### §5.2 — Determinism means bit-identical, and randomness is banned

Same input ⇒ same output, on every run and every platform. ⛔ No `Math.random()`, no `Date.now()`
in any computation, no `Set`/`Map` iteration order used as a ranking, no RANSAC. Where the
literature reaches for RANSAC (vanishing points) this subsystem uses an **exhaustive bounded
accumulator** instead, which is both deterministic and, at these image sizes, affordable.
Tolerances follow **C73**; ties break on a stated, total order (index ascending), never on
whichever candidate the hash table happened to yield first.

### §5.3 — The engine is THREE-free, DOM-free and I/O-free (P2, P5)

`packages/facade-reconstruction` imports no THREE (**P2** — `import * as THREE` is legal only in
`packages/renderer-three/`), touches no DOM, and performs no I/O. Its input is a plain
`RasterImage { width, height, data: Uint8ClampedArray }`.

⭐ **This is what makes decoding somebody else's problem, and it is the reason §7's licence answer
is "no new dependency".** The browser decodes JPEG/PNG/WebP/AVIF/HEIC into a canvas and hands over
`getImageData()`; the CLI decodes PNG with Node's built-in `zlib`. Neither path is the engine's
concern and neither costs a dependency.

---

## §6 — The proof obligation: a synthetic corpus with KNOWN GROUND TRUTH

### §6.1 — The corpus is the gate (brief §19)

Brief §19 requires, **before the photograph is trusted**, at minimum ten synthetic facades:

| Case | Content | The ground truth it exists to prove |
|---|---|---|
| **A** | rectangular window grid | `repeatX`, `repeatY`, cell centres |
| **B** | grid + horizontal floor break | the **break index** — that the ground zone is *discovered* |
| **C** | grid + arched openings | `archness` and `n` recovered as continuous values |
| **D** | grid + projecting balconies | the **soffit-band height** (⛔ *not* a metric depth — §3.10) |
| **E** | grid + curved corner | the outer-band **residual deviation**, and its absence on flat A |
| **F** | grid + central vertical feature | the feature lands in `features[]`, not in a cell |
| **G** | grid with missing windows | the comb survives the gaps; `repeatX/Y` unchanged |
| **H** | grid + outliers | outliers land in `outliers[]` and perturb no cell |
| **I** | perspective-distorted facade | the **homography** recovers the known quad within tolerance |
| **J** | noisy / low-contrast facade | the same answers as A, at a degraded but reported confidence |

Plus this lane's own additions, forced by the orchestrator's correction to brief §1:

| Case | Content | The ground truth it exists to prove |
|---|---|---|
| **K1** | clean photograph, no chrome | crop is a **no-op** — 0 pixels trimmed |
| **K2** | photograph inside screenshot chrome | the chrome is trimmed to the known inner rect |
| **K3** | clean photograph with a large uniform sky | the sky **survives** (§3.1 refusal 3) |
| **K4** | an image where chrome detection would over-trim | the crop is **REFUSED**, `crop.applied=false` |

Plus the case added after the **first real photograph** was run (lane FACADEREAL60, L-10970):

| Case | Content | The ground truth it exists to prove |
|---|---|---|
| **L** | 6 storeys + a **five-arch arcade zone** × 5 bays, balcony soffits on every floor | **7 zones × 5 bays**, 35 openings matched, arcade `archness` ≈ 1 with `n` ≈ 2 against flat heads above, the arcade band the **tallest** zone, five soffit bands, and the **A/B against `latticeSource: 'projection-profile'` on the same pixels** |

⚠ **A–K WERE ONE FACADE UNDER FOURTEEN DEGRADATIONS** — 5 bays × 4 storeys, flat ground floor.
Fourteen different *inputs* is not fourteen different *facades*, and the distinction is what §9.4 is
actually buying. In that one shape the true storey period is a quarter of the extent and its first
harmonic is a half, i.e. exactly at `maxPeriodFraction`, so §3.4's period-doubling bias **could not
win** — and fourteen green cases certified an estimator that halves on real buildings. **A new case
must differ in SHAPE, not only in degradation.**

### §6.2 — ⛔ Every assertion is a MEASURED QUANTITY against a KNOWN NUMBER

A test that asserts "no error was thrown", "the array is non-empty", or "a facade was produced"
**does not count and may not be added to this corpus.** Every case declares its ground truth as
data, and every assertion compares a computed number to it within a stated tolerance. This is
[[committed-is-not-reachable]] applied to a pipeline: a stage that runs and returns is not a stage
that measured anything.

### §6.3 — Diagnostics are a deliverable, not debugging leftovers (brief §18)

> *"I should be able to look at the result and immediately see whether the algorithm understood the
> facade."*

Every stage in §3 emits a named diagnostic layer, and the CLI renders them to PNG so a run is
**lookable** without a browser. A stage that produces no diagnostic layer is incomplete. This is
the only defence that scales to the real photograph, because on the real photograph there is no
ground truth to assert against — **the founder's eye is the oracle**, and §18 is what gives it
something to look at.

---

## §7 — Dependency and licence register (brief §20)

### §7.1 — The finding: **ZERO new dependencies. Nothing was added.**

Every algorithm in §3 is implemented in-repo in TypeScript. Measured at mint, 2026-08-24:

| Name | Version | Source | Licence | Model weights | Commercial use | Redistribution | Status |
|---|---|---|---|---|---|---|---|
| `zod` | 4.4.3 | existing root dep | **MIT** *(verified: `node_modules/zod/package.json`)* | none | ✅ yes | ✅ yes | **ALREADY PRESENT** — not added by this lane |
| `vitest` | 4.1.10 | existing root devDep | **MIT** *(verified in tree)* | none | ✅ yes | ✅ dev-only | **ALREADY PRESENT** |
| `@opentelemetry/api` | 1.9.1 | existing root dep | **Apache-2.0** *(verified in tree)* | none | ✅ yes | ✅ yes | **ALREADY PRESENT** |
| `node:zlib` | Node 24.15.0 | **Node.js built-in** | Node's own (MIT-family) + zlib licence | none | ✅ yes | n/a — not vendored | **BUILT-IN** — the CLI's PNG codec |
| Browser `createImageBitmap` / `CanvasRenderingContext2D.getImageData` | — | **Web platform** | n/a | none | ✅ yes | n/a | **PLATFORM** — the browser's decoder, not a dependency |

**Nothing in the table was introduced by lane FACADE53.** The licence question this subsystem was
most at risk of failing was therefore never reached — by construction, not by luck (§5.3).

### §7.2 — Surveyed and DEFERRED, with the reason each was not adopted

⚠ **Epistemic honesty**: rows in §7.1 are **verified from this tree**. Rows below are **surveyed,
not adopted** — their licence status is stated to record why the survey stopped, and **any future
adoption owes a fresh, verified row in §7.1 before a single import lands.** Do not treat this table
as clearance.

| Candidate | What it would have done | Why NOT adopted |
|---|---|---|
| **nvdiffrast / nvdiffrec** (NVIDIA) | differentiable rasterisation | ⛔ **NVIDIA source-available, NON-COMMERCIAL.** Blocking for a commercial SaaS. Independently found by both the founder (brief §20) and the [GenRecon spike](../../03-execution/spikes/spike-genrecon-generative-reconstruction.md) §4. **The question is closed; do not re-open it without counsel.** |
| **GenRecon** | multi-view generative reconstruction | ⛔ Wrong problem *and* wrong dependency stack. Needs **posed multi-view** capture (COLMAP), outputs a **textured mesh**; PRYZM needs **semantics from one photograph**. Brief §20 permits inspecting it for ideas and forbids copying its stack. Its own spike §6 already ruled *watch-list, no implementation*. |
| **OpenCV / opencv.js** | the classical CV in §3, off the shelf | **Apache-2.0** and usable in principle — deferred, not rejected. It adds ~8 MB of WASM, a second geometry-tolerance regime (against **C73**), and an opaque box between an input and a verdict, in exchange for algorithms that are ~600 lines here. Revisit only if a stage's in-repo implementation proves inadequate **on a measured case**. |
| Any **learned** detector (segmentation, line, layout, depth) | opening masks, planes, depth | ⛔ **Refused by §5.1** before licence is even reached — the founder's deterministic-first ruling. Every such model additionally owes a **model-weight** licence row, which is the row that is usually missing and is exactly what brief §20 asks for. |
| **sharp / jimp / canvas (node-canvas)** | image decode in Node | Not needed: `node:zlib` + ~150 lines gives PNG. Avoiding them also avoids native binaries in CI. `sharp` bundles **libvips (LGPL-2.1+)**; `node-canvas` bundles **Cairo (LGPL)** — both are *manageable*, and neither is worth managing for a decoder we do not need. |

### §7.3 — The standing rule

⛔ **No dependency and no model may be added to this subsystem without a verified row in §7.1
landing in the SAME COMMIT**, covering name, version, source, licence, **model-weight licence**,
commercial-use status and redistribution status. **If commercial rights are unclear, it is not
used.** Brief §20 is written as a precondition, and this clause keeps it one.

---

## §8 — Architecture and layering (brief §21)

### §8.1 — Engine and UI are separate, and the UI is only a client

> Brief §21: *"Keep the reconstruction engine independent from the UI … The UI is only a client of
> this engine."*

| Brief §21 path | PRYZM home | Layer |
|---|---|---|
| `src/contracts` | `packages/facade-reconstruction/src/contracts/` | L1 |
| `src/reconstruction/*` | `packages/facade-reconstruction/src/reconstruction/*` | L1 |
| `src/bim` | `packages/facade-reconstruction/src/bim/` (**Milestone 2**, L-11006) | L1 |
| `src/ui` | `apps/editor/src/ui/facade/` | L7 |
| `src/workers` | deferred — the engine is synchronous and pure, so a worker is a *wrapper*, not an architecture (L-11007) |  |

**Layer placement — `packages/facade-reconstruction` is L1**, `[floor] leaf`: it imports `zod` and
nothing from `@pryzm/*` above L0, and has no consumers below L7. L1 is the strictest correct
placement, which per `eslint.config.js`'s own stated rule is the one that can never emit a false
violation. The row is added to `layerElements` in the same commit as the package.

### §8.2 — The engine entry point is the brief's, exactly

```ts
const result = await reconstructFacade(image, options);   // brief §21
// result: { ir: FacadeIR, diagnostics: FacadeDiagnostics }
```

`async` is kept although Milestone 1 is synchronous — the brief specifies it, and it is the seam a
worker slides behind without changing a call site.

### §8.3 — Two entry surfaces, deliberately

1. **The editor UI** (`apps/editor/src/ui/facade/`) — upload any image the *browser* can decode,
   overlay every diagnostic layer on the photograph, correct the quad by clicking four corners,
   set a reference dimension by clicking two points.
2. **The CLI** (`tools/facade-reconstruct/`) — drop a **PNG** into the repo, get JSON + overlay
   PNGs. ⚠ **PNG only** (L-11003): the browser path handles JPEG and everything else, and adding a
   baseline-JPEG decoder to save a re-save is not worth the code. **Stated, not discovered.**

---

## §9 — ⛔ The anti-overfit rule (brief §22)

> *"It must NOT become `if (centralGlassBlock) / if (roundedBalcony) / if (fiveFloors) /
> if (archedGroundFloor)`. The same algorithm must work on a completely different facade."*

**Binding, and mechanically checkable:**

1. ⛔ **No constant in the engine may encode a property of one building.** No floor count, no bay
   count, no arch threshold, no expected symmetry axis. Every such quantity is *measured* (§3.5,
   §3.6, §3.7) or *unknown*.
2. ⛔ **No branch may be keyed on a building-type or style label.** Brief §3 forbids style labels
   outright; §1.3 forbids semantic labels in the IR; this clause forbids them in control flow.
3. **Tunable thresholds are permitted, named, defaulted and exposed on `options`** — and each must
   be justified by a *corpus case*, not by the founder's photograph. A threshold whose only
   justification is "it made the photo work" is the defect this clause exists to catch.
4. ⭐ **The corpus is the enforcement**, because A–J are ten *different* facades. A change that
   improves one and breaks another is visible immediately; a change tuned to a single image cannot
   pass ten.

---

## §10 — What is NOT built, measured and named

⚠ **This contract is CANONICAL and deliberately NOT ACTIVE.** ACTIVE requires the shipping code to
demonstrably match, and §0.2 is the reason it cannot: the subject of the brief has never been run
through it.

| Id | Open item | Status |
|---|---|---|
| **L-11000** | The subsystem did not exist before this lane. Root row. | CLOSED by Milestone 1 |
| **L-11001** | ⛔ The founder's photograph is not in the repo; **every claim is synthetic**. | **OPEN — blocks ACTIVE** |
| **L-11002** | `FacadeIR` lives in the engine package, not L0 `packages/schemas`. Promotion deferred: it changes what validates a persisted project (**C47**), and `packages/schemas` is a contended file set (the C104 §11 precedent). | OPEN |
| **L-11003** | CLI decodes **PNG only**; browser path is format-complete. | OPEN (won't-fix candidate) |
| **L-11004** | Curvature yields a **residual deviation**, not a radius. | OPEN by design (§3.9) |
| **L-11005** | `protrusion.depth` is **UNKNOWN**; only the soffit cue is measured. | OPEN by design (§3.10) |
| **L-11006** | **FacadeIR → BIM elements** (brief §24), Milestone 2. ⭐ **THE OPENINGS LEG IS NOW WIRED END-TO-END FOR THE GROUND STOREY** (lane MILESTONE2-63, 2026-08-25; L-11080…L-11087). `FacadeOpeningProgram` carries the lattice as pure RATIOS, `planFacadeOpenings` turns it into buildable openings using metres taken ONLY from the wall run and the storey height, and `archness` maps to the EXISTING `OpeningProfileKind` axis with **no tuned threshold** — each candidate's canonical archness is derived from PRYZM's own geometry (`2 × SEGMENTAL_RISE_RATIO`, imported) and VERIFIED against `openingProfileRefusal`. ⛔ The UPPER-storey rhythm is **NOT** built from the photograph (L-11085) and is REPORTED to the user, not silently absent. | **PARTIALLY CLOSED** |
| **L-11007** | The UI panel is **not registered on the ribbon / C82 capability surface**; it mounts standalone. A rail button that arms nothing is worse than no button (C107 §14's rule). | OPEN |
| **L-11008** | No GA gate asserts the corpus runs in CI. The corpus is a package suite; nothing yet fails a build if it is deleted. | OPEN |
| **L-11009** | No automatic scale estimator, by design (§2.2). Any future one is a new `status` value + a §1.2 row. | OPEN by design |
| **L-11010** | The crop cap (§3.1) is proven against **synthetic** chrome only. Real screenshot chrome is untested. | **OPEN** |
| **L-11011** | Foreground rejection (brief §2) is **mitigated by periodicity, not solved** (§3.12). | **OPEN** |
| **L-10971** | The lattice was computed from the wall's projection profile and collapsed to 2×2 on the first real photograph. Primary source is now the DETECTED OPENINGS (§3.4). | CLOSED `9279adf4` |
| **L-10972** | Corpus cases B and F had the WRONG lattice at HEAD and no test asserted it. | CLOSED `9279adf4` |
| **L-10970** | The corpus was one facade under fourteen degradations; case **L** adds the arcaded multi-storey SHAPE (§6.1). | CLOSED `05bbc2aa` |
| **L-10973** | The four facade corners are now ASKED FOR on every photograph, never assumed (§3.2). | CLOSED `2699f831` |
| **L-10974** | The soffit/balcony cue was missed on any facade whose bands are thin relative to its height (§3.10). | CLOSED `39d2c22b` |
| **L-10975** | Curvature reported noise as signal: an estimator that could not return zero, and a confidence with a floor of 0.5 (§3.9). | CLOSED `fad46f15` |
| **L-10976** | The flat-facade curvature RESIDUAL (0.0119/0.0143) is still above the floor and is **not explained**. The per-column argmax trace is the suspect. | **OPEN** |
| **L-10977** | The no-plane "preliminary" path finds **ZERO** openings — Otsu separates sky from wall on an un-rectified frame. | **OPEN — stated limit** |
| **L-10978** | ⛔ **`measureSymmetry` reports the WRONG AXIS on 9 of 14 corpus cases at score 0.97.** Every case is drawn symmetric about 0.500; nine report 0.299. A periodic facade has an exact mirror axis at every bay centre and boundary, so the argmax has no right to be believed. The obvious cause (unequal reach per axis) was tested and FALSIFIED. **No fix guessed at; no test added that would certify the defect.** | **OPEN — measured, not certified** |

### §10.1 — The exit condition for ACTIVE

All of: (a) L-11001 closed — a real photograph run, its diagnostics recorded, its failures named;
(b) L-11008 closed — the corpus gated in CI; (c) L-11006 closed or explicitly deferred by the
founder. **Until then this contract states intent, and §0.2 states what has actually been proven.**

> ⚠ **2026-08-25 — (a) IS HALF MET AND MUST NOT BE READ AS MET.** A real photograph HAS been run,
> its diagnostics recorded and its failures named (§0.2). What is missing is a **second real run
> confirming the fixes on a real photograph**, since all of them are proven against synthetic case
> L. **A fix verified on a synthetic sibling of the failing input is a hypothesis, not a result**
> ([[committed-is-not-reachable]] applied to a repair). ⭐ And **L-10978 is a new blocker of its
> own**: a stage reporting a confidently wrong axis on nine of fourteen known-symmetric cases is
> not a subsystem that can be called ACTIVE.

---

## §11 — Amendment rules

- The brief (§1–§24) is the requirement source. **A clause here that contradicts it is the defect.**
- §1.2 is a **closed list**. A new IR field lands with a new row naming its forcing clause, or not
  at all.
- §7.1 is a **closed list**. A new dependency lands with a verified row in the same commit, or not
  at all.
- §5.1 (no model inference) and §9 (no overfit) are **invariants**. Relaxing either is a new ADR
  that supersedes this contract in as many words — never a quiet exception in a stage.
