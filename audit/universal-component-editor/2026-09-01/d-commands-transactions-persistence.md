# LANE D — COMMANDS · TRANSACTIONS · UNDO · PERSISTENCE · EVENTS · VERSIONING

> **Phase 0 repository archaeology** for `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md`
> (§5 canonical model · §36–38 provenance/versioning/events · §40 AI-through-contracts).
> **Rule §1 obeyed: NOTHING IN THIS LANE WAS CODED OR MODIFIED.** This file is knowledge only.
> Every claim below is `file:line` + contract §. Where a capability is **AUTHORED BUT UNREACHABLE**
> it is labelled as such, because in this repo authored ≠ wired and that distinction decides
> reuse-vs-build.
>
> **Lane-D headline, stated once and up front:**
> **PRYZM already has the seam the spec §5 demands — and it already has a SECOND, RIVAL one built
> for exactly this product.** The canonical seam is
> `CommandBus.executeCommand(type, payload, { context, plan, gestureId })`
> (`packages/command-bus/src/CommandBus.ts:317`). The rival is
> `createFamilyEditorRuntime()` + `createCommandBus()` in **`apps/component-editor`** — a whole
> standalone "Family Creator" SPA (52 TS files, sketch tools, planegcs constraint solver,
> `.pryzm-family` v1 format, parameter table, IFC binding, marketplace publish) that is the
> *previous attempt at this exact spec*, blessed as a second composition root by **ADR-0316**.
> The most consequential decision this programme faces is **not "what shall we build" but
> "do we merge those two roots, and on whose command/undo model"** — and ADR-0316 §5 already
> names, in advance, the conditions under which its own blessing is void. The spec triggers
> **at least four of the six**.

---

## 0 · SUBSYSTEM MAP (what this lane inspected)

| # | Subsystem | Authority file | Contract |
|---|---|---|---|
| D1 | Command bus, handler contract, `HandlerResult` | `packages/command-bus/src/CommandBus.ts`, `types.ts` | C03 §2, C16 |
| D2 | Refusal / diagnostics machinery | `packages/command-bus/src/consequence.ts` | C74, C80 §1.4, C78 §8 |
| D3 | Consequence plan → confirm → execute → report | `packages/command-bus/src/consequence.ts`, ADR-0322 | C72, C80 |
| D4 | Invocation envelope (actor/origin/approval) | `consequence.ts:1283-1334`, ADR-0324 | C23, C75 |
| D5 | Verb surface (361 verbs) + liveness taxonomy | `docs/04-reference/API-VERB-REGISTER.md` | C69 |
| D6 | Undo/redo (three store layers, ring buffer, cross-stack order) | `apps/editor/src/engine/undo/performUndoRedo.ts` | C03 §4 |
| D7 | Batch / transaction coalescing | `packages/core-app-model/src/batch/BatchCoordinator.ts` | C16 §8 |
| D8 | Event model (`storeEventBus`, `CommandEventBridge`, mirrors) | `packages/runtime-composer/src/CommandEventBridge.ts` | C11 §10, C16 §5.1.1 |
| D9 | Project persistence (snapshot) | `ProjectSerializer` / `ProjectLoader` | C05 |
| D10 | File-format versioning + migrations | `packages/file-format/src/migrations`, `family-migrations` | C47 |
| D11 | Component/family persistence + versioning (`.pryzm-family`) | `packages/file-format/src/family-*.ts` | C47, C07 |
| D12 | The rival root: the Family Creator | `apps/component-editor/**` | ADR-0316 |
| D13 | Provenance / audit | `types.ts` `AuditMetadata`, `EventLogPersistor.ts` | C23, C75 |

---

## 1 · WHAT EXISTS

### D1 — The command seam. **This is the answer to the lane's headline question.**

**Authority:** `packages/command-bus/src/types.ts` (293 lines, L1) — the frozen S02/ADR-002 contract.

```ts
// types.ts:150-193
interface CommandHandler<TPayload, TStores> {
  readonly type: string;                                  // wire identifier
  readonly aliases?: readonly string[];                   // §FIX-COMMAND-NAMESPACE / L-796
  readonly affectedStores: readonly (keyof TStores & string)[];
  canExecute(ctx, cmd): ValidationResult;                 // pure pre-flight gate
  execute(ctx, cmd): Promise<HandlerResult> | HandlerResult;
}
```

`HandlerResult` (`types.ts:91-141`) carries **five** channels, and the last three are the
interesting ones for a component editor:

| field | meaning | contract |
|---|---|---|
| `forward` / `inverse` | Immer JSON-Patch pair — the transaction | C03 §4.1 |
| `nextStates` | per-store next snapshot | — |
| `consequence?` | post-mutation `ConsequenceReport` — **RESERVED, NEVER POPULATED YET** (`types.ts:99-105`) | ADR-0322 §9 |
| `refusal?` | typed **decision not to act, as a VALUE not a throw** | C80 §1.4 |
| `report?` | typed **answer of a QUERY verb, as a value**, mutually exclusive with `refusal` | C71 §4.4 |

**Maturity: PRODUCTION, and it is the P6 chokepoint.** `CommandBus.executeCommand`
(`CommandBus.ts:317-643`) is the single dispatch. Its ordering is stated in its own header
(`CommandBus.ts:1-17`) and a component editor would inherit it verbatim:

```
1. handler.canExecute()  → gate; a {valid:false} THROWS CommandBusError and pushes NOTHING
2. handler.execute()     → HandlerResult
3. per-store patch envelopes (routing by path[0] === storeKey, CommandBus.ts:515-529)
4. emitter.emit(record)  → PatchEmitter subscribers
5. undoStack.push(record)             (legacy EventRecord stack)
6. _ringBuffer.push(PatchPair)        (C03 §4.1 patch undo)
7. _crdtApplier(type, payload)        (G3-T2 direct bus → YjsDocAdapter)
```

Three properties a component editor gets for free and would otherwise reinvent:

1. **No global fallback, ever.** `buildContext` (`CommandBus.ts:280-299`) throws synchronously if
   a declared store is missing — *"The bus does NOT fall back to globals"* (ADR-002 §3 / R1A-16).
2. **Gesture identity** — `gestureScope.ts`, `CommandBus.ts:363`. One dispatch = one gesture
   unless a caller declares a wider one; carried onto `PatchPair.gestureId` so undo can recognise
   a dual-dispatch twin **by identity, never by wall clock** (C03 §4.6 U-10).
3. **Remote-origin suppression on BOTH stacks** — `CommandBus.ts:395-410` reads two signals
   (`opts.suppressUndo` *and* `payload._remoteSync`) because two production paths mark remoteness
   differently, so a collaborator's edit never lands on the local Ctrl+Z (C03 §4.6 U-1).

**⭐ The seam is already extended for AI and for plan/act separation, and BOTH extensions are
"carried but unread" by design** (`CommandBus.ts:406-412`, `:531-568`):
`executeCommand(type, payload, { context, plan, gestureId, suppressUndo })` where `context` is the
ADR-0324 **invocation envelope** and `plan` is the ADR-0322 **consumed ConsequencePlan**. Both ride
the `EventRecord` by *conditional spread* so records from legacy callers stay byte-identical. This
is precisely the extension point the spec §40/§45 needs, and **adding a reader disturbs no
existing verb.**

### D2 — Refusal machinery: `CapabilityRefusal`. **The spec's "structured diagnostics" already exists.**

`packages/command-bus/src/consequence.ts:755-807`:

```ts
export interface CapabilityRefusal {
  kind: 'refused';
  commandType: string;
  reason: UndeterminedReason;          // CLOSED 11-member union (C78 §8.1)
  subReason?: UndeterminedSubReason;   // typed per-family specificity — NEVER prose
  asked: number | undefined;           // C80 §1.4 first number
  unaccountedFor: number | undefined;  // C80 §1.4 second number
  protects: string;                    // C80 §3.2 — WHAT it is protecting, named, non-empty
  detail: string;                      // the human sentence; never branched on
}
export function capabilityRefused(input): CapabilityRefusal   // the single constructor
```

The `undefined` discipline is explicit and is one of this repo's hardest-won lessons:
*"it is never `0`-as-a-stand-in for 'we did not look'"* (`consequence.ts:766-772`). Its twin,
`CapabilityRunReport` (`consequence.ts:850-926`), makes `findings: []` mean *"zero results within
`checked`"* and **never** *"nothing ran"* — `checked` is mandatory and must be non-empty.

