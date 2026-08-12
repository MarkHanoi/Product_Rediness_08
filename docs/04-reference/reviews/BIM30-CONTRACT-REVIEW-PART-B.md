# BIM 3.0 contract-suite completeness review — PART B (founder's §10–16, §18–20)

> **Stamp**: 2026-08-12 · **Status**: REVIEW FINDINGS — not a contract, not an amendment.
> **Scope**: the founder-commissioned completeness review of C70–C75, sections **10–16 and
> 18–20**. Founder's §1–9 are PART A (parallel author). The four consolidated lists and the
> final verdict are the coordinator's; they are deliberately **not** written here.
> **Standard applied**: *is the contract itself complete, internally consistent, falsifiable,
> correctly owned, and impossible to misread into a stronger claim than the evidence supports?*
> **Method**: all six contracts read in full, plus `STR-05-bim30-founder-directive.md` and
> `ADR-0319-audit-fields-are-derived-not-authored.md`. Every code claim carries file:line
> measured at HEAD on 2026-08-12. Two gates were **executed**, not read. Where a thing could
> not be established it is written **UNPROVEN**.
> **Finding ids** `B-01…B-33` are stable and are the citable form.

---

## §A — Measured baseline this review rests on

Everything below is re-runnable. Per C70 §0.2 the numbers are cited from the artefacts that
generate them, not asserted here as this document's own claims.

**A.1 — Two gates that C74 and C75 declare UNBUILT exist at HEAD, and are negative-tested.**
Commit `33dc3ca5` *"feat(gates): three BIM 3.0 gates land RED"* (2026-08-12) shipped:

