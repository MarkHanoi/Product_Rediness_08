# ADR-0371 — A facade reconstruction is a MEASUREMENT, not a likeness — and it is classical CV, not a model

- **Status:** ACCEPTED (decisions 1–5) · PROPOSED (the Milestone-2 BIM leg, C108 §10 / L-11006)
- **Date:** 2026-08-24
- **Lane:** FACADE53 · **Issue:** [L-11000..L-11011](../../04-reference/ISSUE-LOG.md)
- **Ratifies:** [C108 — Facade Reconstruction From Image](../contracts/C108-FACADE-RECONSTRUCTION-FROM-IMAGE.md)
- **Specced by:** [SPEC-FACADE-RECONSTRUCTION-PIPELINE](../../03-execution/specs/SPEC-FACADE-RECONSTRUCTION-PIPELINE.md)
- **Governed by:** `C62` (confidence / typed unknowns) · `C73` (determinism & tolerance) ·
  `C75` (provenance) · `C11`+`C16`+`C84` (only once the BIM leg lands)
- **Prior art re-used, not re-derived:**
  [spike-genrecon-generative-reconstruction](../../03-execution/spikes/spike-genrecon-generative-reconstruction.md)
  (§4 licence finding, §6 verdict)

---

## 1. Context — the founder's brief, and the one thing the lane could not do

The founder wrote the specification himself (24 numbered sections) and attached **one photograph of
a building**. The objective is explicit and is not the objective a reconstruction paper would
assume:

> *"The final objective is not a rendered copy of the photograph. The final objective is an editable
> procedural facade that can be regenerated, modified, measured and converted into BIM."* (§24)

⛔ **The photograph was attached to a conversation. It is not in this repository and the lane could
not see it.** That fact reorders the work rather than blocking it, and it reorders it in the
direction the brief itself already points: §19 asks for a synthetic corpus with **known ground
truth** *before* the photograph is trusted, and §22 forbids tuning to it. So the lane built
everything the pixels are not required for, and proved it against ten synthetic facades whose
answers are known by construction.

This ADR records the five decisions that shape came from.

---

## 2. Decision 1 — the output is a MEASUREMENT with uncertainty, never a likeness

**ACCEPTED.**

Every node of the intermediate representation carries a confidence, and **`unknown` is a first-class
answer at every one of them**. `scale.status = "unknown"` is a correct result. A refused crop is a
correct result. `protrusion.depth = null` is a correct result.

**Why this needed a decision at all:** the obvious alternative is the one every reconstruction demo
takes — always emit numbers, because a number renders and a null does not. That is the exact defect
family this codebase spent a full day closing ([[context-data-honesty-family]],
[[envelope-solid-overstates-partial-data]]): *failure and empty and fabricated were the same value*,
so an UNKNOWN constraint got drawn as a confident zero and nobody could tell. On real land that
overstatement was expensive. On a facade it would be worse, because the output's whole purpose is to
become BIM geometry somebody then builds against.

**Consequence, and it is the load-bearing one:** `confidence: 0` and `unknown` are **different
answers**. A `0` claims *"we are certain this is wrong"*. Not knowing is a `null` score plus a typed
`unknownReason`. C62's own schema comment says the same thing, and C108 §2.3 makes it binding here.

---

## 3. Decision 2 — classical CV. NO model inference in Milestone 1.

**ACCEPTED.** The founder's standing ruling is that PRYZM relies on **algorithmic engines, with any
model call as a fallback only**.

Every stage is deterministic classical computer vision: Gaussian/Sobel gradients, Canny-style
non-maximum suppression with percentile-derived hysteresis, a Hough line transform, vanishing points
by exhaustive bounded accumulation, a 4-point DLT homography, normalised autocorrelation,
phase-locked comb fitting, least-squares superellipse fitting.

**Three consequences that are easy to miss and are the actual reason this is a good decision, not
merely an obedient one:**

