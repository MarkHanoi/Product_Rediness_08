# LANE E — AI / RAC AS AN AUTHORING SYSTEM
### PHASE 0 repository archaeology for `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` §39–45, §51

> **Status:** COMPLETE · **Lane:** E-ai-rac · **Date:** 2026-09-01 · **Rule:** spec §1 — knowledge only; **no production file was modified.**
> **Method:** governing documents first (C67 · C68 · C09 · C23 · C74 · C105 · ADR-0313/0314/0315/0316/0318/0322/0323/0324), then the code, cited as `file:line`.
> **Discipline:** every number carries its derivation. Where a gate prints it, the gate was RUN in this tree today and named. Nothing is transcribed from a document as a fact about the code — several of C67's own figures are stale in both directions and are corrected here (T-11).

---

## §E.0 — THE ONE-PARAGRAPH ANSWER

**PRYZM does not need an AI authoring architecture designed; it needs six existing systems connected.**
The RAC is a mature, gated, generated capability control plane — **77 capabilities over 361 registered
bus commands**, one IR, one semantic front door, an LLM rung whose entire vocabulary and field shapes
are *generated from the registry*, and the best failure-honesty machinery in the repository. Against the
master spec's four hard requirements it answers: **§40 YES** (every model mutation goes through the bus;
two declared view-state escapes, and the dispatch carries no actor); **§41–42 NO** (AI creates resolved
VALUES only — `grep -ic formula` over the registry and both resolvers returns **0, 0, 0**, and no
constraint bus verb exists anywhere in the main editor); **§43 THIN** (the LLM is shown a selection
*count*, the level list, and wall type names — three lines); **§44–45 HALF** (the five-state
`DispatchOutcome` union is genuinely structured and exhaustively switched, but the diagnostic *content*
is prose, and no repair loop has the AI as proposer).

⭐ **The two finds that change the plan.** First, a **second AI authoring system already exists**:
`apps/component-editor/src/ai/` declares **12 AI-invocable verbs** — five real `constraint.*` creators,
four `referencePlane.*`, three `solid.*` covering extrude/sweep/revolve/loft/boolean — behind a
propose → validate → `executeBatch` pipeline that is the master spec's §45 loop written out, and
`constraint.addDistance` **already accepts a parameter name in place of a number**. It has **zero
production call sites**. Second, `packages/family-runtime/src/expression/` is the master spec's §9–11
typed expression engine — unit-tagged literals, `UnitMismatchError`, Kahn's-algorithm cycle detection,
and an eight-code `ResolverDiagnostic` that is precisely the structured diagnostic §44 asks for — with
**zero importers in `apps/editor`, `plugins/**` or `packages/ai-host`**. Both are the standing
`authored ≠ wired` lesson at full scale.

⛔ **And one thing must be fixed before any new surface is added:** `check-chat-capability-coverage.ts`
is **RED today at `UNDECLARED: 13` against a baseline of 0** — two whole element families (balcony,
lift) and one compound system (bathroom pod) shipped chat-invisible — and its `HANDLER_GLOBS` scans
**three files**, so `graph.query` / `graph.neighbors` / `graph.path` are not merely undeclared, they are
**uncounted**. A component editor registered outside those three globs would be born invisible to the
one gate that exists to prevent exactly that.

**Nothing in §E.6's integration architecture is a new concept.** Six wiring jobs, in dependency order:
stamp the actor · write the `AIArtefact` · widen the gate's globs · build `check-deferral-blockers.ts` ·
make the Confirm card take a `ConsequencePlan` instead of a prose string · give the component editor a
production caller and merge its tool registry into C67's.

---

## §E.1 — WHAT EXISTS

### E.1.0 — THE HEADLINE, MEASURED TODAY (not transcribed)

Everything in this lane hangs off one live reading. **Run 2026-09-01, this tree:**

```
npx tsx tools/ga-gate/check-chat-capability-coverage.ts     ->  RC=3
[check-chat-capability-coverage] registered bus commands: 361
[check-chat-capability-coverage] chat capabilities: 77 · covering 52 command(s)
[check-chat-capability-coverage] explicitly deferred (CHAT_UNAVAILABLE): 61
[check-chat-capability-coverage] classified (235): B needs-design 131 · C internal 49 · D duplicate 48 · E unsafe 4 · F deferred 3
[check-chat-capability-coverage] maturity: M2/M3 direct+selection 77 · M4 scope 27 · M5 true-batch 21 · M6 plans 1 · M7 generative 4
[check-chat-capability-coverage] UNDECLARED: 13 (baseline 0)
[check-chat-capability-coverage] C68 §6.3 ratchets: unresolved examples 1/1 · unpinned capabilities 7/9 ·
      undeclared spatial reach 5/2 · unclassified global routes 1/1 · resolver case arms 30/30 · unreachable properties 47/42
```

