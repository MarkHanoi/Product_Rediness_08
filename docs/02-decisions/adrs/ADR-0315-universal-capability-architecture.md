# ADR-0315 — The universal capability architecture: one semantic front door, four execution classes, five context services

Status: **accepted** · Date: 2026-08-11 · Extends: **ADR-0313** (the resolver ladder, the
capability registry, proofs 3a/3b, the honesty model) and **ADR-0314** (undo-neutral
`runBatch`, batch primitives, catalogue-ref resolution, the gap taxonomy). Governed at the
contract layer by **C67** (what the chat IS) and **C68** (what a new element or attribute
OWES the chat). Sequencing and per-phase acceptance sentences live in
`docs/03-execution/plans/RAC-IMPLEMENTATION-PLAN.md`; the design assessment it came from is
`docs/03-execution/plans/RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE.md`.

> **Why this file exists at all.** `ADR-0315` was cited by name in
> `tools/ga-gate/check-chat-capability-coverage.ts`, `intents/CapabilityExecutionSpec.ts`,
> `capabilities/ChatCapabilityRegistry.ts`, both RAC plans and the issue log — while the
> ADR directory ended at ADR-0314. C68 §6.3-G9 recorded that as a gap and instructed
> readers to treat every citation as pointing at the plans. This ADR closes it, and it
> records the architecture **as it was actually built**, phase by phase, with the real
> commits. Where a phase is in flight it says so; nothing here is aspirational.

---

## Context

ADR-0313 made the chat's idea of the editor's abilities **checkable** — a registry, two
independent target proofs, and a CI ratchet that fails a bus command nobody declared.
ADR-0314 audited coverage and fixed the highest-leverage gaps. Both left the same wall
standing: **every new capability still cost a hand-written resolver arm.**

Concretely, before this work:

- a new batch-shaped capability meant copying ~60 lines of the scope/value/dispatch
  template into a new `case` arm of `applySemanticIntent`;
- a new PROPERTY meant a second ~60 lines plus a hand-written matcher regex, while
  `element.updateParameters` could already route ~60 panel fields across eleven kinds;
- "all walls **on level 2**" had no representation at all — scope was an
  `'all' | 'selection'` field, and three incompatible encodings of "what does this
  sentence act on" existed elsewhere (regex literals in the legacy QueryEngine, that
  field, and a CustomEvent target);
- the whole generative fleet (apartment / house / office / residential, plus the
  ceiling → furnish → floor → lighting chain) was headless-callable and **unreachable by
  sentence** — the founder typed *"Create 3 bedroom apparment"* on 2026-08-10 and got
  *"I'm not sure how to help with that yet"* while the engine had been shipping for months;
- and, worst, **thirteen chat routes were dead**: handlers `produceCommand`ing against
  detached plugin DTO stores nothing renders, exports or persists. Chat said "Done" and
  changed nothing (§FIX-CHAT-DEAD-ROUTES, `8447911f`).

The founder's doctrine for the whole programme is one sentence:

> **Open language in, hard stoppers at the execution layer.**

The user may say it any way they like; refusal, bounds, liveness and granularity are
enforced where the mutation happens — never by narrowing what the user is allowed to type,
and never by a confident "Done" over a no-op.

---

## Decision

### D1 — One semantic front door

`applySemanticIntent` remains **the ONE semantic authority**. Every rung of the ladder
(tier 0 literal, tier 1 typo-tolerant, the local NL classifier, the compound-plan splitter,
and later the LLM planner) produces the same three PURE inputs and nothing else:

```
SemanticIntent  ∪  ScopeDescriptor  ∪  ValueRefs
```

No rung dispatches. No rung resolves a catalogue. No rung invents a scope. This is what
makes the LLM (U10) safe to add LAST: it emits the same IR every other rung emits and is
validated and refused by the same code.

### D2 — Four execution classes, none of them new machinery

| Class | Shape | Where it executes |
|---|---|---|
| **EXEC-1 Command** | one single or batch verb, proven live | bus / CommandManager |
| **EXEC-2 Fan-out** | N commands with an HONEST N-undo summary | bus / CommandManager |
| **EXEC-3 Plan** | ordered steps, one Confirm card, stop-on-failure | `execute-plan` composite |
| **EXEC-4 GenerationRequest** | typed union → the EXISTING controllers | the shipped generators |