**Why this matters more than it looks for spec §20 / §45 / §71–73.** The spec demands
*"if a reference becomes ambiguous: FAIL CLOSED"*, *"GeometryStatus = Invalid with structured
diagnostics — never silently produce approximate geometry marked valid"*, and the repair loop
`proposal → validation → failure → structured diagnostic → repair proposal`. **PRYZM already has
the value type for the "structured diagnostic" leg, already on the dispatch seam, already
distinguished from a throw** — `types.ts:106-120` states why verbatim: *"a refusal the
caller can drop on the floor is an exception, not a refusal."*
✅ REUSE. ⛔ Do not mint a `GeometryError` / `ComponentDiagnostic` type.

### D3 — The consequence contract: plan → [confirm] → execute → read back → report

`packages/command-bus/src/consequence.ts` (1,334 lines) implements **ADR-0322** R1:
`ConsequencePlanner` (`:1246`), `PlanningContext` (`:1229`, deliberately minimal: read-only store
views and nothing else), `ConfirmationPolicy` (`:1271`), `ConsequenceReport` (`:996`),
`PredictedVsActual` (`:928`), `PlanStaleRefusal` (`:1102`), `PlanBindingVerification` (`:1156`).

Binding invariants, restated where the types live (`consequence.ts:16-33`):
- a planner **MUST NOT** mutate authoritative state (gate `G-REASON-01`);
- the executor **CONSUMES** the plan and may not recompute consequences under different rules
  (`G-REASON-03` — plan/execution divergence is a named certification-failure class);
- the report is produced from the actual execution record **plus** the plan, never a second
  inference pass;
- `untouched` is **derived at report time and never persisted** (ADR-0322 §6).

**Maturity: R1 — TYPES LANDED, NO PRODUCER.** `HandlerResult.consequence` is explicitly
*"RESERVED, NEVER POPULATED YET … No bus code reads this field in R1"* (`types.ts:99-105`), and
the file header warns *"FIRST DRAFT — the exact field shape is expected to be revised after the
`wall.move` golden operation closes end-to-end (R2–R7)"*. Roadmap:
`docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md`.
**AUTHORED-AND-CARRIED, NOT YET PRODUCED.** For the component editor that is good news, not bad:
the shape is reserved and the ADR says *"Do not build a rival representation when a field is
missing — evolve this one."*

### D4 — Provenance on the invocation: `CommandExecutionContext` (ADR-0324)

`consequence.ts:1283-1334` — three separate types the ADR forbids merging:

- `CommandActor { kind: 'human'|'ai'|'system'|'remote', id? }` — *"AI provenance is metadata about
  the invocation, not a different command path … every actor kind reaches the SAME
  `executeCommand()`"* (`:1279-1289`). **That sentence IS the spec's §40 requirement, already
  decided in PRYZM's favour.**
- `CommandOrigin { surface, proposalId? }` — WHERE (toolbar / chat / keyboard / sync / batch).
- `CommandApproval { proposalId, approvedBy, rationale?, confidence? }` — an AI-initiated,
  human-approved command reads `actor.kind==='ai'` **and** `approval.approvedBy=<human>`.
  *"Never merge these types, and never stamp `actorId='ai'` as a substitute"* (`:1299-1310`).

**Maturity: R1 CARRIED, READ BY NOTHING** (`consequence.ts:1325-1332`): *"carried onto the
`EventRecord` verbatim and otherwise UNUSED — no bus branch reads it, absence changes nothing …
geometric, dependency, validation, consequence-planning and mutation semantics MUST NOT [read it]
(ADR-0324 §3, gated by G-REASON-04 parity via `normalizeForParity` in `parity.ts`)."*

⛔ **TRAP for spec §36 provenance:** this envelope is *per invocation*, is **not persisted anywhere
today** (see D13), and `normalizeForParity` **strips it by construction**. A component editor that
wants `provenance {author, source, ai-generated, derived, version, command history}` on the
*object* is asking for something different from what ADR-0324 built, and must not assume this
envelope survives a save.

### D5 — The verb surface: 361 verbs, and a liveness taxonomy that already answers "is it real?"

**Authority:** `docs/04-reference/API-VERB-REGISTER.md` — **GENERATED, DO NOT EDIT**, produced by
`tools/ga-gate/check-verb-register.ts`, governed by **C69**. C69 §0.1: *"The register is produced
by a program from the handler sources. No section of this contract, and no other document, may
transcribe the verb list, the verb count, or any per-verb column. Cite the artefact."*

**Reading at generation time (cited, NOT transcribed as durable fact — re-run the gate):**
Handler files read 1407 · **Verbs 361** · LIVE 150 · REFUSES 37 · SHADOWED 0 · **UNKNOWN 174** ·
**authoritative store NONE-or-UNKNOWN 211** · sync UNDECLARED 2 · chat UNDECLARED 15.

The `liveness` column's derivation is the part a component editor must understand
(`API-VERB-REGISTER.md`, "Column meanings"):

- **LIVE** — declared in an execution-authority root (`packages/command-registry`, `apps/editor`),
  or a legacy bridge, or live via the §L-946 **mirror channel** (three statically-greppable
  conditions must all hold).
- **REFUSES** — registered and answers, **in the open**, that it will not act. Two accepted
  shapes: a `canExecute` that can never return `{valid:true}` (§FIX-DEAD-VERB-REFUSE), **or**
  `execute` returning a `CapabilityRefusal` on `HandlerResult.refusal` beside an empty patch pair
  (§REFUSAL-IS-A-VALUE — the C16 CA-18 shape).
- **SHADOWED** — two registration sites; the boot-order guard means the plugin one wins and the
  live bridge never registers.
- **UNKNOWN** — a lone plugin `produceCommand` handler; **nobody has proven either way.**

⛔ **`UNKNOWN` is an honest verdict, not a pass** (C16 §11.1). Nearly half the verb surface sits
there. **C69 §1.1: a verb is a WIRE IDENTIFIER — written into `project_command_log`, replayed in
collaboration history — so renaming one is a persistence-breaking change governed by C47, not a
refactor.** Any `component.*` / `parameter.*` / `constraint.*` verb this programme mints inherits
that permanence from its first commit.

**Executed-read-back proof (C16 §11.1 `CA-21`, G-CA-A4):** `tools/ga-gate/check-verb-liveness.ts`
exists, is registered at `tools/ga-gate/run-all.ts:215`, and is a **GROW-ONLY** ratchet. C16 §11.1
records its 2026-08-18 reading as **PROVEN 7 of 326** — *"7 of 326 is 2%"* — with **109
UNPROVABLE-NO-STORE** and **210 UNKNOWN**, and the gate's own line: *"Neither is a pass; both are
the work."* ⛔ Do not quote those numbers as current; C16 also records that this gate can exit
`MISCONFIGURED` on a worker timeout, which is *"neither a pass nor a fail"*. **Run it.**

### D6 — Undo/redo: ONE entry point over TWO backends over THREE store layers

**Authority:** `apps/editor/src/engine/undo/performUndoRedo.ts` (1,254 lines) —
`performUndo()` / `performRedo()`, C03 §4.6 **U-5**: *"There is exactly one undo path and one redo
path. Every trigger MUST call them."* Siblings in the same directory (3,679 lines total):
`elementUndoStoreAdapter.ts` (758), `undoHistoryTimeline.ts` (508),
`legacyStoreUpdateSemantics.ts` (328), `poolUndoAdapter.ts` / `liftUndoAdapter.ts` (241 each),
`pluginStoreUndoAdapter.ts` (241), `bathroomPodUndoAdapter.ts` (88).

**The three store layers (C03 §4.4 — the single most load-bearing table in this lane):**

| Layer | Example | `applyPatch`? | Drives the mesh? | Role |
|---|---|---|---|---|
| **L1 bus store** | `storesProvider('wall')` → `Store<WallData>` | **Yes** | **No** | what the handler writes; what ring-buffer patches target |
| **Legacy store** | `window.wallStore` (`@pryzm/geometry-wall`) | **No** | **Yes** | mesh + **serialization** source of truth |
| **Command-object snapshot** | `CreateWallCommand` in `commandManager.history` | n/a | reverts legacy store | Path-A undo only |