⛔ **GATE 31 IS RED, and it is red on the ONE ratchet whose baseline is 0.** C67 §1.2 records
`UNDECLARED: 0 (baseline 0)` at `f89c735c`; today it is **13**. The thirteen are `balcony` ×4,
`bathroomPod.create/.delete`, `lift` ×3, `room.autoClassify.batch`, `room.restoreMeaning`,
`room.setColourMode`, `view.setCategoryVisibility`. Two whole element families (**balcony**, **lift** —
the latter has its own contract, `C104-ELEMENT-LIFT-COMPOUND-SYSTEM.md`) and one compound system
(**bathroom pod**, `C109`) shipped **chat-invisible** — the `c1902a5a` defect the registry exists to
prevent, recurring at the family level. Also RED: **47/42 panel-editable properties the chat cannot
reach**, and **3 unresolvable parameter sources** (`enumeration`, `opening-shapes` ×2 — capabilities
declaring a `valueSource` nothing in the gate's `KNOWN_VALUE_SOURCES` can resolve).

⚠ **Do not quote the numbers in C67 §1.2 (`56` capabilities / `325` commands / `UNDECLARED 0`).**
They were true at `f89c735c` on 2026-08-19 and are stale in **both** directions today: the capability
count is UP (56 → **77**) and the honesty ratchet is BREACHED (0 → **13**). This is the exact
oscillation CLAUDE.md's P4 box documents. **Read the gate.**

---

### E.1.1 — `packages/ai-host` — TWO UNRELATED AI SYSTEMS LIVE IN ONE PACKAGE

**575 TypeScript files** (`find packages/ai-host -name '*.ts' -not -path '*/node_modules/*' | wc -l`).
A newcomer's first trap: `AiPlane` and the RAC chat ladder are **not the same system and do not talk
to each other.**

| | **A — the `AiPlane` workflow plane (L7.5)** | **B — the RAC zero-token ladder** |
|---|---|---|
| Entry | `packages/ai-host/src/AiPlane.ts:100` `submit()` | `packages/ai-host/src/intents/ZeroTokenResolver.ts` `resolveUtterance()` |
| Shape | workflow descriptor → budget gate → impl → **AiPendingAction** → human approval → bus | utterance → `SemanticIntent` → `applySemanticIntent` → bus |
| Governs | C09 (AI & visibility intent), C23 (provenance & AI audit), ADR-050 response cache | C67 (capability control plane), C68 (element chat onboarding), ADR-0313/0314/0315 |
| Cost model | `CostMeter`, `$0.18` ceiling, `preCheckBudget` (`AiPlane.ts:15-30`) | **0 tokens** for every rung except the last |
| Human gate | **structural** — nothing commits until approve (`AiPlane.ts:29`, step 9) | **per-capability** — a Confirm/Cancel card only when `destructive: true` |

⭐ **The `AiPlane` propose → approve → commit pipeline is the closest thing PRYZM has to the master
spec's §45 repair loop, and the chat does not use it.** `AiPlane.ts:20-31` documents the nine-step
pipeline; step 9 (`workflow.commit` → command bus) is the only step that mutates. The RAC ladder never
enters this pipeline: it calls `runtime.bus.executeCommand` directly from
`ZeroTokenChatBridge.ts:1629` / `:1644`.

---

### E.1.2 — `ChatCapabilityRegistry.ts` — THE DECLARATION SURFACE (4,079 lines)

**Authority:** `packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts`
**Contract:** C67 §0 (*"the editor registers capabilities; language resolves against them"*), §4 rules 3 / 4 / 10 / 14.
**Maturity:** the most mature declaration surface in the repository. **Reachable in production**
(`allChatCapabilities()` at `:4010`, consumed by the resolver, the gate, the LLM planner and the panel).

The `ChatCapability` record (`:270-357`) is a **near-complete capability descriptor** and is the single
most reusable artefact this lane found:

| Field | Line | What it gives a universal component editor |
|---|---|---|
| `id` | `:272` | stable identity — *"identical to the `SemanticIntent.intent` it is reached by, so the resolver and the registry cannot drift apart by construction"* |
| `verbs` / `aliases` / `refusalLabel` | `:276-288` | the natural-language surface, **generated** — not a hand-written prompt list |
| `targets` | `:296` | the **proven** element-kind list — not a wish; see the two proofs below |
| `parameters[].valueSource` | `:117-228` | **a typed value-source union, 21 members today**: `measurement` · `angle` · `wall-system-types` · `window-system-types` · `door-system-types` · `slab-system-types` · `ceiling-system-types` · `stair-types` · `handrail-types` · `lighting-types` · `curtain-wall-types` · `finish` · `project-levels` · `color` · `project-rooms` · `orientation` · `level-range` · `user-text` · `coordinates` · `opening-shapes` · `enumeration` |
| `scope` / `scopeModes` | `:246-256` | `selection · all · global` plus `level · room · orientation` — a real scope algebra |
| `destructive` | `:311` | drives the Confirm card |
| `busCommand` / `alsoDispatches` | `:316-322` | the route(s). **One value describing a one-to-many route** — C67 §1.7 F-3 |
| `localAction` | `:334` | the SIX non-bus escapes — this is the §40 answer (E.1.5) |
| `probe` | `:352` | a minimal `SemanticIntent` the gate **executes** against every element kind |
| `commandProof` | `:354` | `{file, mustMention[], note}` — a **source-anchored** assertion that the route really accepts the claim |
| `examples` | `:356` | phrasings the gate **executes**; a capability declaring none fails |

**The two proofs** (`:41-68`) are the architecturally load-bearing part and generalise directly to a
component editor's capability surface:

1. **EXECUTABLE** — `applySemanticIntent(probe, ctxSelecting(kind))` is run for **every** kind in
   `PROBE_ELEMENT_KINDS` (`:358-372`, **17 kinds**) and asserts `refusal ⟺ kind ∉ targets`.
   *"An undeclared kind the guard accepts FAILS too — silent over-reach is the same lie in the other
   direction."*
2. **SOURCE-ANCHORED** — the gate opens `commandProof.file` and requires the `mustMention` literals to
   be present in it.

⭐ **The generator pattern (C67 §1.3) is the reuse story.** A capability of a known shape is a **table
row**, not resolver code. Four tables feed one generic arm each:

| Table | Generates | File |
|---|---|---|
| `CapabilityExecutionSpec.ts` (1,133 ln) | *resolve scope → resolve value → dispatch ONE batch verb* | `packages/ai-host/src/intents/CapabilityExecutionSpec.ts` |
| `CatalogueFamilies.ts` | a type-change family — **execution spec AND tier-0 grammar from one record** | `packages/ai-host/src/intents/CatalogueFamilies.ts` |
| `PropertyVocabulary.ts` | a property — noun + synonyms + accepting kinds + live route + bounds | `packages/ai-host/src/intents/PropertyVocabulary.ts` |
| `DeleteFamilies.ts` | a scoped destructive family (`destructive` + `requireResolvedIds` set by the generator) | `packages/ai-host/src/intents/DeleteFamilies.ts` |

Hand-written resolver arms are **ratcheted at 30** (measured today; C67 §1.3 records 27). Evidence the
pattern works, from C67 §1.3: `set-door-type` shipped as *"~94 lines of metadata with zero new resolver
case code"*; U7.3's four properties shipped in a commit with *"zero changed lines in
`ZeroTokenResolver.ts` and zero in `CapabilityExecutionSpec.ts`"*.

---

### E.1.3 — `ChatCommandClassification.ts` — THE HONEST-GAP SURFACE

**Authority:** `packages/ai-host/src/capabilities/ChatCommandClassification.ts:34-45`.
Five classes: `B` needs-design (`blockedBy` names the missing piece) · `C` internal · `D` duplicate ·
`E` unsafe · `F` deferred. Today: **B 131 · C 49 · D 48 · E 4 · F 3 = 235**, plus **61**
`CHAT_UNAVAILABLE` (`ChatCapabilityRegistry.ts:3693`).

⚠ **Two traps live here, both recorded in-code:**

- **`:59-72` B_CREATION** — *every* element `create` verb is deferred behind one reason:
  `blockedBy: 'per-family placement grammar (coordinates/host references) in the resolver context'`.
  The list includes `beam.create`, `ceiling.create`, `column.create`, `curtain-wall.create`,
  `floor.create`, `furniture.create`, `grid.create`, `handrail.create`, `lighting.create`,
  `plumbing.create`, `room.create`, `roof.create`, `slab.create`, `stair.create`,
  `roof.addSkylight`, `slab.addHole`, `wall.createBetweenMarks`.
  ⭐ **So the AI cannot CREATE any element except through the four generative controllers and
  `create-windows-parametric`.** For the master spec's §64 AI test (*"create a 1200×1500 window with a
  75 mm aluminium frame…"*) this is the load-bearing gap — and it is a **grammar** gap, not an executor
  gap. Every executor already exists.
- **`:84-95` the `room.setOccupancy` lesson**, written in-code and then not applied three lines below
  to `element.changeType` (C67 §1.8.4): *"when a deferral names a dependency, check the dependency is
  real for THAT verb before inheriting the family's reason."* The `element.changeType` half was
  repaired (L-1146; see `ZeroTokenChatBridge.ts:1085-1112`), but **the class has no gate**. C67 §4
  rule 15 names `check-deferral-blockers.ts` as **TO BUILD** and it is still absent:
  `ls tools/ga-gate/check-deferral-blockers.ts` → *No such file or directory*.


### E.1.4 — THE RESOLUTION LADDER — five rungs, one IR, one front door

**Authority:** `packages/ai-host/src/intents/ZeroTokenResolver.ts` (6,277 ln) · `LocalNaturalLanguageResolver.ts` · `SemanticPlan.ts` (277 ln) · `FilterScope.ts` · `LlmPlanner.ts` (677 ln)
**Contract:** C67 §1.1, §4 rules 1 / 2 / 11. **ADR:** 0313 (ladder) · 0315 (universal capability architecture).

```
utterance
  → §PLAN     SemanticPlan.ts     compound splitter, explicit connectives only   0 tokens
  → tier 0    deterministic grammar                                              0 tokens
  → tier 1    synonyms + bounded typo repair                                     0 tokens
  → tier NL   semantic parse → SemanticIntent                                    0 tokens
  → §PLANNER  LlmPlanner.ts       LAST rung, paid, rare, skippable
        ↓ every rung emits the SAME IR and nothing else
  applySemanticIntent  ← THE ONE semantic authority
        ↓
  runtime.bus.executeCommand   (P6)
```

Three properties make this the reusable part (C67 §1.1, verified in source):

1. **Every rung emits `SemanticIntent ∪ ScopeDescriptor ∪ ValueRefs` and nothing else.** No rung
   dispatches. This is why adding the LLM *last* was safe: it is validated and refused by the same
   code as tier 0.
2. **The local rungs are PURE** — `LlmPlanner.ts:60` states it: *"PURITY: no DOM, no stores, no fetch.
   The transport is INJECTED (`PlannerDeps.complete`), so ai-host stays pure and the editor owns the
   relay."* All five context services arrive through `ResolverContext` (`ZeroTokenResolver.ts:256-273`).
3. **Ladder order is pinned by test**, not convention — `zeroTokenLadderOrder.spec.ts`,
   `packages/ai-host/__tests__/llm-planner.test.ts`, `apps/editor/src/ui/ai/__tests__/LlmPlannerBridge.spec.ts`.

⭐ **The LLM rung's vocabulary and its field shapes are BOTH generated** (`LlmPlanner.ts:28-43`,
`buildPlannerVocabulary()` at `:358`): the tool list comes from `allChatCapabilities()`, and the legal
field shapes are *"each capability's registry `probe` … UNION the intents the DETERMINISTIC ladder
itself produces for that capability's declared `examples`"*. The response contract (`:385-409`) is
**intents-only — there is no free-text command form** — and validation **rejects, never coerces**
(`:45-51`). ⭐ **This is the single best answer in the repository to "how do you let an LLM author
without giving it new authority", and it transfers unchanged to a component editor.**

**Reachability of the LLM rung** — `apps/editor/src/ui/ai/LlmPlannerBridge.ts:19-25`:
> *"THE PRODUCTION TRUTH. This deploy carries neither `CF_WORKER_URL` nor `ANTHROPIC_API_KEY`, so
> `/api/anthropic/v1/messages` answers 500 and there is nothing to plan with … the rung is SKIPPED
> cleanly."*
The **BYOM** arm (C105 §3.1, `:59-77`) makes it reachable when a user supplies their own key —
browser → provider direct, deliberately using plain `fetch` and not `apiFetch` so PRYZM's session
token cannot leak to a third party.

---

### E.1.5 — §40 ANSWERED: **DOES AI DISPATCH ONLY THROUGH THE COMMAND BUS?**

> **Master spec §39–40:** *"AI must NOT directly mutate the database, scene graph, renderer or
> arbitrary kernel objects."*

**ANSWER: for every MODEL mutation, yes. For six named non-model actions, no — and each is declared,
typed and justified in-code.**

**The bus half is clean.** Every mutating resolution goes through
`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1629` (`bus.executeCommand` inside `batchCoordinator.runBatch`)
or `:1644` (single command). There is no second mutation path: the file's own header, `:20`, states
*"P6: every mutation goes through `runtime.bus.executeCommand` — the same verbs/payloads the property
panel and keyboard shortcuts dispatch."* The LLM cannot bypass it — `LlmPlanner.ts:8-12` — and the
gate proves the declared route exists.

**The six escapes** are the `localAction` union at `ChatCapabilityRegistry.ts:334`, executed by
`runLocal()` at `ZeroTokenChatBridge.ts:1746-1846`:

| `localAction` | What it does instead of a bus dispatch | Line | Mutates the model? |
|---|---|---|---|
| `undo` | `performUndoRedo.performUndo()` | `:1762` | reverses model state, but is the same call Ctrl+Z makes |
| `redo` | `performUndoRedo.performRedo()` | `:1776` | as above |
| `setActiveLevel` | **`w.projectContext.activeLevelId = r.levelId`** — a direct global assignment + an event emit | `:1802-1803` | **view state, written directly** |
| `applyVisibilityIntent` | dispatches a `visibility.*` bus command **and then projects the intent onto the THREE scene** | `:1806` | **scene graph, written directly** |
| `activateTool` | activates a placement tool via `runtime.tools.activate` | `:1825` | no — nothing is created until the user clicks |
| `answer` | nothing; the summary IS the answer | `:1840` | no |

⚠ **`setActiveLevel` and `applyVisibilityIntent` are the two real §40 exceptions.** Both are declared,
both are honest, and the second is the more interesting: `ChatCapabilityRegistry.ts:336-343` explains
that `visibility.*` is *"registered by the COMPOSITION ROOT, composeRuntime §4d-bis, which the coverage
gate's handler-file scan cannot see, so declaring it as `busCommand` would read as a phantom."*
**The gate's blindness shaped the data model** — the capability had to lie about which field it uses
because the gate could not see the truth. C67 §1.7.3 records the consequence in the user's own words:
visibility has *"no undo, no persistence, no sync"*, and the refusal copy now says so verbatim —
*"(view-only — not undoable, not saved, not shared)"*.