| Gate | Path | Lines | Executed reading |
|---|---|---|---|
| `check-solver-is-real` | `tools/ga-gate/check-solver-is-real.ts` | 544 | exit **1** DECLARED-LEVEL, 4 findings / declared 4 |
| `check-provenance-not-invented` | `tools/ga-gate/check-provenance-not-invented.ts` | 509 | exit **1** DECLARED-LEVEL, 7 findings / declared 7 |
| `check-epsilon-policy` | `tools/ga-gate/check-epsilon-policy.ts` | 475 | (C73 §0.1's own amendment already cites it) |

Both executed runs print a **planted-tree negative control** and a **clean-tree positive
control** before their findings (`check-solver-is-real.ts:418`, `:467–477`;
`check-provenance-not-invented.ts:384`, `:440–450`), each recording
`✗ BLIND COMPARATOR — <arm> did not fire on a deliberately planted violation` as the failure
text, and each declaring *"an arm never watched failing is UNPROVEN"*
(`check-solver-is-real.ts:492`, `check-provenance-not-invented.ts:464`).

**A.2 — A fourth gate exists that C72 names as an open UNPROVEN.**
`tools/rac-conformance/certification/gates/check-propagation-trackers-reach.ts` (commit
`bbff7030`, 2026-08-12) opens by quoting C72 §6.1.2(d) verbatim as its reason for existing
(`:7–14`).

**A.3 — 13 of the 21 gates named across C70–C75 have no file anywhere in the repo**:
`check-constraint-honesty`, `check-no-hidden-mock`, `check-provenance-coverage`,
`check-derived-not-authored`, `check-graph-write-coverage`, `check-graph-delete-integrity`,
`check-graph-persistence`, `check-prevstate-contract`, `check-suppression-is-reversible`,
`check-predicate-canonical`, `check-deterministic-regeneration`, `check-derived-classification`,
`check-topology-survives`.

**A.4 — the five-value provenance union does not exist in the repository.** `REGENERATED` has
three source hits, all comments; two of them are inside `check-provenance-not-invented.ts`
(`:84`, `:107`), the second stating the fact outright. `packages/schemas/src/elements/` returns
**zero** hits for `provenance|detectionMethod|originDetail|derivationStatus|AUTHORED|OBSERVED|
COMPUTED|INFERRED|REGENERATED`.

**A.5 — `packages/schemas/src/provenance/ProvenanceEdge.ts` exists (95 lines) and is not what
C75 §0 Finding 3 implies.** `EdgeKindSchema` (`:28–34`) is
`artefact-to-element | artefact-to-artefact | cache-derived-from | fallback-from`, and
`fromArtefactId` is regex-pinned to `/^aia_[0-9a-f-]{36}$/` (`:36`, `:49`). **Every edge must
originate at an AI artefact.** It is AI-call lineage, not value origin.

**A.6 — `packages/stores/src/ProvenanceStore.ts` is session-scoped and unpersisted.** Its own
docstring (`:33–35`) reads *"One instance per runtime session (constructed by composeRuntime).
Idempotent disposal."* It holds six in-memory `Map`s (`:38–46`), has **no** `serialize` /
`deserialize` / `toSnapshot` method, and no file under `packages/persistence-client/src`,
`apps/editor/src/engine/persistence` or `packages/file-format/src` references it.

**A.7 — `packages/schemas/src/site/metadata/DataConfidence.ts` is DRAFT and deliberately
unwired.** `:26–28` records STATUS DRAFT (ADR-0280 **PROPOSED**), *"NOT yet wired into consumers
and deliberately NOT re-exported from the site barrel."* `UnknownReasonSchema` is at `:49–58`;
`unknownEnvelope<T>()` at `:200–202`.

**A.8 — there is no export mapping for provenance.**
`packages/file-format/src/export/ifc/IfcSemanticWriter.ts:36–50` is the room payload actually
written into `Pset_PRYZM_Spatial` / `Pset_PRYZM_Compliance`; its fields are `roomId, roomName,
roomNumber, occupancyType, area, syncState, templateName, templateCode, targetArea, unitId,
complianceStatus, deviationPct, failingRequirements` — no `detectionMethod`, no provenance.
`DxfExportService.ts`, `AnnotationDxfBridge.ts` and `IfcPropertyWriter.ts`: zero hits. The only
`detectionMethod` in `packages/file-format` is on the **import** side
(`import/ifc/conversion/IfcSpaceToNativeRoomConverter.ts:42`).

**A.9 — `loadSolver()` has three branches, not two.**
`packages/constraint-solver/src/engine.ts:463–483`:
`:468` `if (!url) return new MockSolver();` · `:474–478` an **indirect-eval dynamic import**
(`new Function('s', 'return import(s)')`) against a **constructed** specifier
(`const specifier = './' + 'PlanegcsAdapter.js'`) which, if it resolves, returns
`createPlanegcsAdapter(url)` — the class declaring `readonly kind = 'planegcs'`
(`PlanegcsAdapter.ts:85`) whose `underlying` is `opts.underlying ?? new MockSolver()` (`:95`) ·
`:480–482` an **empty `catch { }`** · `:483` `return new MockSolver();`. The source comment at
`:471` states the opacity is deliberate: *"so Vite/Rollup cannot statically resolve"*.

---

## §10 — C74 completeness, and whether its gates can detect RUNTIME substitution

### B-01 · C74 §1.1 — the four kinds are not disjoint, so "exactly one" is unsatisfiable

**Problem.** §1.1 requires every constraint be classified *"exactly one of"* VALIDATION /
ENFORCEMENT / ADVISORY / SOLVING, and then defines **ENFORCEMENT as "a validation wired into a
mutation path such that failure refuses the mutation."** An enforcement therefore *is* a
validation. The categories nest; they do not partition. §2's own table shows the strain:
`StairValidationAuthority` is classed VALIDATION while §2 states it "runs in the stair dispatch
path via `ValidateStairCommand`" — if that dispatch refuses, it is ENFORCEMENT by §1.1's own
definition, and the table is wrong; if it does not refuse, the reader cannot tell from the row.

**Why it matters.** §1.3 makes the classification mandatory and §4.2 makes it the gate on solver
authorisation. A taxonomy whose top two members overlap lets the same family be filed either way,
and §1.3's tie-break ("treated as VALIDATION until proven otherwise") then systematically
*downgrades* enforcement gates to advisory-looking rows — the exact "enforcement gate silently
becoming advisory" §2.1 forbids.

**Amendment — add to C74 §1.1, immediately after the four bullets:**

> **The four kinds are a partition on the *strongest* property a constraint exhibits, evaluated
> top-down: SOLVING > ENFORCEMENT > ADVISORY > VALIDATION.** A predicate that refuses a mutation
> is **ENFORCEMENT**, not VALIDATION, even though it contains a validation — the classification
> names the strongest thing the constraint does, because that is the property a user can
> observe. Where a single implementation is called from both a refusing and a non-refusing site,
> it is classified **twice, once per call site**, and both classifications are written down;
> classifying the *implementation* rather than the *wiring* is how an enforcement gate becomes
> invisible when its refusing caller is removed.

### B-02 · C74 §1.1 × C70 G-INV-2 — ADVISORY has no representable "declared strength", and Level 6's award condition cannot be evaluated for an advisory family

**Problem.** C70 **G-INV-2** fixes the strength vocabulary at **three** values —
*"every constraint family carries a declared strength — validation · enforcement · solving"* —
and C70 §4's Level-6 award condition requires a stored constraint be *"checked / enforced /
solved at its declared strength."* C74 §1.1 defines **four** kinds and makes ADVISORY a
first-class one, with a real, shipping example (the `./compliance` registry, §2). An ADVISORY
family cannot declare a strength that C70 recognises.

**Why it matters.** Either the `./compliance` registry is mis-declared as VALIDATION to satisfy
C70 — which §2.1 calls a user-facing behaviour change disguised as a refactor — or Level 6 is
awardable while a whole constraint kind sits outside the award condition. Both readings are
available today.

**Amendment — C70 G-INV-2, replace the parenthetical:**

> **G-INV-2** every constraint family carries a declared strength — *validation · enforcement ·
> advisory · solving*, the four kinds of [C74 §1.1](C74-CONSTRAINT-HONESTY.md), which is the
> owning vocabulary and may not be re-enumerated here — and executable evidence **at that
> strength**; for ADVISORY the evidence is that it reaches the user **and blocks nothing**,
> which is a testable claim in both directions. "Solver-driven" without a solver is a contract
> violation.

### B-03 · C74 §3.1 — the identity rule reaches only `SolverPorter`, while §0's scope claims every component that answers a constraint question

**Problem.** The scope line binds *"validators, commit-time gates, advisory rule registries, and
solvers"*. §3.1 — the contract's key principle — is written entirely in terms of
*"A `SolverPorter` implementation's externally visible identity"*. The §6 gate row widens it to
*"No `SolverPorter` (**or comparable adapter**)"*, and **"comparable adapter" is nowhere
defined**, so the widening is not decidable by a program. Measured consequence: the gate that
exists discovers its subject by **class name** — its own output prints
`out of subject : MockVoiceTranscriber kind='mock' packages/ai-host/src/workflows/VoiceCommand.ts:70
— the class name does not declare it an adapter`. A stand-in not named `*Adapter` is out of
subject by construction.

**Why it matters.** §0's five incidents include a compile gate that fabricated PASS lines and a
certification whose empty seed scored best. **Neither is a `SolverPorter`.** The contract
generalises the *lesson* in prose and then narrows the *rule* to the one component that produced
it.

**Amendment — C74 §3.1, replace the first sentence:**

> **§3.1 — MUST. No component reports work it did not perform.** Any component in this
> contract's scope — validator, commit-time gate, advisory registry, solver adapter, or
> measurement harness — has an externally visible identity (its declared `kind` or equivalent
> discriminant, its span attributes, its return shape, its log lines) that describes **the work
> it actually did**. Where a component has no discriminant field, **adding one is part of
> satisfying this rule**, not a precondition for it: a component that cannot be asked what it is
> is not exempt, it is unfinished.

### B-04 · C74 §3.3 — the selector has three states; the contract names two, and permits the reason to be destroyed

**Problem.** §3.3 requires *"not configured"* and *"configured but could not load"* be different
observable outcomes. Measured (A.9), `loadSolver()` has **three** terminal states, and the third
is the dangerous one: **configured, loaded successfully, and the thing loaded is a stand-in
wearing a real engine's name.** §3.3 has no vocabulary for it. Separately, `:480–482` is an
**empty `catch { }`**: the load error — the only artefact that could say *why* — is discarded
before §3.3's "failure" can carry a reason. §3.3 says the second outcome "is a failure, not a
default"; it does not say the failure must carry its cause.

**Why it matters.** State three is C74's own headline defect reached *by configuration*: setting
`PLANEGCS_WASM_URL` does not, as §0 asserts, "change nothing" — on that branch it changes the
reported `kind` from the honest `'mock'` to the dishonest `'planegcs'` while the behaviour stays
the mock. Whether the branch resolves is realm-dependent (dynamic `import()` inside a
`Function`-constructed body has no module referrer) and is **UNPROVEN either way** — which is
itself the point: the reachability of the lying adapter is undecidable from the source, and no
contract clause covers it.

**Amendment — C74 §3.3, replace the final sentence and add a fourth state:**

> "Not configured", "configured but could not load", and "configured, loaded, and the loaded
> implementation is a stand-in" MUST be **three** different observable outcomes. The second is a
> **failure and carries its cause** — the load error may not be swallowed by a bare `catch`; it
> is recorded in the returned value in the UNKNOWN-with-reason idiom
> ([C75 §1.4](C75-PROVENANCE.md)), because a failure with its reason deleted is
> indistinguishable from emptiness at the next hop. The third is a **stand-in and announces
> itself under §3.2**; a selector may not return it under a name the caller asked for.

### B-05 · C74 §0 bullet 3 — the measured description of `loadSolver()` is wrong at HEAD, in the lenient direction

**Problem.** §0 states: *"`loadSolver()` returns `new MockSolver()` on **both** paths: the no-URL
miss (`engine.ts:468`) and the fall-through after the URL *is* supplied (`engine.ts:483` …).
Supplying `PLANEGCS_WASM_URL` — the one action a caller could take to ask for the real thing —
changes nothing and reports nothing."* Measured (A.9), `:483` is the **catch fall-through**, not
the URL-supplied path; the URL-supplied path is `:474–478`, which attempts a dynamic import and
returns `createPlanegcsAdapter(url)` on success.

**Why it matters.** C70 §0.2 and C74's own §3.6 are about claims outrunning their measurement.
C74 §0 is the evidentiary base of the entire contract and it under-describes its own subject —
it reports a *dormant* mock where the code contains an *activatable* misreport. This is the third
time in the corpus that a hand-read count came in on the lenient side (C73 §0.2 records the other
two).

**Amendment — C74 §0, replace bullet 3:**

> - `loadSolver()` (`engine.ts:463–483`) has **three** terminal branches, not two: the no-URL
>   miss returns `MockSolver` (`:468`); the URL-supplied branch performs an **indirect-eval
>   dynamic import** whose specifier is assembled at runtime specifically so bundlers cannot
>   resolve it (`:474–475`, comment at `:471`) and, on success, returns
>   `createPlanegcsAdapter(url)` — i.e. the adapter that declares `kind = 'planegcs'` over a
>   `MockSolver`; and the empty `catch { }` (`:480–482`) discards the load error before falling
>   through to `MockSolver` again (`:483`). So supplying the one configuration a caller could
>   supply does not "change nothing" — on the middle branch it **changes the reported identity
>   and not the behaviour**, which is strictly worse. Whether that branch resolves at runtime is
>   **UNPROVEN**, and a defect whose reachability cannot be decided from the source is the
>   subject of §6.3(a), not an exception to it.

### B-06 · C74 §3.7 — "a declared dependency of some workspace" is satisfiable in one line, without binding anything

**Problem.** §3.7 settles the question by the *manifest*: *"A component claiming to bind a
third-party engine must have that engine as a declared dependency of some workspace
`package.json`."* Adding `"planegcs": "^0.1.0"` to any manifest satisfies the rule and turns the
gate arm green while the adapter still delegates 100 % to `MockSolver`. The executed gate confirms
the arm is manifest-shaped: `R1 ✗ 'planegcs' is declared by NO package.json in the repo`.

**Why it matters.** §3.7 is described as *"the cheapest check in this contract"* and it is — but
cheap and *defeatable in one line* is the profile of a check that will be defeated, and its
greenness would then be cited (C70 Level 6) as evidence the solver is real.

**Amendment — C74 §3.7, append:**

> A manifest entry alone does not satisfy this rule. The engine must be **(a)** a declared
> dependency of a workspace, **(b)** resolvable in that workspace, and **(c)** the subject of a
> **static import edge from the adapter that names it**. A dependency declared and never
> imported is a manifest claim, and this contract exists because manifest-shaped claims were
> read as capability. Where the binding is necessarily dynamic, §3.2's first-call production
> signal is the substitute evidence and the adapter says so at its own boundary.

### B-07 · C74 §3.8 — the permitted remedy is exactly the remedy §3.2 forbids

**Problem.** §3.2 is unambiguous: *"'It is documented in the file header' is not detection; §0
shows a header that has been accurate and ignored for months."* §3.8 then permits: *"Either wire
it or **say, in the barrel, that it is unwired**."* A barrel comment is a file header one
directory up.

**Why it matters.** An implementer satisfying §3.8 by comment produces a component that §3.2
would reject, in the same contract, with the same argument. It is a self-contradiction an
implementer may resolve in whichever direction is cheaper.

**Amendment — C74 §3.8, replace the final sentence:**

> Either wire it, delete it, or make it **structurally** undeliverable to a production caller —
> removed from the barrel export, or gated behind a symbol that throws with a named reason on
> first call in a production build (§3.2). **A comment is not a declaration**: §3.2 rejects the
> file-header remedy and this section may not reintroduce it one directory up.

### B-08 · C74 §3.5 / §3.6 — declaring the uncovered production configuration is not covering it

**Problem.** §3.5 requires a suite substituting a double to state *which production configuration
is thereby not covered*, and §3.6 forbids citing test counts without naming the bound subject.
Both are disclosure rules. Neither requires that the production construction path ever be tested.
`PlanegcsAdapter.test.ts` can add one sentence and remain a green suite over a configuration
production never uses.

**Why it matters.** §0's argument is that a green suite over a substituted subject *argues for*
the claim. A disclosed green suite still argues for the claim in every aggregate CI view, which
is where levels get awarded.

**Amendment — C74, add §3.5.1:**

> **§3.5.1 — MUST. The production construction path is itself under test.** For every component
> whose tests inject a double, at least one test constructs the component **exactly as
> production constructs it** — no injected `underlying`, no test-only options — and asserts the
> §3.2 stand-in signal fires. A suite that can only reach its subject through a seam production
> never uses has not tested its subject; it has tested the seam.

### B-09 · C74 §6.3(a) × C70 §4 Level 6 — the runtime-substitution concession is not reconciled with the award condition, and §3.1/§3.2 have **no gate at all** at HEAD

This is the founder's question, answered.

**Can C74's gates detect RUNTIME substitution? No — and the gap is larger than §6.3(a) admits.**

1. §6.3(a) concedes only *"a double injected at runtime through DI is invisible to a source
   scan."* The repository contains a stronger case: `engine.ts:474–476` builds its module
   specifier at runtime **for the declared purpose of defeating static resolution**. That is not
   an incidental DI blind spot; it is an in-tree, deliberately static-opaque selection path
   between an honest mock and a dishonest adapter.
2. **The two arms that would catch identity fraud do not exist.** §3.1 (identity = performed
   work) and §3.2 (stand-in announces itself) are assigned to `check-constraint-honesty`, which
   **has no file anywhere in the repo** (A.3). The gate that does exist,
   `check-solver-is-real`, has arms R1 (dependency), R2 (selector), R3 (dead capability) — and
   **no identity arm**: its executed output lists `names an engine : PlanegcsAdapter
   kind='planegcs'` as an *inventory line*, and the only finding it raises against that class is
   R1, the manifest question. So C74's headline defect — *"the adapter takes the mock's behaviour
   and puts the real solver's name on it"* — is **ungated at HEAD**.
3. C70 §4's Level-6 award condition reads *"`check-constraint-honesty` green (G-INV-1/2)"*.
   A level is therefore awardable on a gate that (a) does not exist and (b) by C74's own §6.3(a)
   could not see the substitution it is being cited for even if it did.

**Amendment — C74 §6.3, replace opening clause of (a):**

> **(a) runtime substitution — and this is a limitation on the CLAIM, not merely on the gate.**
> A double injected through DI, or selected through a specifier assembled at runtime
> (`packages/constraint-solver/src/engine.ts:474–476` is the measured in-tree instance, and its
> own comment states the opacity is deliberate), is invisible to a source scan. **Therefore a
> green `check-constraint-honesty` may never be cited as evidence that the shipped solver is
> real.** It is evidence that no *statically visible* adapter misreports. Under
> [C70 §0.1](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) the only thing that can discharge G-INV-1 is
> an **executed run that reads the composed runtime's solver `kind` back at the seam it is used**
> — a runtime probe, not a scan. Until that probe exists, G-INV-1 is **UNPROVEN** and
> [C70 §4](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)'s Level 6 is not awardable.

**Amendment — C70 §4, Level 6 award-condition cell, replace `check-constraint-honesty` green
(G-INV-1/2) with:**

> `check-constraint-honesty` green **AND** an executed runtime probe that composes the runtime,
> obtains the solver through the production selector, and reads back an identity matching the
> work performed ([C74 §6.3(a)](C74-CONSTRAINT-HONESTY.md) — a static gate cannot decide this
> and its greenness is not a substitute).

### B-10 · C74 §4.3 — `honesty fix → separate binding change` is a MUST and a C74-local exit condition, but it is **not** a Definition-of-Done dependency and has **no gate arm**

The founder asked specifically whether this binds. **It half-binds.**

**What exists.** §4.3 is a MUST ("they land in SEPARATE changes"), §4.4 is a MUST NOT, §5.g names
the anti-pattern, and C74 §7 exit condition 1 says *"and that change landed in its own commit,
before any binding work (§4.3)"*. That is stronger than advice.

**What is missing, and it is the load-bearing half.**
- **No Definition-of-Done dependency.** C70 §6 enumerates the eight DoD conditions; none
  references C74 §4.3 or commit separation. C70 §4's Level-6 row is satisfiable by a *merged*
  honesty+binding commit — the gate is green either way. So the ordering constraint binds C74's
  own exit conditions and nothing above them, and C70 is the document a level is awarded from.
- **No gate arm.** Commit granularity is a VCS property. None of C74's three §6 gates has an arm
  for it, and `check-solver-is-real` (which exists) cannot see it. §6.2 requires every arm be
  negative-tested; an arm that does not exist cannot be. §4.3's separation is therefore
  **unmeasured by construction**, which is the condition §0 says produced five incidents.

**Amendment — C70 §6, insert as a new numbered condition (renumbering the rest):**

> 9. **The honesty fixes landed before, and separately from, the capability they make flattering.**
>    For every component that shipped as a stand-in under
>    [C74 §3.2](C74-CONSTRAINT-HONESTY.md), the commit that made its boundary truthful is a
>    **distinct, earlier commit** from the one that supplied the real capability
>    ([C74 §4.3](C74-CONSTRAINT-HONESTY.md)). This condition is a **dependency of conditions 1–8,
>    not a peer of them**: a Definition-of-Done line satisfied by a merged commit is satisfied by
>    a run in which the organisation learned nothing, and the lesson is the deliverable.

**Amendment — C74 §6, add a fourth gate row:**

> | `check-honesty-precedes-binding` | hard | **§4.3/§4.4.** For every component on the stand-in
> register, the commit introducing its §3.2 signal is an **ancestor of, and distinct from**, the
> commit introducing its real dependency. Subject is `git log --follow` over the adapter file and
> the manifest that declares the engine; a component whose two changes share a commit **exits 1
> and is named**. Where VCS history is unavailable to the runner the gate **exits 2**, never 0 —
> an unmeasurable ordering is a misconfiguration, not a pass. |

### B-11 · C74 gate header, §6, §7.3 — stale at HEAD in a direction that would cause duplicate work; and §0/§2's subject is narrower than the defect

**Problem.** The **Gate** header line and §6's preamble both state *"all three UNBUILT at stamp
time (§6)"*, and §7 exit condition 3 lists `check-solver-is-real` as unbuilt. Measured (A.1),
`check-solver-is-real.ts` exists at HEAD (544 lines, commit `33dc3ca5`, same stamp date), runs,
is negative-tested with a planted tree, and exits **1 DECLARED-LEVEL at 4 findings**. C74 carries
no changelog entry recording this. **Additionally**, that gate's executed output raises
`FINDING R2 — packages/ai-host/src/AnthropicRelay.ts:187 loadRelay() returns
'new MockAnthropicRelay()' on 2 branches, one of them past a catch` — the §3.3 defect in a second
subsystem C74's §0 and §2 never mention.

**Why it matters.** An agent reading C74 today would rebuild a 544-line gate that already exists,
and would believe §3.3's defect is solver-local when the gate has measured it as at least
estate-wide across `ai-host`. "UNBUILT at stamp time" is a phrase whose truth expires the same
day it is written, in a contract whose §0.2 sibling (C70) forbids exactly this shape.

**Amendment — C74, replace the Gate header line and add a changelog entry:**

> **Gate**: `tools/ga-gate/check-solver-is-real.ts` (**EXISTS**, negative-tested, exit-1
> declared-level — read the gate's own output, never this line, per
> [C70 §0.2](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)) · `check-constraint-honesty.ts` and
> `check-no-hidden-mock.ts` — **no file at HEAD**, specified in §6.
> **Changelog**: … · 2026-08-12 — `check-solver-is-real` landed (`33dc3ca5`); the header's
> "all three UNBUILT" reading is superseded. §0's evidence base is **narrower than the measured
> defect**: the gate found the §3.3 silent-fallback pattern in `packages/ai-host` as well as in
> `packages/constraint-solver`, so §3.3 is an estate rule and §0's solver framing is its origin
> story, not its scope.

---

## §11 — C75's vocabulary contradiction, and the default conflict

### B-12 · C75 §1.1 vs §1.4 (and C70 H-INV / §6.7) — five, or six? The decision, written

**Problem.** §1.1: *"Every provenance-bearing value carries exactly one of **five** values."*
§1.4: *"**UNKNOWN is a value**, not a blank … An absent provenance field must never be *read as*
any of the five."* §2.5: the migration default *"is `UNKNOWN`-with-reason (§1.4), **never a member
of the five**."* So UNKNOWN is simultaneously a value the field carries and not one of the values
the field carries. C70 compounds it three ways: **H-INV-1..3** say *"The vocabulary is fixed:
AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED, with `'unknown'` first-class and
legible"* — a **lowercase string literal**, peer-shaped, with no reason attached, where C75 §1.4
requires an uppercase **structure carrying a reason** in the `DataConfidence` idiom.

**Why it matters.** Three implementable readings exist today: a six-member string enum; a
five-member enum plus a nullable field; and a tagged union. The first is the worst and is the one
C70's wording most directly suggests — a bare `'unknown'` peer loses the reason, and a reason-less
UNKNOWN is C75 §4.i's "blank cell for unknown origin" wearing a name.

**The decision.** **The canonical vocabulary is FIVE. UNKNOWN is not a sixth member; it is the
other arm of a tagged union, and it carries a reason.** The five answer *"who or what produced
this value"*; UNKNOWN answers *"we cannot answer that question, and here is why"* — a different
question, so it is a different shape, not a different value of the same shape. This preserves
§1.1's "exactly one" (it holds on the `kind` discriminant of the KNOWN arm), satisfies §1.4
(UNKNOWN is a value, with a cause), and makes §2.5's migration default constructible.

**Amendment — C75 §1.1, replace the opening MUST and add §1.1.1:**

> **§1.1 — MUST.** Every provenance-bearing value carries a `ValueProvenance`, which is a
> **tagged union of exactly two arms**: a **KNOWN** arm carrying **exactly one of five** origin
> values, and an **UNKNOWN** arm carrying a reason. The five are **not** a quality ranking; they
> are five different statements about *who or what produced the value*. [five bullets unchanged]
>
> **§1.1.1 — MUST. The canonical shape.** UNKNOWN is **not a sixth member of the five**. It is
> the second arm of the union, and it is structurally distinguishable — a consumer that has
> narrowed to the KNOWN arm has, by construction, an origin; a consumer that has not, has a
> reason. The five-value enum is never widened to admit it, and no package may declare a
> `'unknown'` **string peer** of the five: a peer-shaped unknown loses the reason and becomes
> §4.i's blank cell with a name on it.
>
> ```ts
> // packages/schemas/src/provenance/ValueProvenance.ts — canonical
> export type OriginKind = 'AUTHORED' | 'OBSERVED' | 'COMPUTED' | 'INFERRED';
> export type ValueProvenance =
>   | { known: true;  kind: OriginKind; reason?: string; supersedes?: ValueProvenance }
>   | { known: false; unknownReason: UnknownReason };   // ADR-0280 idiom, §1.4
> ```
> (`REGENERATED` is derived from `supersedes`, not stored — see §1.5 / B-16.)

**Amendment — C70 H-INV row, replace the final two sentences:**

> The vocabulary is fixed and **owned by [C75 §1.1](C75-PROVENANCE.md)**, which this row may not
> re-enumerate: five origin values plus a structurally separate **UNKNOWN arm carrying a reason**.
> `'unknown'` is **never a bare string peer of the five** — a reason-less unknown is a blank cell
> with a name on it. **Provenance is never invented.**

### B-13 · C75 §2.2 vs §2.5 — the default conflict, and a rule an implementer cannot choose between

**Problem.** §2.2: *"A default is INFERRED, and says so … Where a value must be supplied for the
model to be usable, the supplied value is **INFERRED**."* §2.5: *"Every new provenance field is
optional with a default … and that default is `UNKNOWN`-with-reason, **never a member of the
five**."* Both are MUSTs; both describe "a default"; they prescribe opposite labels. §2.5's own
closing sentence — *"This rule and §2.1 are the same rule"* — asserts consistency without
establishing it.

**Why it matters.** Every migration touches both. An implementer wanting a clean coverage number
picks §2.2 (INFERRED counts as covered); an implementer wanting a clean honesty number picks §2.5.
Both cite a MUST. This is the single most convenience-exploitable seam in C75.

**The distinguishing principle** — and the reason the two rules are not actually about the same
thing: **§2.2 is about a VALUE the system supplied; §2.5 is about a PROVENANCE the system never
observed.** Supplying a value is an act the system performed and can describe. Failing to find a
provenance record is an absence the system can only report. Conflating them is what
`roomSnapshotUtils.ts:156` does.

**Amendment — C75, replace §2.2 and §2.5's default clause with a single §2.2 covering both:**

> **§2.2 — MUST. The default rule, and it admits no choice.** Two different acts are called
> "defaulting" and they take different labels. Ask **"did this system produce the value, or is it
> storing a value whose origin it never observed?"**
>
> **(a) The system produced the value → INFERRED, with a reason naming the rule that produced
> it.** This covers a **new runtime default** (`INFERRED`, reason `default:<field>`), a
> **loader-supplied value for a field absent from the snapshot** (`INFERRED`, reason
> `migration-default:<field>`), and a **generated fallback** (`INFERRED`, reason naming the
> fallback), which §2.3 may instead require to refuse. A default is never AUTHORED and never
> COMPUTED — a supplied value that presents as authored is indistinguishable from a user decision
> and will be exported as one.
>
> **(b) The system is storing a value it did not produce and cannot attribute → UNKNOWN, with a
> reason.** This covers a **value present in an old snapshot whose provenance field is absent**
> (`UNKNOWN`, reason `pending-implementation` / `pre-provenance-snapshot`). The value is kept; the
> origin is not invented. **(a) and (b) are distinguished by what is missing — the VALUE, or the
> RECORD OF ITS ORIGIN — and never by which label is more convenient.**
>
> **(c) An imported field whose source carries no metadata → OBSERVED.** **OBSERVED is a statement
> about the boundary crossing, not about the upstream author.** A field PRYZM received from an IFC
> file is OBSERVED even when the file does not say whether a human typed it or a tool computed it;
> that residual ignorance belongs to confidence (C62) and to the source attribution, not to the
> origin label. An importer that **supplies** a field the source lacked falls under (a), not (c) —
> that is the one importer case that is INFERRED, and it must be written at the import site rather
> than inferred by the reader.
>
> **(d) UNKNOWN is never used to avoid deciding between (a) and (c).** If the system can name what
> produced the value, UNKNOWN is a violation of §2.1 in the opposite direction: understating a
> known origin is a smaller harm than inventing one, but it is still a false record, and it
> corrupts the §3 coverage ratchet by making an instrumented path look uninstrumented.

### B-14 · C70 H-INV-3 vs C75 §1.3 — a direct contradiction about which origins may carry confidence

**Problem.** C70 **H-INV-3**: *"confidence exists **only on OBSERVED/INFERRED** data and is
**ceiling-only**."* C75 **§1.3**: *"Provenance is **orthogonal to confidence** (C62). **A value may
be OBSERVED with low confidence, or COMPUTED with high.**"* C70 forbids exactly the pairing C75
uses as its worked example.

**Why it matters.** C75's Authority line makes C62 the owner of confidence and C75 the owner of
origin; C70 then constrains their product. One of the two is wrong, and the disagreement sits on
`check-provenance-not-invented`'s stated subject (its executed run discovers **20 vocabularies**,
several of which — `HeightProvenanceSchema`, `FieldProvenanceSchema` — pair provenance with
confidence today).