Nothing in this ADR executes anything new. EXEC-4 in particular is a **mapper**, not a
pipeline: `generation.building` calls the same controller entry points the onboarding modal
calls, and `generation.apartment` calls the same `apartmentLayoutTrigger` the AI-panel leaf
already used.

### D3 — Five context services, injected, never imported

`ScopeResolver` · `ValueResolvers` · `SiteQuery` · `RoomQuery` · `FacadeOrientation` all
arrive through `ResolverContext`. The resolver stays a pure L2 module that must answer
before any plugin loads. **An absent service refuses honestly** — *"I can't resolve 'on
level 2' here — spatial scoping isn't wired into this chat context"* — and never widens the
ask to a scope the user did not name.

### D4 — A capability is METADATA. The target is zero new resolver code.

- A batch-shaped capability is a `CapabilityExecutionSpec` **table row**.
- A catalogue family is a `CatalogueFamilies` **table row**, from which the spec *and* the
  grammar are generated.
- A property is a `PropertyVocabulary` **table row**.

All three are consumed by ONE generic arm. The proof this is real, not a slogan:
`set-door-type` (U4.3) shipped as ~94 lines of metadata with **zero** changed lines in
`ZeroTokenResolver.ts`, and U7.3 added four properties with zero changed lines in either
`ZeroTokenResolver.ts` or `CapabilityExecutionSpec.ts`.

### D5 — Liveness is a gate, not a hope

The M1 rung of the maturity taxonomy (below) is a **hard CI check**, not a report.
`check-chat-capability-coverage.ts` check 3d classifies every `commandProof` file by
EXECUTION AUTHORITY, and **a plugin `produceCommand` store is presumed DEAD until proven
otherwise, because that presumption has been right 13/13 times.**

### D6 — The maturity taxonomy is MEASURED, not asserted

M0 command exists · M1 UI-proven-live · M2 direct · M3 selection · M4 semantic scope ·
M5 true batch (one undo) · M6 deterministic plan · M7 generative workflow · M8
context-aware generation. Gate 31 prints the live counts on every run, so the roadmap is a
dial rather than a claim. As of 2026-08-11: **41 capabilities · M4 9 · M5 8 · M6 1 · M7 4**.

---

## The U-phases, as built