⛔ **The residual §40 finding: the AI's dispatch carries NO ACTOR.** `ADR-0324-ai-invokes-the-same-loop.md`
§1 (**status: ACCEPTED**) mandates an optional `CommandExecutionContext` — `actor {kind: human|ai|…}`,
`origin {surface, proposalId?}`, `approval {proposalId, approvedBy, rationale, confidence}`. It **is
implemented in the bus**: `packages/command-bus/src/CommandBus.ts:331` accepts
`opts.context?: CommandExecutionContext`, and `packages/command-bus/src/consequence.ts` defines
`CommandActor` / `CommandOrigin` / `CommandApproval` / `CommandExecutionContext`.
**The chat never passes it.** Measured:
```
grep -n "actorKind\|actor:\|origin:\|approval:\|context:" apps/editor/src/ui/ai/ZeroTokenChatBridge.ts
   -> (no output)
```
Both call sites are two-argument: `bus.executeCommand(c.type, c.payload)`. The only production writer
of `actorKind: 'ai'` in the whole tree is `apps/ai-worker/src/cv/handler.ts:154` — a server worker, not
the editor. **So an AI-authored command and a hand-authored command are byte-identical in the event
record**, and the bus's own comment concedes the field is *"carried onto the EventRecord, read by
NOTHING in the bus"* (`CommandBus.ts:326-328`).

---

### E.1.6 — §43 ANSWERED: **WHAT CONTEXT DOES THE AI ACTUALLY RECEIVE?**

> **Master spec §43:** *"AI has contract-controlled access to the current definition, selection,
> parameters, constraints, feature graph, types, materials, geometry status, host and World-Model
> context — it should not infer from a screenshot."*

**There is exactly ONE `ResolverContext` construction site in the repository** —
`ZeroTokenChatBridge.buildContext()` at `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1030-1195`
(C67 §1.8.4 asserts the same, and it still holds). Its **17 fields** (`ZeroTokenResolver.ts:256-273`):

| Field | Source | Master-spec §43 item it covers |
|---|---|---|
| `selection: {elementId, elementType}[]` | `selectionBus.currentIds` (`:150-174`) | selection — **id + kind ONLY** |
| `levels`, `activeLevelId` | `bimManager.getLevels()` | spatial context (storeys) |
| `rooms: {id,name,roomNumber,levelId,areaM2}[]` | legacy room store via `storeRegistry` | partial World-Model |
| `resolveWallSystemType` + `wallSystemTypeNames` | `resolveWallSystemTypeRef` (command-registry) | types |
| `resolveWindowSystemType` / `resolveDoorSystemType` + names | same ladder | types |
| `catalogues: Record<string, CatalogueLookup>` | `buildCatalogueChannel()` — the GENERIC channel | types |
| `resolveScope(ScopeDescriptor)` | `makeScopeResolver(levels, typeNamer)` | spatial/World-Model queries |
| `visibility: {hiddenCount, isolationActive, isolationCount}` | scene traversal | representation state |
| `readProperty` | `chatPropertyReader` (`apps/editor/src/ui/ai/chatPropertyReader.ts`) | **the only parameter READ path** |
| `photoFacade` | the attached image (L-10905) | — |
| `mintId()` | `L${Date.now()}-${seq}` | identity minting |

⛔ **What is NOT in the context, measured:** no parameter VALUES on the selection · no constraints ·
no formulas · no feature graph · no materials (beyond a finish name table) · no geometry status ·
no host · no relationships. `ResolverSelection` (`ZeroTokenResolver.ts:236-239`) is literally
**two fields**: `elementId` and `elementType`.

⛔ **And the LLM gets far less than the resolver does.** `LlmPlanner.buildPlannerFacts()`
(`:365-383`) renders **three lines**:
```
Selection: <count> selected: <elementType, elementType, …>      // no ids, no values
Levels:    <name @ elevation>, … (active: <name>)
wall types: <name | name | …>                                   // ONLY if wallSystemTypeNames is set
```
The `cats` array has exactly one `push` and it is guarded by `ctx.wallSystemTypeNames?.length`. **The
window, door, slab, ceiling, stair, handrail, lighting and curtain-wall catalogues are in
`ResolverContext` and are never rendered into the prompt.** So the LLM rung is told which wall types
exist and nothing about any other family's types — while the deterministic rung below it can resolve
all of them. That asymmetry is not documented anywhere and is a live defect, not a design.

⭐ **The one thing this context does exceptionally well is HONESTY about absence.** `buildContext`
distinguishes ABSENT from EMPTY at every injection point — `:1039-1042`: *"A catalogue that cannot be
read is reported as ABSENT … rather than as EMPTY, which would make 'no such wall type' and 'could
not read the catalogue' the same sentence"*. Same for rooms (`:1123`), visibility (`:1114`) and the
generic channel (`:1108-1112`). This is the `context-data-honesty` family applied at the AI boundary
and it is directly reusable.

---

### E.1.7 — §44–45 ANSWERED: **ARE DIAGNOSTICS STRUCTURED ENOUGH FOR A REPAIR LOOP?**

> **Master spec §44–45:** *"Failures return structured diagnostics … with options; never hidden. The
> repair loop `proposal → validation → failure → structured diagnostic → repair proposal → validation
> → commit` is a reusable pattern."*

**ANSWER: the OUTCOME classification is genuinely structured; the DIAGNOSTIC CONTENT is prose; and
there is no repair loop anywhere on the chat path.**

**a. Pre-dispatch refusal — a 4-field record, of which 2 are free prose.**
`ZeroTokenResolution` (`ZeroTokenResolver.ts:427-459`):
```ts
| { kind: 'refusal'; intent: string; reason: string; suggestions: readonly string[] }
| { kind: 'miss' }
```
`CapabilityGapRefusal` (`CapabilityRefusal.ts:636-641`) is the identical shape. So a refusal carries a
capability id and **two English strings**. There is no failing-constraint id, no conflicting-value
pair, no machine-readable code, no typed `options`. C67 §6.2 concedes the same: refusal **quality** is
*"review-only (C68 §6.3-G9)"*.
⭐ The **three-state discipline** is nonetheless first class and worth copying:
`ChatResolutionState = 'clarification' | 'refusal' | 'miss'` (`CapabilityRefusal.ts:41`), with
`capabilityGapRefusal()` firing only when **four** conditions hold (`:672-686`) — *"a refusal that
guesses is worse than a miss"*.

**b. Post-dispatch outcome — five states, exhaustively switched. THIS is the structured half.**
`classifyDispatch()` (`ZeroTokenChatBridge.ts:1296-1345`) is a **pure, separately tested function**
mapping `DispatchEvidence {reports, failures, expectsReport, commandCount}` onto
`DispatchOutcome` (`:1240-1251`):

| kind | Means |
|---|---|
| `applied` | every command that reported, reported success |
| `partial` | some landed, some did not — **both halves reported**, `lines` + `failedLines` |
| `refused` | the engines RAN and changed nothing, with reasons |
| `dispatch-failed` | the BUS rejected everything — it never reached an engine |
| `indeterminate` | a report was PROMISED and did not arrive. **Nothing is confirmed** |

The switch at `:1370-1400` is *"exhaustive over the union on purpose: adding a sixth engine state must
break the build here rather than fall through to 'Done'."* And `indeterminate` never prints "Done" —
it prints *"I can't tell you what happened … nothing here is confirmed."*
⭐ **This is the best failure-honesty machinery in the repository** and it exists because of a real
production lie (L-996, quoted verbatim at `:1461-1478`): `wall.setSideFinishBatch` broadcast a truthful
report onto an event **nothing subscribed to**, so *"the transcript said 'Set the interior finish of all
17 walls on Ground to Wood · Oak (Light). Done' whether the command changed 17 walls, 0 walls, or was
never reached at all. FAILURE AND EMPTINESS WERE THE SAME VALUE."*

**c. The report table is derived, not remembered.** `BATCH_REPORT_EVENTS`
(`ZeroTokenChatBridge.ts:1448`) maps bus verb → CustomEvent name, and
`apps/editor/src/ui/ai/__tests__/batchReportEventsCompleteness.spec.ts` **derives the required key set
from the handlers themselves** and fails both on an omission and on a vacuous scan.

**d. A REAL REPAIR LOOP EXISTS — but it is triggered by the EDITOR's refusals, never by the AI's.**
⭐ This is the lane's most reusable single discovery and it would be easy to miss. **Four
propose→consent surfaces speak THROUGH the chat**, all reachable in production:

| Module | Trigger | Reached from | Structured alternatives? |
|---|---|---|---|
| `apps/editor/src/ui/ai/WallMoveClashProposal.ts` (579 ln) | `UpdateWallBaselineCommand.canExecute` refuses `OCC_CROSSES_HOSTED_OPENING` | `apps/editor/src/engine/consequence/wallPlacementGate.ts:100` → `presentWallMoveClash` | ✅ `verdict.offers` from `computeWallCrossingOffers` (`@pryzm/geometry-wall`, C83 §4.2) |
| `apps/editor/src/ui/ai/OpenedRegionProposal.ts` (502 ln) | a wall move opens a region / merges two rooms | `apps/editor/src/engine/initTools.ts:3448` | ✅ |
| `apps/editor/src/ui/ai/RoomMeaningRestoreProposal.ts` (297 ln) | a room tombstone can be restored (L-10814, C94 §TOBE.6 RM-3) | `initTools.ts:3459` | ✅ |
| `apps/editor/src/ui/ai/RoomLossNotice.ts` (103 ln) | the TELL half of the same event | `initTools.ts:3471` | n/a (informational) |

`WallMoveClashProposal.ts:19-30` is the doctrine, and it is exactly master spec §44's *"with options"*:
> *"each candidate is re-run through the WHOLE placement predicate against every wall on the level
> before it may be offered — the same `canPlace` occupancy convention that produced the refusal. An
> offer that cannot be defended is not emitted, so `offers` arriving empty here MEANS 'no defensible
> candidate' … (C83 §4.2 MUST NOT: 'an offer carries an implicit claim that the alternative is valid')."*