1. ⭐ **It costs ZERO new dependencies, and therefore the licence question is never reached.** The
   brief's §20 is a precondition — *document licence, model-weight licence, commercial-use status
   before adding anything* — and the prior-art audit had already found the obvious route poisoned:
   **nvdiffrast / nvdiffrec are NVIDIA source-available, NON-COMMERCIAL, blocking for a commercial
   SaaS**. The founder found this independently in §20. Not adding a dependency is the only answer
   that cannot rot.
2. ⭐ **The engine is Node-testable with no network, no GPU, no weights and no fixtures.** That is
   what makes the synthetic corpus meaningful. A pipeline that needs a model to run can only be
   tested through a fake, and [[fake-more-capable-than-real]] is what that produces.
3. **Determinism is achievable and is asserted.** No `Math.random()`, no RANSAC, no
   iteration-order-as-ranking. Where the literature reaches for RANSAC (vanishing points) the lane
   used an exhaustive accumulator, which at these image sizes is affordable and is bit-identical
   across runs and platforms (C73).

**Rejected alternative — a learned opening/layout detector.** It would very likely beat the
classical opening detector on a hard photograph. It also (a) violates the standing ruling, (b) owes
a **model-weight** licence row, which is the row that is usually missing and is precisely what §20
asks for, and (c) removes the ability to say *why* a detection happened, which is what §18's
diagnostics exist to show. **If a stage genuinely cannot be done classically, the instruction is to
STOP and say so — not to add one.**

**Rejected alternative — OpenCV / opencv.js.** Apache-2.0 and adoptable in principle; deferred, not
rejected. It adds ~8 MB of WASM, an opaque box between input and verdict, and a second
geometry-tolerance regime running against C73 — in exchange for algorithms that are ~600 lines
in-repo. Revisit only when an in-repo stage proves inadequate **on a measured case**.

---

## 4. Decision 3 — the founder's §17 JSON is the contract, and every extension is enumerated

**ACCEPTED.**

The §17 shape is reproduced verbatim in C108 §1.1. §17 permits extension *"only when necessary"*, so
C108 §1.2 is a **closed table**: each extension names the brief clause that forces it. Eight rows,
no more, and a new field lands with a row or not at all.

**The interesting collision, and how it resolved.** C62 §1.2 is binding on new subsystems in as many
words: *"New subsystems MUST express confidence through `DomainConfidence`, not a bespoke scalar."*
The founder's §17 puts a bare scalar `confidence` on every node. Read naively these conflict.

They do not, and the resolution is not a compromise: **the §17 scalar IS
`DomainConfidence.score`** — the same number, not a second one — and an `evidence:
FacadeConfidence` sibling carries the axes a scalar cannot express (`unknownReason`,
`validationState`, `authorityRank`). `FacadeConfidence` is an **alias** of `DomainConfidence`,
following `packages/schemas/src/provenance/ElementConfidence.ts` exactly: *"this name exists to make
the usage greppable, NOT to fork the shape."*

**Rejected alternative — invent a facade-local confidence scale.** That is the drift ADR-0280 was
written to stop, and C62 was born from finding it happening per-subsystem across parcel, envelope
and heights.

---

## 5. Decision 4 — anti-overfit is enforced by the CORPUS, not by discipline

**ACCEPTED.**

Brief §22 names the failure precisely: `if (centralGlassBlock) / if (roundedBalcony) /
if (fiveFloors) / if (archedGroundFloor)`. A rule saying "don't do that" is worth very little; ten
different facades that all have to pass is worth a great deal.

**The design that makes it structural rather than aspirational is the periodicity stage.** Floor
count is not a constant, it is `round(extent / period)` from a phase-locked comb fit. The
ground-floor zone is not a special case, it is a **break** the comb-fit score finds. The central
glass-block element is not a rule, it is *any* detection that fails to match a comb node while being
vertically continuous across two or more zones. Arches are not a category, they are a fitted
superellipse exponent `n` and a continuous `archness`.

⭐ **Nothing in the engine knows what a lightwell, an arcade or a balcony is** — which is the only
way brief §22's closing sentence (*"The same algorithm must work on a completely different facade"*)
can be true rather than hoped for.