**Amendment — C70 H-INV-3, replace:**

> **H-INV-3** confidence and provenance are **orthogonal axes**
> ([C75 §1.3](C75-PROVENANCE.md), [C62](C62-DATA-CONFIDENCE.md)) and a single field may encode
> only one of them; **confidence is ceiling-only** — no consumer raises it. Any restriction on
> which origins may carry confidence is C62's to make, not this contract's, and the earlier
> reading ("only on OBSERVED/INFERRED") is withdrawn as contradicting C75 §1.3.

### B-15 · C70 §6.7 vs C75 §2.5 and §5 — the Definition of Done forbids the state C75 mandates

**Problem.** C70 §6.7: *"**Provenance is complete at element grain** — every element carries an
origin in the AUTHORED / OBSERVED / COMPUTED / INFERRED / REGENERATED vocabulary; `'unknown'`
appears **only on pre-migration data**."* C75 §2.5 requires every new provenance field default to
UNKNOWN-with-reason — which on a **freshly created element in a new project** is not pre-migration
data. C75 §5 additionally permits a kind to be *"argued out of scope — in writing, on the named
list"*, which §6.7's "every element" forbids.

**Why it matters.** DoD conditions are the terminal claim of the whole programme. As written, C70
§6.7 is unsatisfiable while C75 §2.5 is obeyed, and the cheapest resolution available to an
implementer is to stop defaulting to UNKNOWN — i.e. to re-introduce §2.1's defect to satisfy the
Definition of Done.