And `:32-40`: **"IT ASKS. IT NEVER AUTO-APPLIES."** — on Confirm it dispatches ONE ordinary
`wall.updateBaseline`, *"the same payload shape the 3D gizmo's drag-end dispatches … so the accepted
candidate is ONE history entry and one Ctrl+Z restores the wall."*

The seam is `apps/editor/src/ui/ai/chatPromptHost.ts` — `chatSay` / `chatConfirm`, an accessor over
`ZeroTokenUiHooks`, carrying the **§PROMPT-REACHES-A-HUMAN** guarantee (opens the panel, waits for a
transcript that can render, falls back to a VISIBLE card rather than a console line). Its header
records why: *"the §OPENED-REGION detector fired correctly on a real founder wall move … and the
founder saw nothing. The question was written to the console and stopped there."*
⚠ It also records the survey result that a component editor must respect: **C83 §4.1 found FOUR live
propose→consent surfaces at `28c6b05c` and named `ConsequencePlan` / `ConfirmationFlow` /
`ConfirmationCard` canonical** — so a new authoring surface must join those, not mint a fifth.

⛔ **What is missing is the AI-side arm.** When a *chat-authored* command fails, the loop stops:
`classifyDispatch` renders one sentence and the turn ends. No diagnostic is fed back to
`LlmPlanner`, nothing re-proposes, nothing re-validates. The wall-move loop proves PRYZM can do the
`failure → structured diagnostic → repair proposal → validation → commit` cycle; it has simply never
been wired with the AI as the proposer.

⭐ **AND THE GENERIC SUBSTRATE FOR IT IS BUILT, AND BUILT WELL — see E.2.3.** `packages/command-bus/src/consequence.ts`
defines `ConsequencePlan`, `PredictedVsActual`, `ConsequenceReport`, `UndeterminedOutcome`,
`PlanDivergenceVerdict`, `PlanStaleRefusal`, `ImpactDetermination`, `ConsequenceRefusal`,
`ValidationDelta`, `RegenerationPlan`. Seven certification gates enforce them
(`tools/rac-conformance/certification/gates/check-{ai-human-parity,approval-binding,consequence-report-completeness,execution-plan-agreement,no-silent-partial,plan-determinism,preview-purity}.ts`).
**The chat consumes none of it.**

---

### E.1.8 — THE DEAD-ROUTE PICTURE, RE-MEASURED TODAY

```
npx tsx tools/rac-conformance/probe-route-shadowing.ts   ->  RC=0 (a measurement, not a gate)
A. SHADOWED (plugin DTO handler AND editor bridge claim one verb) .......... 0
B. PLUGIN-ONLY, presumed-DETACHED ......................................... 2
C. no plugin DTO handler on the verb ...................................... 64
capabilities whose commandProof declares itself ORPHANED .................. 9
```

- **A = 0** confirms C67 §1.7 **F-2 is closed** (the `roof.update` double-registration, L-839).
- **B = 2**, and C67 §1.6 O-5 records only **one**. The second is
  **`move-to-level` → `wall.changeLevel`** (`plugins/wall/src/handlers/ChangeWallLevel.ts`) —
  *"PLUGIN, presumed-DETACHED and ENROLLED (produceCommand → plugin DTO store)"*. Its `commandProof`
  points at `apps/editor/src/engine/elementLevelChangedMirror.ts`, a **different file from the one
  that registers the verb**, which is exactly the presumption C67 §6.2 warns about.
- **9 ORPHANED-declaring commandProofs**, against the **8** C67 §6.2 records. The probe's own closing
  line is the lesson: *"A `commandProof` that says 'ORPHANED — no longer called' is a proof of nothing.
  The D14 gate accepts it because of WHERE it lives, not because anything calls it."*

---

### E.1.9 — §41–42 ANSWERED: **CAN AI CREATE INTENT, OR ONLY VALUES?**

> **Master spec §41–42:** *"AI creates INTENT (`CreateEqualityConstraint(leftFrame, rightFrame)`,
> `GlassWidth = OpeningWidth − 2 × FrameWidth`), and distinguishes a value change from rule creation."*

**ANSWER: today's production AI can create VALUES ONLY. There is not one intent in the IR that carries
an expression, a formula, or a relation between two parameters.**

**The evidence is the IR itself.** `SemanticIntent` (`packages/ai-host/src/intents/ZeroTokenResolver.ts:671-1440`)
is a discriminated union of ~50 members. Every value-bearing member carries a **resolved literal**:

```ts
| { intent: 'set-height';    value: number }                    // :700
| { intent: 'set-thickness'; value: number }                    // :701
| { intent: 'set-width';     value: number }                    // :706
| { intent: PropertyDrivenIntentId; value: number | string }    // :716   ← the whole property family
| { intent: 'set-roof-pitch'; degrees: number }                 // :729
| { intent: 'set-dimensions'; height?; width?; thickness?; sillHeight? }   // :774-780
| { intent: 'set-wall-type';  … typeRef: string … }             // :850
```

⛔ **Three failed searches, quoted:**

```
grep -ic "formula" packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts   -> 0
grep -ic "formula" packages/ai-host/src/intents/ZeroTokenResolver.ts             -> 0
grep -ic "formula" packages/ai-host/src/intents/LocalNaturalLanguageResolver.ts  -> 0
```

```
grep -nE "component-editor|sketch|constrain|family-instance|familyEditor" \
     packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts
   -> 1 hit, and it is a prose sentence about the stair TOOL config, not a constraint
```

```
grep -rnE "type\s*[:=]\s*'[a-z][\w-]*\.(addConstraint|constraint)" \
     --include=*.ts plugins apps/editor/src/engine
   -> (no output)   # there is NO constraint bus verb in the main editor at all
```

The word **"constraint"** appears in `ChatCapabilityRegistry.ts` exactly four times (`:1053`, `:1071`,
`:1196`, `:1226`) and every one is `STAIR_CONSTRAINTS` — a **validation bound**, i.e. a min/max the
command checks. That is the opposite of the spec's meaning: a bound refuses a value, it does not
persist a relation.

⭐ **The nearest thing PRYZM has to §42's "rule creation" is the four GENERATIVE capabilities**
(`M7 generative 4` in the gate line): `generate-building`, `generate-apartment-layout`,
`generate-room-finishes`, `finish-apartment-chain` (`ZeroTokenResolver.ts:1236 / 1330 / 1375 / 1402`).
These carry a **brief** — a set of design parameters the engine then satisfies — which is intent-shaped.
But the intent lives in the *generator's* parameters, not in the model: nothing persists as a rule that
survives and recomputes when an input changes. This is the master spec §12/§13 gap in one sentence.

---

### E.1.10 — ⭐⭐ THE FIND: **A SECOND AI AUTHORING SYSTEM ALREADY EXISTS, IT CREATES REAL CONSTRAINTS, AND IT IS WIRED TO NOTHING**

**Authority:** `apps/component-editor/src/ai/` — 4 files, 540 lines.
**ADR:** `ADR-0316-family-creator-is-a-second-composition-root.md` (**Status: Accepted**, 2026-08-11).
**Contract:** C74 (constraint honesty) governs the solver posture; C01 §1 (P1) governs the second root.

⛔ **This is the single most important thing this lane found, and no document in the RAC tree mentions
it.** `grep -rn "component-editor" packages/ai-host` → **no output**. C67 does not cite it. C68 does not
cite it. The chat-capability gate does not scan it.

**What it is.** `apps/component-editor/src/ai/toolRegistry.ts:171-184` declares **12 AI-invocable verbs
with a hand-rolled validator each**:

| Category | Verbs | Master-spec section served |
|---|---|---|
| `constraint.*` | `addCoincident` · `addDistance` · `addFixed` · `addParallel` · `addPerpendicular` | **§14 constraints · §41 AI creates INTENT** |
| `referencePlane.*` | `add` · `update` · `reorient` · `remove` | **§14 reference planes · §16 feature graph** |
| `solid.*` | `add` (kind ∈ `extrude`/`sweep`/`revolve`/`loft`/`boolean`) · `remove` · `setLodBitmask` | **§4.4 geometric · §57 Solid tool group** |

⭐ **`constraint.addDistance` already accepts a PARAMETER NAME instead of a number**
(`toolRegistry.ts:78-91`): *"`value` must be a number or a non-empty parameter name"*, backed by
`ScalarOrParam = number | string` (`packages/constraint-solver/src/types.ts:45`) and resolved by the
solver through `resolveExpr`. **That is the first and only place in PRYZM where an authored value can
be a reference rather than a literal** — the seed of master spec §11's expression engine.

**The pipeline is the spec's §45 loop, already written** (`apps/component-editor/src/ai/aiHostBridge.ts:1-24`):
```
submit(prompt) → @pryzm/ai-host proposal → LOCAL approval queue
accept(id)     → validate EVERY command through the tool registry
                 (failure → AiBridgeValidationError with per-command {index, verb, errors[]},
                  proposal rejected with a structured reason, BUS UNTOUCHED)
               → commandBus.executeBatch(..., spanName 'pryzm.family.ai.batchExecute')
                 → ONE undo entry
reject(id)     → drop; no commands run
```
Its header states the guarantee explicitly: *"The host itself does NOT mutate the editor; mutation only
happens on `accept`. This preserves the … 'AI host is pure, never touches the bus directly' guarantee."*

⛔ **AUTHORED BUT UNREACHABLE — measured:**
```
grep -rn "createAiHostBridge" --include=*.ts apps packages
  apps/component-editor/src/ai/aiHostBridge.ts:98      <- the definition
  apps/component-editor/__tests__/ai/aiHostBridge.test.ts:28,79
  apps/component-editor/__tests__/ai/replay.test.ts:33,75
```
**Zero production call sites.** `familyEditorRuntime.ts` does not construct it (`grep -n createAiHostBridge apps/component-editor/src/app/familyEditorRuntime.ts` → no output), so the `loadHost` option is never supplied and `DEFAULT_LOADER` (`:88-92`) throws by design.