**A named tuning rule follows:** thresholds are permitted, defaulted and exposed on `options`, and
**each must be justified by a corpus case**. A threshold whose only justification is *"it made the
photo work"* is the defect this decision exists to catch.

---

## 6. Decision 5 — the crop must be a NO-OP on a clean photograph, and must REFUSE rather than over-crop

**ACCEPTED**, and this decision corrects the brief on a point the founder could not have known.

Brief §1 describes the input as a screenshot carrying LinkedIn/phone chrome. The image the
orchestrator saw *"appears to be a clean, already-cropped building photograph with no UI chrome at
all."* Neither reading can be verified from the repository.

So the crop stage is built for both and is **capped**:

- It detects chrome as near-uniform border bands terminated by a full-width step edge.
- It is a **no-op** when no band qualifies (the clean-photo case).
- ⛔ It **never trims more than 35 % from a side and never reduces area below 25 %** — a candidate
  that would is **refused**, and the full frame is returned with `crop.applied = false`.
- ⛔ **Sky is not chrome.** A uniform sky band and a solid UI bar are separated by *inter-row
  variation*: a UI bar's rows are near-identical to one another; sky drifts. Without this the stage
  trims the top off every outdoor photograph — and would do it silently and plausibly.

**Why a refusal beats a best guess here specifically:** a wrongly cropped building is not a degraded
result, it is an *unrecoverable* one. Every downstream stage then measures the wrong rectangle
confidently, and the diagnostics look perfectly reasonable. This is [[unsatisfiable-gate-decomposition-is-the-fix]]
in reverse — ask "can this stage's answer ever be checked downstream?" before letting it guess.

---

## 7. Consequences

**Positive**

- Zero new dependencies; the §20 licence exposure is nil by construction, not by review.
- The engine is L1, pure, THREE-free (P2) and DOM-free (P5-adjacent), testable in Node.
- Ten synthetic facades with known ground truth exist and can falsify a change immediately.
- Two entry surfaces: the editor UI (any browser-decodable format) and a CLI (PNG) so the founder
  can drop a file into the repo and get JSON plus overlay PNGs.
- Every uncertain quantity is expressible as unknown-with-a-reason, so the first real photograph
  produces a *diagnosis* rather than a plausible wrong answer.

**Negative / accepted costs**

- ⛔ **Nothing here is proven on a real photograph** (L-11001). This is the honest state and C108
  §0.2 refuses to let it read otherwise.
- Classical CV will be beaten by a learned detector on hard, cluttered, low-contrast images. Accepted
  for Milestone 1; §3's rejected-alternative reasoning is where that conversation restarts.
- The CLI decodes **PNG only** (L-11003). JPEG goes through the browser path.
- Curvature yields a residual deviation, not a radius (L-11004); balcony depth is UNKNOWN
  (L-11005). Both are honest limits of one uncalibrated image, and both are stated in the output
  rather than in a comment.
- Foreground rejection (brief §2) is **mitigated by periodicity, not solved** (L-11011).
- `FacadeIR` lives in the engine package, not L0 `packages/schemas` (L-11002) — promotion deferred
  because it changes what validates a persisted project (C47), following the C104 §11 precedent of
  declaring the deferral rather than doing it quietly.

**Reversibility.** High for everything except the IR shape. The engine is a leaf with no consumers
below L7; swapping a stage's algorithm changes one directory. The IR shape is the founder's and is
the thing other systems will bind to — which is why C108 §1.2 is closed and §1.4 versions it.

---

## 8. What this ADR does NOT decide

- **How a FacadeIR becomes BIM elements** (brief §24). That is Milestone 2, L-11006, and it is bound
  by C11, C16, C84 and the C85–C99 per-element block. Deciding it now, without a real photograph and
  without a single validated IR, would be the confident-register-row defect at contract scale.
- **Whether the UI belongs on the ribbon** (L-11007). C107 §14's rule stands: a rail button that
  arms nothing is worse than no button.
- **Whether a model ever enters the pipeline.** It does not enter Milestone 1. A later decision to
  add one is a superseding ADR, and it owes C23 compliance and a model-weight licence row in the
  same commit.