**Amendment — C70 §6.7, replace:**

> 7. **Provenance is complete at element grain** — every element carries a `ValueProvenance`
>    ([C75 §1.1](C75-PROVENANCE.md)) on every field the per-kind coverage ledger names, and the
>    **UNKNOWN arm always carries a reason**. UNKNOWN is a legitimate terminal state for
>    pre-provenance data and for kinds argued out of scope **on C75 §5's named list**; it is
>    **never** legitimate on a value the system produced in this session (C75 §2.2(a)), and it is
>    **never silently rewritten** into one of the five.

---

## §12 — C75 REGENERATED semantics: the exact data model, and which is canonical

### B-16 · C75 §1.1 / §2.7 / §0 Finding 3 — three unreconciled models, one of which is measured to be unusable

**Problem.** C75 simultaneously requires:
1. **exactly one value** per provenance-bearing value (§1.1);
2. **historical provenance** — REGENERATED *"carries what it replaced"* (§1.1) and *"records
   REGENERATED **and the prior provenance**"* (§2.7);
3. a **provenance graph** — §0 Finding 3 holds up `ProvenanceEdge` as *"provenance as a **graph
   edge** — derivation is a relationship, not a label"*, in a table headed *"to be **copied, not
   reinvented**"*.

It never says which is canonical. Worse, **REGENERATED is a category error as a peer of the other
four.** AUTHORED / OBSERVED / COMPUTED / INFERRED answer *who produced this value*. REGENERATED
answers *when, and over what*. A regenerated value is **still** either COMPUTED or INFERRED — and
by storing `kind = 'REGENERATED'` you **destroy the COMPUTED/INFERRED distinction** that §1.2
calls *"the entire subject of this contract"* and §4.f names as an anti-pattern. The contract's
headline vocabulary contains a member that, when used, commits the contract's headline
anti-pattern.

**Measured**: `ProvenanceEdge` cannot serve as model 3. `fromArtefactId` is regex-pinned to
`/^aia_[0-9a-f-]{36}$/` (`ProvenanceEdge.ts:36`, `:49`) and `edgeKind` is
`artefact-to-element | artefact-to-artefact | cache-derived-from | fallback-from` (`:28–34`).
**Every edge must originate at an AI artefact.** It cannot express "this COMPUTED slab area
superseded that AUTHORED one" at all. C75 §0 Finding 3 cites it as an idiom to copy without
recording that constraint, so an implementer following C75 to `ProvenanceEdge` will discover the
model does not fit only after building on it.

**The decision — canonical model.** **`kind` stays exactly-one; history is a `supersedes` chain
on the record; REGENERATED is a DERIVED PREDICATE, not a stored tag; `ProvenanceEdge` remains the
cross-element AI-lineage graph and is a different axis.** `supersedes` answers *"what did this
value replace"* (temporal, same field); `ProvenanceEdge` answers *"which artefact produced which
element"* (cross-entity, AI-scoped). Neither substitutes for the other, and the contract must say
so or the two will be conflated in the first implementation.

**Amendment — C75 §1.1, replace the REGENERATED bullet, and add §1.5:**

> - ~~**REGENERATED**~~ — **withdrawn as a stored `kind`.** See §1.5. A value that was re-derived
>   is still AUTHORED, OBSERVED, COMPUTED or INFERRED; storing `REGENERATED` in the `kind` slot
>   erases which, and that erasure is §4.f — merging COMPUTED and INFERRED — performed by the
>   vocabulary itself.
>
> **§1.5 — MUST. REGENERATED is a derived predicate over a `supersedes` chain, and the chain is
> canonical.**
> A provenance record MAY carry `supersedes: ValueProvenance`, the record it replaced.
> **`isRegenerated(p) ≡ p.supersedes !== undefined`.** REGENERATED remains the reporting word —
> STR-05 §3 H and C70 fix the five-word vocabulary at the *claim* surface — but it is **computed
> at the read, never stored at the write**, so §1.1's exactly-one and §2.7's history are
> satisfied by one structure instead of two rival ones.
> - The chain is **append-only and depth-preserving**: a second regeneration nests, it does not
>   overwrite. A chain truncated to save space is a silent loss and is a finding.
> - `supersedes` records **temporal replacement of the same field**.
>   `packages/schemas/src/provenance/ProvenanceEdge.ts` records **cross-entity AI lineage** and
>   **cannot express this axis** — its `fromArtefactId` is regex-pinned to `aia_<uuid>`
>   (`:36`, `:49`), so every edge must originate at an AI artefact. The two are **different axes,
>   both canonical for their own axis, and neither is a substitute for the other.** §0 Finding 3's
>   citation of `ProvenanceEdge` is an idiom to learn from, **not** the storage model for value
>   provenance.

---

## §13 — C75's lifecycle boundary, and whether C70 Level 8 is awardable

### B-17 · The walk, step by step

| Step | Created | Lost | Fabricated | Widened | Overwritten | Transformed | Omitted | Governed by |
|---|---|---|---|---|---|---|---|---|
| **construction** | ✔ the only legitimate creation point | — | ✔ §2.2 defaults | — | — | — | ✔ no field to write | C75 §2.2 ✔ |
| **schema (L0)** | — | — | — | — | — | — | ✔ **measured zero fields** (A.4) | C75 §2.4 ✔ |
| **store** | ✔ (today the only site) | — | — | — | — | — | — | C75 §2.4 ✔ (as a prohibition) |
| **snapshot** | — | ✔ **UNGOVERNED — see B-18** | — | — | — | ✔ union→`string` (`roomSnapshotUtils.ts:32`) | ✔ | **GAP** |
| **load** | — | — | ✔ `roomSnapshotUtils.ts:156` | — | — | — | — | C75 §2.1/§2.5 ✔ |
| **regeneration** | — | ✔ **prior chain — see B-26** | — | — | ✔ §2.7 | — | — | C75 §2.7 partial |
| **renderer** | — | — | — | ✔ §2.6 claims only | — | — | — | C75 §2.6 ✔ |
| **AI** | — | — | — | ✔ §2.6 | — | — | ✔ **no rule provenance reaches the answer — B-20** | partial |
| **export** | — | ✔ **total, measured (A.8)** | — | — | — | — | ✔ | **UNPROVEN, §5** |

Three steps are ungoverned or under-governed: **snapshot**, **regeneration** and **export**. The
first is B-17/B-18, the second B-26/B-27, the third B-19.

**Problem (B-17, the snapshot step).** C75 §2.9 defers persistence behaviour to ADR-0319:
*"where they [intersect], **ADR-0319 governs persistence behaviour** and C75 governs the origin
label."* ADR-0319's class 1 (AUTHORITATIVE) names *"authored provenance
(`detectionMethod: 'manual-*'`)"* — **only authored provenance**. Classes 2 and 3 name counters
and timestamps. **Non-authored provenance — COMPUTED, OBSERVED, INFERRED, UNKNOWN, and the entire
`supersedes` chain — is classified by neither document.** C75 defers to ADR-0319; ADR-0319 does
not cover it; ADR-0319's own "Not decided here" closes with *"the schema changes for per-element
provenance, which are BIM 3.0 §7 work and **deliberately not folded into** a BIM 2.0 contract
decision."* Both documents point at each other across a hole.