⛔ **And the app itself is unreachable from the editor.** `apps/editor/src/familyCreatorPlaceholder.ts`
is the honest statement, carrying a **C74 §3.4 SCAFFOLD DECLARATION**:
> *"WHAT IS FAKE, stated plainly — this module is named for the Family Creator and creates no family …
> Clicking 'Component' / 'Generic Component' in the create rail reaches a dialog, not an editor."*
> *"⚠ MILESTONE HONESTY (C74 §4.2(c)): the 'S58' above is the PLAN's number, restated, not a fresh
> promise … **treat S58 as UNSCHEDULED until `apps/component-editor` has a deploy target.**"*

⚠ **The solver behind it is a MOCK, and says so.** `packages/constraint-solver/src/PlanegcsAdapter.ts:1-27`:
`kind` reports `'mock'` for every construction; `intendedEngine = 'planegcs'` is a *separate* field
*"so intent can never be read as capability"*; a real binding is **UNAUTHORISED** until
**C74 §4.2(c)** records, in writing, a constraint family that genuinely needs *solving*. A retirement
test (`PlanegcsAdapter.test.ts`, *"scaffold retirement guard"*) fails the moment a real engine executes.

---

## §E.2 — WHAT IS REUSABLE, AND HOW

### E.2.1 — REUSE DIRECTLY, UNCHANGED — the capability control plane

| Artefact | File | How a universal component editor uses it |
|---|---|---|
| `ChatCapability` record + the two proofs | `packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts:270-357` | **This IS the "AI tool descriptor" the spec needs.** Add component-editor verbs as rows; `probe` + `commandProof` keep the claim honest. **Do not design a new tool schema** (§1). |
| `allChatCapabilities()` → generated LLM vocabulary + generated field shapes | `LlmPlanner.ts:28-43`, `:358-363` | the component editor's tool list must be **generated from the registry**, never hand-written. C67 §4 rule 4. |
| The five-rung ladder with ONE IR and ONE front door | `ZeroTokenResolver.ts` `applySemanticIntent` | a component-editor utterance takes the same ladder; a new `SemanticIntent` member per authoring op, and `applySemanticIntent` stays the only place semantics become commands. |
| `ScopeDescriptor` + `FilterScope` pre-stripper | `intents/ScopeDescriptor.ts`, `intents/FilterScope.ts` | `"make the mullions on the south facade 60 mm"` — the scope algebra is family-agnostic and filters compose for free. |
| `SpatialScopeTail.ts` (the ONE place phrase parser) | `intents/SpatialScopeTail.ts` | **mandatory** — C67 §4 rule 16 forbids a second place-phrase regex. |
| `resolveCatalogueRef` — THE ladder | `packages/command-registry/src/catalogue/resolveCatalogueRef.ts:1-50` | exact id → exact name → case-insensitive name → **unambiguous word subset**; *"Ambiguity returns null, never a coin-flip … the caller refuses and lists candidates"*. Any component/type/material catalogue must resolve through this, not a rival matcher. |
| `CapabilityValueSource` (21 members) | `ChatCapabilityRegistry.ts:117-228` | the component editor adds `component-definitions`, `component-types`, `parameters`, `materials` as new members — the union is the extension point. |
| `classifyDispatch` + `DispatchOutcome` + `BATCH_REPORT_EVENTS` | `ZeroTokenChatBridge.ts:1240-1345`, `:1448` | the five-state outcome union and the derived report-event table transfer verbatim; they are what stops a component editor saying "Done" over a model nothing touched. |
| `CapabilityRefusal`'s three states + four-condition guard | `capabilities/CapabilityRefusal.ts:41`, `:672-686` | `clarification ≠ refusal ≠ miss`, and *"a refusal that guesses is worse than a miss"*. |
| The claiming-discipline guards | `CapabilityRefusal.descriptiveReportReason`, `LocalNaturalLanguageResolver.Normalized.corrected`, `ZeroTokenResolver.PROTECTED_FUNCTION_WORDS` | three production P0s already paid for. C67 §4 rule 7. |
| `check-chat-capability-coverage.ts` (gate 31, 13 checks) | `tools/ga-gate/check-chat-capability-coverage.ts` | ⚠ **its `HANDLER_GLOBS` (`:203-207`) must be extended** — see E.4.1. |

### E.2.2 — REUSE THE PIPELINE, NOT THE PROMPT — `AiPlane`

`packages/ai-host/src/AiPlane.ts` already gives: content-hash response cache (ADR-050) · budget
pre-check (`CostMeter`, `$0.18`) · a workflow registry for plugin discovery · an approval queue ·
`AiBus` events (`workflow.start` / `propose` / `commit` / `cacheHit`) · one `pryzm.ai.workflow.{kind}`
span. **Nothing commits until step 9.** Production consumers today are exactly two —
`apps/editor/src/ui/apartment-layout/ApartmentLayoutController.ts:310` and
`plugins/ai-floorplan/src/handlers/index.ts:39,62` — so the plane is proven but almost unused.
⭐ **A component-authoring workflow is the obvious third consumer, and it is the only path that gives
the master spec's §45 proposal object a place to live.**

### E.2.3 — ⭐ REUSE THE CONSEQUENCE CONTRACT — this is the §44/§45 substrate, and it is BUILT

**Authority:** `packages/command-bus/src/consequence.ts` · **ADR:** 0322 (one consequence contract),
0323 (disposition + the four-state ladder), **0324 (AI invokes the same loop)** — all **Accepted**.

Exported vocabulary (`packages/command-bus/src/index.ts`): `ElementSet` · `UndeterminedReason` ·
`UndeterminedImpact` · `ImpactDetermination` · `ConsequenceRefusal` · `RefusalSet` ·
`ConsequenceCommandRef` · `TopologyDelta` · `ViolationRef` · `ValidationDelta` · `RegenerationPlan` ·
`MetricTransition` · **`ConsequencePlan`** · **`PredictedVsActual`** · **`ConsequenceReport`** ·
`ActualConsequences` · `UndeterminedOutcome` · **`PlanDivergenceVerdict`** · **`PlanStaleRefusal`** ·
`PredictionAbsence` · `ExecutionConsequence` · `PlanningContext` · `ConsequencePlanner` ·
`ConfirmationRequirement` · `ConfirmationReason` · `ConfirmationPolicy` · `CommandActor` ·
`CommandOrigin` · `CommandApproval` · `CommandExecutionContext`.

Seven certification gates already enforce it:
`tools/rac-conformance/certification/gates/check-ai-human-parity.ts` ·
`check-approval-binding.ts` · `check-consequence-report-completeness.ts` ·
`check-execution-plan-agreement.ts` · `check-no-silent-partial.ts` · `check-plan-determinism.ts` ·
`check-preview-purity.ts`.

ADR-0324's own words are the master spec's §44–45 restated in PRYZM's vocabulary:
> §4 *"AI confirmation happens AFTER prediction … human confirmation over the ACTUAL consequence set
> (including untouched counts and undetermined items) → execution of the exact approved plan →
> post-mutation report. **A proposal card without the consequence set is the specification gap, not a
> confirmation.**"*
> §5 *"Approval binds to the plan, not to the sentence. `planId`/`planHash`/state-hash generated
> together; execution verifies both; a model change between approval and execution invalidates the
> approval → re-plan → re-ask."*
> §3 *"`normalize(result.human) === normalize(result.ai)` for identical command+payload … actor/channel
> may affect AUTHORIZATION POLICY, but must not alter geometric, dependency, validation,
> consequence-planning, or mutation semantics."*

⛔ **The chat consumes NONE of it.** The Confirm card takes a **prose string**
(`ZeroTokenUiHooks.confirm(summary: string, choices?)`, `ZeroTokenChatBridge.ts:1203-1211`), not a
`ConsequencePlan`; the dispatch passes no `context` and no `plan`
(`bus.executeCommand(c.type, c.payload)`, `:1629`/`:1644`). **Wiring the chat onto ADR-0322/0324 is
reuse, not new architecture, and it is the highest-value single item this lane can name.**

### E.2.4 — REUSE THE COMPONENT-EDITOR AI SURFACE — do not rebuild it

`apps/component-editor/src/ai/{types,toolRegistry,approvalQueue,aiHostBridge}.ts` is 540 lines of
already-written, already-tested (`__tests__/ai/aiHostBridge.test.ts`, `__tests__/ai/replay.test.ts`)
propose→validate→batch-execute machinery for constraints, reference planes and solids. **It needs a
production caller and a merge with the C67 registry — not a redesign.** ⚠ Two reconciliations are
owed before it can be adopted:
1. **Batch semantics disagree.** Component-editor `commandBus.executeBatch` collapses a proposal to
   **ONE undo entry** (`aiHostBridge.ts:13-16`); the main editor's `batchCoordinator.runBatch` is
   **undo-NEUTRAL** — N commands are N entries (ADR-0314, quoted at `ZeroTokenChatBridge.ts:22-30`).
   ADR-0324 §6 already names the resolution: batches declare **Atomic** or **Progressive**.
2. **Two rival tool registries.** `toolRegistry.ts`'s hand-rolled validators are a **second source of
   chat truth**, which C67 §4 rule 4 forbids. The merge direction is clear: component verbs become
   `ChatCapability` rows with `probe` + `commandProof`, and the hand-rolled validators become
   `CapabilityValueSource` members.

### E.2.5 — REUSE THE WORLD-MODEL QUERY SURFACE — `GraphQueryService`