**The two backends (C03 §4.3):** Path A `CommandManagerImpl` (snapshot undo, scoped by
`affectedStores: ReadonlyArray<string>` at `packages/command-registry/src/types.ts:605`, whose
`StoreKey` union is enumerated at `:616+`); Path B `CommandBus` + `RingBufferUndoStack`
(patch-pair undo, cap 200). Eight tools **dual-dispatch** into both and are reconciled by the
`gestureId` shadow-drop (C03 §4.6 U-8/U-10).

`PatchPair` (`packages/runtime-undo-stack/src/RingBufferUndoStack.ts:49-127`) carries
`forward`/`inverse` op lists, `affectedStores`, `timestamp`, `gestureId`, `commandType`.
**`push()` stamps a `timestamp` if the pusher did not and never overwrites one that was supplied**
(`:279-281`, §UNDO-ORDERING-KEY) — the fix for a defect where **six of eight production push sites
minted unorderable entries** and a Ctrl+Z on the founder's wall edits reverted a slab.

**⭐ THE FINDING THAT MOST CONSTRAINS A COMPONENT EDITOR — selective undo is unsound here, and the
repo says so in writing.** `undoHistoryTimeline.ts:1-55` distinguishes
**(A) sequential jump-back** (implemented **and reachable** — `buildUndoTimeline` / `undoThrough`
are imported by the production HUD at `apps/editor/src/ui/SaveUndoRedoHUD.ts:280`; ADR-0341) from
**(B) selective / out-of-order undo**
(**NOT SUPPORTED AND MUST NOT BE OFFERED**, C03 §4.6 **U-12**), for three measured reasons:

1. *"THE INVERSE IS A POSITIONAL PATCH, NOT A COMMUTABLE OPERATION … `inverse` restores the value
   the field held at that instant … The patch has no notion of what it is undoing; it is an
   assignment."*
2. *"THE LEGACY HALF IS A SNAPSHOT, WHICH IS STRICTLY WORSE"* — whole-store write-back.
3. *"HOSTED AND DERIVED ELEMENTS MAKE THE RESULT UNDEFINED, NOT MERELY WRONG."*

⛔ **This is the collision with spec §16.** A *"deterministic, replayable feature graph"* whose
features carry *"stable identity, inputs, parameters, dependencies, outputs, provenance,
validation state"* — i.e. a CAD history tree you can re-open at feature 3 and recompute forward —
is **a different mechanism from PRYZM's undo stack**, not a feature of it. PRYZM's undo is a
positional patch/snapshot timeline. **Do not plan to implement the feature graph "on the undo
stack".** The honest exit named in-repo is **ADR-0251** (one store, derived geometry, one
timeline), *"at which point selective undo becomes a question that can at least be ASKED."*

**Undo coverage is DECLARED per store key, and the third class is the dangerous one.**
`performUndoRedo.ts:402` `buildUndoStoreMap()` is the single map; `:665`
`UNMAPPED_BUS_STORE_KEYS` declares every uncovered key with `owner: 'legacy-stack' | 'nothing'`
plus a non-empty reason, and `_reportStranded` (`:889`) surfaces it to the **user**, not only the
console (§EI-7c / C84 §3). C03 §4.8 names the three classes: covered → ring-buffer adapter;
uncovered-but-legacy-owned → `commandManager` fallback; and **REACHABLE-AND-STRANDED** — a real
`PatchPair` is minted, coverage is all-or-nothing so `_covered()` declines it, and the legacy
stack holds nothing: **Ctrl+Z is a total no-op** (this was `balcony` / `lift` / `liftPart`,
L-7310..L-7312; several have since acquired adapters — read the map, not this sentence).

### D7 — Transactions: what actually buys "one gesture = one undo entry"

**Authority:** `packages/core-app-model/src/batch/BatchCoordinator.ts` + C16 §8.6/§8.7.

⛔ **C16 §8.6, measured under §FIX-NESTED-BATCH-DROPS-GUARDS / L-271, and the single most
misunderstood rule in the command contract:**

> *"`CommandBus.executeCommand()` pushes **exactly one ring-buffer entry per DISPATCH** … It
> **never reads `batchCoordinator`**. Therefore **`runBatch()` is UNDO-NEUTRAL**."*

- **B-6** — one gesture = one undo entry is bought by **dispatching ONE `*.batch.create` command**
  (one `produceCommand` → one patch pair → one ring entry). N dispatches inside a batch produce
  **N** undo entries and the batch cannot merge them.
- **B-7** — `runBatch()` exists for the **GUARDS** (builder pauses, `ViewDependencyTracker`
  suppression, room-redetect suppression, the CRDT blackout window, the registration queue, the
  loading overlay), never for undo.