**Why it matters.** If a `supersedes` chain is classed DERIVED-INCIDENTAL it is **enumerated out
of the comparator** and may legally not round-trip — which silently deletes §2.7's entire
guarantee while `check-identity-roundtrip` stays green. That is not a hypothetical reading; it is
the cheapest reading, because a chain that need not round-trip is a chain that need not be
serialised.

**Amendment — C75 §2.9, append:**

> **The intersection is not empty and neither document may leave it unclassified.** ADR-0319
> classifies only *authored* provenance (class 1). This contract therefore states the classes for
> the rest, and ADR-0319 governs their persistence behaviour once stated:
> **a `ValueProvenance` record is AUTHORITATIVE (class 1) in every arm — including the UNKNOWN
> arm and its reason — and the `supersedes` chain (§1.5) is AUTHORITATIVE for its full depth.**
> Provenance is not derived from the value it describes and cannot be recomputed from it; a
> provenance field that does not round-trip byte-for-byte has been **destroyed, not
> regenerated**. No provenance field may be added to ADR-0319's class-3 enumerated exclusion list.

### B-18 · C75 Authority line / C70 pillar H — the one live provenance store in the runtime is session-only, and C75 does not mention it or its owning contract

**Problem.** C70's Authority line assigns provenance ownership to *"**C23**/C62 (own provenance
and confidence)"*. **C75's Authority line does not peer with C23**, does not mention the C23
substrate, and does not mention `ProvenanceStore` anywhere. Measured (A.6): `ProvenanceStore` is
constructed in the real runtime (`packages/runtime-composer/src/composeRuntime.ts:1044`), typed on
the runtime (`types.ts:3793`), read by the UI (`apps/editor/src/ui/inspect/ProvenanceTab.ts:23`,
`InspectPanel.ts:248`) — and is **six in-memory `Map`s with no `serialize`/`deserialize` and no
persistence importer anywhere in the repo.** Its own docstring says *"One instance per runtime
session."*

**Why it matters.** Three separate harms. **(a)** Ownership: two CANONICAL documents disagree
about who owns provenance, and the contract that claims the vocabulary omits the contract C70
names as owner. **(b)** Falsifiability: C75 §3.3's measured table classes
`site / context / climate / zoning / AI artefacts` as *"rich and disciplined"* — but the AI-artefact
half of that row **does not survive a reload**, and the table does not say so. **(c)** Coverage:
`check-provenance-coverage` is specified over *element kinds*; nothing in C75 measures the
substrate that already exists and already loses its data at save.

**Amendment — C75, Authority line, insert after C62:**

> **C23** (the AI-provenance substrate — owns `AIArtefact`, `ProvenanceEdge`, `ContextSnapshot`
> and the L3 `ProvenanceStore`; **C75 owns the origin of a MODEL VALUE, C23 owns the record of an
> AI CALL**, and the two must not grow rival vocabularies, C69 §3.2)

**Amendment — C75 §3.3, replace the third table row:**

> | site / context / climate / zoning | rich and disciplined (§0 Finding 3) |
> | AI artefacts (C23) | rich in shape, **session-scoped in fact** — `packages/stores/src/ProvenanceStore.ts` is six in-memory maps with no serializer and no persistence caller, so every artefact and every edge is **lost on reload**. Richness of schema is not persistence, and this row may not be cited as coverage. **UNPROVEN** whether any production workflow writes an edge at all: no `addEdge` call site exists outside the store and its tests. |

### B-19 · C70 §4 Level 8 — awardable today with the export mapping entirely absent. It must not be.

**The founder's decisive question, answered: NO — and C70 as written permits it.**

**Problem.** Level 8's award condition reads: *"the eight golden operations each pass their
**full** Golden Chain; provenance answers *who/how* for every element; IFC round-trips **on the
GUID join key**."* Read literally, all three clauses are satisfiable with **zero** provenance in
the export: the Golden Chain's `report` link is about truthful outcome reporting, "provenance
answers who/how" is an **in-model** property, and the IFC clause scopes the round-trip to the GUID
alone. Meanwhile C75 §5 states the export mapping is **UNPROVEN** and *"the largest open risk in
the contract: provenance that stops at the export boundary protects nothing downstream"*, and
C75 §0.1 names the terminal harm: *"how a generated guess ends up in an IFC export as a surveyed
fact."*

**Measured (A.8):** the mapping does not merely lack proof — it does not exist.
`IfcSemanticWriter.ts:36–50` enumerates the exported room payload and `detectionMethod` is not in
it. A room stamped `'auto-topology'` by `roomSnapshotUtils.ts:156` or by the repair path at
`RoomDetectionEngine.ts:475` exports with its origin **dropped**, so the downstream file carries a
guess with no marking at all.

**Why it matters.** Level 8 is the terminal award of the entire programme. If it is awardable
while the boundary that the provenance contract exists to protect is unmapped, then "BIM 3.0
complete" means "complete inside our own process", which is the strongest possible misreading of
the evidence and precisely the class C70 §0 was written to prevent.

**Amendment — C70 §4, Level 8 award-condition cell, replace:**

> the eight golden operations each pass their **full** Golden Chain; provenance answers *who/how*
> for every element **in-model AND across the export boundary** — the mapping required by
> [C75 §5](C75-PROVENANCE.md) exists, is executed, and an **export→re-import round-trip
> preserves each value's `ValueProvenance` arm and its `supersedes` depth, or names the loss**;
> IFC round-trips on the GUID join key. **Level 8 is NOT awardable while C75 §5's export mapping
> is UNPROVEN**, and an accepted-limitation record under C75 §7.7 is a *named, founder-signed
> exception*, never a substitute for the mapping. An exported value stripped of its provenance is
> exported **as authored** by the receiving tool, which is the harm C75 §0.1 names.

**Amendment — C75 §5, third bullet, append:**

> This absence is a **blocking dependency of [C70 §4](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)
> Level 8 and of [C70 §6](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)'s Definition of Done**, not a
> parked nicety. Measured 2026-08-12:
> `packages/file-format/src/export/ifc/IfcSemanticWriter.ts:36–50` exports rooms with no origin
> field of any kind, and the DXF path has none either — so the mapping is not *unproven*, it is
> *absent*, and the two must not be reported with the same word.

### B-20 · C75 §2.6 × C67/C68 — no rule carries provenance into a chat answer

**Problem.** §2.6 forbids a *"chat answer"* presenting a value as more authoritative than its
record. It does not require the chat surface to **have** the record. C68 governs element and
attribute chat onboarding and is mandatory on every PR adding a user-visible attribute; nothing in
C68 or C75 requires that a newly onboarded attribute carry its provenance to the answer.

**Why it matters.** §2.6 is unenforceable at a surface that never receives the field. An attribute
onboarded to chat without provenance produces answers that are *silent* about origin — and per
§0.1's own argument, a value the user cannot distinguish from one they authored is the harm.

**Amendment — C75 §2.6, append:**

> A consumer that **cannot see** a value's provenance may not answer questions about the value as
> though it could. An attribute onboarded to a chat or query surface under
> [C68](C68-ELEMENT-ATTRIBUTE-CHAT-ONBOARDING.md) carries its `ValueProvenance` to that surface in
> the same PR, or the surface answers **UNKNOWN-with-reason** for that attribute's origin.
> Silence about origin is read as authorship.

---

## §14 — C74 × C75: is the sibling distinction complete?

### B-21 · The crux — a mock is deterministic, and COMPUTED means "derived deterministically"

**Problem.** C75 §1.1 defines **COMPUTED** as *"derived deterministically from inputs the system
holds, by a rule that would produce the same output again."* `MockSolver` satisfies that
definition **exactly**: it is a deterministic projection over the constraint set
(`packages/constraint-solver/src/engine.ts:84–85` and following). So a value produced by a
stand-in is **COMPUTED** under C75 as written, and becomes indistinguishable in the model from a
value produced by a real solver.

C74 buys honesty at the **component** boundary (§3.1 identity, §3.2 first-call signal). **Neither
contract carries that honesty into the VALUE.** The moment the stand-in's output is written, C74's
guarantee ends and C75 labels it as if a real engine had run. A user, an exporter and a
regeneration pass all see COMPUTED.

**Does a solver result need both a constraint-work kind and a provenance kind?** Yes, and neither
contract says so. C74 §1.1 classifies the *work*; C75 §1.1 classifies the *value*. The pairing is
never stated, so nothing requires that a SOLVING result be labelled at all.

**Why it matters.** This is the single seam where the two siblings both look complete and
together leave the original defect intact: `PlanegcsAdapter` could be made fully C74-honest —
declare `kind = 'mock'`, emit the first-call signal — and its outputs would still enter the model
as COMPUTED, and C70 G-INV-1 would be green.

**Amendment — C75 §1.1, append to the COMPUTED bullet:**

> **Determinism is necessary but NOT sufficient for COMPUTED.** A stand-in is deterministic
> (`MockSolver` is a deterministic projection), so "it always gives the same answer" does not
> establish COMPUTED. See §1.6 and §2.10.

**Amendment — C75, add §2.10:**

> **§2.10 — MUST. A stand-in's output is never COMPUTED.** A value produced by a component that
> declares itself a stand-in under [C74 §3.2](C74-CONSTRAINT-HONESTY.md) — mock, stub, fake,
> scaffold, or an adapter whose declared identity does not match a real engine — is at best
> **INFERRED**, and its reason **names the stand-in**
> (e.g. `reason: 'stand-in:MockSolver'`). Determinism is not the test: a mock is deterministic by
> design. **C74's honesty at the component boundary is worthless if the value crosses that
> boundary unlabelled**, and this rule is the only thing carrying it across. A component whose
> C74 identity is unknown at write time produces **UNKNOWN-with-reason**, never COMPUTED.

**Amendment — C74, add §3.9 (the reciprocal, so neither contract is the sole carrier):**

> **§3.9 — MUST. A constraint result is labelled at both grains.** Every value a constraint
> component writes into the model carries **both** its C74 kind (§1.1 — what work was performed)
> and its [C75 §1.1](C75-PROVENANCE.md) `ValueProvenance` (where the value came from). They are
> not substitutes: the first is a property of the component, the second of the datum, and a
> component that is honest about itself while its outputs are unlabelled has moved the defect
> one hop downstream rather than fixing it. Where the component is a stand-in (§3.2), C75 §2.10
> governs the label.

### B-22 · C75 §1.1 COMPUTED silently imports C73's determinism obligation without citing it

**Problem.** COMPUTED's definition — *"a rule that would produce the same output again"* — is
C73 §1.1's subject verbatim in substance. C75's Authority line does **not** peer with C73. So a
value can be labelled COMPUTED by a path that C73 §1.2 forbids (iteration-order-dependent,
unstable sort, wall-clock) with nothing to catch it: `check-provenance-not-invented` checks
*shape*, and its own §6.3(a) concedes it cannot see *"honesty of authorship"*.