`packages/ai-host/src/graph/GraphQueryService.ts` (888 ln) is the read-only projection behind
`graph.query` / `graph.neighbors` / `graph.path`, registered at
`apps/editor/src/engine/graphQueryBusHandlers.ts:100/114/128` and wired from `initBusHandlers.ts:3083`.
**Contract:** C70 D-INV-1/2/3, C71 §4.
⭐ **Its discipline is exactly what master spec §34 needs**: *"Every method returns a DISCRIMINATED
result, never a bare `[]`"* — five outcomes kept distinct (`no results` · `unknown-element` ·
`graph-unavailable` · `unsupported-relationship` · `hierarchy-not-in-graph`). `partOf` is answered by
**derivation** from the sole hierarchy substrate (ADR-0328 supersedes ADR-0325's refusal), never by a
second record.
⛔ **But it is invisible to the RAC.** No `ChatCapability`, no `CHAT_UNAVAILABLE` entry, no
classification: `grep -n "graph\." packages/ai-host/src/capabilities/*.ts` → no output. See E.4.1 for
why the gate cannot see it either.

---

### E.2.6 — ⭐⭐ THE SECOND FIND: **`@pryzm/family-runtime` IS THE §9–11 EXPRESSION ENGINE, ALREADY BUILT, AND NO AI PATH REACHES IT**

The master spec §11 asks for *"a typed expression engine [supporting] formulas and detect[ing]
circular dependencies, undefined references, unit mismatch, invalid expressions/types"*. **It exists.**

| Spec §11 requirement | Where it already lives |
|---|---|
| typed expression grammar | `packages/family-runtime/src/expression/parser.ts:1-17` — recursive descent; `expr := compare`, `addsub`, `muldiv`, `unary`, `call`, `primary`; AST is a discriminated union (`number` \| `ident` \| `neg` \| `arith` \| `cmp` \| `call`) |
| **units are semantic and typed** | `expression/tokenizer.ts` emits **unit-tagged numeric literals** (`5 mm`, `0.5 m`, `90 deg`, `1.57 rad`); `expression/unit-coercion.ts:1-18` canonicalises length→mm, angle→rad |
| **unit mismatch detected** | `unit-coercion.ts:21-26` `UnitMismatchError` — *"We DO NOT cross-convert: a `m` literal supplied where an angle parameter is expected raises `UnitMismatchError`"* |
| **circular dependencies detected** | `resolution/resolveParameter.ts:90-126` — **Kahn's topological sort**; parameters in a cycle are excluded and surfaced as a `cycle` diagnostic, *"Resolution proceeds for every parameter NOT involved in a cycle so the editor can still render"* |
| undefined references / invalid expressions | the `ResolverDiagnostic.code` union, `family-runtime/src/types.ts:92-101` |
| **no unsafe arbitrary string substitution** | it is a parser with an AST, not `eval`; the function table is *"the single source of truth"* for arity (`parser.ts:16-17`) |
| the canonical parameter record | `packages/schemas/src/family-parametric/parameter.ts:34-37` — `ParametricParameterSchema { range, constraint?: string }`, L0-pure Zod |

⭐ **And its diagnostic is EXACTLY the structured shape master spec §44 asks for** (`types.ts:90-101`):
```ts
interface ResolverDiagnostic {
  severity: 'warn' | 'error';
  code: 'unknown-identifier' | 'cycle' | 'expression-parse' | 'expression-eval'
      | 'invalid-default'  | 'invalid-override' | 'duplicate-name' | 'invalid-name';
  parameterId: string | null;
  message: string;
}
```
Compare with what the chat can produce today: `{ kind:'refusal', intent, reason: string, suggestions: string[] }`.
**One is machine-actionable; the other is English.**

⛔ **AUTHORED BUT UNREACHABLE FROM ANY AI PATH — measured:**
```
grep -rln "@pryzm/family-runtime" --include=*.ts --include=*.json \
     packages/*/src packages/*/package.json apps/*/src apps/*/package.json plugins/*/src plugins/*/package.json
  -> packages/family-instance, packages/family-loader, packages/file-format/family-migrations,
     packages/schemas/family-*, and family-runtime itself.
  -> ZERO importers in apps/editor, apps/component-editor, plugins/**, or packages/ai-host.
```
The same holds for `@pryzm/formula-library` (12 pure functions: `sum`, `avg`, `min`, `max`, `count`,
`distance`, `area-rect`, `perimeter-rect`, `ratio`, `clamp`, `lerp`, `round`) — its only non-self
importer anywhere is **`apps/api-gateway`** (server-side). `grep -rn "formula-library|FormulaCatalog"
packages/plugin-sdk apps/editor plugins` → **no output**.

---

## §E.3 — WHAT IS GENUINELY MISSING

Each row is evidenced by a search that FAILED, quoted. Nothing here is a gap I could not disprove.

### M-1 · **No AI verb creates a CONSTRAINT or a FORMULA in the main editor.** (spec §41–42, §14–15)
```
grep -rnE "type\s*[:=]\s*'[a-z][\w-]*\.(addConstraint|constraint)" --include=*.ts plugins apps/editor/src/engine
  -> (no output)
grep -ic "formula" packages/ai-host/src/intents/ZeroTokenResolver.ts   -> 0
grep -ic "formula" packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts -> 0
```
**Not missing:** the substrate (E.1.10, E.2.6). **Missing:** a bus verb, a `SemanticIntent` member and a
`ChatCapability` row. Every `SemanticIntent` value field is a resolved literal.

### M-2 · **The AI cannot CREATE any element directly except through a handful of named exceptions.** (spec §57–62, §64)
`ChatCommandClassification.ts:59-72` defers **every** `*.create` verb behind ONE `blockedBy`:
*"per-family placement grammar (coordinates/host references) in the resolver context"* — `beam.create`,
`ceiling.create`, `column.create`, `curtain-wall.create`, `floor.create`, `furniture.create`,
`grid.create`, `handrail.create`, `lighting.create`, `plumbing.create`, `room.create`, `roof.create`,
`slab.create`, `stair.create`, `roof.addSkylight`, `slab.addHole`, `wall.createBetweenMarks`.
The exceptions, all in `SemanticIntent`: `create-wall` (`:833`, coordinate grammar),
`create-windows-parametric` (`:1189`), `create-stair-span` (`:1065`), `create-stair-shape` (`:1086`),
`replicate-element` (`:1100`), the four `generation.*` controllers (`:1236` / `:1330` / `:1375` / `:1402`),
and `activate-placement` — which creates **nothing**: it activates the placement tool and *"nothing is
created until the user clicks"* (`ZeroTokenChatBridge.ts:1817-1824`).
⭐ **The executors all exist.** This is a *grammar* gap, not an *executor* gap — the same finding shape
as C67 §1.8.0's *"the gap is PUBLICATION, not implementation"*, and the same materially-cheaper job.

### M-3 · **No AI-authored command carries provenance. Three rival vocabularies, none written.** (spec §35)
```
grep -n "actorKind|actor:|origin:|approval:|context:" apps/editor/src/ui/ai/ZeroTokenChatBridge.ts  -> (no output)
grep -c "provenance|Provenance|AIArtefact" apps/editor/src/ui/ai/ZeroTokenChatBridge.ts             -> 0
grep -c "provenance|Provenance|AIArtefact" apps/editor/src/ui/ai/AIPanel.ts                          -> 0
grep -rn "source: 'ai'" --include=*.ts packages/*/src apps/*/src plugins/*/src
  -> 3 hits: 2 code COMMENTS about a version-counter bug, and one SELECTION EVENT
     (apps/editor/src/ui/ai/AIPanel.ts:953). ZERO command dispatches.
```
- **C09 §1** requires *"dispatches commands with `source: 'ai'`"* → **0 dispatches carry it.**
- **C23 §1.1** requires *"Every AI call MUST write an AIArtefact before returning"* → the store is real
  and wired (`composeRuntime.ts:1142`, exposed `:2079`, serialized `ProjectSerializer.ts:910`), and the
  chat writes **nothing** to it. C23's own §0.0 banner already records this as NOT-YET-TRUE; it is
  **still** NOT-YET-TRUE on 2026-09-01.
- **ADR-0324 §1–2** (Accepted) defines `CommandExecutionContext` and the bus accepts it
  (`CommandBus.ts:331`) → **the chat never passes it.**

### M-4 · **There is no repair loop with the AI as proposer.** (spec §45)
The four propose→consent surfaces (E.1.7d) are all triggered by *editor* refusals. When a chat-authored
command fails, `classifyDispatch` renders one sentence and the turn ends — nothing re-plans.
`ADR-0324 §5` specifies the missing arm (`planId`/`planHash` → invalidate → re-plan → re-ask) and it is
**not implemented on the chat path**: the Confirm hook's signature is
`confirm(summary: string, choices?): Promise<boolean>` (`ZeroTokenChatBridge.ts:1203-1211`) — a boolean
over prose, with no plan to bind to.

### M-5 · **The LLM prompt sees almost nothing.** (spec §43)
`LlmPlanner.buildPlannerFacts()` (`:365-383`) renders three lines: a selection COUNT with element
TYPES (no ids, no values), the level list, and **wall type names only** — the `cats` array has exactly
one `push`, guarded on `ctx.wallSystemTypeNames`. Window / door / slab / ceiling / stair / handrail /
lighting / curtain-wall catalogues sit in `ResolverContext` and are never rendered. No parameters, no
constraints, no materials, no host, no relationships, no geometry status.

### M-6 · **The World-Model query surface is not an AI capability.** (spec §34)
`graph.query` / `graph.neighbors` / `graph.path` are live bus verbs
(`apps/editor/src/engine/graphQueryBusHandlers.ts:100/114/128`, registered from `initBusHandlers.ts:3083`)
with a genuinely disciplined refusal model. But:
```
grep -n "graph\." packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts \
                  packages/ai-host/src/capabilities/ChatCommandClassification.ts   -> (no output)
```
Not a capability, not deferred, not classified — **and not even counted as registered** (E.4.1).

### M-7 · **No definition → type → instance vocabulary in the AI layer.** (spec §6, §12, §23–25)
```
grep -rn "ComponentDefinition|ComponentType|ComponentInstance" --include=*.ts packages/ai-host/src
  -> 2 hits, both `AIReadModel.getComponentInstanceStore()` (a legacy `any`-typed accessor)
```
The chat's `set-*-type` family changes an element's `systemTypeId`; there is no capability that
**creates** a type, **versions** a definition, or reasons about instance-vs-type override precedence.
Master spec §64's *"make the Medium type 1600 mm"* has no route.

### M-8 · **No deferral-staleness gate.** (C67 §4 rule 15)
```
ls tools/ga-gate/check-deferral-blockers.ts  ->  No such file or directory
```
C67 §1.8.4 measured the cost once (`element.changeType`: eleven families dark behind a blocker that had
already been satisfied). Nothing prevents the next one. 131 Class-B + 61 `CHAT_UNAVAILABLE` = **192
deferrals whose reasons nothing re-validates.**

### M-9 · **`packages/formula-library` is server-only; `packages/family-runtime` has no client consumer.**
Both quoted in E.2.6. For the master spec's §46–56 code-native authoring, the DSL runtime exists and the
browser cannot reach it.

---

## §E.4 — TRAPS

### T-1 · ⛔ **The coverage gate scans THREE files. Anything registered elsewhere is invisible — including a whole World-Model query surface.**
`tools/ga-gate/check-chat-capability-coverage.ts:203-207`:
```ts
const HANDLER_GLOBS = [
  'plugins/*/src/handlers/*.ts',
  'apps/editor/src/engine/initBusHandlers.ts',
  'apps/editor/src/engine/engineLauncher.ts',
];
```
`graph.query` / `graph.neighbors` / `graph.path` declare their `type:` literals in
`apps/editor/src/engine/graphQueryBusHandlers.ts`, which matches none of the three. **So the headline
"UNDECLARED: 13" is computed over a universe that excludes them.** The gate's own §R5-FLOOR comment
(`:227-241`) anticipates exactly this class — *"a `HANDLER_GLOBS` typo … would print 'UNDECLARED: 0 …'
over a repository it never read"* — and installs floors (`MIN_HANDLER_FILES = 150`) that catch a *total*
miss but not a *partial* one. **Before adding component-editor verbs, extend `HANDLER_GLOBS` — or the
new surface will be born invisible.**

### T-2 · ⛔ **`§FEAT-CHAT-SYMMETRY` has NOTHING to do with geometric symmetry.**
20 hits across `ChatCapabilityRegistry.ts` and the resolvers. It means **capability-surface symmetry** —
*"the chat can set a wall's height, so it should be able to set a ceiling's height"* — and was minted for
the founding incident's twin families (`:966`, `:1023`). A newcomer implementing master spec §13
(*"make this symmetrical"*) or §68 (the `symmetric` constraint) will grep "symmetry", find twenty hits,
and conclude the feature exists. **It does not.** `SketchConstraint` (`packages/constraint-solver/src/types.ts:49-54`)
has **five** kinds — `distance-pp`, `parallel`, `perpendicular`, `coincident-pp`, `fixed` — and
`symmetric`, `equal`, `horizontal`, `vertical`, `tangent`, `concentric`, `aligned`, `angle`, `radius`,
`diameter` are all absent.

### T-3 · ⛔ **A `commandProof` is not a proof. Nine of them declare themselves ORPHANED and still pass.**
`probe-route-shadowing.ts` (run 2026-09-01) closes with: *"A `commandProof` that says 'ORPHANED — no
longer called' is a proof of nothing. The D14 gate accepts it because of WHERE it lives, not because
anything calls it."* Gate 31 check 3d classifies route liveness **by the directory the proof file sits
in** (C67 §6.2). Today's list of nine includes `set-height`, `set-thickness`, `set-roof-pitch`,
`set-overhang`, `set-curtain-wall-type` and all four scoped deletes.

### T-4 · ⛔ **Gate 31 is a V1/V2 instrument only. "182 examples EXECUTED" is not evidence the model changed.**
C67 §1.0 defines seven verdicts (V1 RESOLVE · V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC ·
V7 REPORT) and §6.2 tabulates which instrument reaches which. **V3 is covered for 18 verbs of 361**, by
`tools/rac-conformance/certification/gates/check-authoritative-state.ts`, whose CI job
(`bim20-certification`) is `continue-on-error: true`. C67 §1.7.2 is the structural reason: `runtime.stores`
after a successful `composeRuntime()` exposes only `registerHydrator, hydrate, viewState, project` — the
geometry stores the serializer, the 2-D projector and the IFC exporter read are built by
`apps/editor/src/engine/engineLauncher.ts`, which `composeRuntime()` never references.
⭐ **BUT C67 §5's own status line for this is now STALE, in the good direction.** It records next-4 as
*"not started"*; measured 2026-09-01, **ADR-0318 (Accepted, 2026-08-11) IS implemented** —
`packages/runtime-composer/src/types.ts:3032` declares `ElementStoresSlot`, `:3083` puts
`readonly elements: ElementStoresSlot` on the runtime, and `composeRuntime.ts:1666` constructs it, with
an executed identity probe at `tools/rac-conformance/runtime-harness/__tests__/adr0318.stores.probe.ts`.
**Re-measure V3 coverage before quoting "unprovable by construction" at anyone** — the constructional
half may be closed and only the certification coverage (18 verbs of 361) still open.
⭐ The lesson to carry: *"Had I probed the DTO store, all fifteen would have shown a correct patch and
returned a **FALSE PASS**"* — and `wall.bulkSetVisuals` armed an inverse keyed to a store it never
wrote, so **a dead write plus a live undo is worse than either alone.**

### T-5 · ⛔ **"UNPROVEN" is a third value. Never fold it into PASS or FAIL.**
C67 §1.0: *"Three values, never two: `PASS` ≠ `FAIL` ≠ `UNPROVEN`."* The cat-1-5 scorecard reads
`V3/V4/V5/V6: 0 PASS · 0 FAIL · 55 UNPROVEN`. Reading that as "fine" or as "broken" both destroy the
study's most useful output.

### T-6 · ⛔ **The preposition must not decide the scope kind, and there is a FIFTH spelling still on disk.**
C67 §4 rule 16 (L-1201): *"on level 2"* and *"in level 2"* are the same sentence; the **noun** decides.
Every grammar must read its place phrase through `packages/ai-host/src/intents/SpatialScopeTail.ts`.
The cost of the absence, measured on the real ladder: *"set all windows in level 2 width to 1.5m"*
dispatched **`{ width: 2 }`** on a `destructive: true` mass edit with a confidently wrong Confirm card.
⚠ A **fourth** spelling was found *after* the rule was written (`WALL_RAKE_SCOPE`, L-1372) and a **fifth**
is deliberately left in `WALL_COLOR_RE` because folding it in without its `(?!colou?r )` lookahead turns
*"make all walls in white"* into a place phrase. **The gate that would catch a sixth is still TO BUILD.**

### T-7 · ⛔ **Two destructive misreads were live at the last measurement and their corpus rows do not exist.**
C67 §1.6: **O-1** *"remove the plasterboard layer from all walls"* → `element.delete` — **the wall is
deleted** (L-1081). **O-2** *"undo would remove the wall, right?"* — a hypothetical whose main verb is
`undo` — **deletes the wall** (L-1082). Neither utterance is in the adversarial corpus, so gate 31 check
4c executes neither. A new authoring grammar inherits this class unless C68 §5.j's opener taxonomy is
built (C67 §5 next-5, *not started*).

### T-8 · ⛔ **`AiPlane` and the RAC chat are different systems with different safety models.**
`AiPlane` is propose → **human approval** → commit, with a cost meter. The RAC chat dispatches
immediately unless `destructive: true`. Only **12 of 77** capabilities are `destructive: true`; only
**2** are `readOnly: true`; **10** use a `localAction` escape. Do not assume a capability is gated.

### T-9 · ⛔ **`runBatch` is undo-NEUTRAL. `executeBatch` is not. They are in different apps.**
ADR-0314: `batchCoordinator.runBatch` is the event/geometry-storm gate — *"N commands inside runBatch are
N undo entries, and the summary must say so."* One undo entry is bought **only** by dispatching one
batch verb. `ZeroTokenChatBridge.ts:22-30` records that its own header once claimed the opposite and
*"the claim was false"*. Meanwhile `apps/component-editor`'s `commandBus.executeBatch` **does** collapse a
proposal to one undo entry. **Two apps, two batch semantics, one word.**

### T-10 · ⛔ **`visibility.*` capabilities declare `localAction`, not `busCommand`, because the GATE cannot see the composition root.**
`ChatCapabilityRegistry.ts:336-343`: the `visibility.*` verbs are registered by `composeRuntime` §4d-bis,
*"which the coverage gate's handler-file scan cannot see, so declaring it as `busCommand` would read as a
phantom"*. **The gate's blind spot shaped the data model.** Anyone reading `localAction:
'applyVisibilityIntent'` as "this bypasses the bus" is half right and half wrong: it dispatches a real bus
command **and** projects onto the scene.

### T-11 · ⛔ **Do not transcribe C67's numbers.** §1.2's table is dated `2026-08-19 @ f89c735c`. Measured
2026-09-01: capabilities 56 → **77**, commands 325 → **361**, `UNDECLARED` 0 → **13** (baseline breached),
resolver case arms 27 → **30**, unreachable properties 40 → **47/42** (breached), plugin-only detached
routes 1 → **2**, ORPHANED commandProofs 8 → **9**. C67 §1.2's own header says it: *"Never transcribe a
number without its derivation."*

### T-12 · ⛔ **`apps/component-editor` is a SECOND composition root, and that is a ratified decision, not debt.**
`ADR-0316` (Accepted, 2026-08-11) argues the case measured: `composeRuntime()` statically imports
`buildWorkspaceSurface` from the `@pryzm/renderer-three` barrel, and `three/build/three.core.js` is
**281,053 bytes gzip — 1.53× the component editor's ENTIRE 180 KB first-paint budget**, before a line of
PRYZM code. *"Delegation does not slow the Family Creator down; it makes its stated contract
unsatisfiable."* A universal component editor that plans to run inside `composeRuntime` must re-open
this ADR deliberately, not by accident.

### T-13 · ⛔ **The Family Creator entry point is a truthful placeholder that the create rail really reaches.**
`apps/editor/src/familyCreatorPlaceholder.ts` carries a C74 §3.4 scaffold declaration and a **retiring
assertion** (`FamilyCreatorPlaceholderScaffold.test.ts`) that fails the moment the create rail stops
importing it. ⚠ **There are TWO files with this name and different callers** (`apps/editor/src/familyCreatorPlaceholder.ts`
← `CreateRailPanel.ts:1105`; `apps/editor/src/ui/familyCreatorPlaceholder.ts` ← `CreatePanelLayout.ts:350`),
a third was deleted as dead. Grep will hand you the wrong one.

### T-14 · ⛔ **The constraint solver is a MOCK and is deliberately unauthorised to be otherwise.**
`PlanegcsAdapter.ts:1-27`: `kind` reports `'mock'`; `intendedEngine: 'planegcs'` is a separate field *"so
intent can never be read as capability"*; the real binding *"may be built only when some constraint
family is shown, in writing, to need SOLVING (a simultaneous system with no closed form)"* — **C74
§4.2(c)**. Building a solver-dependent AI capability without that written record is an unauthorised
adoption, not an implementation detail.

### T-15 · ⛔ **`ResolverContext` has exactly ONE construction site, and it is in the app layer.**
`ZeroTokenChatBridge.buildContext()` (`:1030-1195`). C67 §1.8.4 cited its absence of a `catalogues`
writer as the blocker that kept eleven element families dark. Any new context a component editor needs
lands **here**, or it is unreachable — and `ai-host` must stay pure (no DOM, no stores, no fetch).

---

## §E.5 — THE FOUR HARD QUESTIONS, ANSWERED WITH CODE

| Spec | Question | Verdict | The code that decides it |
|---|---|---|---|
| **§40** | Does AI dispatch **only** through the command bus? | **YES for every model mutation. NO for two declared view-state escapes.** | every mutating path is `bus.executeCommand` at `ZeroTokenChatBridge.ts:1629` / `:1644`; the exceptions are `localAction: 'setActiveLevel'` (`:1802`, a direct `projectContext.activeLevelId =` assignment) and `localAction: 'applyVisibilityIntent'` (`:1806`, dispatch **plus** a direct THREE-scene projection). `LlmPlanner.ts:8-12` forbids the model a verb of its own; gate 31 proves the declared route exists. ⛔ **But the dispatch carries no actor** — ADR-0324's `CommandExecutionContext` is accepted by `CommandBus.ts:331` and never passed. |
| **§41–42** | Can AI create **INTENT** (constraints / formulas), or only **values**? | **VALUES ONLY, in production.** | `SemanticIntent` (`ZeroTokenResolver.ts:671-1440`) — every value field is a resolved literal (`value: number`, `degrees: number`, `typeRef: string`). `grep -ic formula` over the registry and both resolvers → **0, 0, 0**. No constraint bus verb exists. ⭐ The two things that *would* satisfy §41 are **already written and unwired**: `apps/component-editor/src/ai/toolRegistry.ts:171-175` (five `constraint.*` AI verbs, `addDistance` already accepting a **parameter name** instead of a number) and `packages/family-runtime/src/expression/` (a unit-typed expression engine with cycle detection). |
| **§43** | What context does AI actually receive? | **The resolver gets 17 typed fields, mostly catalogues and scope services. The LLM gets THREE LINES.** | `ResolverContext` (`ZeroTokenResolver.ts:256-273`) built once, at `ZeroTokenChatBridge.ts:1030-1195`. `ResolverSelection` is **two fields** — `elementId`, `elementType`. `LlmPlanner.buildPlannerFacts()` (`:365-383`) renders selection-count + level list + **wall types only**. No parameters, constraints, feature graph, materials, host, geometry status or relationships reach the model. ⭐ The one exemplary property: ABSENT ≠ EMPTY at every injection point (`:1039-1042`). |
| **§44–45** | Are diagnostics structured enough for a repair loop? | **The OUTCOME classification is excellent and structured. The DIAGNOSTIC CONTENT is prose. The AI-proposer repair loop does not exist — but a real repair loop does, for one verb.** | structured: `DispatchOutcome`'s five-member union + the pure, separately-tested `classifyDispatch` (`ZeroTokenChatBridge.ts:1240-1345`), with `indeterminate` as a first-class state and an exhaustive switch. Prose: `{kind:'refusal', reason: string, suggestions: string[]}` (`ZeroTokenResolver.ts:453-458`). Real loop, editor-triggered: `WallMoveClashProposal.ts` → `verdict.offers`, each candidate re-run through the whole `canPlace` predicate before it may be offered, *"IT ASKS. IT NEVER AUTO-APPLIES."* Absent: any path from a failed chat command back into `LlmPlanner`. Substrate for it: **`packages/command-bus/src/consequence.ts` + ADR-0322/0323/0324 + seven certification gates — all built, none consumed by the chat.** |

---

## §E.6 — THE ONE-PAGE AI/RAC INTEGRATION ARCHITECTURE (§81 item 9), stated as REUSE

Every arrow below already exists somewhere in the tree. Nothing in this diagram is a new concept.

```
      utterance (chat)   ·   visual gesture   ·   component code (§46-56)
              │                    │                      │
              └──────────── ONE resolution ladder ─────────┘
                  ZeroTokenResolver: §PLAN → t0 → t1 → NL → LlmPlanner
                  (LLM vocabulary + field shapes GENERATED from the registry)
                                   │
                       SemanticIntent ∪ ScopeDescriptor ∪ ValueRefs
                                   │
                        applySemanticIntent  ← ONE semantic authority
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        │  MISSING TODAY: a ConsequencePlanner call before dispatch
        │  ADR-0322 · ConsequencePlan{planId, planHash, stateHash,
        │  impact, undetermined, refusals, undoUnits}
        └──────────────────────────┬───────────────────────────┘
                                   │
        Confirm card over the PLAN (not a prose summary)  ← ADR-0324 §4/§5
                                   │           ▲
                                   │           └── repair: structured diagnostic
                                   │               (ResolverDiagnostic | DiagnoseResult |
                                   │                ConsequenceRefusal) → re-plan → re-ask
                                   ▼
   bus.executeCommand(type, payload, { context: {actor:{kind:'ai'}, origin, approval}, plan })
                                   │                    ▲
                                   │                    └── ADR-0324 §1-2, accepted, UNUSED
                                   ▼
              authoritative stores (ADR-0318 elements slot)
                                   │
        ┌──────────────┬───────────┴────────────┬──────────────────┐
     geometry     ProvenanceStore           GraphQueryService     BATCH_REPORT_EVENTS
                  (C23 AIArtefact —          (graph.query/…  —     → classifyDispatch
                   wired, never written)      not a capability)      → five honest states
```

**Six wiring jobs, in dependency order. All six are connections, not inventions:**

1. **Stamp the actor.** Pass `{ context: { actor: { kind: 'ai' }, origin: { surface: 'chat' } } }` at
   `ZeroTokenChatBridge.ts:1629`/`:1644`. Closes C09 §1 and half of ADR-0324 §1. ~2 lines.
2. **Write the artefact.** One `ProvenanceStore` append per chat turn. The store is already composed
   (`composeRuntime.ts:1142`), serialized (`ProjectSerializer.ts:910`) and hydrated
   (`ProjectLoader.ts:1283`). Closes C23 §1.1, which has been NOT-YET-TRUE since it was written.
3. **Extend `HANDLER_GLOBS`** in `check-chat-capability-coverage.ts:203-207` so a verb registered outside
   the three scanned files cannot be born invisible. Then declare or classify `graph.*` and the 13
   currently-undeclared verbs (balcony ×4, lift ×3, bathroomPod ×2, room ×3, view ×1) to get the
   `UNDECLARED` ratchet back to its 0 baseline.
4. **Build `check-deferral-blockers.ts`** (C67 §4 rule 15 · §1.8.4). 192 deferrals, none re-validated.
5. **Make the Confirm card take a `ConsequencePlan`.** Change `ZeroTokenUiHooks.confirm` from
   `(summary: string)` to a plan, bind approval to `planHash`, and the repair loop becomes possible
   because there is now something to re-plan *against*. This is ADR-0324 §4/§5 and it is the single
   highest-leverage item in this list.
6. **Give the component editor a production caller and merge its tool registry into C67's.**
   `createAiHostBridge` has zero production call sites; `toolRegistry.ts`'s 12 verbs become
   `ChatCapability` rows with `probe` + `commandProof`; its hand-rolled validators become
   `CapabilityValueSource` members. Only then add `constraint.*` and `parameter.setFormula` verbs —
   pointed at `packages/family-runtime`'s already-built resolver, not at a new one.

⛔ **What this lane recommends AGAINST, on §1 grounds:** a new AI tool-descriptor schema (use
`ChatCapability`), a new refusal vocabulary (use `ChatResolutionState` + `DispatchOutcome`), a new
catalogue matcher (use `resolveCatalogueRef`), a new place-phrase parser (use `SpatialScopeTail`), a new
expression engine (use `family-runtime`), a new approval queue (use `AiPlane`'s), and a new
propose→consent surface (C83 §4.1 already named `ConsequencePlan`/`ConfirmationFlow`/`ConfirmationCard`
canonical and counted four).

---

## §E.7 — WHAT THIS LANE DID **NOT** MEASURE (stated so a blank is never read as "fine")

- **No utterance was typed into a live editor.** Every verdict above is source-measured or derived from
  a gate/probe run in this tree. V3/V4/V5/V6 for any capability is **UNPROVEN by this lane**.
- **The 192 deferrals were not re-validated.** C67 §1.8.4 re-validated two and found both stale. That is
  a sample of 2, not a clearance of 192.
- **`apps/component-editor`'s test suite was not run.** Its AI bridge is asserted unreachable on the
  strength of a call-site grep, which is sound for reachability but says nothing about correctness.
- **The BYOM arm (C105) was read, not exercised.** Whether the LLM rung behaves identically on the
  user-supplied route is not established here.
- **`AiPlane`'s two production consumers were not traced end-to-end.** That the plane is reachable is
  established (`composeRuntime.ts:752`); that its approval gate actually holds under
  `ApartmentLayoutController` is not.