| Phase | What landed | Commits |
|---|---|---|
| **U0** Liveness gate + maturity metrics | Gate 31 check 3d (execution-authority classification, dated allowlist), the 13-verb `DEAD_VERBS` pin, the M-maturity report line | `56e0c5e3`; dead-route truth-fixes `8447911f` |
| **U1** Liveness verdicts + dead-edit fixes | `wall.updateDimensions` audited **DEAD** and re-routed to a legacy bridge; five Property-Inspector verbs (window `setSize`/`setSillHeight`, door `setWidth`/`setHeight`/`setSillHeight`) bridged to the production-proven `UpdateElementParameterCommand`; `PLUGIN_LIVE_ALLOWLIST` **emptied** — 3d now proves liveness with zero exemptions | `9f93fbac` (§FIX-DIMS-REACH-RECORD, **L-815**) |
| **U2** The five context services | θ-threaded facade orientation + all-levels roll-up; typed `RoomStore` predicates (`findByName` / `findByOccupancy` / `findByArea`); `getElementsInRoom` completed for windows/columns/lighting/stairs; headless `SiteQueryService`; the `CapabilityScopeMode` + value-source vocabulary | `197d4859` · `71003764` · `f6212896` · `3d081acd` · `fcf6c1ef` |
| **U3** ScopeDescriptor + ScopeResolver | THE canonical scope representation, replacing three incompatible encodings. Level, room and orientation arms live end-to-end: *"on level 2"*, *"in the kitchen"*, *"all south-facing exterior walls"* | `999ba097` · `5557395e` · `beec27e0` |
| **U4** The spec interpreter | `CapabilityExecutionSpec` + the ONE generic arm `applyExecutionSpec`; the batch family migrated one commit each with refusal copy byte-pinned; `set-door-type` as the extension proof | `cea504cf` · `1fc83042` · `a14409e3` · `657f3aa5` · `be4e550a` · `432db9b7` |
| **U5a** Conversational level duplication | `duplicate-level` on the already-shipped `DuplicateFloorPlanCommand` — all-or-nothing targets, a Confirm card naming what is NOT copied, one undo. Zero new execution code | `9d7ffaeb` |
| **U5b** Generation adapters | The typed `GenerationRequest` union + brief mappers; `generation.building` and `generation.apartment` over the FOUR proven executors; the `maxHeightM` gate consumed rather than redone; the engines' own words relayed verbatim into the transcript | `c30fbc8f` · `671153df` · `8bb9dac8` |
| **U5c** Room-scale generation + chain | `generate-room-finishes` (ceilings / floor finishes / furnish / lighting, any combination in one ask, in the pipeline's own order) and `finish-apartment-chain` (one Confirm card, fire the FIRST link then OBSERVE the shipped cascade — firing the later links would double-place); the post-duplicate offer | `7c18a187` · `442d4d30` |
| **U6** The plan executor | `execute-plan`, the first COMPOSITE capability: a clause splitter whose every clause is resolved by the EXISTING single-intent ladder, ONE Confirm card, one ordered dispatch pass, stop-on-failure with an honest partial report, and the undo cost stated as the SUM of the steps **before consent** | `1d9eb83e` · `cba04ca7` · `b6863d70` |
| **U7** Property vocabulary + catalogue families | `PropertyVocabulary` (U7.1) — and the lie it found; `CatalogueFamilies` with slab + ceiling live (U7.2); four more properties as pure table rows (U7.3) | `99f8efab` · `63f22496` · `f21fd6c6` |
| **U8** Filter scopes | `FilterScopeDescriptor` — a base scope NARROWED by predicates, never replaced by them — with the grammar as a PRE-STRIPPER, so composition with level/room/orientation was automatic and cost no capability a line; the editor-side resolution service (one record read per surviving id, never a project clone); refusals that quote the real extremum | `5da99e10` · `f86935bc` · `8a0b23d6` |
| **U9** Batch-creation parametrics | **IN FLIGHT** at the time of writing | — |
| **U10** Drain + LLM planner | **IN FLIGHT** — U10.1 (the planner contract, generated from the registry) landed as `e1fea0a3`; the QueryEngine drain and the M8 solar seed have not | `e1fea0a3` |

**U3.5 and U8.4 (the scope benchmarks) are open, and the reason is not time.** The thing
worth measuring — the indexed store walk and the per-id record read — lives editor-side in
the bridge, and the ai-host suite is a Node environment with no stores in it. A benchmark
there would time a synthetic stand-in and report a number about the wrong system. The
honest home for it is the editor spec suite, against real stores.

---

## What the architecture FOUND (the part that justifies it)

A table is only worth building if it makes lies visible. Each of these was discovered by
authoring the declaration, not by reading the code:

1. **`set-height` was lying about beams.** `BeamData` carries width and depth and **no
   height**; `BeamFragmentBuilder` builds from `beam.width × beam.depth`. *"Set the beam
   height to 500 mm"* wrote a field nothing reads and reported success — the
   `ElementCapabilities` defect, inside the chat. Beam came off `set-height` and its real
   property, DEPTH, went into the vocabulary instead (U7.1, `99f8efab`).
2. **`gridXSpacing` / `gridYSpacing` were rejected on the same bar.** Both are editable
   number rows on the curtain-wall panel and `resolveStore()` routes curtain-wall — but
   `CurtainWallBuilder` reads them ONLY when `cw.gridSystem` is absent. On any curtain wall
   whose grid has been edited, the write lands, the rebuild runs, and nothing moves.
   **A property whose liveness is conditional on other state is not a property this table
   may claim.**
3. **Thirteen dead verbs**, found by U0's classification and closed by U1.
4. **The paste-back defect.** The founder pasted the assistant's OWN report line back into
   the chat and the ladder created a level from it — twice, stacking two levels at 6.000 m
   — because the typo corrector rewrote *built → build*, the synonym table rewrote *floors
   → level*, and `add-level` read the bare 6 as an elevation (`795cbec1`). Its sibling: a
   bounded Levenshtein rewrote **with → width**, turning *"Created Aparment with 2
   bedrooms"* into *"select an element first, then set its width"* (`05930960`).

From (4) come three doctrine rules now pinned by the acceptance suite and executed by the
gate:

- **Report text must never command.** Report-shaped and past-tense openers MISS on every
  rung — not a clarification, a MISS; the user did not ask for anything.
- **Typo correction may repair a word the user meant; it must never MANUFACTURE the
  imperative that authorises a mutation.** `add-level` requires an *uncorrected* creation
  verb in opener position.
- **A correctly spelled English function word is never a misspelled domain term** —
  while *aparment → apartment* is exactly what tier 1 exists to do.

---

## Consequences

**Good.** A capability is metadata; the fifth catalogue family is a table row. Every scope
form the arm learns, every capability gets for free — U8's filters widened all seven
spec-driven capabilities in one commit. The generative fleet is reachable by sentence
without a second pipeline. Liveness, targets, value sources, scope honouring, one-dispatch,
catalogue existence and acceptance are all machine-checked (C68 §6).

**Costs, stated plainly.**

- **The generic arm reaches further than the registry declares.** `applyExecutionSpec`
  handles the scope SUPERSET, so a spec-driven capability's ARM accepts a level/room/
  orientation descriptor whether or not its `scopeModes` claims one. No grammar produces
  those sentences for the undeclared ones today, so nothing user-visible over-claims — but
  the distance is real and is now ratcheted (gate 31, baseline 20 on 2026-08-11).
- **Irregular shapes stay hand-written**, and the list is in the
  `CapabilityExecutionSpec.ts` header with reasons: creation, level-query, whole-model
  reference, coordinate entry, and the selection-fan-out dimension family. `wall` is
  deliberately not a catalogue-family row — its grammar is entangled with the colour and
  rake grammars that share the *"make all walls …"* opening, and its refusal copy is the
  founding incident's verbatim wording.
- **`runBatch` is undo-NEUTRAL** (ADR-0314). One undo entry is bought by ONE batch command
  or by `CompositeCommand` + `beginGenerationBatch`, never by a loop. A plan's undo cost is
  the SUM of its steps and is stated on the Confirm card before consent.
- **"One undo" and partial-outcome honesty are only half-provable statically.** Gate 31
  now proves the ONE-DISPATCH half by execution and the report-vocabulary half by reading
  the command source; whether the runtime pushes exactly one history entry, and whether
  the report payload is populated truthfully, remain runtime facts. C68 §6.3 says so.

---

## Alternatives rejected

- **Colocate chat metadata on the handler object.** It cannot work at runtime: the resolver
  is a pure L2 module that must answer before any plugin loads, and a `plugins → ai-host`
  import would add an SDK-facade bypass. The coupling is made STATIC instead — the
  declaration lives in the registry and CI proves it against the real registration lists.
  *The guarantee "a feature cannot ship without its chat metadata" is delivered by the
  gate, not by an import.*
- **Let the LLM dispatch.** Rejected as the inversion of the founder doctrine. The LLM is
  the LAST rung and emits the same pure IR as every other rung, through the same validation
  and the same refusals.
- **A second name→value matcher, "just for this family."** Two ladders drift, and the
  second one's refusal lists a different set of options than the first — so the user is
  told two different truths about one project. Every catalogue reference resolves on the
  ONE `resolveCatalogueRef` ladder; colour in `colorRef.ts`, finish in `finishRef.ts`.
- **Declaring the spatial `scopeModes` up front, at U2.5, before U3 could honour them.**
  Rejected in the plan's own words: *"declaring a spatial mode before the resolver honours
  it would be the ElementCapabilities lie."* The vocabulary shipped as metadata and the
  first consumers landed with U3.

---

## Citations (all checkable)

- Gate: `tools/ga-gate/check-chat-capability-coverage.ts` (GA gate 31, run by
  `tools/ga-gate/run-all.ts`).
- Code: `packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts` ·
  `ChatCommandClassification.ts` · `CapabilityRefusal.ts` ·
  `packages/ai-host/src/intents/{ZeroTokenResolver,CapabilityExecutionSpec,CatalogueFamilies,PropertyVocabulary,ScopeDescriptor,FilterScope,SemanticPlan,colorRef,finishRef}.ts`.
- Acceptance: `packages/ai-host/__tests__/capability-acceptance.test.ts` (families +
  the adversarial corpus, both now executed by the gate).
- Contracts: **C67** (the control plane) · **C68** (element/attribute onboarding, `06a5eaae`)
  · **C16** (command authoring) · **C03** (schemas/commands/state).
- Plans: `docs/03-execution/plans/RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE.md` ·
  `RAC-IMPLEMENTATION-PLAN.md`.
- Issue log: **L-620**, **L-815** (`docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`).