**Amendment — C75, Authority line, insert:**

> **C73** (geometry determinism & tolerance — owns what "deterministic" means; **COMPUTED
> (§1.1) is a claim under C73 §1.1/§1.2 and inherits its prohibitions**, so a value derived by a
> path C73 §1.2 forbids may not be labelled COMPUTED)

---

## §15 — C73 × C75: `authoritative input → heuristic repair → new geometry`

The founder's six questions, asked of `RoomDetectionEngine.ts:452–475` — the contracts' own worked
example. **Four of six are not uniquely determined.**

| # | Question | Determined? |
|---|---|---|
| 1 | Was it deterministic (C73)? | **Yes** — `repairToSimplePolygon` is deterministic code; C73 §1.1 is satisfied |
| 2 | Was it derived from authoritative inputs (C75)? | **Yes** — the inputs are the wall graph |
| 3 | Was it a repair/guess (C75)? | **AMBIGUOUS** — §2.3 says INFERRED; §1.1's COMPUTED definition also fits, because (1)+(2) hold. **B-23** |
| 4 | Can it be exported as authored? | **UNDETERMINED** — no export mapping exists (A.8, B-19) |
| 5 | Can it be regenerated (C73/C75)? | **AMBIGUOUS** — C73 REGENERABLE and C75 REGENERATED are different axes with near-identical names and no cross-reference. **B-25** |
| 6 | What if repair is impossible (refusal)? | **CONFLICTING** — C73 §4.1 says refuse; C75 §2.3 says record INFERRED and proceed. **B-24** |

### B-23 · C75 §1.1 — the COMPUTED/INFERRED boundary is drawn on "deterministic", which does not separate them

**Problem.** §1.2 declares the COMPUTED/INFERRED distinction *"the entire subject of this
contract"* and §4.f makes merging them an anti-pattern. But the **definitions themselves** produce
the merge: COMPUTED = "derived deterministically … would produce the same output again"; the
heuristic repair *is* deterministic and *would* produce the same output again. §1.1 lists
"heuristic repair" under INFERRED and §2.3 confirms it — so the contract asserts the answer while
its own criterion yields the opposite one.

**The real separator** is not determinism but **entailment**: does a *unique correct* output
follow from the inputs, or did the procedure **choose** among several admissible outputs?
"The largest simple ring" is a choice among rings; a slab from a boundary is an entailment.

**Amendment — C75 §1.1, replace the COMPUTED and INFERRED bullets:**

> - **COMPUTED** — **entailed** by inputs the system holds: a unique correct output follows from
>   them, and the rule that produced it is deterministic (C73 §1.1/§1.2). *Both* conditions are
>   required. Topology detection, a slab from a boundary, a quantity takeoff.
> - **INFERRED** — the procedure **chose** among several admissible outputs, or produced an output
>   the inputs do not entail: AI generation, heuristic repair, a defaulted assumption.
>   **Plausible, not entailed.** A procedure may be perfectly deterministic and still be INFERRED
>   — `repairToSimplePolygon` returns "the largest simple ring", which is a **choice among rings**,
>   not the unique ring the inputs entail. **The test is entailment, not repeatability**; using
>   repeatability is how §4.f's merge is produced by the definitions themselves.

### B-24 · C73 §4.1 vs C75 §2.3 — the same code site is told to refuse and to proceed

**Problem.** C73 §4.1: *"When a geometric operation **cannot produce a correct result**, it
**refuses** … It does not silently produce an approximation."* A heuristic repair by definition
cannot produce a *correct* result — that is what makes it heuristic. C75 §2.3: *"Any pass that
substitutes geometry … writes **INFERRED** plus the reason … **Where the substitution cannot be
recorded**, the correct behaviour is … **refuse**."* C75 makes refusal the *fallback* once
recording is possible; C73 makes refusal the *rule*. Both cite the same sibling precedent
(`SlabFragmentBuilder.ts:706`) for opposite conclusions, at the same file
(`RoomDetectionEngine.ts:454`), and both are MUSTs.

**Why it matters.** Once the provenance field ships, an implementer can satisfy C75 §2.3 by
recording INFERRED and shipping the repaired ring — while C73 §4.1 forbids exactly that. The
question "may a heuristic repair ship at all?" has no determined answer, and it is the central
question of the worked example both contracts use.

**Amendment — C73 §4.1, append the precedence rule (C73 owns geometry, so it states it):**

> **Refusal and recording are not alternatives, and the order is fixed.** Where an operation
> cannot produce a correct result but **can** produce a *bounded, admissible* one, it may proceed
> **only if all three hold**: (a) the substitution is recorded in the **model** as INFERRED with
> its reason ([C75 §2.3](C75-PROVENANCE.md)) — the console is not the model; (b) the substitution
> is **bounded and named** (which construction, at what measurement), per §4.4; and (c) the
> operation is **not on a path whose output is treated as authoritative geometry by a downstream
> consumer that cannot read provenance** — which, until [C75 §5](C75-PROVENANCE.md)'s export
> mapping exists, includes **every export path**. If any of the three fails, **§4.1 governs and
> the operation refuses.** C75 §2.3's "record it" is the licence for (a); it is not a licence to
> skip (b) or (c).

### B-25 · C73 §1.3 / C75 §1.1 / C71 §1.2 — three near-identical words, three meanings, no disambiguation

**Problem.** **C73 REGENERABLE** = a round-trip reaches a fixed point (§1.3). **C75 REGENERATED**
= a value was re-derived over a prior one (§1.1/§2.7). **C71 §1.2 semantic 4 "regenerated"** =
an edge is rebuilt on load rather than persisted. Three contracts, three axes, one word-stem, zero
cross-references. C71 §3.3 states this repo's own doctrine on exactly this hazard: *"One letter of
edit distance … is a review hazard … **The near-miss name is worse than a new name**."* The suite
violates it against itself.

**Why it matters.** In §15's worked example, the repaired boundary is C73-REGENERABLE (a rebuild
reproduces it), is **not** C75-REGENERATED (nothing prior was overwritten), and its `boundedBy`
edges are C71-regenerated. All three statements are true simultaneously and a reader will conflate
at least two.

**Amendment — add to C75 §1.5 (and cite from C73 §1.3 and C71 §1.2):**

