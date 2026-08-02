# C64 — The Envelope Compiler

> **Stamp**: 2026-08-02 · **Status**: DRAFT (governance authored; layers 2/3/4 unbuilt — §3, §9).
> **Ratified by**: [ADR-0291](../adrs/ADR-0291-pryzm-envelope-compiler-variable-first-architecture.md)
> (the variable-first architecture) over the doctrine set
> [ADR-0283](../adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) ·
> [ADR-0284](../adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md) ·
> [ADR-0285](../adrs/ADR-0285-computing-an-observable-criterion-is-implementation.md) ·
> [ADR-0286](../adrs/ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) ·
> [ADR-0287](../adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) ·
> [ADR-0288](../adrs/ADR-0288-machine-readable-is-not-publishable.md) ·
> [ADR-0289](../adrs/ADR-0289-geometry-derived-ordinance-variable-engine.md) ·
> [ADR-0290](../adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md).
> **Spec**: [SPEC-ENVELOPE-COMPILER-PROGRAMME](../../03-execution/specs/SPEC-ENVELOPE-COMPILER-PROGRAMME.md)
> (the executable half — operating model, queue, index, reporting).
> **Scope**: the ONE cross-cutting answer to *"given any parcel, what does PRYZM owe the user?"* — the
> **compiler contract**, the **nine-layer model**, the **universal variable-resolution order**, and the
> **determination taxonomy** in which every non-envelope outcome terminates.
> **Sits ABOVE**: [C58](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (envelope semantics, rule packs,
> derivation trace, refusal-as-answer) — **C64 does not replace C58 and does not restate it**; C58 remains
> the authority on everything from the resolved rule set inward (§7).
> **Companion to**: [C57](./C57-PARCEL-DATA-LAYER.md) (parcel), [C60](./C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)
> (coverage honesty at the navigation layer), [C62](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) (the
> confidence / typed-unknown vocabulary this contract composes), [C63](./C63-CITY-COMPLETION-AND-DOSSIER.md)
> (the completeness ruler — a *measure of us*, not a compiler stage), [C12](./C12-GEOSPATIAL.md),
> [C23](./C23-PROVENANCE-AND-AI-AUDIT.md).
> **Key principles**: **P5** (compiler schemas pure — no THREE / no DOM / no I-O), **P6** (a determination
> reaches the model only through the command bus), **P8** (every exported compiler function opens an OTel
> span `pryzm.pec.<verb>`), **P1** (resolvers wired once, in one composition root).
> **Evidence** (never transcribed here — §2.3): the measured per-city records under
> `tools/city-completion/measurements/*.measurements.json`, the computed
> [PEC Execution Dashboard](../../03-execution/plans/PEC-EXECUTION-DASHBOARD.md), and the
> [National Capability Register](../../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md).

---

## §0 — Why this contract exists

Eight ADRs ratified in a single week settle the doctrine of what PRYZM may assert about a parcel, and one
of them (ADR-0291) settles the architecture. Between them they leave three governance holes that no ADR
can close, because an ADR records *a decision*, not *an obligation on every future PR*:

1. **Nothing owns the pipeline end-to-end.** C57 owns the parcel. C58 owns `resolved rules → envelope`.
   **Nothing owns `parcel → resolved rules`** — the legal stack, the variable graph, the resolution order,
   the dataset binding. That gap is exactly where every city was hand-wired into `siteDispatch.ts`, and
   where three published datasets were missed while derived replacements were being scoped (ADR-0290).
2. **The doctrine is stated eight times and enforced zero times.** Doctrine B, the four-part
   implementation test, the refusal duty and the disclosure triple are binding decisions with no
   contractual invariant, no CI gate and no conformance surface. A machine opened a publication gate over
   a whole city's only rendering envelope, citing as authority the commit that opened it — and no
   contract had been violated, because none applied.
3. **"Cannot compute" is still a reachable product output.** ADR-0291 declares it must stop being one.
   Only a contract can make that binding on every resolver.

C64 closes all three. It **governs; it does not re-derive.** Where an ADR settles a question, C64 cites
it and states the obligation. Where C58 already owns a rule, C64 defers and says so.

---

## §1 — The compiler contract (the normative statement)

> **Given any parcel, the PRYZM Envelope Compiler MUST resolve the minimum set of authoritative variables
> required to construct a legally defensible 3D buildable envelope — or return a typed determination
> naming exactly what is missing, who owns it, and what would close it.**

Four obligations follow, and all four are binding:

### §1.1 — Totality: there is no third outcome
Every parcel the compiler accepts terminates in **either** a `BuildableEnvelope` (C58 §2) **or** an
`EnvelopeDetermination` of one of the five §5 kinds. A thrown error, an empty result, a silent fallback,
a `null` with no reason, or the string *"cannot compute"* is a **contract violation**. This is
§CONTEXT-DATA-HONESTY (C62) at the compiler boundary: *failure and emptiness are the same value to the
user unless the type discriminates them.*

### §1.2 — The determination NAMES the binding dependency, not the symptom
A determination MUST carry the **specific variable** that blocked it and the **dependency chain** beneath
it (ADR-0291 §2). *"No envelope"* is not conformant; *"blocked only by `storeys`, which is blocked by
`streetWidth`, which is blocked by `alignment`, for which no authoritative layer is published"* is. Four
cities today block the same variable for four different reasons and the product says the same thing in
all four — that is the defect this invariant forbids.

### §1.3 — The unit of architecture is the ORDINANCE VARIABLE, never the city
Per **ADR-0291**. A municipality is a **set of bindings** for variables the platform already knows how to
resolve. Adding a city MUST NOT require a new code path, a new dispatch branch, or a new engine edit —
only bindings, packs and adapters (this is C58 §1.5 raised one layer). A PR that adds a per-city branch to
a resolver is non-conformant and must state, in its description, which generic seam it could not use and
why.

### §1.4 — Behaviour-preserving migration, or it is a correctness event
Per **ADR-0291**. A city's published determinations MUST reproduce **byte-identically** through any new
compiler layer before that city is migrated onto it. A rewrite that moves a published number is a
**defect**, not a refactor, and is handled under the defect path — never as a scope change.

---

## §2 — Invariants

Binding on every PR touching parcel context, legal-instrument resolution, variable resolution, dataset
binding, constraint composition or the determination surface. Each has a `§2.N` id usable in
`TODO(C64.N)` and in gate failure messages. **Each cites its ADR and does not re-argue it.**

### §2.1 — Publication bounds assertion; Unknown is a valid product state
Per [**ADR-0283**](../adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md)
(D-007, SIG-M2). PRYZM may assert only what authoritative publication demonstrates; where evidence is
incomplete **or legally insufficient**, the compiler returns `Unknown`. Partial publication authorises
nothing beyond its demonstrated spatial extent. ⚠ *"or legally insufficient"* is load-bearing: **having
the data is not authority to publish an entitlement.**

### §2.2 — Derived geometry is permissible; derived law is not
Per [**ADR-0284**](../adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md). The compiler MAY
derive a **measurement** the ordinance makes operative but does not tabulate. It MUST NOT derive a
**determination** the publisher has not made — no invented default, no borrowed neighbouring parameter,
no analytical reconstruction promoted to a zoning dataset, no self-certified machine transcription.

### §2.3 — Every derived value exposes legal source · computational source · confidence tier
Per [**ADR-0286**](../adrs/ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md).
All three travel **together, to the UI** — not into a log the user never sees. The carrier is C58 §1.3's
`DerivationEntry`; C64 adds no second provenance object. ⚠ **This invariant is about the value's origin,
not its truth** — see §9.1, which is the launch-blocking gap it does not close.

### §2.4 — Resolvers refuse when uncertainty can change the legal outcome
Per [**ADR-0287**](../adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md). If a
measurement's uncertainty interval spans a threshold at which the legal answer changes, the resolver MUST
NOT publish a determination. Not "flag it", not "take the conservative branch", not "widen the error bar".
A refusal produced by this invariant is the doctrine working — never a coverage defect, and never a
number to be engineered away.

### §2.5 — Machine-readable is not publishable
Per [**ADR-0288**](../adrs/ADR-0288-machine-readable-is-not-publishable.md). Readability establishes only
readability. Publication additionally requires: the instrument **grants** the determination; the parcel is
inside the data's demonstrated extent; every required human sign-off is **recorded and dereferenceable**
(L-449); and the output carries the §2.3 triple. **A readable dataset with no legal grant is `Unknown`,
not an envelope.**

### §2.6 — Stage 0: authoritative published data is exhausted before anything is derived
Per [**ADR-0290**](../adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md)
— an **architectural invariant, not a recommendation.** No capability that *derives, constructs,
reconstructs, approximates or digitises* a planning variable may enter an implementation sprint until a
Stage 0 discovery pass has run for the affected municipalities and its **negative result is recorded with
evidence**. A capability with no Stage 0 pass is not "ready"; it is **unsized**. The pass is one-shot and
time-boxed (§5.3 of the SPEC). The discovery protocol and its tool are specified separately and are
deliberately **not** designed here.

### §2.7 — The certification gate is a human act, dereferenceable, and machine-signable never
No `*_CERTIFIED` / `*_ENVELOPE_VERIFIED` gate may read `true` without a recorded signature that
**dereferences** — a document in the repo containing the named anchor. A gate opened by an automated
author, or one whose cited authority is the commit that opened it, is a **P0 correctness defect** on
every determination it authorised. Registered gates, their claimed signatures and the explicit
`UNSIGNED_OPEN_GATES` quarantine live in `packages/site-parcel-data/src/l449CertificationGates.ts` and
are asserted by its test — **the registry is not the authority; it is the index that makes the absence of
authority visible.** (Basis: ADR-0283's `Supersedes in practice` clause; audit **L-681**.)

### §2.8 — One blocker, one category, one owner, one exit criterion
Per the [BLOCKER-CLASSIFICATION-STANDARD](../../04-reference/standards/BLOCKER-CLASSIFICATION-STANDARD.md)
(binding founder standing rule). Every compiler blocker is exactly one of **Legal · Engineering · Data
acquisition · External authority**, carries one named owner and one third-party-checkable exit criterion,
and **does not migrate category without explicit dated evidence**. A blocker whose category is `Legal`
**freezes the engineering it gates**.

### §2.9 — A ceiling asserted from a sample is not a ceiling; a failure is not an emptiness
Per the blocker standard rules 5–6 and [PROBE-DISCIPLINE](../../04-reference/standards/PROBE-DISCIPLINE.md).
Every claim about the world that enters a compiler decision states its `N`; every probe records URL ·
HTTP status · content-type · byte count; a `403 / 499 / timeout / DNS error` is `Unknown`, never
*"no data"*. ⚠ **Probe the artefact, not its container** — a directory index's status is not the
document's status.

### §2.10 — Mandatory first check: the registers
Before opening any line of enquiry, the
[MACHINE-READABLE-EVIDENCE-REGISTER](../../04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md)
(*what exists*) and the [DECISION-REGISTER](../../04-reference/standards/DECISION-REGISTER.md) (*what the
programme has decided*) MUST be read. Re-probing a `Closed` row, or re-deriving a recorded decision, is a
process defect. Correct a register **with evidence**; never route around it. Decision records are
**immutable** — superseded by a new record that cites them, never edited.

### §2.11 — Compiler schemas are pure; the resolvers are the only impure surface
The determination, variable, legal-stack and index schemas live in `packages/schemas/` (P5-pure). Dataset
access, GIS reads and probe I/O live behind adapters at the C57/C58 provider seam. **No fetch may be
introduced into the geometry layer** (C12 §8). How a UI renders a determination is a consumer decision;
this contract guarantees the vocabulary and the totality, not the pixels.

### §2.12 — A determination is never reported as a single bare number
`Determination = Envelope + Refusal`, with refusals **broken out by §5 kind**. A bare determination
percentage MUST NOT appear in any report, dashboard, or external-facing document. **Determination is
gameable by refusing** — refusals are cheap, envelopes are expensive, and nobody has to be dishonest for
the aggregate to drift. The standing drift signal is *refusal rate rising while envelope count is flat*.
(Founder, 2026-08-02, Addendum 1.)

### §2.13 — Contracts, specs and plans carry references to measurements, never transcriptions
No coverage figure, determination figure or completion percentage may be **transcribed** into a contract,
spec, ADR or master document. Cite the artefact that computes it: the per-city measurement record, the
computed dashboard, or the register. **Transcribed measurements rot; computed references do not** —
`ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md` was written with correct numbers in hand and was wrong in
both directions within weeks, in opposite directions for two different cities. (Founder, 2026-08-02,
Addendum 1.) ⚠ This invariant binds **this contract too**, which is why C64 contains no percentages.

---

## §3 — The layer model

Nine layers. Each has a fixed purpose, a fixed input and a fixed output, so that a capability can be
placed unambiguously and a gap can be named unambiguously.

⚠ **The `Status` column is a POINTER, not a record.** The authoritative, evidenced status of every layer is
**D1 of the [National Capability Register](../../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md)**,
which is verified by `git grep` over `packages/` and `apps/` and is re-verified each cycle. C64 fixes the
*shape*; the register measures the *state*. **Do not maintain status here.**

| # | Layer | Purpose | Input | Output | Reusable interface | Status → D1 |
|---:|---|---|---|---|---|---|
| **0** | **Parcel Context** | one immutable object: municipality → district → block → frontages → corner → statutory overlays | a click (lat/lon) | `ParcelContext` | C57 `ParcelFeature` + `ParcelProvider` | 🟡 partial — the context object is not a symbol; corner and the overlay gates are unresolved |
| **1** | **Legal Stack** | which instruments govern, in what precedence, valid when, by whose authority, over what geometry | `ParcelContext` | `LegalStack` | — | 🟡 partial — **extent** and **disposition** precedence exist; **instrument** precedence does not |
| **2** | **Variable Dependency Graph** | variables as nodes with declared dependencies; yields the resolution order and the exact missing node | `LegalStack` | ordered variable set + blocking node | — | ❌ absent — this is what makes §1.2 expressible |
| **3** | **Variable Resolution** | the one municipality-independent pipeline of §4 | variable + `ParcelContext` + `LegalStack` | value + provenance + tier, or a typed unknown | — | ❌ absent — every city hand-orders its own path |
| **4** | **Dataset Resolver** | score every published layer against candidate variables (the Stage 0 mechanism) | a GIS endpoint | ranked candidate bindings | — | ❌ absent — **owned by the Dataset Discovery Protocol; not designed here** |
| **5** | **Provenance** | value + source + layer + article + method + confidence | any resolved value | `DerivationEntry` | `DerivationEntrySchema` (C58 §1.3) | ✅ exists and is mandatory |
| **6** | **Constraint Composition** | heritage / airport / flood / infrastructure composing **downward** over base variables | base variables + overlays | composed constraint set | — | 🟡 partial — exactly one per-city implementation; no generic `min()` composition |
| **7** | **Envelope Synthesis** | footprint → setbacks → depth → occupation → extrude → roof → corner | constraint set | `BuildableEnvelope` → `MassingSolid[]` | `GeometricRule` union (ADR-0270) | ✅ exists — **C58 owns this; do not redesign it** |
| **8** | **Explainability** | every face answers *"why?"* | `DerivationTrace` | UI | `DerivationTraceSchema` | ✅ as data · ⚠ per-**constraint**, not per-**face** |

**Normative consequences of the model:**

- **§3.1** — Layers 5, 7 and 8 are **built and expensive**. A PR that redesigns them requires a
  superseding ADR. The missing work is **layers 2, 3 and 4, and it is contiguous.**
- **§3.2** — A capability MUST declare the layer it belongs to before it is scheduled. A capability that
  cannot be placed in exactly one layer is mis-scoped and is split.
- **§3.3** — **A downward constraint that is unmodelled can only over-state**, and is invisible to every
  metric on the board. Airport, flood and infrastructure constraints are therefore modelled as
  first-class layer-6 variables from the outset, even where no city measures them yet.
- **§3.4** — Layer 4 is specified by the Dataset Discovery Protocol (in authoring). C64 fixes its
  **position and contract** — endpoint in, ranked candidate bindings out — and nothing else. ⚠ **A layer
  that could supply a variable is a CANDIDATE, never a resolution.** The ordinance decides which layer
  binds, not the plausibility of the number it returns.

---

## §4 — The universal variable-resolution order

Every ordinance variable resolves through **one pipeline, in one order** (ADR-0291 §1). The order is
normative and total: a resolver that reorders it, skips a step, or invents a step is non-conformant.

```
PRECONDITION ▸ STAGE 0 GATE      authoritative published data exhausted, negative recorded (§2.6)
                                  ⚠ not a step — a gate that must be closed before the ladder is entered

0 ▸ IS A METHOD PRESCRIBED BY THE INSTRUMENT?   ⚠ FIRST · MANDATORY · EXPLICIT · PER CITY, PER ARTICLE
1 ▸ PUBLISHED VALUE               the authority states the number
2 ▸ PUBLISHED GEOMETRY            outranks any geometry we construct (§2.1)
3 ▸ PUBLISHED ANNOTATION          present but semantically unbound ⇒ refuse until an authority binds it
4 ▸ REFERENCED LEGAL INSTRUMENT   identify + cite; admit numbers only if held and in force
5 ▸ LEGALLY CONSTRUCTIBLE         ADR-0285, all four tests, all four conditions
6 ▸ TYPED UNKNOWN                 §5 determination, with reason, article and the missing dependency
```

### §4.1 — Step 0 is a checked branch, never an assumption
⚠ **This is a correction, not an addition.** ADR-0285's test 2 — *"the method is unprescribed"* — was on
its way to being treated as a general property of Spanish PGOUs. Murcia's Art. 4.5.3 **does** prescribe a
method, and Art. 4.5.4 prescribes a different governing frontage on a corner *solar* than the resolver
took. Both errors under-granted. **Test 2 MUST be evaluated per city, per article, and the evaluation
MUST be recorded in the city's `findings/`.** A resolver that reaches step 5 without a recorded step-0
answer is non-conformant.

### §4.2 — Step 5 is gated by ADR-0285 in full
All four tests hold, or the variable falls to step 6:
1. the **criterion** is stated by the ordinance (we are measuring what the law made operative);
2. the **method** is unprescribed (step 0, checked);
3. the **input** is authoritative published geometry (inferring an unpublished alignment does not qualify);
4. the **computation** is reproducible — deterministic, pinned by test over a captured fixture.

And all four mandatory conditions ride with the result: reproducible · **explicitly labelled
constructed** · article-cited · refusing at band edges (§2.4).

### §4.3 — A signature on methodology is not a signature on outcomes, and never a tier promotion
A founder signature under ADR-0285 approves **the methodology**, not each parcel's result, and MUST NOT
be recorded as a per-parcel warranty. Per ADR-0286, **a quantity does not earn a higher confidence tier by
virtue of having been signed.** Where a ruleset's own sign-off records that the top tier is unreachable,
the reachable ceiling is a fact about that jurisdiction — any per-city target above it must name where an
*issued* authority determination would come from, or be restated.

### §4.4 — Prefer the published source even when the derived one already works
Per ADR-0290. A shipped derivation whose authoritative source is later discovered **migrates to it**: the
tier is better and the provenance is the publisher's, not ours. Discovering the source late is a
**confidence-tier loss**, not merely wasted effort — which is why §2.6 is a gate and not advice.

---

## §5 — The determination taxonomy

Every outcome that is not a `BuildableEnvelope` terminates in **exactly one** of five kinds. The five are
**exhaustive and mutually exclusive**: across any measured territory they MUST account for **100 % of
non-envelope land**. A residual bucket, an "other", or an unclassified remainder is a contract violation
— it is the state in which a coverage gap of ours is indistinguishable from an answer of the law's.

| Kind | Means | Blocker class (§2.8) | Who can close it | Is it PRYZM's gap? |
|---|---|---|---|---|
| **`legal-impossibility`** | The instrument grants no computable envelope here. A **positive legal answer**. | Legal (settled) | Nobody — it is the answer | **No.** Never counted as a shortfall |
| **`missing-authoritative-data`** | The determination exists in law but no machine-readable authoritative source has been demonstrated. | Data acquisition | Us, plus possibly the publisher | Partly — closing it is discovery, not engineering |
| **`external-authority-required`** | Only a third party can resolve it: a semantic definition, credentials, a licence, a signature. | External authority | Not us | **No.** MUST NOT consume sprint capacity |
| **`engineering-capability-missing`** | We know what to build and are permitted to build it; it is not built. | Engineering | Us, no external dependency | **Yes.** The only kind that enters a sprint |
| **`awaiting-legal-interpretation`** | The governing instrument's meaning is unresolved; it may prohibit the thing we would build. | Legal (open) | A planning-literate human, or a signature | **No** — and it **freezes** the engineering it gates |

### §5.1 — The determination object
```ts
EnvelopeDetermination {
  kind:            'legal-impossibility' | 'missing-authoritative-data'
                 | 'external-authority-required' | 'engineering-capability-missing'
                 | 'awaiting-legal-interpretation'
  blockingVariable: VariableId                  // §1.2 — the variable, not the symptom
  dependencyChain:  VariableId[]                // layer 2 — why THAT variable is unresolved
  legalBasis:       OrdinanceRef | null         // the article; null ONLY for the engineering kind
  owner:            string                      // a named party. `unassigned` is a defect (§2.8)
  exitCriterion:    string                      // third-party-checkable. "investigate further" is not one
  unknownReason:    C62 UnknownReason           // the typed vocabulary, not a free string
  confidence:       EnvelopeConfidence          // the C58 §1.6 ladder position of what we DO hold
}
```
It is a **discriminated union member alongside the envelope**, not an error channel: `compile(parcel)`
returns `BuildableEnvelope | EnvelopeDetermination`, total (§1.1).

### §5.2 — Two states that are NOT determinations, and must never be conflated with one
- **`intervention-ceiling-only`** — a cited maximum-permitted-intervention volume is **drawable and is not
  an envelope**. It is a third state of envelope synthesis, it MUST NOT aggregate into envelope coverage,
  and it is **not publishable** while its binding ceiling (the existing building's own envelope and built
  area) is unobtainable. Publishing an upper bound without its binding constraint is the L-616 defect —
  ADR-0284: *a solid must intersect ALL derived constraints*.
- **`not-assessed`** — *we have not measured*, which is C63's vocabulary about **us**, not a statement
  about the parcel. `not-assessed ≠ 0 %` and `not-assessed` is never a determination.

### §5.3 — Refusal correctness is a measured property, not an asserted one
A refusal that cites an article which does not in fact terminate that parcel is a defect **of the same
class as an over-granted envelope**, and is reported as one. The taxonomy makes refusals cheap to produce;
§2.12 stops that being rewarded, and a periodic refusal audit (SPEC §8) is what stops it being *believed*.

### §5.4 — Terminal ≠ closed ≠ superseded
Per the blocker standard. A **terminal** determination is a correct answer that will not become an
envelope. **Closed** means the investigation reached its expected conclusion; **superseded** means the
investigation showed the original assumption was false. ⚠ **Every post-mortem MUST identify its
`Superseded` items explicitly** — they are the only entries that teach anything, and every stale claim
that has propagated across cities in this programme was a `Superseded` that nobody recorded as one
(audit **L-685**).

---

## §6 — Confidence, and what a tier may never do

- **§6.1** — The tier ladder, its ordering and its axis weights are **C58 §1.6 + C63 §3.2's**
  `EnvelopeConfidence` ladder. C64 mints no second ladder and no aliases.
- **§6.2** — Tier movement is **demote-only** against a pack's declared default. No surface may re-derive
  or override a tier; a label only one caller knows how to compute is not a property of the answer
  (C58 §1.2).
- **§6.3** — **The vocabulary is incomplete and this is recorded, not worked around.** A cited legal
  determination (terminal, correct) and PRYZM's own coverage gap currently weigh the same on the envelope
  axis and are indistinguishable in the score. ADR-0291 records that a `legally-delegated` tier is needed;
  C64 does not set its weight. Until it exists, **any reading of the envelope axis as a measure of PRYZM's
  performance is unsound** over delegated land.

---

## §7 — What C64 does NOT own (defer, do not restate)

| Question | Owner |
|---|---|
| Envelope semantics, rule packs, the derivation trace, refusal-as-answer, determinism, the tier ladder | **[C58](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)** — C64 sits above it and defers |
| Parcel fetch, provider seam, coverage-miss degradation, attribution | **[C57](./C57-PARCEL-DATA-LAYER.md)** |
| The confidence / `UnknownReason` / `ValidationState` / `MetadataEnvelope` vocabulary | **[C62](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)** |
| "How complete is city X" — the 7-axis ruler and the dossier shape | **[C63](./C63-CITY-COMPLETION-AND-DOSSIER.md)** |
| Where a user *arrives* at a site, and the honest coverage claim made by the navigation surface | **[C60](./C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)** |
| The geometry-derived ordinance-variable engine (layer 3's measurement core) | **[ADR-0289](../adrs/ADR-0289-geometry-derived-ordinance-variable-engine.md)** |
| Dataset discovery mechanism, scoring, tooling (layer 4) | the **Dataset Discovery Protocol** (in authoring) |
| Capability inventory, variable model, dependency ranking, KPI baselines, roadmap | the **[National Capability Register](../../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md)** |
| How work enters sprints, the production queue, the completion index, reporting | **[SPEC-ENVELOPE-COMPILER-PROGRAMME](../../03-execution/specs/SPEC-ENVELOPE-COMPILER-PROGRAMME.md)** |

⚠ **Duplication is how doctrine forks.** If a statement in C64 begins to disagree with its owner above,
the owner wins and C64 is corrected in place — never both, and never a new derivative document.

---

## §8 — Conformance gates (§6-style, all PROPOSED)

None of these exists yet. They are listed so that "C64 is DRAFT" has a checkable meaning and so the gates
are not re-invented per city.

| Gate | Asserts | Kind |
|---|---|---|
| **G-C64-1 · totality** | every `compile()` exit path returns an envelope or a typed determination; no throw, no bare `null`, no `[]` | hard-fail unit gate |
| **G-C64-2 · taxonomy closure** | over any measured territory the five §5 kinds + envelope sum to the whole denominator, with no residual bucket | hard-fail on the measurement records |
| **G-C64-3 · signed gates dereference** | every `*_CERTIFIED` / `*_ENVELOPE_VERIFIED` gate on disk is registered, carries no inline literal, and its cited signature anchor resolves in the named document; the unsigned-open set matches the quarantine exactly | **shipped** (`l449CertificationGates.test.ts`) — adopt as the C64 gate |
| **G-C64-4 · no transcribed measurement** | no coverage / determination / completion percentage appears in `docs/02-decisions/**` or in this SPEC | hard-fail grep gate (§2.13) |
| **G-C64-5 · Stage 0 evidence** | every capability marked *derive / construct / reconstruct* on the queue references a dated Stage 0 record in the city's `findings/` | soft-fail, hardens at the first release gate |
| **G-C64-6 · determination never bare** | no report or dashboard renders a determination figure without its §5 split | soft-fail lint on the reporting surfaces |
| **G-C64-7 · one blocker, one category** | every blocker row in `jurisdictions/**` carries exactly one category, one owner and one exit criterion | hard-fail doc gate |

---

## §9 — Known violations + open items

Recorded here so that DRAFT status is honest. Each has an audit `L-NN`; **none is fixed by this contract.**

- **§9.1 — `honestyOk` verifies that a number HAS a derivation, never that it is TRUE.** The
  launch-blocking honesty gate checks three structural properties (null ⇒ typed reason; number ⇒ no
  reason; non-empty derivation string) and **never validates the derivation's content**. A fully-cited
  falsehood passes. **This belongs in C63 §8** and is FLAGGED here, not fixed — C63 is contended and is
  edited by its own owner. Audit **L-682**.
- **§9.2 — Layers 2, 3 and 4 do not exist.** §1.2 is therefore un-satisfiable today: the product cannot
  name the blocking dependency because nothing models the dependency. Audit **L-686**.
- **§9.3 — Explainability is per-constraint, not per-face** (layer 8). A face does not cite its own
  article or the measurement that produced it.
- **§9.4 — Instrument precedence is unmodelled** (layer 1). Extent and disposition precedence exist;
  PGOU vs Plan Especial vs Modificación Puntual vs PERI does not, and no cited article in at least one
  city has an established `effectiveDate`.
- **§9.5 — Constraint composition is one per-city implementation** (layer 6), with a deliberately
  two-member disposition type and no `absent` member. Everywhere else, overlays are static refusal
  families rather than composition — see §3.3 for why that direction of error is the dangerous one.
- **§9.6 — The national roll-up denominator is being restated** (Addendum 1: to the cadastral parcel).
  Until it lands, cross-city aggregates are **indicative, not measured**, and §2.13 forbids carrying any
  of them into a governed document anyway. Audit **L-687**.

---

## §10 — How to amend C64

1. Edit this file in place. Do **not** author a `*-AUDIT.md` derivative (C31, and the standing rule in
   the rollout tracker §8).
2. A change that reverses an ADR requires a superseding ADR **first**; then cite it here.
3. A change that touches C58's territory is a C58 change. Make it there and cite it here.
4. A change that adds a determination kind must show the five are still exhaustive and mutually
   exclusive, or it is a re-partition and needs an ADR.
5. Never add a measured figure (§2.13). Add the pointer to the artefact that computes it.
