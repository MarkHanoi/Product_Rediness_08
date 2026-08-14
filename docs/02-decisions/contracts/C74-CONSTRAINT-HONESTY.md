# C74 — Constraint Honesty

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: every component in this repository that answers a constraint question — validators, commit-time gates, advisory rule registries, and solvers. Owns the rule that a component's **reported identity must equal its performed work**, the vocabulary that distinguishes the four kinds of constraint work, and the requirement that a stand-in be detectable from outside itself. Does **not** own the constraint *semantics* of any element family — those stay with the owning contract.
> **Key principle**: *No adapter may report a solve it did not perform.* A green test suite whose subject is a stub is byte-for-byte indistinguishable from a green suite whose subject works. The only cure is to make the stub say so, out loud, at its own boundary.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C03** (schemas/commands/state — owns what a command *is* and what may mutate a store), **C11** (element creation pipeline — owns where in creation a gate may refuse), **C15** (hosted elements — owns the wall-occupancy domain rule this contract only requires be *told the truth about*), **C16** (command authoring — owns how a refusal is written), **C58**/**C64** (zoning + envelope compiler — own the refusal-union idiom C74 generalises), **C66** (concurrency & scale — owns the CLAIMED-vs-MEASURED distinction this contract applies to solvers), **C75** (provenance — the data-side sibling: C74 governs *did the work happen*, C75 governs *where did the value come from*). Supersedes nothing.
> **Gate**: `tools/ga-gate/check-constraint-honesty.ts`, `tools/ga-gate/check-solver-is-real.ts`, `tools/ga-gate/check-no-hidden-mock.ts` — **all three UNBUILT at stamp time** (§6).
> **Changelog**: 2026-08-12 — created, as the BIM 3.0 suite's answer to a Phase 0 sweep that found the constraint solver shipping a mock behind 31 passing tests.

---

## §0 — Why this contract exists

The Phase 0 sweep did not find a broken solver. It found a solver that **was never
there**, wearing the name of one, passing tests, exported from a barrel, and dated
against a milestone nobody was tracking. Measured at HEAD:

- `packages/constraint-solver/src/PlanegcsAdapter.ts:95` —
  `this.underlying = opts.underlying ?? new MockSolver();`. Every `solve()` and
  `diagnose()` is a one-line delegation to the mock (`:99`, `:103`).
- The same class declares `readonly kind = 'planegcs' as const;` (`:85`). **This is the
  defect in one line.** `MockSolver` is honest — it declares `kind = 'mock'`
  (`engine.ts:84–85`). The adapter takes the mock's behaviour and puts the real solver's
  name on it. A caller that inspects `kind` — the only externally visible identity the
  `SolverPorter` shape offers — is told `planegcs` and gets projection arithmetic.
- `loadSolver()` returns `new MockSolver()` on **both** paths: the no-URL miss
  (`engine.ts:468`) and the fall-through after the URL *is* supplied
  (`engine.ts:483`, guarded by the comment `// Real adapter lands at S53 D1; for now fall
  through.`). Supplying `PLANEGCS_WASM_URL` — the one action a caller could take to ask
  for the real thing — changes nothing and reports nothing.
- **`planegcs` is not a dependency of anything.** `grep '"planegcs"' --include=package.json`
  → **0 hits** repo-wide. There is no WASM module to bind, in any workspace, at any version.
- `createWorkerHandler` — the off-thread solve path — has **zero production callers**.
  Ten hits total: the definition (`worker.ts:61`), the barrel re-export (`index.ts:37`),
  three doc comments, and five test lines. Nothing dispatches to it.
- The adapter's own header still reads *"S52 D1 SCAFFOLD … the actual planegcs WASM
  binding lands at S52 D2"* while `engine.ts` says **S53 D1** in four places. The scaffold
  and its selector disagree about which milestone is supposed to retire the scaffold,
  which is what an untracked scaffold looks like.
- **The 31 of 33 passing tests test the mock.** `PlanegcsAdapter.test.ts` verifies
  delegation by *injecting* `opts.underlying` — the field whose docstring says
  *"Production callers MUST NOT pass this"*. So the tests exercise the one configuration
  production never uses, and the configuration production *does* use (the `??` fallback)
  is the untested one.

**This repository has now been bitten by the same defect five times in a single
session**, and the list is the argument for a contract rather than a bug fix:

1. a headless suite whose subject was mocked, so it proved the mock;
2. this solver — a mock behind a real name, for months;
3. a compile gate that **fabricated ~90 PASS lines per run** without compiling;
4. tests that built `prevState` by hand, and therefore structurally could not observe a
   missing argument at the seam they existed to cover;
5. a certification whose **empty seed scored better than any real run** (`e5addac8`).

Five different subsystems, one mechanism: *a measurement whose subject was not the thing
being claimed.* C66 §1.1 already forbids writing a claim the way a measurement is
written. C74 is the same rule pushed one level down — into the component being measured,
which must not be able to impersonate the component it stands in for.

> **§0.1 — what this contract is NOT.** It is **not** a mandate to build a geometric
> constraint solver. See §4. The founder's rule is explicit: *do not build a solver
> because "BIM 3.0 sounds like it needs one."*

---

## §1 — The four kinds of constraint work

A "constraint" in this codebase means four structurally different things. Conflating them
is how a repo talks itself into needing a solver.

> **§1.1 — MUST.** Every constraint in the system is classified as exactly one of:
>
> - **VALIDATION** — a predicate over a proposed state. Answers *"is this legal?"* Returns
>   pass/fail plus a reason. Changes no geometry. Example:
>   `StairValidationAuthority` (riser/going/headroom).
> - **ENFORCEMENT** — a validation wired into a mutation path such that failure **refuses
>   the mutation**. Answers *"may this be committed?"* Example:
>   `WallOccupancyStore.canPlace()` at opening-commit time.
> - **ADVISORY** — a rule evaluated off the critical path, reported to the user, blocking
>   nothing. Answers *"you may want to know."* Example: the `./compliance` rule registry.
> - **SOLVING** — an iterative numerical procedure that **moves geometry** to satisfy a
>   system of simultaneous constraints, where no closed-form assignment exists. Answers
>   *"what geometry satisfies all of these at once?"*

> **§1.2 — MUST NOT.** A constraint may not be described as needing SOLVING because it is
> hard, because it is numeric, or because it involves several elements. SOLVING is
> reserved for **simultaneous** systems with **no closed form**. Everything else is one of
> the first three, and the first three are cheap, testable, and already how this repo
> works.

> **§1.3 — MUST.** The classification is written down **per constraint**, with the
> evidence for it, before any solver work is authorised. A constraint family with no
> classification is treated as VALIDATION until proven otherwise — the cheapest kind, not
> the most expensive.

---

## §2 — What is real today, and must be protected

The sweep's second finding is as important as the first: **this repo already does real
constraint work.** A solver programme that treated the codebase as greenfield would put
four working things at risk. Measured at HEAD:

| Component | Kind (§1.1) | Evidence it is real |
|---|---|---|
| `./compliance` rule registry (`ConstraintEngine`) | **ADVISORY** | `apps/editor/src/engine/initDataPlatform.ts:50` imports `constraintEngine` from `@pryzm/constraint-solver/compliance`; the subpath export maps to `src/ConstraintEngine.ts` (`package.json:14`). Auto-run is wired to `StoreEventBus` with an 800 ms debounce and a load-quiet window (`:291–311`). Non-blocking by construction. |
| `WallOccupancyStore.canPlace()` | **ENFORCEMENT** | called at opening commit from `plugins/wall/src/handlers/CreateWallOpening.ts`, `packages/command-registry/src/walls/CreateWallOpeningCommand.ts`, and the door/window offset + move commands. A real refusal on a real mutation path. |
| `evaluateWallPlacement()` (§C83-S1) | **ENFORCEMENT** | the WALL-SIDE mirror of the row above, added 2026-08-14 on a founder report from live build `a75e8e1e` ("the wall can be placed in front of a door still"). `canPlace` takes ONE wall and compares against THAT wall's own `openings[]`, so a NEW wall arriving at a wall that already holds a door is not expressible in it — all ~12 of its call sites are opening-side. Refuses at `packages/command-registry/src/walls/CreateWallCommand.ts` `canExecute` (the legacy/import/duplicate/from-slab path) and pre-commit in both interactive gestures (`WallTool` in 3D, `WallPlanToolHandler` in plan). Emits `OCC_CROSSES_HOSTED_OPENING` — a **seventh member of the existing `CanPlaceRefusalCode` union, not a rival vocabulary** (C83 §1.4). Suppressed during project restore and building generation (C83 §3.1): projects saved by `a75e8e1e` may already contain the defect, and refusing on replay would make them un-openable. |
| `annotationConstraints` | **VALIDATION** | the **one** persisted constraint family in the system — written to the snapshot, read back, and *checked*. Never solved. |
| `StairValidationAuthority` | **VALIDATION** | runs in the stair dispatch path via `packages/command-registry/src/stair/ValidateStairCommand.ts`. |

> **§2.1 — MUST NOT.** No solver work may replace, bypass, or "unify" any row above
> without a per-row migration that keeps its refusal behaviour observable. An advisory
> registry silently becoming blocking, or an enforcement gate silently becoming advisory,
> is a user-facing behaviour change disguised as a refactor.

> **§2.2 — the tested copy is not the shipped copy.** `StairValidationAuthority` exists
> **twice**: `packages/geometry-stair/src/StairValidationAuthority.ts` and
> `packages/constraint-solver/src/StairValidationAuthority.ts`. Production imports the
> **geometry-stair** copy (via `geometry-stair/src/StairStore.ts` and
> `command-registry/src/stair/ValidateStairCommand.ts`); the constraint-solver copy has
> **zero production importers** — its only reference outside itself is the package's own
> barrel (`constraint-solver/src/index.ts`). Whichever copy the tests bind to, one of them
> is a rule set that can drift from shipped behaviour with a green suite. This is §0's
> mechanism again, in a file that is otherwise entirely real.
>
> **MUST**: the duplicate is resolved to one owner before either copy is extended. Until
> then, neither copy may be cited as "the stair rules" without naming which one.

---

## §3 — The binding rules

> **§3.1 — MUST. No component reports a solve it did not perform.** A `SolverPorter`
> implementation's externally visible identity — its `kind`, its span attributes, its
> return shape, its log lines — must describe **the work it actually did**. Delegating
> every call to `MockSolver` while declaring `kind = 'planegcs'` is a violation, and it is
> the violation this contract was written for.

> **§3.2 — MUST. A stand-in announces itself at its own boundary.** A mock, stub, fake,
> scaffold or not-yet-implemented adapter is **detectable from outside** without reading
> its source: through its declared identity, and through a **non-suppressible signal on
> the first call in a production build** — a distinguished result field, a span attribute,
> or a one-time warning. "It is documented in the file header" is not detection; §0 shows
> a header that has been accurate and ignored for months.

> **§3.3 — MUST NOT. A selector may not fall back to a stand-in silently.** `loadSolver()`
> today returns `MockSolver` when a WASM URL is *absent* and, separately, when one is
> *present but unbindable* — and the two are indistinguishable to the caller. **Failure and
> emptiness are never the same value** (§CONTEXT-DATA-HONESTY, C69 §2.2). "Not configured"
> and "configured but could not load" MUST be different observable outcomes, and the second
> is a **failure**, not a default.

> **§3.4 — MUST. A scaffold carries an owner, a date, and a gate.** A component shipped in
> a deliberately incomplete state declares (a) the milestone that retires it, (b) an
> assertion that fails when that milestone passes without the retirement. The
> `PlanegcsAdapter` (S52 D2) / `engine.ts` (S53 D1) disagreement is what a scaffold with
> neither looks like. A scaffold whose retirement date is untracked is **permanent
> architecture that nobody chose**.

> **§3.5 — MUST. A test double standing in for a production subject is declared.** Where a
> suite substitutes a double for the component under test, the suite states which
> production configuration is thereby **not** covered. `PlanegcsAdapter.test.ts` covers
> injected-`underlying` delegation; it does **not** cover the `??` fallback that every
> production construction takes. Both facts must be visible from the test file.

> **§3.6 — MUST NOT. Test count may not be cited as evidence of subject health.** "31 of
> 33 passing" is a statement about a mock. Any claim of the form *"the solver works, N
> tests pass"* requires naming the subject those N tests bound to.

> **§3.7 — MUST. Dependency-free capability is refuted, not assumed.** A component
> claiming to bind a third-party engine must have that engine as a declared dependency of
> some workspace. `planegcs` has **0 hits** across every `package.json` in the repo, which
> settles the question without reading a line of adapter code — and is the cheapest check
> in this contract.

> **§3.8 — MUST. Dead capability is deleted or declared.** `createWorkerHandler` has zero
> production callers. Unreachable machinery that looks reachable is the
> §AUTHORED-BUT-UNWIRED failure: an audit of *existence* passes, an audit of
> *reachability* fails. Either wire it or say, in the barrel, that it is unwired.

---

## §4 — The solver question, and the order it must be answered in

> **§4.1 — MUST NOT.** No geometric constraint solver may be built, bound, or budgeted on
> the argument that the product category implies one. The founder's rule, recorded
> verbatim so it survives paraphrase: *do not build a solver because "BIM 3.0 sounds like
> it needs one."*

> **§4.2 — MUST.** Authorisation for SOLVING (§1.1) requires, per constraint family, a
> written answer to three questions in order — and the first two are usually the end of it:
> **(a)** does it need VALIDATION? **(b)** does it need ENFORCEMENT? **(c)** does it need
> geometric SOLVING — i.e. is there a *simultaneous* system with *no closed form*? Only a
> family that reaches (c) with evidence authorises solver work, and it authorises it **for
> that family only**.

> **§4.3 — MUST. The honest sequence is adapter truthfulness FIRST; WASM binding only if
> model-space constraints prove necessary — and they land in SEPARATE changes.** This
> ordering is binding, and the separation is the load-bearing half. If the truthfulness
> fix and the real binding land together, the fix is invisible: the adapter starts telling
> the truth in the same commit that makes the truth flattering, and **the organisation
> learns nothing about the fact that a mock shipped for months behind passing tests.** The
> lesson is the deliverable. Merging the two destroys it.

> **§4.4 — MUST NOT.** The honesty fix may not be deferred until the binding is ready.
> §3.1–§3.3 are satisfiable today, in the adapter, with no new dependency. There is no
> version of "we'll make it honest when it's real" that is not a decision to keep shipping
> the misreport.

> **§4.5 — the standing verdict, until §4.2 is answered.** **UNPROVEN** — no constraint
> family in this repository has yet been shown to require SOLVING. The four real
> components in §2 are VALIDATION, ENFORCEMENT and ADVISORY. That is not a claim that none
> ever will; it is the honest reading of what has been measured, and it is the reason
> §4.1 is a MUST NOT rather than a caution.

---

## §5 — Anti-patterns

- **§5.a — The named mock.** A stand-in wearing the identity of the thing it stands in
  for. `kind = 'planegcs'`, behaviour = `MockSolver`. §3.1.
- **§5.b — The silent fallback.** Configure-and-it-still-doesn't-work, reported as
  success. §3.3.
- **§5.c — The undated scaffold.** Two milestones, no assertion, no owner. §3.4.
- **§5.d — Passing tests as a health claim.** Without naming the bound subject. §3.6.
- **§5.e — The two copies.** One tested, one shipped, both plausible. §2.2.
- **§5.f — The solver-shaped roadmap.** SOLVING assumed from the product category rather
  than proven per family. §4.1.
- **§5.g — Fixing honesty and capability in one commit.** §4.3.
- **§5.h — Auditing existence instead of reachability.** §3.8.

---

## §6 — The gates

All three are **UNBUILT at stamp time (2026-08-12)**. They are specified here so that the
contract is falsifiable rather than aspirational; a gate's absence is stated, never
implied by omission.

| Gate | Kind | What it must assert |
|---|---|---|
| `check-constraint-honesty.ts` | hard | **§3.1/§3.2.** No `SolverPorter` (or comparable adapter) declares an identity that its implementation does not perform: a class whose every public method delegates to a type named `Mock*`/`Stub*`/`Fake*` may not declare a non-mock `kind`. Every stand-in emits a first-call production signal. |
| `check-solver-is-real.ts` | hard | **§3.7/§3.3.** For every adapter naming an external engine, that engine is a declared dependency of some workspace `package.json`; and no selector returns the same value for "not configured" and "configured but failed". `planegcs` at 0 hits fails this arm today. |
| `check-no-hidden-mock.ts` | ratchet, **named baseline** | **Generalised beyond solvers.** Any test double standing in for a production subject is detectable from outside the module that defines it. The baseline is a **named, shrink-only list checked in both directions** — a count would let one hidden mock be fixed while another is introduced (C69 §7.c). |

> **§6.1 — MUST.** Each gate carries an **exit-2 floor** on its own subject discovery
> (C69 §3.5): a scan that reads fewer files than its floor exits **2**, never 0. Three of
> §0's five incidents were measurement failures, and a gate that cannot establish its
> subject is the sixth waiting to happen.

> **§6.2 — MUST.** Each arm is **negative-tested before it is trusted** — watched failing
> against a deliberately planted violation, with the failure text recorded here. Until
> that record exists for an arm, the arm is **UNPROVEN** and may not be cited as coverage.

> **§6.3 — what these gates CANNOT see**, stated so nobody reads them as full coverage:
> **(a) runtime substitution** — a double injected at runtime through DI is invisible to a
> source scan; **(b) semantic correctness** — an honest solver that computes the wrong
> answer passes every arm here, because C74 governs *identity*, not *accuracy*;
> **(c) the classification in §1.1** — whether a family truly needs SOLVING is a written
> judgement (§4.2), not a machine-checkable property; **(d) advisory reachability** — the
> `./compliance` registry's *rules* are not enumerated by any gate, only its wiring.

---

## §7 — Exit conditions

This contract stops being a live remediation and becomes a standing invariant when **all**
of the following hold:

1. `PlanegcsAdapter` either performs a real solve or reports `kind` that matches what it
   performs — **and that change landed in its own commit**, before any binding work (§4.3).
2. `loadSolver()` distinguishes not-configured from configured-and-failed (§3.3).
3. `check-constraint-honesty` and `check-solver-is-real` are built, negative-tested, and
   hard (§6.2).
4. `check-no-hidden-mock`'s named baseline reaches **0**, at which point it leaves
   `tools/ga-gate/gate-debt.json` and flips to hard-0.
5. The duplicated `StairValidationAuthority` has one owner (§2.2).
6. `createWorkerHandler` is wired or deleted (§3.8).
7. Every constraint family carries a §1.1 classification with its evidence (§1.3).

Until (7) is met, **§4.5 stands: no solver is authorised.**