> **Three near-identical terms exist in this suite and mean three different things. Cite the
> contract with the word, always:**
> **C73-REGENERABLE** — a round-trip reaches a fixed point (a property of a *field's* serialize
> behaviour, C73 §1.3). **C75-REGENERATED** — this value replaced a prior one and carries it
> (a property of a *value's history*, §1.5). **C71-regenerated** — this edge is rebuilt on load
> rather than persisted (a *rebuild disposition*, C71 §1.2 semantic 4). A field may be
> C73-REGENERABLE and not C75-REGENERATED, and vice versa. Per **C71 §3.3**, a near-miss name is
> worse than a new name; these three were minted independently and the disambiguation is
> therefore mandatory rather than optional.

---

## §16 — C72 × C75: does regeneration preserve prior provenance?

### B-26 · C72 §3.1 — a propagated recompute expressed as remove-then-add destroys history by construction, and no contract forbids it

**Problem.** The founder's test case: `AUTHORED → propagated recompute → overwritten value`.
C75 §2.7 requires REGENERATED plus prior provenance. **C72 never mentions provenance.** Its
pre-mutation vehicle is `prevState`, which is:
- **transient** — an optional third callback argument (`SlabStore.ts:31`, `:167`), never persisted,
  never a record;
- **absent on `add`** by explicit rule — §3.1: *"absent on `add`; there is no prior state."*

So a regeneration implemented as **remove-then-add** carries no `prevState` at all, and nothing in
C72 forbids expressing a recompute that way. C72 §2.4 in fact *protects* the bespoke rebuild
paths, and `SlabStore.triggerRebuild` (`:299–307`) emits a bare `bim-slab-updated` with only
`{ id }` and, per its own comment (`:295–298`), *"does NOT emit on storeEventBus because it carries
no semantic change."* A rebuild that a store declares carries no semantic change is precisely
where an AUTHORED value can be replaced with no record of the replacement.

**Why it matters.** C75 §2.7 calls silent overwrite of a user's decision *"the most expensive form
of this defect and the hardest to detect after the fact."* C72 — the contract that owns how the
change arrives — permits the arrival shape that guarantees it. Neither contract cross-references
the other on this; C72's Authority line peers with C73 (*"owns what the recompute must produce"*)
and **not with C75**.

**Amendment — C72, Authority line, insert:**

> **C75** (provenance — owns the **origin** of the value a recompute writes; a propagation path
> that overwrites a value without carrying its prior `ValueProvenance` violates
> [C75 §2.7](C75-PROVENANCE.md), and this contract's `prevState` is **not** that record)

**Amendment — C72, add §3.6:**

> **§3.6 — MUST NOT. A recompute may not launder away a value's history by changing its arrival
> shape.** `prevState` is a **transient diff vehicle**, not a provenance record: it is optional,
> unpersisted, and absent on `add` by §3.1. Therefore a propagated recompute expressed as
> **remove-then-add**, as a whole-level rebuild, or as a `triggerRebuild` that its own store
> declares carries "no semantic change", **still overwrites the target's provenance** and is
> governed by [C75 §2.7/§1.5](C75-PROVENANCE.md): the prior `ValueProvenance` is carried into the
> new record's `supersedes` chain. **The propagation mechanism may not be chosen to avoid the
> record.** A rebuild path that cannot carry the chain **refuses** and names the values it would
> have overwritten (C73 §4.1) — it does not proceed quietly.

### B-27 · C75 §2.7 vs §1.1 — the trigger is narrower than the vocabulary, so regeneration chains lose depth

**Problem.** §1.1's REGENERATED reads *"**previously one of the above**, then re-derived by a later
pass"* — any of the five. §2.7's obligation fires only on *"a pass that overwrites an **AUTHORED**
value."* So COMPUTED→COMPUTED, INFERRED→INFERRED and INFERRED→COMPUTED overwrites require **no
record at all**, and a chain of regenerations over a non-authored value has depth 0 forever.

**Why it matters.** The §15 case is exactly this: a repaired (INFERRED) boundary re-repaired by a
later pass. Under §2.7 nothing is recorded, so the model cannot show that a guess was made twice
— and the second guess is indistinguishable from a first-pass derivation. It also breaks §1.5's
append-only chain before it is built.

**Amendment — C75 §2.7, replace:**

> **§2.7 — MUST. Regeneration carries what it replaced, whatever it replaced.** A pass that
> overwrites **any** existing `ValueProvenance` — AUTHORED, OBSERVED, COMPUTED, INFERRED, or an
> UNKNOWN arm — records the new origin and nests the prior record in `supersedes` (§1.5). The
> chain is depth-preserving: a second regeneration nests, it does not replace. Restricting this
> to AUTHORED values would leave a guess re-guessed indistinguishable from a first derivation.
> **Overwriting an AUTHORED value additionally requires the overwrite be user-visible** — silently
> replacing a user's decision with a generated one is the most expensive form of this defect and
> the hardest to detect after the fact.

---

## §18 — Negative tests: one row per gate named by C71–C75

Negative-testing is treated here as a **cross-contract invariant**, not an implementation detail:
C70 §5.6 already states the general form (*"Every comparator in the evidence set is watched go red
against a tampered state before it is trusted"*), C74 §6.2 and C75 §6.2 restate it locally, and
**C71 §6, C72 §6 and C73 §5 do not state it at all**.

| Gate | Contract | Exists at HEAD | Positive evidence | Negative fixture | Expected exit | Failure text recorded? |
|---|---|---|---|---|---|---|
| `check-graph-write-coverage` | C71 §6 | **NO** | — | — | — | **NO — no requirement stated in C71** |
| `check-graph-delete-integrity` | C71 §6 | **NO** | — | — | — | **NO — none stated** |
| `check-graph-persistence` | C71 §6 | **NO** | — | — | — | **NO — none stated** |
| `check-propagation-reaches` | C72 §6.1 | **YES** (`…/certification/gates/`, 180 ln) | executed: 8 findings / 8 declared; floors printed (`:53`, `:59–70`) | **NONE** — the word "negative" at `:17` means *false negative*, not a control | 1 DECLARED-LEVEL | **NO** |
| `check-propagation-trackers-reach` | **not named by C72** — closes C72 §6.1.2(d) | **YES** (commit `bbff7030`) | drives real mutations, reads back independently (`:22–24`) | negative control **N3** cited in-file (`:38–41`) | — | partial — controls named, text not transcribed |
| `check-prevstate-contract` | C72 §6.2 | **NO** | — | — | — | **NO — none stated** |
| `check-suppression-is-reversible` | C72 §6.3 | **NO** | — | — | — | **NO — none stated** |
| `check-epsilon-policy` | C73 §5.1 | **YES** (475 ln) — **C73 says NOT BUILT in two places** | prints recipe + histogram each run | planted tree (`:306–307`), `const EPS = 0.05` must appear in both ledgers (`:93`) | 1 / 2 on floor | **YES** (`:318–331`, `:371`) |
| `check-predicate-canonical` | C73 §5.2 | **NO** | — | — | — | **NO — none stated** |
| `check-deterministic-regeneration` | C73 §5.3 | **NO** | — | — | — | **NO — none stated** |
| `check-constraint-honesty` | C74 §6 | **NO** | — | — | — | required by C74 §6.2 — **unsatisfiable, gate absent** |
| `check-solver-is-real` | C74 §6 | **YES** (544 ln) — **C74 says UNBUILT** | executed: floors 170 manifests / 4485 files / 3 adapters / 1 control | planted `GhostAdapter` `kind='ghostgcs'` (`:418–420`, `:467`) | 1 DECLARED-LEVEL (4/4) | **YES** — `✗ BLIND COMPARATOR — <arm> did not fire…` (`:477`) |
| `check-no-hidden-mock` | C74 §6 | **NO** | — | — | — | required by §6.2 — **unsatisfiable** |
| `check-provenance-not-invented` | C75 §6 | **YES** (509 ln) — **C75 says UNBUILT** | executed: floors 4485 files / 20 vocabularies / 10 fields / 1 control | planted `\|\| 'observed'` + repair path (`:384`, `:440`) | 1 DECLARED-LEVEL (7/7) | **YES** (`:450`) |
| `check-provenance-coverage` | C75 §6 | **NO** | — | — | — | required by §6.2 — **unsatisfiable** |
| `check-derived-not-authored` | C75 §6 | **NO** | — | — | — | required by §6.2 — **unsatisfiable** |

### B-28 · Negative-testing is stated in three of six contracts, and where stated it is recorded in the wrong place

**Problem, three parts.**
1. **C71 §6, C72 §6 and C73 §5 contain no negative-test requirement.** A reader of C71 alone —
   the contract that owns three unbuilt gates — has no instruction to negative-test them. C70 §5.6
   binds *"every comparator in the evidence set"*, but neither C71, C72 nor C73 cites it, and
   §5.6's phrasing ("in the evidence set") is narrow enough that a reader may not take a source
   gate to be in scope.
2. **C74 §6.2 and C75 §6.2 both say the failure text is *"recorded here"*** — i.e. transcribed
   into the contract. That contradicts **C70 §0.2** (*"No section … may restate a measured count …
   Cite the evidence appendix, or the gate's own output"*), and the two gates that exist already
   do the right thing: they **print the control result on every run**
   (`check-solver-is-real.ts:469–477`, `check-provenance-not-invented.ts:442–450`).
3. **Three of the four existing gates in scope have no negative control at all**:
   `check-propagation-reaches`, `check-derived-regenerable`, `check-identity-roundtrip` — and
   `check-propagation-reaches` is the one gate on `gate-debt.json`, i.e. the one whose greenness is
   already load-bearing for a declared level.

**Amendment — add verbatim to C71 §6, C72 §6 and C73 §5 (as §6.3 / §6.4 / §5.5 respectively):**

> **MUST. Every arm is negative-tested before it is trusted.** An arm is watched failing against a
> deliberately planted violation, and the control **runs on every invocation and prints its own
> result** — `negative control (planted tree): N finding(s), arms fired = […]` plus a clean-tree
> positive control that must read 0. An arm never watched failing is **UNPROVEN** and may not be
> cited as coverage; a run in which **zero** controls passed is a **blind comparator** and exits
> **2**, never 0. This is [C70 §5.6](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) applied to source
> gates as well as to certification comparators, and it is a **cross-contract invariant of the
> BIM 3.0 suite**, not a per-gate implementation choice.

**Amendment — C74 §6.2 and C75 §6.2, replace "with the failure text recorded here":**

> — with the control **executed on every run and its result printed by the gate itself**. The
> failure text lives in the gate's output, **never transcribed into this contract**
> ([C70 §0.2](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md): counts and outputs rot in documents and do
> not rot in gates).

**Amendment — C72 §6.1 table, add a row:**

> | **controls** | exit **2** | a planted-tree negative control and a clean-tree positive control, executed and printed each run. `check-propagation-reaches` has **none today**, and it is the one gate in this suite already carrying a declared-level entry on `gate-debt.json` — a gate whose greenness is load-bearing and whose ability to fail is unproven is C74 §0's mechanism in this contract's own subsystem. |

---

## §19 — Silent failure as success: one consolidated list across all six

`✔` = a binding rule exists · `~` = named as a *finding* but not stated as a rule · `✖` = silent.

| Failure disguised as success | C70 | C71 | C72 | C73 | C74 | C75 |
|---|---|---|---|---|---|---|
| `[]` means failure | ✔ L-INV-1 | ✔ §4.4, §7.h | ✔ §2.3 | ✔ §4.3, §7.i | ✔ §3.3 (by ref) | **✖ B-29a** |
| `null` / `0` mean failure | ✔ L-INV-1 | ✔ §4.4 | ~ | ✔ §4.3 | ✔ §3.3 | ✖ |
| **`undefined` means failure** | **✖ B-29b** | ~ §0 (`getEdgesFromNode?.() ?? []`) | ✖ | ✖ | ✖ | ✖ |
| **empty object means failure** | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ **B-29c** |
| missing provenance means authored | ✔ §6.7 | — | — | — | — | ✔ §1.4, §2.1 |
| missing dependency means mock | — | — | — | — | ✔ §3.7 (weak, B-06) | — |
| missing listener means propagation | ✔ F-INV-1 | — | ✔ §1.1, §1.2 | — | — | — |
| missing graph writer means zero relationships | ✔ C-INV-1 | ✔ §5.2 | — | — | — | — |
| zero scanned files means zero defects | ✔ §5.2 | ✔ §6 floors | ✔ §6.1 floors | ✔ E0/C0/D0 | ✔ §6.1 | ~ §6.1 **B-29d** |
| zero comparisons means zero divergences | ✔ §5.2 | ✔ §6 floor | ✔ | ✔ D0 | ~ | **✖ — no comparator arm** |
| absent export mapping means provenance preserved | **✖ B-19** | — | — | — | — | ✔ §5 (UNPROVEN) |
| absent runtime probe means capability exists | ✔ §7.3(a), §4.2 | ✔ §5.8, §6.2(a) | ✔ §6.1.2 | ✔ §5.4(b)(c) | ✔ §6.3(a) | ✔ §6.3(b) |

**The six DO agree on the two that matter most** — *zero scanned files* and *absent runtime probe*
are covered in all six. They **disagree or are silent on four.**

### B-29 · Four inconsistencies in the failure/absence/unknown/zero doctrine

**(a) C75 has no `[]`/`null` rule at all.** Every other contract states one; C75's nearest is §1.4,
which is about a *field*, not a *return value*. A provenance query returning `[]` for "no records
found" and `[]` for "the store was never populated" is the `contains` defect (C71 §5.2) in the
provenance domain, and C75 cannot name it. Measured: `ProvenanceStore` is a set of `Map`s with no
distinction between "empty" and "never written" (A.6), and there is no production `addEdge` caller.

**(b) `undefined` is absent from every contract, and it is the failure mode that has actually
fired twice.** C70 L-INV-1 enumerates *"`[]`/`null`/`0`"* — not `undefined`, and not the
`?.() ?? []` idiom. C71 §0 records **two** production read paths permanently returning `[]` through
exactly that idiom (`HierarchyTreePanel` on `getEdgesFromNode`, `SpeculativeEngine` on `getEdges`,
both methods that have never existed), and the Furniture group *"has never rendered"*. The corpus's
best-evidenced silent failure is the one the rule does not name.

**(c) Empty object is unmentioned in all six.**

**(d) C75 §6.1 is the only floor clause that does not say "exit 2".** C74 §6.1 says *"exits **2**,
never 0"*; C75 §6.1 says *"is **misconfigured**, not passing"* and cites C69 §3.5. Under C70 §5.1
the difference is material — 2 is **NEVER absorbable as debt**, and a floor that produces a
generic "misconfigured" without pinning the code can be absorbed.

**Amendment — C70 §2 L-INV-1, replace:**

> **L-INV-1** no production API returns `[]`, `null`, `0`, `undefined`, or an empty object to mean
> *"I could not answer"* — **and an optional call on a method that does not exist
> (`x.foo?.(…) ?? []`) is this defect in its most durable form**: it type-checks, it never throws,
> and it returns the empty answer forever. Two production read paths in this repository did
> exactly that, undetected, for months ([C71 §0](C71-GRAPH-AND-TOPOLOGY.md)). **Failure,
> absence, unknown and zero are four different states and must be four different values.**

**Amendment — C75, add §2.11:**

> **§2.11 — MUST. A provenance query distinguishes four states.** *"No record for this value"*,
> *"this value's origin is UNKNOWN-with-reason"*, *"the store holds nothing"* and *"the store was
> never populated"* are four different answers. `[]`, `null` and `undefined` may only ever mean
> **zero results over an established subject**; a query that could not establish its subject
> refuses with a named reason ([C70 L-INV-1](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md),
> [C71 §4.4](C71-GRAPH-AND-TOPOLOGY.md)). C75 previously stated this only for *fields* (§1.4);
> it binds equally to **reads**, and `packages/stores/src/ProvenanceStore.ts` is the standing
> subject.

**Amendment — C75 §6.1, replace "is misconfigured, not passing":**

> **exits 2**, never 0 — MISCONFIGURED is **never absorbable as declared debt**
> ([C70 §5.1](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)), and a floor clause that names the state
> without pinning the exit code can be absorbed by a runner that maps it to 1.

---

## §20 — Looks complete but isn't reachable — and C75 does not receive the lens

### B-30 · C75 is the only one of the six with no reader/consumer arm — it reproduces the `sitsOn` defect verbatim

**Problem.** Every sibling applies the reachability lens: C70 §4.2/§7.3(a); C71 §0 (*"a census of
either side is worthless"*), §5.1, §5.8, §6.2(a); C72 §0.1, §4.3, §5.2, §8.h; C73 §3.6/§7.h
(*"the shipping consumer is identified by name"*); C74 §3.8/§5.h. **C75 has no equivalent.** It
has no anti-pattern for authored-but-unwired, no rule that a provenance field must have a typed
production **reader**, and its coverage gate is specified writer-side only: §6's
`check-provenance-coverage` asserts *"whether a provenance field **exists** in `packages/schemas`
and **is populated on every construction path**"*.

**Why it matters.** That is precisely the census C71 §0 records as having graded `sitsOn` healthy:
*"`sitsOn` was the most-written edge in the graph and had no typed reader at all … a **writer
census alone graded it healthy**. It was not."* C75 is specifying the writer census. If every
element kind gains a populated provenance field and nothing typed-reads it, the coverage ratchet
reaches its target and C70 §6.7 reads satisfied while no user, exporter or AI answer is any better
informed. Measured: the fields that exist today already have this shape — `detectionMethod` is
written by the room/floor/ceiling family and is read by **no export path at all** (A.8).

**Amendment — C75 §3, add §3.4:**

> **§3.4 — MUST. Coverage is writer AND typed reader, counted separately.** A kind counts as
> covered only when its provenance field has **≥1 production writer on every construction path
> AND ≥1 typed production reader whose computation the value feeds** — an untyped sweep, a
> debug panel, or a serializer that copies the field through is **not** a reader
> ([C71 §1.3](C71-GRAPH-AND-TOPOLOGY.md)). The two counts are reported **separately and never
> merged**: a writer census alone graded `sitsOn` healthy for months
> ([C71 §0](C71-GRAPH-AND-TOPOLOGY.md)), and a provenance field written everywhere and read
> nowhere is the same defect with a different name. **A field whose only reader is the exporter
> that does not yet exist has zero readers**, and the ledger says so.

**Amendment — C75 §4, add:**

> - **§4.j — A provenance field with a writer and no typed reader.** §3.4. This is `sitsOn`
>   (C71 §0), manufactured in the provenance domain.
> - **§4.k — Auditing existence instead of reachability.** The lens every sibling contract
>   applies; C75 is bound by it too.

### B-31 · C75 §1.4 and §2.5 bind the whole contract's UNKNOWN idiom to an artefact that is DRAFT, unwired, and deliberately unexported

**Problem.** §1.4 (*"in the ADR-0280 / `DataConfidence` idiom"*), §2.5 (the migration default), and
§0 Finding 3 (first row of the idioms-to-copy table) all anchor to
`packages/schemas/src/site/metadata/DataConfidence.ts`. Measured (A.7), that file's own header at
`:26–28` records: **STATUS DRAFT**, **ADR-0280 PROPOSED**, and *"NOT yet wired into consumers and
deliberately NOT re-exported from the site barrel."*

**Why it matters.** A CANONICAL contract's binding rule rests on a DRAFT artefact governed by a
PROPOSED ADR that is unreachable from its own package barrel. This is the defect ADR-0319's own
status note flags in the other direction (*"the certification had gone green under a PROPOSED
governance act"*). C75 never records the dependency's status, so a reader takes the idiom to be
settled.

**Amendment — C75 §1.4, append:**

> **The idiom's own status, stated so it is not inherited by assumption**:
> `packages/schemas/src/site/metadata/DataConfidence.ts:26–28` records itself **DRAFT** under
> **ADR-0280 (PROPOSED)**, *"NOT yet wired into consumers and deliberately NOT re-exported from
> the site barrel."* This contract **copies the shape** (`value | null` paired with an enumerated
> `unknownReason`, `unknownEnvelope<T>()` at `:200–202`) and does **not** inherit its status:
> `ValueProvenance` (§1.1.1) lands in `packages/schemas` as **CANONICAL and barrel-exported**, or
> §2.4 is unmet. **Ratifying ADR-0280 is a named prerequisite of C75 §7.3**, not a background
> assumption.

### B-32 · C75 §0 Finding 3's idiom table cites artefacts with declared-but-never-written fields

**Problem.** `AIArtefact` is row 5 of the "copy, don't reinvent" table. Measured, `AIArtefact.ts`
(175 lines) has **no `humanApproval` field** — yet `packages/schemas/src/site/zoning/
ExtractionProvenance.ts:80` and `packages/schemas/src/site/zoning/ProvenanceFlags.ts:60` both
reference `AIArtefact.humanApproval` in prose. Two schema files document a field that does not
exist, inside the idiom set C75 holds up as the discipline to copy.

**Why it matters.** C72 §0.1 is the general rule — *"a typed declaration is not wiring"* — and this
is one step weaker still: **prose in a schema file referencing a field that was never written.**
An implementer copying the idiom will copy the reference.

**Amendment — C75 §0 Finding 3, append below the table:**

> **These idioms are cited for their SHAPE, and their reachability is not inherited.** Measured
> 2026-08-12: `DataConfidence.ts` is DRAFT and unexported (§1.4); `AIArtefact` is referenced as
> carrying a `humanApproval` field by `ExtractionProvenance.ts:80` and `ProvenanceFlags.ts:60`
> and **has no such field**; and `ProvenanceEdge` has **no production writer** — no `addEdge`
> call site exists outside `ProvenanceStore.ts` and its tests (**UNPROVEN** whether any workflow
> records an edge at runtime). Copying an idiom **copies its shape, never its status**, and each
> of these is on the §3 named ledger in its own right.

### B-33 · Consolidated reachability audit of C75's own subject matter

Applying the founder's §20 checklist to C75 specifically, which C75 does not do for itself:

| Lens | C75's subject matter — measured |
|---|---|
| exported but unused | `DataConfidence.ts` — deliberately **not** re-exported from the site barrel (`:26–28`) |
| registered but never consumed | `ProvenanceEdge` — one production importer (`ProvenanceStore.ts`), **no production writer** |
| tested but not production-bound | **UNPROVEN** — not established either way for `provenance-commands/*` |
| declared but never written | `AIArtefact.humanApproval` — referenced in two schema files, does not exist |
| emitted but never listened to | `ProvenanceStore._listeners` (`:46`) — consumer set **UNPROVEN** |
| canonical implementation shipping code never calls | the five-value union — **does not exist at all** (A.4) |
| **a provenance field that exists only in a non-L0 package** | **`detectionMethod`** — `packages/room-topology`, `packages/core-app-model`; **zero hits in `packages/schemas`**. This is C75 §2.4's own subject and is the contract's central measured gap |
| a gate file outside the suite that certifies it | **YES** — `check-provenance-not-invented.ts` lives in `tools/ga-gate/`, not in `tools/rac-conformance/certification/gates/`. **C70 §7.2 records this split as a finding**, and C75 §6 does not acknowledge it |
| a worker path with no production caller | not applicable to C75 (it is C74 §3.8's `createWorkerHandler`, confirmed by the executed gate: *"ZERO production callers"*) |

**Amendment — C75 §6, add §6.4:**

> **§6.4 — MUST. This contract's gates are subject to the same reachability lens as their
> subject.** `check-provenance-not-invented.ts` ships under `tools/ga-gate/`, not under
> `tools/rac-conformance/certification/gates/` where the BIM 3.0 gates that decide C70 invariants
> live. [C70 §7.2](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) records that split as a **finding, not a
> blessing** — *"two suites with two exit-code implementations is how the four-exit-code contract
> quietly becomes two contracts"* — and it applies to this contract's gates. Either the gate moves
> into the certification suite, or the split is named here with the reason and carried on
> [C70 §7.2](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)'s finding.

---

## §B — What PART B could not establish (UNPROVEN)

Recorded so absence is never inferred from omission.

1. **Whether `engine.ts:474–478`'s dynamic import resolves at runtime**, and therefore whether the
   `kind='planegcs'` adapter is reachable in production. Dynamic `import()` inside a
   `Function`-constructed body has no module referrer and resolution is realm-dependent. Neither
   branch was executed. **UNPROVEN — and the undecidability is itself finding B-09.**
2. **Whether any production workflow ever writes a `ProvenanceEdge`.** No `addEdge` call site
   exists outside `ProvenanceStore.ts:157` and its tests; a runtime probe was not run.
3. **Whether `packages/stores/src/provenance-commands/*` are reachable from a bus verb.** Not
   traced.
4. **Whether the three certification-suite gates that lack negative controls
   (`check-propagation-reaches`, `check-derived-regenerable`, `check-identity-roundtrip`) are
   *capable* of failing.** Not tampered; per C70 §5.6 they are therefore **UNPROVEN as
   comparators**, which is the same standing this review applies to any untested arm.
5. **Whether C73's §5.1 "SPECIFIED, NOT BUILT" heading or its §0.1 amendment is the intended
   reading.** `check-epsilon-policy.ts` exists (475 lines); the contract says both. Recorded here
   because it determines the §18 table; the internal-consistency finding on C73 in isolation may
   belong to PART A.