- **§8.7 re-entrancy** is a four-state machine (N1 IDLE / N2 JOIN / N3 EXTEND / N4 DEFER) with
  typed option-merge rules (`levelIds` UNION, `totalElementCount` SUM, skips ANDed — *"a skip is a
  promise made to every participant"*). *"A warning is not a guard … Re-entrancy safety is the
  COORDINATOR's invariant, never the caller's."*

**The multi-store transaction chokepoint** is `produceMultiStoreCommand()`
(`packages/command-bus/src/produceCommand.ts:77`) — the one helper that emits **store-key-prefixed
paths** (`[storeKey, elementId, ...field]`). Its docstring (`:12-43`) records the trap: the
store-RELATIVE `produceWithPatchesPerStore()` is *unusable* for a multi-store command — its patches
route to nothing, `applyRingBufferSide` applies zero stores, **"Undo does nothing, and says
nothing."** A composed component (spec §25: Window → frame, glass, mullion, handle, seal) spanning
several stores in one undo unit is **exactly** this shape.

### D8 — The event model: one relay, a declarative mirror, and a measured hole

- `packages/runtime-composer/src/CommandEventBridge.ts` (2,976 lines) subscribes to
  `CommandBus.patches` at the composition root and re-emits `command.executed` **plus typed family
  events** (`wall.created`, …) on `runtime.events` — so handlers stay pure and never import
  runtime-composer (ADR-002 §5, C11 §5.2). Handlers MUST use `runtime.events.emit`, never
  `window.dispatchEvent` (C16 **CA-10**).
- `packages/core-app-model/src/StoreEventBus.ts` is the **store-level** channel with three stated
  non-negotiables: **No Event Drops · Ordered Delivery · Layer Isolation**, and a **depth-counted**
  `batch<T>(fn)` that flushes all buffered events in emission order with **no coalescing**.
- `apps/editor/src/engine/elementUpdatedMirror.ts:185` `LEGACY_UPDATABLE_STORES` ×
  `CommandEventBridge.ts:241` `ELEMENT_UPDATE_VERBS` are the **declarative** update mirror
  (C16 §5.1.1 **CA-17-M**). ⛔ *"A row in ONE table and not the other is the silent half of the
  defect"* — both mirrors log a NAMED refusal when their counterpart row is missing.

**⭐ Re-measured for this lane (2026-09-01) — and the numbers MOVED, which is the point:**

```
grep -c "\.created'"  apps/editor/src/engine/initTools.ts   ->  20   (C16 §5.1.1 recorded 17)
grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->   2   (C16 §5.1.1 recorded  0)
```

The asymmetry C16 §5.1.1 named is real and only slightly narrowed: **creates mirror to the render
store; updates largely do not.** Its first gate reading was *"200 verbs write a plugin DTO store ·
170 uncovered · 123 UNMIRRORED"*, and 13 `*.setMaterial` verbs sit at `REFUSES` **because a
refusal was the only honest answer available**. ⛔ **And the channel is DECLARATIVE ON PURPOSE**:
`WallStore.update()` clears `_sourceBaseLine` and re-runs join resolution (a relayed baseline
*silently un-welds every corner*); `SlabStore.update()` is a **whole-record replace** that, handed
a one-key partial, leaves the record as that one key (**L-977**); `RoofStore.update()` is a
partial merge; `ColumnStore.update()` takes `Omit<T,'id'|'type'>`. *"Three stores, three contracts,
one method name."*

### D9 — What a saved project actually contains

**Live serializer:** `apps/editor/src/engine/persistence/ProjectSerializer.ts` (1,992 lines),
imported by `apps/editor/src/engine/initPersistence.ts:41`. **Loader:** `ProjectLoader.ts` (3,264).
`SNAPSHOT_SCHEMA_VERSION = 5` (`ProjectSerializer.ts:139`, mirrored at
`packages/core-app-model/src/persistence/SnapshotConstants.ts:15`), migrated 1→5 by
`persistence/MigrationEngine.ts` (289 lines, pure, forward-compat = warn + pass-through).

⛔ **THERE ARE TWO ProjectSerializers.** `packages/persistence-client/src/loader/ProjectSerializer.ts`
(1,008 lines) is a second copy; `snapshotFamilyCoverage.ts` records a defect that had to be fixed
*"in BOTH copies"*. Anything a component editor persists must know which copy is on the live path.

**The declared answer to "does this family survive save+reload?"** is
`apps/editor/src/engine/persistence/snapshotFamilyCoverage.ts` — one row per plugin DTO store,
closed vocabulary, gated by `tools/ga-gate/check-snapshot-family-coverage.ts`, set-compared in both
directions. **Measured 2026-09-01: 30 rows — 18 `via-legacy-twin` · 9 `persisted` ·
1 `not-model-state` · 2 `UNPERSISTED` (`structural`, `section`).**

⭐ **The structural fact behind those 18:** *the plugin DTO store is not what is saved — the legacy
geometry twin is.* Wall, slab, door, window, column, beam, stair, roof, curtainwall, grid,
handrail, ceiling, floor, furniture, plumbing … all serialize from `window.<x>Store`.

⛔ **And a `persisted` row has been WRONG in the dangerous direction.** The `balcony` row read
`persisted` **for four days while the family was still destroyed on every reload** (L-11530): the
serializer read `readPluginStore('balcony')` = `window.runtime.stores.balcony`, `StoresSlot`
declared no `balcony` key and no index signature, so the read was `undefined` — *and because the
row said `persisted`, the family stayed out of `UNPERSISTED_FAMILY_KEYS` and out of the C84 EI-6
save-time loss warning.* The row's own conclusion is the rule to carry forward:
> *"A `persisted` row asserts the READ CHANNEL resolves, not merely that a key and a writer exist."*

This file's own header is the best short history of the class: `ProjectSerializer` has **lost an
entire element family three times** (lighting; boundaryLine — *"`grep -c "boundaryLine"
ProjectSerializer.ts` → 0, in BOTH copies"*; then lift/pool/water/balcony/structural/section, the
founder: *"11 elements did not survive project opening"*). *"Each fix added ONE key and left the
CLASS open. A comment is not a detector."*

### D10 — Versioning: FIVE rival version fields, and C05 governs

**C47 §0.0 (correction, 2026-08-18) — quoted because it is the whole finding:** §1.1 mandates
`formatVersion: SemVer`; **no shipped artefact does this.** Measured at HEAD:

| Field the code writes | Where | Type |
|---|---|---|
| `schemaVersion: z.literal(1)` | `packages/persistence-client/src/manifest.ts:105` | monotonic INTEGER |
| `formatVersion: z.literal('pryzm-v1')` | `manifest.ts:109` | **an opaque STRING TAG** |
| `schemaVersion: PRYZM_ARCHIVE_VERSION` | `PryzmArchive.ts:25/103/135` | integer, rejected on mismatch |
| `SNAPSHOT_SCHEMA_VERSION = 5` | `ProjectSerializer.ts` + `SnapshotConstants.ts:15` | a THIRD integer, migrated 1→5 |
| `formatVersion: '1.0'` | family-pack (`family-schema.ts`) | a Zod **literal**, not a range |

**Governance resolution, binding:** *"C05 GOVERNS the version field. C47 §1.1, §1.2 and §2 are a
PROPOSAL, not a requirement, and MUST NOT be cited to justify changing the shipped field."*
(C05 is CANONICAL; C47 is DRAFT and *"a DRAFT contract binds nothing"*.) What of C47 **survives**:
§1.3 migration-chain irreversibility and composability (implemented), the 12-month deprecation
window, §1.7 writer attribution, §1.11 per-migration span.

### D11 — `.pryzm-family`: a component definition format that already exists, versions, signs and event-logs

**Authority:** `packages/file-format/src/family-types.ts`, `family-schema.ts` (266),
`family-pack.ts` (233), `family-unpack.ts` (314), `family-migrations/**`.

**ZIP layout (`family-types.ts:8-17`):** `manifest.json` · `document.json` ·
**`event-log.ndjson`** · `ifc-mapping.json` · `thumbnail.webp` · `icon.svg` ·
`signing/schema-hash` · `signing/signature` (Ed25519, `family-types.ts:49-56`), with
`schemaHash = sha256(canonical(document) + canonical(ifc-mapping))` over
`packages/file-format/src/canonical-json.ts`.

**What the schema already models** (`family-schema.ts`) — map it against the spec before proposing
anything new: prefixed-ULID identity per kind (`fam_`, `typ_`, `par_`, `sol_`, `prof_`, `slot_`,
`plane_` — spec §7); `FamilyManifest` with **semver**, author, `ifcEntity`, `category`, `tags`,
`minPRYZMVersion`, `schemaHash`, `createdAt`/`lastModifiedAt`; `ReferencePlane`;
`FamilyParameter { kind: 'type'|'instance', dataType: length|angle|number|count|boolean|string,
defaultValue, expression, ifcMapping, exposed }` (§8/§9/§11/§12); `ProfileEntity`
(point/line/arc/circle/spline) + **`ProfileConstraint` with 13 kinds** (coincident, parallel,
perpendicular, horizontal, vertical, tangent, distance, radius, angle, diameter, equalLength,
distancePointLine) carrying `parameterRef` (§14 — a constraint bound to a parameter, i.e. a
persistent semantic object); `SolidFeature` discriminated union
**extrude | sweep | loft | revolve** each with an **LOD bitmask** (coarse/medium/fine — §28
visibility-by-detail-level) and a `lengthExpression` **string** (§15 intent, not a baked number);
`MaterialSlot` (§23); `FamilyType { values: Record<ParameterId, …>, checksum }` (§6/§24);
`FamilyEvent { id: ULID, ts, kind, payload }` — the **NDJSON event log** (§16/§38).

**Versioning of definitions (spec §37)** — `packages/file-format/src/family-migrations/`:
`Migrator { id, from, to, description, apply(RawFamily): RawFamily }` (pure, non-mutating),
`MigratorRegistry` with cycle detection and a typed `ChainResult` whose failure reasons are
`no-path | cycle | migrator-threw | unknown-source-version`, `migrateFamily()` with its own OTel
tracer, an `identityMigrator` fixture, and **parameter-level migration ops already authored**:
`rename-parameter`, `add-parameter`, `delete-parameter`, `change-parameter-type`,
`introduce-expression`.

**Maturity / reachability:** the format, its Zod schema, packer, unpacker, signature and migration
framework are **real and unit-tested** (`packages/file-format/__tests__/family-round-trip.test.ts`,
`family-signature.test.ts`; `tests/family-marketplace-publish/`, `tests/family-load-into-project/`;
`apps/bench/src/benches/family-load.bench.ts`). **No migrator edges are registered** — expected,
since `formatVersion` is the literal `'1.0'` and there is only one version. **`@pryzm/family-loader`
is Node-only** (`loadFamily.ts:17` `import { readFile } from 'node:fs/promises'`) and **no
`apps/editor` source imports it**; the family-into-project leg lives in
`tests/family-load-into-project/`. In the main editor, family registration is reached only through
a **dev modal** — `apps/editor/src/ui/dev/familyPlatformTestModal.ts:19/349`
(`window.runtime?.familyRegistryStore`).

### D12 — ⭐ THE RIVAL: `apps/component-editor` — the previous build of this exact spec

**`apps/component-editor` / `@pryzm/component-editor`, 52 TS files.** Its own `package.json`
describes it as *"PRYZM 2 — Family Creator standalone SPA. The Revit-Family-Editor analogue: 2D
parametric profile sketcher → constraint solver → 3D extrude/sweep/loft/revolve → parameter table
→ typed authoring of `.pryzm-family` artefacts"*, with an 8-sprint roadmap **S52 → S59** whose
stated outcomes include **S54 AI host bridge + tool registry + batch undo**, **S55 parameter table
+ expression DSL + IFC binding + `.pryzm-family` v1**, **S56 main-editor integration (load family,
place 200 instances, swap types)**, **S57 versioning + migration framework**, **S59 marketplace
publish**. On disk: `sketch/tools/{Line,Rectangle,Circle,Arc,Fillet,Trim,Select}Tool.ts`,
`sketch/{SketchCanvas,solverRunner,snap,hitTest,buildConstraintSet}.ts`,
`commands/{constraint,referencePlane,solid}/`, `stores/{sketchDoc,constraint,selection,
referencePlane,solid,viewTab}Store.ts`, `ai/{aiHostBridge,approvalQueue,toolRegistry}.ts`,
`marketplace/{publishFlow,signing}.ts`, `a11y/`.

**Its command/undo model is a SECOND, INCOMPATIBLE one.**
`apps/component-editor/src/app/commandBus.ts:115` `createCommandBus()`:

| | canonical `@pryzm/command-bus` | `apps/component-editor` |
|---|---|---|
| handler | `{type, aliases?, affectedStores, canExecute, execute}` | `{category, execute(args) → {payload, undo}}` |
| pre-flight | `canExecute → ValidationResult` | **none** |
| store declaration | `affectedStores`, verified synchronously | **none** |
| transaction | forward/inverse **Immer patch pair** | **a closure inverse** |
| record | `EventRecord` (ULID, audit, patches, context, plan, refusal, report) | **none** |
| undo | `RingBufferUndoStack` cap 200 + `performUndoRedo` + legacy stack | local array of closures, **cap 100** |
| **redo** | `performRedo()` | ⛔ **there is no redo** — `undo()` pops and discards (`:259-273`) |
| batch | `runBatch` guards + one `*.batch.create` dispatch | `executeBatch()` = one compound closure entry; **nested batches throw** (`:187`) |
| refusal | `CapabilityRefusal` as a value | `throw new Error(...)` |
| observability | `pryzm.command.execute` span | `pryzm.family.command.<verb>` span |

**Its runtime is a SECOND COMPOSITION ROOT**, `createFamilyEditorRuntime()`
(`apps/component-editor/src/app/familyEditorRuntime.ts:85`), blessed by **ADR-0316** and tolerated
by `tools/ga-gate/check-single-compose.ts` at `MAX_RIVALS = 1`. Workspace deps: **3**
(`constraint-solver`, `file-format`, `geometry-kernel`) versus composeRuntime's **25**. Its
justification is measured and honest: a **≤180 KB gzip first-paint budget** against
`three/build/three.core.js` at **281,053 B gzip — 1.53× the entire budget**; plus `composeRuntime`
requiring a `bootstrapFn` from `@pryzm/editor`.

⛔ **ADR-0316 §5 names, in advance, what voids its own blessing.** The spec triggers these:
> 1. *"The Family Creator gains a project"* — spec §34 makes the component a first-class World-Model
>    participant with Project/Site/Building/Storey context. *Tripwire: the invariants test forbids
>    importing `@pryzm/persistence-client`.*
> 2. *"Two users edit one family at once"* — *"Collaboration means CRDT means the patch-pair undo
>    model, because closure inverses cannot be merged or replayed."*
> 3. *"The 3D view stops being lazy"* — spec §57–62 makes the 3D viewport *"a first-class authoring
>    environment"*. *Tripwire: `bundle-budget.test.ts` + `@pryzm/renderer-three` forbidden.*
> 4. *"The editor embeds the Family Creator in-process"* — spec §61 folds Window/Wall/Door/Facade
>    into ONE universal editor inside the product. ADR-0316: *"Mounting it inside `apps/editor` puts
>    two live command buses and two undo stacks in one window, and a user's Ctrl-Z becomes
>    ambiguous. That is a merge, not a coexistence."* *Tripwire: `@pryzm/editor` and
>    **`@pryzm/command-bus`** are forbidden imports.*
> 5. *"Family verbs become durable"* — §4.2.3 permits its camelCase verb spelling **only because
>    family verbs are never wire identifiers**: not persisted to `project_command_log`, not sent
>    over CRDT, not replayed. The moment a `component.*` verb is logged or synced, §4.2.3 is void
>    and the namespace must join `check-command-naming.ts` (which today *"scans only `plugins/*/src`
>    and `packages/command-registry/src`, so this namespace is currently ungoverned"*).

**Reachability:** ⚠ **AUTHORED AND TESTED, NOT ON THE DEPLOYED PATH.** It IS a pnpm workspace
member (`pnpm-workspace.yaml` → `apps/*`), so `npm run test:ci` (`pnpm -r … run test:ci`) runs its
suites and its bundle-budget gate. But:
```
grep -l "component-editor" package.json vite.config.ts fly.toml .github/workflows/*.yml
  -> (no matches)
```
The root `build` script is a single `vite build` of the main SPA; nothing builds or deploys this
app. It carries its own `vite.config.ts` and a checked-in `dist-gate/`. Its own `src/index.ts:9-19`
records that even the deep link is inert: *"We only LOG the parsed request today; the actual
`loadFamily` wiring lands when `@pryzm/family-loader` is pulled into the SPA boot path (deferred
per S58 closure note)."*
⭐ **This is the repo's own standing lesson — [[authored-but-unwired-is-the-bottleneck]] and
[[committed-is-not-reachable]] — at the scale of a whole application.** A green test suite over an
app nobody can open is exactly the state ADR-0316 §4.1 clause 2 was written to prevent one level
down (*"Everything authored is reachable"* — the audit that produced it found `referencePlane.*`
and `solid.*` authored, unit-tested, and *"constructed only inside their own tests"*).

⛔ **AND THE P1 GATE THAT POLICES IT PRINTS A FALSE GREEN — `L-12830`, OPEN, P0.**
`tools/ga-gate/check-single-compose.ts` exits 0 and its body prints *"rival runtime factories: 1"*
naming `familyEditorRuntime.ts`, then its terminal line prints *"1 definition, **0 rivals**"* —
because `0 rivals` at `check-single-compose.ts:216` **is a string literal, not the count**.
CI logs show the terminal line. ⛔ Do not "fix" this by editing CLAUDE.md's *"1 definition / 0
rivals"*; the false green is in the place CI reads.

### D13 — Provenance and the audit trail

- **Per-command audit exists and is stamped by the bus.** `AuditMetadata { actorId, projectId,
  clientId, timestamp }` (`types.ts:35-44`); `timestamp` is **deliberately excluded** from the
  caller-supplied `AuditDefaults` (`types.ts:46-59`) *"so callers MUST NOT supply it (a single
  timestamp at boot would lie about every subsequent command's start time)"* — it is stamped
  per command in `buildContext` (`CommandBus.ts:293-297`).
- **Element-level provenance now exists in L0** — `packages/schemas/src/provenance/`:
  `ValueOrigin.ts`, `ElementConfidence.ts`, `DetectionMethodOrigin.ts`, `ProvenanceEdge.ts`
  (*"provenance as a graph EDGE — derivation is a relationship, not a label"*), `AIArtefact.ts`,
  `ContextSnapshot.ts`, `RedactionRecord.ts`, `ProvenanceExport.ts`. Gated by
  `packages/schemas/__tests__/elementProvenance.test.ts` (PV-04): every element kind declares the
  field; a pre-change record still parses and lands on **UNKNOWN-with-reason, never on a member of
  the five**; `authored` is not mintable by a system path.
  ⚠ **That test states its own limit, and it is the whole maturity verdict:** *"NOT asserted here
  … that any PRODUCER actually writes a real origin. Every kind's field defaults to
  `predates-provenance` today."* **The vocabulary is live; the producers are not instrumented.**
  C75's three gates (`check-provenance-not-invented`, `check-provenance-coverage`,
  `check-derived-not-authored`) were **UNBUILT at stamp time**.
- ⛔ **THE COMMAND AUDIT TRAIL IS AUTHORED AT BOTH ENDS AND UNWIRED IN THE MIDDLE.**
  Client: `createEventLogPersistor()` (`packages/command-bus/src/EventLogPersistor.ts:28`), a
  `PatchEmitter` subscriber that POSTs each `EventRecord`. Server: `POST /api/event-log`
  (`server/eventLog.js:36`, behind `authMiddleware`, actor derived from the session, membership
  checked — L-406/C08 §1.2) inserting into `event_log`. Wiring:
  `composeRuntime.ts:1017` subscribes it **only when `opts.eventLogEndpoint` is set** —
  ```
  grep -rn "eventLogEndpoint" (repo, minus dist/node_modules)
    -> 7 hits: 1 in EventLogPersistor's comment, 6 in composeRuntime's own declaration.
       ZERO call sites supply it.
  ```
  **No production caller passes it, so no `EventRecord` is ever persisted.**
- **What IS persisted is not an audit trail.** `project_command_log` is a **collaboration catch-up
  buffer**: written from the socket.io `command-executed` path (`server.js:642/655`) with
  `~2%`-probabilistic **24-hour retention purging** (`server.js:664-684`). It stores
  `command_type` + `payload` for replay to peers — **not** patches, not the invocation envelope,
  not a per-object history. ⛔ **It cannot serve as the spec §36 "command history" for a
  component.**

---

## 2 · WHAT IS REUSABLE — and exactly how

> Ordered by leverage. Every row is *"the seam already exists; here is the extension point"*.

**R1 — Dispatch every component-editor action through `CommandBus.executeCommand()`.**
The spec §5 (*"Visual UI, AI/RAC and Code all pass through PRYZM Contracts into ONE canonical
model"*) and §40 (*"AI must NOT directly mutate the database, scene graph, renderer or arbitrary
kernel objects"*) are **already the enforced architecture** for the BIM editor: P6, C03 §2.1,
C16, and the ADR-0324 rule that *"every actor kind reaches the SAME `executeCommand()`"*.
**HOW:** author `component.*` / `parameter.*` / `constraint.*` / `feature.*` verbs as ordinary
C16 handlers with `affectedStores`, `canExecute`, and a patch pair. Nothing new is required at the
bus. ⛔ Author them on **Path B** (C16 §4); Path A is transitional.

**R2 — Use `CapabilityRefusal` for every "cannot do that" the spec asks for.**
§20 fail-closed on an ambiguous reference · §45 structured diagnostics with options · §71–73
`GeometryStatus = Invalid`. `capabilityRefused({commandType, reason, subReason?, asked,
unaccountedFor, protects, detail})` already forces both numbers and the *protects* clause, rides
`HandlerResult.refusal` → `EventRecord.refusal`, and is a **value the caller reads**, not a throw a
`catch {}` swallows. Its `reason` union is **CLOSED at eleven members (C78 §8.1)** — extending it
is a contract edit; per-family specificity goes in the typed `subReason`, **never in prose**.

**R3 — Use `CapabilityRunReport` for every component-editor QUERY** (spec §35's *"which windows on
Level 02 use Large?"*). Empty patches beside a populated `report` keep a query **undo-neutral**
(`CommandBus.ts:576-578`: `isEmptyPatchRecord ⇒ skipRingBuffer`) — the alternative makes Ctrl+Z "undo"
a question. `findings: []` is only honest because `checked` is mandatory and non-empty.

**R4 — Use ADR-0322's plan/execute/report for parametric recompute (spec §12/§71/§73).**
`ConsequencePlanner.plan()` is pure over read-only views; `ConfirmationPolicy` is computed from the
plan's actual consequence set, **never from an `isDestructive` flag**; `PredictedVsActual` closes
the loop. `HandlerResult.consequence` and `executeCommand(..., {plan})` are already threaded end to
end and read by nothing — **populate them, do not mint a rival.** *"A stale plan is refused
upstream (`PlanStaleRefusal`) and never rides here"* is the spec §73 *"never let stale geometry
overwrite newer state"* rule, already typed.

**R5 — Use `CommandExecutionContext` for the AI/code/visual provenance split (spec §36/§40/§46).**
`actor.kind ∈ {human, ai, system, remote}` · `origin.surface` (add `'code'` / `'component-editor'`)
· `approval {proposalId, approvedBy, rationale, confidence}`. One funnel, enriched, never forked.
⚠ It is not persisted today (D13) — persisting it is **new work**, but the *shape* is decided.

**R6 — Adopt `.pryzm-family` as the ComponentDefinition envelope rather than inventing one.**
It already gives spec §6 (Definition/Type), §7 (prefixed-ULID stable identity), §9 (typed
parameters with `expression` and `exposed`), §14 (13 persistent constraint kinds with
`parameterRef`), §16 (feature list + **`event-log.ndjson`**), §23 (material slots), §28 (per-LOD
visibility), §29–33 (`ifc-mapping.json` kept **beside** the document, never inside it — the spec's
*"IFC is not canonical"* rule already realised as a file boundary), §37 (semver + a real migration
framework with parameter-level ops), plus **canonical-JSON hashing and Ed25519 signing** the spec
did not even ask for. **HOW:** extend `FamilyDocumentSchema`; add migrators through
`MigratorRegistry`. ⛔ Do not start a `ComponentDefinitionSchema` beside it.

**R7 — Use `snapshotFamilyCoverage.ts` as the model for "does a component survive reload?"**
A declared, closed-vocabulary, set-compared, shrink-only table per family, with `UNPERSISTED` as a
**work list rather than an exemption**. This is the single cheapest defence against the failure
that has hit `ProjectSerializer` three times, and its rule — *"a `persisted` row asserts the READ
CHANNEL resolves"* — is exactly the trap a new component store would fall into.

**R8 — Use `produceMultiStoreCommand()` for composed components (spec §25 nesting).**
One dispatch → one `HandlerResult` → one `PatchPair` → one ring entry → one Ctrl+Z across frame,
glass, mullion, handle and seal. ⛔ **N dispatches inside `runBatch` gives N undo entries**
(C16 §8.6 B-6) — the batch is undo-neutral.

**R9 — Use `UNMAPPED_BUS_STORE_KEYS` + `_reportStranded` for honest undo coverage.**
Every new component store key gets a row with `owner` and a non-empty reason, so an uncovered key
is **declared and user-visible**, never a silent no-op Ctrl+Z.

**R10 — Reuse `CommandEventBridge` + the `ELEMENT_UPDATE_VERBS`/`LEGACY_UPDATABLE_STORES` pair for
spec §38 semantic change events.** `ParameterChanged`, `TypeChanged`, `ConstraintAdded/Removed`,
`FeatureAdded/Modified`, `MaterialChanged`, `HostChanged`, `RelationshipAdded/Removed`,
`DefinitionChanged` are all `X.updated`-shaped verbs — **exactly the class C16 §5.1.1 measured as
systematically unmirrored.** Reuse the declarative channel and add both rows per verb.
⛔ Do not build a generic field-copying relay: *"A relayed baseline silently un-welds every corner
it touches."*

**R11 — Reuse C78's lifecycle rather than inventing a component-editor transaction model.**
C78 §1.1 is the transaction law already in force: *carry the related element through
discovery → prediction → plan → confirmation → plan-bound execution → reconciliation → report,
**or** return UNDETERMINED with a typed reason. There is no third outcome.* Its §12.1 —
*"one user gesture … is one undo unit"* — is the spec's requirement for a parametric edit that
cascades. Its §12.3 is the trap: **asynchronous consequence maintenance must thread `gestureId`
explicitly** or *"one user action undoes in pieces."*

**R12 — Reuse `ApartmentParameterPropagator` as the pattern for type→instance propagation
(spec §12).** `packages/stores/src/ApartmentParameterPropagator.ts` with C20 §1.5: the propagator
*"is the single authority for 'an aggregate parameter changed, here is what must re-solve'"* and
*"emits derived patches into the geometry stores through the command bus — never via direct store
writes."* The resolver is **injected** (`recomputeImpact`), which is exactly the seam a
`ComponentTypePropagator` needs. C20 §1.8's **branded ids** are the spec §7 identity rule already
implemented (`ADR-0001`).

**R13 — Reuse the `CommandBus` alias table for the rename problem.** `handler.aliases`
(`types.ts:159-179`) makes a wire-identifier rename **incremental** instead of a flag day —
important because C69 §1.1 makes every verb permanent from its first commit. *"An alias is a
DEPRECATION, not a synonym."*

---

## 3 · WHAT IS GENUINELY MISSING — each evidenced by a search that FAILED

**M1 — There is no component/definition-level command family. `component.*` does not exist.**
```
grep -c "^| \`component\.\|^| \`definition\.\|^| \`parameter\.\|^| \`feature\." docs/04-reference/API-VERB-REGISTER.md
  -> 0        (measured 2026-09-01)
grep -c "^| \`family\."                                                        docs/04-reference/API-VERB-REGISTER.md
  -> 0
```
The 361 registered verbs are element-family verbs (`wall.*`, `slab.*`, `annotation.*`, …). The
component editor's verbs exist **only** in `apps/component-editor/src/commands/**` on the rival
bus, and ADR-0316 §4.2.3 explicitly notes that namespace *"is currently ungoverned"* by
`check-command-naming.ts`. **BUILD**, on Path B, with C69 register rows from day one.

**M2 — No `EventRecord` is ever persisted. There is no per-object command history.**
```
grep -rn "eventLogEndpoint" . (minus node_modules, dist)
  -> 7 hits, ALL of them the declaration itself. ZERO call sites supply it.
```
Both ends exist (`EventLogPersistor.ts:28`; `server/eventLog.js:36` → `event_log` table). The
middle is unwired. `project_command_log` is a 24-hour collaboration catch-up buffer, not a history.
**Spec §36 ("command history" as provenance) and §16 (replayable feature graph) therefore have no
durable substrate today.** ⚠ Wiring the persistor is small; deciding *what* a component's history
is — a durable feature log versus an audit trail — is the real design question.

**M3 — Provenance is authored in L0 and written by nobody.**
`packages/schemas/__tests__/elementProvenance.test.ts:28-33` states it verbatim: *"NOT asserted
here … that any PRODUCER actually writes a real origin. Every kind's field defaults to
`predates-provenance` today."* **The vocabulary is reusable (R5); instrumenting producers is
BUILD.**

**M4 — `HandlerResult.consequence` has no producer.** `types.ts:99-105`: *"RESERVED, NEVER
POPULATED YET … No bus code reads this field in R1."* The planner interface, the plan type, the
report type, the confirmation policy and the `executeCommand({plan})` thread all exist; **no
`ConsequencePlanner` is registered for any verb.** A parametric editor whose §66 test is
*"a formula change recomputes dependents; no stale derived geometry may overwrite newer state"*
needs R2–R5 of ADR-0322 to actually land.

**M5 — There is no redo in the component editor's model, and no cross-root undo story.**
`apps/component-editor/src/app/commandBus.ts:259-273` — `undo()` pops the stack and discards the
entry; there is no redo stack and no `redo()` on the `CommandBus` interface (`:83-108`). ADR-0316
§4.1 clause 3 pins *undo granularity* across the two roots but says nothing about redo. Spec §63
requires the full round trip. **BUILD, or merge onto the canonical stack.**

**M6 — Selective / out-of-order undo (the CAD "edit feature 3 and recompute") is UNSOUND in the
current model and is refused by contract.** C03 §4.6 **U-12** and `undoHistoryTimeline.ts:16-18`:
*"SELECTIVE / OUT-OF-ORDER UNDO IS NOT SUPPORTED AND MUST NOT BE OFFERED."* Not a missing feature
to schedule — a **model change** (ADR-0251) that must be decided before spec §16 is designed.

**M7 — No cross-root identity, transaction or persistence bridge exists between
`apps/component-editor` and `apps/editor`.** The main editor's only reach into the family platform
is a **dev modal** (`apps/editor/src/ui/dev/familyPlatformTestModal.ts`); `@pryzm/family-loader` is
Node-only and imported by no editor source; the SPA's deep link is logged and not acted on
(`apps/component-editor/src/index.ts:9-19`). Spec §63's *"place 20 instances → make THIS instance
1800 → make the Medium type 1600"* crosses that boundary in both directions and **the boundary is
not built.**

**M8 — `formatVersion` is not comparable, so C47's forward/backward-compatibility rules cannot be
evaluated.** C47 §0.0: `'pryzm-v1'` is *"an opaque tag that is neither SemVer nor comparable, so
§1.2's MAJOR/MINOR/PATCH comparison and §1.4's forward-compatibility rule cannot be evaluated
against it at all."* A component **definition** version must survive decades of instances
(spec §37: *"never silently destroy historical meaning"*). `FamilyManifest.semver` is a real
SemVer and is the better substrate — but `FamilyDocument.formatVersion` is a Zod **literal**
`'1.0'`, i.e. the same non-comparable shape one level down. **DECIDE before minting version two.**

**M9 — No gate proves that a declared `affectedStores` key resolves to the store the handler
wrote.** C16 §11.1 exit condition **G-CA-A3**: *"Does not exist today. Until it does, CA-19 is
review-enforced."* The existing coverage test proves a key **resolves**, not that it resolves to
the written store — and the difference is C03 §4.6 **U-2b**, *"not a failed undo; a mutation of
authoritative state derived from a different store's history."*

---

## 4 · TRAPS — the in-code corrections a newcomer will trip over

**T1 — `produceCommand()` alone is NOT a mutation.** C16 **CA-8** was *corrected*: writing
`ctx.stores` is a write to the **L1 DTO store**, which drives no mesh and is not what
`ProjectSerializer` reads. *"A `produceCommand()` with no committer, bridge or `commandManager`
delegation carrying it onward mutates nothing anyone reads."* CA-8 is satisfied only together with
**CA-17**. C68 §5.a: such a write-only sink is *"presumed DEAD until proven otherwise, because
that presumption has been right 13/13 times."*

**T2 — `success: true` is not evidence, and neither is a passing test.** C16 **CA-21**: liveness is
proven by *"dispatch the verb, then read the property back out of the authoritative store."*
Explicitly NOT satisfying it: `result.success === true`; a spy/call-count; a patch-pair shape; a
read-back **from the same DTO store the handler wrote**; a reviewer inspecting a mapping.
*"Reading a mapping is not exercising a call"* (C03 §4.8 §ANN-UNDO-ARITY). And *"a dead verb's
tests MUST NOT pin the lie"* — a test named *"no-ops (does not throw)"* is a passing proof that the
verb does nothing.

**T3 — Registration order decides which handler wins, and it is invisible in the file you are
editing.** `CommandBus.register()` throws on duplicates (`CommandBus.ts:101`), so
`initBusHandlers.ts` guards with `if (runtime.bus.registry?.has?.(spec.type as any)) continue;`.
The bus is therefore **first-registration-wins**, and a plugin handler registered during
`composeRuntime` **silently shadows** a later editor bridge (C16 **CA-20**; the `roof.update`
defect L-839). *"Authoring a bridge is not wiring it."*
⚠ **Re-measured 2026-09-01: that guard is at FOUR sites — `initBusHandlers.ts:476`, `:524`,
`:2902`, `:3053` — not the single `:2202` C16 CA-20 cites** (`wc -l` → 3,096). A newcomer looking
for "the" skip will find one of four and conclude the others do something different.

**T4 — `affectedStores` keys are overloaded ACROSS TIME.** At write time `'wall'` is the L1 Immer
store; at undo time `buildUndoStoreMap()` (`performUndoRedo.ts:271`) resolves `'wall'` to
`window.wallStore`, the geometry store. C03 §4.6 **U-2b**: the entry passes the coverage check, the
ring-buffer path runs, and *"an inverse patch is applied to a store that never received the
forward."* The only two legal exits are (a) route the write to the mapped store, or (b) declare
`affectedStores: [] as const` and fall to the legacy stack. ⛔ *"`lift` MUST NOT be mapped to
`window.liftStore`"* — the nearest global with a matching name is a **different store** (LOD-200
massing vs the C104 compound), and mapping it satisfies `_covered()` while corrupting state.

**T5 — `runBatch()` is UNDO-NEUTRAL.** C16 §8.6: it *"never reads `batchCoordinator`"*. Opening,
nesting or dropping a batch cannot change how many undo entries a gesture produces. Batches are
for **guards**; the undo unit is bought by **one dispatch**.

**T6 — `CompositeCommand` reports what it ATTEMPTED, not what LANDED.** C16 §8.6 **B-8**
(ADR-0345 §5, L-2401): it returns `success: true` *unconditionally in BOTH directions* and counts
`children.length`. *"Generate a building, press Ctrl+Z, and if any child fails to revert the user
is told it was undone, half the building remains, and Redo is offered for a state that never
existed."* Also: many mutators return `void` and **silently no-op on an unknown id**
(`BimManager.updateLevel()` is literally `if (!level) return;`). **Verify by re-reading; report
`landed` and `attempted`.**

**T7 — `levelId` is refused on the generic parameter path** (C03 §4.10). A partial merge carrying
`levelId` would re-file an element on another storey with none of the four effects a storey move
owes it. Expect the same class for any component parameter that is really a **routing key** rather
than a value.

**T8 — A `persisted` row can be a lie in the dangerous direction** (D9 / L-11530). Assert the
**read channel**, not the existence of a key and a writer.

**T9 — `getHistory()` hands out LIVE `Command` instances.** C03 §4.6 **U-11**: a caller can invoke
`.execute(ctx)` / `.undo(ctx)` directly — *"a mutation path into model state that bypasses the
command dispatcher entirely (P6)"*. Read undo state through the frozen, value-free projections
(`RingBufferUndoStack.listEntries()`, `CommandManager.getUndoHistoryView()`). 🔴 `getHistory()`'s
non-UI callers are **UNAUDITED**.

**T10 — Absence is never a verdict.** Two instances, one rule: `_cmEntryIsNewer` opened with
`if (typeof pairTime !== 'number') return false`, an **unconditional win for the ring buffer**
dressed as a tie-break (§UNDO-ORDERING-KEY); and *"an entry carrying no `gestureId` is NEVER a
twin — absence-as-membership is the original bug renamed"* (§UNDO-GESTURE-ID). **Wall-clock
proximity MUST NOT be used to infer gesture membership**; `_SAME_GESTURE_WINDOW_MS` is deleted and
its reintroduction is a pinned regression.

**T11 — C03 has TWO sections numbered §4.9**, and `§5`/`§6` appear out of order
(`grep -n "^## §" C03-…md` → §1 :9, §2 :38, §3 :99, §4 :134, **§6 :595**, **§5 :632**,
**§4.9 :645**, §4.10 :689). Cite by title as well as number.

**T12 — C47 is DRAFT and does not bind; C05 governs the version field.** C47 §0.0. Do not
introduce `formatVersion: SemVer` into the `.pryzm` envelope on C47's authority.

**T13 — `check-single-compose.ts` prints a hard-coded `0 rivals` while naming one** (L-12830, OPEN,
P0). The rival it names is `apps/component-editor/src/app/familyEditorRuntime.ts`. **The gate this
programme most needs to trust about second composition roots is currently the one printing a false
green about exactly this app.**

**T15 — The contracts' LINE citations have drifted, and two of them point at the wrong code.**
C03 §4.6 **U-2b** and C16 **CA-19** both locate `buildUndoStoreMap()` at
`apps/editor/src/engine/undo/performUndoRedo.ts:271`. **Measured 2026-09-01: `:271` is the closing
brace of `_reportUnorderable`'s message string; `buildUndoStoreMap()` is at `:402`.** Same class
as T3's `:2202`. **The §-tags and the rule text are reliable; the line numbers are not.** Grep the
`§`-tag or the symbol, never the line.

**T14 — Do not read the counts in this file as durable.** C64 §2.13 / C69 §0.1 bind docs to citing
generated artefacts. Every number here is a reading with a date. Re-run:
`npx tsx tools/ga-gate/check-verb-register.ts` · `check-verb-liveness.ts` ·
`check-mirror-completeness.ts` · `check-snapshot-family-coverage.ts` · `check-single-compose.ts`.
This lane re-measured `initTools` mirrors at **20 create / 2 update** where C16 §5.1.1 recorded
**17 / 0** — the numbers move, the shape does not.

---

## 5 · THE LANE'S ANSWER TO ITS OWN QUESTION

> **"The spec demands ONE canonical model reached only through contracts — does PRYZM already
> enforce that, and what is the exact seam a component editor would dispatch through?"**

**Partly, and the gap is measured rather than guessed.**

**The seam exists and is exact:**
```ts
runtime.bus.executeCommand<TPayload>(
  type,                                   // C69 wire identifier, registered once (CA-1, CA-20)
  payload,                                // serialisable; no class instances (CA-15)
  { gestureId?,                           // one gesture = one undo unit (C78 §12, C03 U-10)
    context?: CommandExecutionContext,    // ADR-0324 actor / origin / approval
    plan?: ConsequencePlan,               // ADR-0322 the plan this execution CONSUMES
    suppressUndo? }                       // remote origin only (C03 U-1)
): Promise<EventRecord>                   // patches + audit + refusal? + report? + consequence?
```
implemented by a `CommandHandler {type, affectedStores, canExecute, execute}` returning
`HandlerResult {forward, inverse, nextStates?, refusal?, report?, consequence?}`.
`packages/command-bus/src/CommandBus.ts:317`.

**What IS enforced:** exactly one dispatch entry (P1/C02) · commands as the declared mutation path
(P6/C03 §2.1, at a shrink-only baseline of tolerated direct writes, not at 0) · one undo entry
point (C03 §4.6 U-5, `performUndoRedo`) · a generated, CI-diffed verb register in both directions
(C69) · a declared per-family persistence table (`snapshotFamilyCoverage`) · a declared undo
coverage table with user-visible stranding (`UNMAPPED_BUS_STORE_KEYS`) · one composition root
(P1, at `MAX_RIVALS = 1`).

**What is NOT enforced, and each is a number, not an opinion:** liveness — **174 of 361 verbs are
`UNKNOWN`** and **211 have no known authoritative store**; executed read-back — **PROVEN 7 of 326**
at the last recorded reading, *"7 of 326 is 2%"*; the update mirror — creates mirror, updates
largely do not; `affectedStores` identity (G-CA-A3) has **no gate at all**.

**And the canonical model is not yet ONE:** three store layers per element (C03 §4.4), two undo
backends (C03 §4.3), two `ProjectSerializer` copies, five rival version fields (C47 §0.0), and
**a second command bus + second undo stack + second composition root in `apps/component-editor`,
which is the previous implementation of this very spec.**

**Therefore the first architectural decision this programme owes the founder is not a canonical
data model — it is a verdict on `apps/component-editor`.** Three options, and ADR-0316 §5 has
already written the criteria for choosing:

- **(a) MERGE onto the canonical bus** — the component editor becomes a surface of `apps/editor`
  dispatching `component.*` verbs through `executeCommand`, patch-pair undo, one Ctrl+Z. This is
  what spec §5, §34, §57–62 and §63 each independently require. Cost: ADR-0316's ≤180 KB
  first-paint budget is **void** (accept it, or make the surface lazy inside the editor); the
  closure-undo bus, its stores and `executeBatch` are rewritten as C16 handlers; `familyEditorRuntime`
  is deleted and `MAX_RIVALS` drops to 0.
- **(b) KEEP the split and build a bridge** — the SPA stays standalone, `.pryzm-family` stays the
  interchange, and the main editor gains `component.instantiate` / `component.swapType` verbs. Cost:
  the spec's *"parametric after placement"* (§12), *"instance overrides"* (§9) and the §63 vertical
  slice all cross a **file boundary**, so a type change must round-trip through a pack/unpack.
  ADR-0316 §5.1/§5.5 arguably void the blessing the moment families become project-persisted or
  their verbs durable.
- **(c) RETIRE the SPA, KEEP its assets** — delete the rival root and bus; keep `.pryzm-family`,
  `family-migrations`, `packages/constraint-solver`, `packages/family-runtime`, the sketch tools and
  the marketplace publish flow, re-hosted on the canonical seam.

**Lane D's evidence points at (a) or (c).** The rival bus has **no redo**, no validation gate, no
store declaration, no patch pairs, no event record, no CRDT hook, no refusal values, and no
persistence — and ADR-0316 §4.2.1 permitted every one of those omissions **only because family
state is *"in-memory and never CRDT-merged or replayed from a persisted log"***. The spec makes the
component a first-class World-Model participant, which is precisely the clause that expires.

⛔ **Whichever is chosen, it must be an ADR that supersedes ADR-0316 explicitly, and it must fix
`check-single-compose.ts`'s hard-coded `0 rivals` (L-12830) first** — otherwise the decision is
taken against an instrument that is known to print a false green about this exact application.

