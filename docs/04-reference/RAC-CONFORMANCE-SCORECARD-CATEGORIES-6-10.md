# RAC Conformance Scorecard — Categories 6–10

> **Stamp**: 2026-08-11 · **Author**: Agent RAC-2 · **Status**: MEASURED, not asserted
> **Scope**: rooms & spatial model · visibility/selection/isolation · materials, metadata & properties · batch operations · collaboration. 39 operations × 7 verdicts.
> **Companion**: RAC-1 owns categories 1–5. Shared harness: `tools/rac-conformance/`.
> **Contracts**: C66 §1 (no CLAIMED tier described as supported), C67 §1.6 (open defects), C68 §5.g/§5.j/§6.3, C03 §2/§4.6 (commands are the only mutation path; failure ≠ emptiness).

---

## §0 — What this document is, and the one thing it is not

The founder asked whether the RAC can **reliably** perform ~92 named BIM operations. `tools/ga-gate/check-chat-capability-coverage.ts` (D14) cannot answer that. D14 proves **declaration ↔ route**: every registered bus command is declared, every declared target is really accepted, every `commandProof` file sits in an execution-authority root. It does **not** prove **route → AUTHORITATIVE STATE**. A capability can be perfectly declared, resolve perfectly, dispatch perfectly, and write a store nothing renders, persists or exports — the `§FIX-CHAT-DEAD-ROUTES` family, dead 13/13 times.

So every operation below carries **seven independent verdicts**, never collapsed:

| | Verdict | What it asks |
|---|---|---|
| **V1** | RESOLVE | does the utterance reach the intended capability? |
| **V2** | DISPATCH | does it emit the intended bus command(s)? |
| **V3** | STATE | does **the store the renderer and persistence actually consult** now hold the new value? Not `success===true`. Not a plugin DTO store. |
| **V4** | PERSIST | does save → reload round-trip it? |
| **V5** | UNDO | does one undo restore exactly the prior value? |
| **V6** | SYNC | does a **second client** receive the authoritative change? |
| **V7** | REPORT | is the user-visible transcript **true** of what happened? |

**PASS / FAIL / UNPROVEN**, and **UNPROVEN is first-class**. "I could not establish this" is a different fact from "this is broken", and the two are never written the same way (§CONTEXT-DATA-HONESTY). No probe was weakened to turn a row green.

### §0.1 — The evidence bar this document holds itself to

| Column | How it was established | Strength |
|---|---|---|
| **V1, V2** | **EXECUTED.** `tools/rac-conformance/probe-categories-6-10.ts` drives the REAL ladder (`resolveCompoundUtterance` → `resolveUtterance` → `resolveNaturalLanguage`) in `ZeroTokenChatBridge`'s own order, and prints the resolution verbatim. | measured |
| **V3 (cat 8)** | **EXECUTED.** `apps/editor/__tests__/deadVerbAuthoritativeState.test.ts` reproduces production's exact store topology (bus given plugin DTO snapshots; a separate object stands in for the geometry store) and asserts *resolved successfully ⇒ the authoritative record changed*. | measured |
| **V7 (cat 9)** | **EXECUTED.** `apps/editor/src/ui/ai/__tests__/ReportPayloadHonesty.spec.ts` drives one chat sentence to completion for six engine payloads and captures the six transcripts. | measured |
| **V3 (elsewhere), V4, V5, V6** | **SOURCE-ANCHORED.** Which store a handler writes; whether `ProjectSerializer` carries the field; whether the handler returns a non-empty `inverse`; whether the verb appears in `syncDisposition.ts`. | inference |

**The three executed runs, and what each returned:**

| Run | Command | Result |
|---|---|---|
| RAC-2 probe | `npx tsx tools/rac-conformance/probe-categories-6-10.ts` | 38 read-only + 46 operational utterances resolved; **0 read-only mutations**; 3 misreads found |
| V3, category 8 | `cd apps/editor && npx vitest run __tests__/deadVerbAuthoritativeState.test.ts` | **5 passed / 5** — incl. the positive control (`materialColor` *does* reach the authoritative bridge) and *"a catalogue `materialId` must not report success while writing nothing"* |
| V7, category 9 | `npx vitest run apps/editor/src/ui/ai/__tests__/ReportPayloadHonesty.spec.ts` | **17 passed / 17** — six engine states → six distinct transcripts (§4) |

> **⚠ THE HONEST LIMIT OF THIS SCORECARD, STATED UP FRONT.** **Not one row was observed in a running browser against a real renderer, a real Postgres save/reload, or two real clients.** Where the source *proves* a write cannot reach authoritative state, the cell is **FAIL** — that is a fact, not a guess. Where the source suggests it *does*, the cell is **UNPROVEN**, never PASS, and the reason names the expected live path so the runtime harness has a hypothesis to test. Building that runtime harness is the single largest outstanding piece of work this exercise identifies.

---

## §1 — THE HEADLINE FINDINGS

### §1.1 — 🟢 The adversarial read-only set: **0 mutations in 38 phrasings** (at the zero-token ladder)

The highest-severity thing in RAC-2's scope, and it is **clean at the layer I could measure**. Full set and results in §3.

`fd27e513`'s guard (`isVisibilityQueryOpener` / `visibilityMisreadReason`, `packages/ai-host/src/capabilities/CapabilityRefusal.ts`) is an **allowlist**, not a blocklist: a visibility opener may claim only `go-to-level`, `zoom-fit`, `zoom-selected`, `undo`, `redo`. That is the safe direction to be wrong in, and it holds across every phrasing I threw at it — including the nine imperative-plus-measurement forms of the original P0.

**⚠ WHAT THIS RESULT DOES NOT COVER, AND IT IS THE LARGER HALF.** 35 of the 38 read-only phrasings ended as an **honest `miss`** — which in the real app means they *fall through* to rung 2 (the LLM planner, `AIPanel.ts:1635`) and then rung 3 (the legacy `QueryEngine`, `AIPanel.ts:1654`). **`QueryEngine` is not read-only**: its handlers push mutating `CommandProposal`s into `commandProposalStore` with intents including `CREATE_MULTIPLE_LEVELS`, `CREATE_GRID_SYSTEM` and `CREATE_WALLS_ON_ALL_SLABS` (`packages/ai-host/src/QueryEngine.ts:179, 485, 579, 706, 758, 945`), and `AIPanel.ts:1699-1703` renders them as clickable mutation cards. **My probe stops at the zero-token ladder. What the planner and QueryEngine do with these 35 sentences is UNPROVEN and is the next thing anyone should measure.**

### §1.2 — 🔴 P0-CLASS · "Hide Level 2" NAVIGATES instead of hiding — the founder's exact case

```
LOCAL   7.5 hide level    "hide level 2"    → local intent=go-to-level action=setActiveLevel
LOCAL   7.6 show level    "show level 2"    → local intent=go-to-level action=setActiveLevel
```

The founder named this distinction precisely: *"Hide Level 2"* (MUTATE) vs *"What levels are visible?"* (READ-ONLY). The read-only half is safe (§1.1). **The mutate half is a misread**: `hide level 2` and `show level 2` — two opposite asks — produce the *same* action, and it is neither of them. It switches the active level.

This is a direct consequence of the `fd27e513` allowlist: `go-to-level` is in `VISIBILITY_SAFE_INTENTS` so that *"show level 2"* keeps working. That decision is defensible for `show`; **it is not defensible for `hide`**, and nothing in the guard distinguishes them.

Severity: it is a **view-state mutation, not geometry** — no element is harmed — but the user is told an action happened and it is not the action requested, with **no visibility capability anywhere to do the right thing** (§1.3). `QueryEngineDrain.spec.ts` pins the sibling `"isolate level 2" → go-to-level` as a live MISREAD; **`hide level 2` and `show level 2` are in neither the MISREAD nor the DRAINED list — they are undocumented.**

### §1.3 — 🔴 Category 7 does not exist as a RAC capability. P7 is wired but unreachable.

Of the **45 declared capabilities, ZERO carry a read-only/query marker and ZERO hide, show or isolate anything.** `ChatCapability` has no `readOnly`, no `kind: 'query'`, no `mutates` field — only `destructive: boolean`, which grades the severity of a *mutation*. C68 §6.3 says this in its own words: *"a read-only / visibility capability class does not exist at all … the largest of the four families the U10.3 drain measured as still uniquely SERVED by the legacy QueryEngine (**71 phrasings**)."*

**The status of P7 changed under this audit, and the change must be stated precisely.** The brief's baseline — *"all five visibility handlers were `console.debug` and nothing else; `IsolationStateStore` had ZERO production consumers"* — is **STALE**. Agent B3's in-flight work has landed:

- The five handlers now do **real writes**: `packages/visibility/src/intents/visibilityIntentCommands.ts:130-215` → `store.hide/isolate/revealAll/setTransparency/setEdgesEnabled`. The zero-arg no-op constructor is now **unconstructible** — `buildVisibilityIntentHandlerSet` throws without `{store, activeViewId}` (`:101-107`).
- `ViewVisibilityIntentStore` is single-instanced and registered in `composeRuntime.ts:1172-1191`.

**And yet the whole subsystem remains unreachable and non-durable:**

| Axis | State | Evidence |
|---|---|---|
| **Reachable from chat** | ❌ NO | zero capabilities; all 7 visibility utterances MISS or misread (§4, category 7) |
| **Reachable from UI** | ❌ NO | nothing in `apps/` or `plugins/` dispatches `visibility.*` — the only call sites are `composeRuntime.__tests__` |
| **UNDO** | ❌ FAIL | `composeRuntime.ts:594-601` — `affectedStores: []`, `{forward: [], inverse: []}`. Deliberate and documented: *not undoable via Ctrl+Z* |
| **PERSIST** | ❌ FAIL | `ViewVisibilityIntentStore.serialize()` (`:296`) / `deserialize()` (`:317`) exist with **zero callers**; neither `ProjectSerializer` imports `@pryzm/visibility`. No per-element `hidden` flag is serialized anywhere |
| **SYNC** | ❌ FAIL | `affectedStores: []` ⇒ no CRDT patch; `view.*`/`element.hideInView` are explicitly `not-synced` in `syncDisposition.ts:252-262` |
| **`IsolationStateStore`** | ⚠ WORSE THAN ORPHANED | **three** `apps/editor` call sites each `new` a **private** instance (`livingGraphSelection.ts:289`, `InspectPanel.ts:131`, `modelTreeTestModal.ts:182`); `composeRuntime` constructs none. `composeRuntime.ts:1161` names this exact defect: *"three call sites each construct a private instance and then disagree about what is isolated"* — and fixes it only for the other store |

**On the claim/behaviour question the brief asks:** the claim and the behaviour now **AGREE**, because the claim was lowered to meet the behaviour. `composeRuntime.ts:573-588` states outright that a visibility gesture is not undoable, not replicated and not logged. That is honest — and it means the answer to *"does visibility have persistence/undo/sync?"* is **no, by written decision**, not by accident.

### §1.4 — 🔴 P0-CLASS · "remove the material from this wall" → **`element.delete`**

```
COMMANDS  8.3  "remove the material from this wall"  → commands[element.delete] intent=delete-selected
```

A **material** request routes to a **destructive delete of the wall**. This is a claiming-discipline failure of exactly the class C68 §5.j governs and §6.3-G10 records as **NOT ENFORCED** (*"the item most likely to ship a destructive defect"*). It is **not** in `QueryEngineDrain.spec.ts`'s MISREAD inventory — new, found here.

Mitigation, stated so the severity is not overstated: `delete-selected` is `destructive: true`, so the chat shows a Confirm card before acting, and that card names *deletion*. A user who reads it will catch it. **A user who does not, deletes a wall by asking about its material.**

### §1.5 — 🔴 The founder's own category-9 utterance **is not a supported sentence**

```
MISS  9.0  "Raise all exterior walls to 3.2 m"      → miss
MISS  9.1  "make all walls 3.2m tall"               → miss
MISS  9.2  "make all walls on level 2 3.2m tall"    → miss
```

Three independent reasons, each verifiable:

1. **`raise` is not a verb.** `matchHeight` (`ZeroTokenResolver.ts:2347-2353`) accepts `set | change | make`.
2. **There is no all-scope height grammar.** `set-height` has `scope: 'selection'` with no `scopeModes`; `needSelection('set-height', …)` (`:1135`) refuses without one.
3. **There is no wall-height BATCH command.** `SpecDrivenIntentId` (`CapabilityExecutionSpec.ts:82-97`) covers wall-type, wall-color, wall-rake, window/door/slab/ceiling-type, delete-families and add-wall-layer — **not height**. So even a fixed grammar would fan out to N commands = N undo entries, which ADR-0314 forbids calling one undo.
4. `exterior` is not a scope: `WALL_ORIENTATION_ADJ` (`:2550`) treats it as an **ignored optional qualifier** before a compass word.

**Consequence for the acceptance rule.** The founder's rule — the UI must say *"Changed 7 of 10 walls. 3 skipped…"*, not *"Done."* — **cannot be exercised on this sentence at all**, because the sentence never reaches an engine. It CAN be exercised on the sentences the grammar does accept (`make all walls interior partition`, `make all walls white`, `delete all furniture in the kitchen`), and on those the reporting layer now behaves — see §5.

### §1.6 — 🟡 The category-9 reporting defect the brief names is **ALREADY FIXED** (Agent E2, in the working tree)

Both defects named in the brief are gone, and I measured that rather than trusting it:

- **`batchCatalogue.ts:500` `if (res?.success) return { ok: true }`** — removed. `dispatchBatchEntry` (`:533-576`) now reads `const info = res?.info ?? []` (`:557`) and returns `{ ok: true, info }` (`:561`). `BatchDispatchResult` (`:492-506`) carries `info` on **both** arms.
- **`roomFinishChatSeam.ts` `success:true` after a total timeout** — removed. `reportStages()` (`:102-116`) splits three ways: all confirmed → `applied`; **none confirmed → `emitReport(false, …, 'indeterminate')`**; mixed → `partial` with the unconfirmed lines carried.
- **A partial across commands reported as total failure** — fixed. `classifyDispatch` (`ZeroTokenChatBridge.ts:735-784`) has five kinds: `applied | partial | refused | dispatch-failed | indeterminate`.

The six transcripts are in §5, verbatim.

### §1.7 — 🔴 Category 10: **cannot be demonstrated. Not "works", not "probably".**

Per **C66 §1.1**, all three tiers (50 / 300 / 1,000) are **CLAIMED**, none HELD, and no tier may be described as supported. Beyond capacity, the *functional* claim fails on three independent legs, all source-proven:

| Leg | State | Evidence |
|---|---|---|
| (a) **write** into the Y.Doc | ✅ wired for **25 verbs** | `packages/sync-client/src/syncDisposition.ts:114-181`, landed `e1f6966d` |
| (b) **read back** into local stores | ❌ **DOES NOT EXIST** | `YjsDocAdapter.ts` contains **zero** `.observe`/`observeDeep`. The only observer in `sync-client` is `event-bridge.ts:73,95` on the *events* map, not `ELEMENTS_NAMESPACE`. Its read surface (`readElement`, `readElementProperty`, `getElementsNamespace`, `:733-758`) has **no caller in `apps/editor`** |
| (c) **transport deployed** | ❌ **NO** | `engineLauncher.ts:863-902` — `enabled: _flagOn && Boolean(_syncUrl)`, **both default OFF**; off-path log at `:894-897` is literally `L-391: CRDT websocket provider OFF`. Production collaboration is socket.io last-writer-wins full-snapshot rebroadcast (`engineLauncher.ts:851`) |
| (d) *bonus defect* | ⚠ | the adapter is constructed behind `requestIdleCallback` (`:971-988`), so **any command in the first ~1.5–4 s runs with `_crdtApplier === null` and is never written to the Y.Doc at all** — including the generate path (`:804-806`) |

**So V6 is FAIL for every one of the 39 rows**, and the reason is identical: even for the 25 verbs whose writes land, **leg (b) does not exist — a receiving client never re-renders.** I did **not** stage a two-adapter test and call it collaboration. Had I done so it would have exercised leg (a) only, and **would not demonstrate two users seeing each other's edits**; that distinction is the entire point of this category.

### §1.8 — 🔴 The room material defect: **CLOSED**, but rooms are hollow elsewhere

The named defect (`SetRoomMaterial.ts:71-73` returning `{forward:[],inverse:[]}` and reporting success; `MaterialDispatch.ts:120` missing `supportsMaterialId:false`) is **fixed in the working tree by Agent G2**:

- `SetRoomMaterial.ts:86-88` — `canExecute` now returns `{valid:false, reason: ROOM_MATERIAL_ID_UNSUPPORTED}` for a `materialId`. An **explicit refusal**, not an empty patch pair.
- `MaterialDispatch.ts:129` — `room: { …, supportsMaterialId: false }` is present; `MATERIAL_ID_UNSUPPORTED_REASON.room` (`:208`) is now **used** (`:268`), not dead.

**The founder's acceptance rule is therefore satisfied by refusing the ask rather than by fulfilling it** — which is the correct answer, because a room genuinely has no catalogue-material field: the renderer and `ProjectSerializer` paint the top-level `colour` override. That is a real, defensible outcome and it must not be re-described as "room materials work."

What remains broken in rooms is elsewhere, and is larger:

- **`room.setFinish` and `room.resize` DO NOT EXIST as bus verbs anywhere.** Room *finishes* are fully modelled and fully persisted (`RoomFinishesSchema`, `RoomDataSchema.ts:83-89` — `materialId`, `materialName`, `materialColor`, `finishCode`, `nbs`, `csiDivision`; round-tripped at `roomSnapshotUtils.ts:95/190`) — **and there is no command-bus route to set any of them.** A rich persisted schema with no write path is the mirror image of a dead verb.
- **`room.create` is a dead verb by this repo's own criterion.** `plugins/rooms/src/handlers/CreateRoom.ts:114` `produceCommand`s into the plugin `RoomsState` DTO store with `affectedStores: ['room']` and **no** `commandManager` bridge — the only room verb that was not given one (its siblings `room.rename`, `room.delete`, `room.setMaterial` all bridge). The renderer and `ProjectSerializer.ts:975` read the **`@pryzm/room-topology` `RoomStore`**, a *different and incompatible* `RoomData` shape (`boundary.polygon: {x,z}[]`, nested `finishes`) from the plugin DTO `Room` (`packages/schemas/src/elements/Room.ts:39-112`, `boundary: Vec3[]`, flat `materialColor`/`materialId`). **There is no translation layer between them.**

### §1.9 — 🟡 Category 8: the 15 dead DTO verbs are now **REFUSED**, not silently dead

`wall.setColor` / `wall.setDimensions` / `wall.setLayers` / `wall.bulkSetVisuals` and the `*.setMaterial` family still `produceCommand` into detached plugin DTO stores — **but their `canExecute` now refuses unconditionally** (`SetWallColor.ts:98-100` `WALL_SET_COLOR_UNREACHABLE`; `BulkSetWallVisuals.ts:76`), redirecting to the live batch verbs. `CHAT_UNAVAILABLE` states the true reason rather than a euphemism: *"Writes a detached plugin store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH)."*

**This is why V3 must never be read off `success === true`.** Had I probed the DTO store, all fifteen would have shown a correct patch and returned a **FALSE PASS**. `apps/editor/__tests__/deadVerbAuthoritativeState.test.ts` measures the *legacy geometry singleton* instead — the store `ProjectSerializer` and the fragment builders read — and includes a **positive control** (`room.setMaterial` with a `materialColor`, which really does bridge to `commandManager` → `UpdateRoomCommand` → `roomStore`) so that a probe failing for everything cannot be mistaken for a finding.

**I ran it: 5 passed / 5.** The two rows that matter most:

```
✓ §PROBE-DEAD-VERB — room.setMaterial > CONTROL: materialColor reaches the authoritative bridge
✓ §PROBE-DEAD-VERB — room.setMaterial > a catalogue materialId must not report success while writing nothing
✓ §PROBE-DEAD-VERB — no verb may report success while authoritative state is unchanged
✓ §PROBE-DEAD-VERB-UNDO — wall.bulkSetVisuals must not push a geometry-keyed PatchPair
✓ §PROBE-DEAD-VERB-UNDO — replaying the armed inverse against the geometry store clobbers a value it owns
```

The last two are the finding people miss: a dead verb is not merely inert. `wall.bulkSetVisuals` armed an inverse **keyed to the geometry store it never wrote**, so a later undo would have *clobbered a value it did not own*. A dead write plus a live undo is worse than either alone.

---

## §2 — THE SCORECARD · 39 operations × 7 verdicts

### §2.0 — The tally, before the detail

**V1 RESOLVE, the only column scored on every applicable row (33 of them; six rows are payload-level cases with no utterance):**

| Category | PASS | FAIL | UNPROVEN |
|---|---|---|---|
| 6 · rooms | 2 | 6 | 0 |
| 7 · visibility | **1** | **6** | 0 |
| 8 · materials/properties | 3 | 6 | 0 |
| 9 · batch | 3 | 1 | 0 |
| 10 · collaboration | 3 | 1 | 1 |
| **total** | **12** | **20** | **1** |

**V6 SYNC: 0 PASS. FAIL on all 39 rows, for one identical reason** — leg (b), reading the canonical element map back into local stores, does not exist (§1.7). This is not a capacity finding and must not be softened into one.

**V3 STATE: 1 PASS (row 5, by refusal), the rest FAIL or UNPROVEN.** **V4 PERSIST and V5 UNDO: 0 PASS** — every affirmative case needs a runtime this harness does not have; every negative case is source-proven. **V7 REPORT: 5 PASS, all in category 9, all executed.**

Read the shape rather than the arithmetic: **the RAC resolves reliably where a capability exists, and a capability does not exist for most of categories 6 and 7.** The failures are overwhelmingly *absence*, not *malfunction* — with three sharp exceptions (§1.2, §1.4, §1.5).

---

**39 numbered operations, plus two supplementary rows (5b, 23b) that separate a distinction the numbered list conflates** — room *colour* from room *material*, and an invalid *value* from an invalid *property*. Both distinctions turned out to matter.

**Legend.** `NOT OFFERED` = there is no capability for this ask at all (a finding, but a different one from "broken"). `MISREAD` = the ladder claims it and produces the wrong thing. `DEAD` = source-proven not to reach authoritative state. Every non-PASS cell carries its reason.

### Category 6 — ROOMS / SPATIAL MODEL (8)

| # | Operation | Utterance probed | V1 | V2 | V3 | V4 | V5 | V6 | V7 | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | create room | `create a room` | FAIL | FAIL | FAIL | FAIL | UNPROVEN | FAIL | UNPROVEN | V1 NOT OFFERED — miss; `room.create` classified **B/needs-design** (placement geometry). V2/V3/V4 the registered handler writes plugin `RoomsState` (`CreateRoom.ts:114`), a **detached DTO store**; renderer + `ProjectSerializer.ts:975` read `@pryzm/room-topology` `RoomStore`, an incompatible shape, with no translation layer. V6 §1.7 |
| 2 | detect room boundary | `detect the room boundaries` | FAIL | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | V1 NOT OFFERED — miss; `room.redetect`/`room.recomputeBoundary` classified **C/internal** ("a sentence never means this verb"). Boundary detection runs on load (`ProjectLoader.ts:2098-2160`), never by request |
| 3 | rename room | `rename this room to Kitchen` | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | V1/V2 executed → `commands[room.rename]` intent `rename-room`. V3–V5 source-anchored LIVE: `RenameRoom.ts:52` bridges `commandManager` → `RenameRoomCommand` → geometry `roomStore`; `name` is serialized (`ProjectSerializer.ts:975` `deepStrip`). Never observed at runtime. V6 `room.rename` IS declared (`syncDisposition.ts:165`) — the **one** `last-writer-wins` entry — but leg (b) is absent (§1.7) |
| 4 | change room finish | `set the floor finish of this room to oak` | FAIL | FAIL | FAIL | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | **NOT OFFERED, AND NO VERB EXISTS.** `room.setFinish` is absent from the entire repo. Finishes are fully schema'd and fully persisted (`RoomDataSchema.ts:83-89`) with **no command-bus write path** — only the legacy `UpdateRoomCommand` |
| 5 | change room **material** (the named defect) | `change the material of this room to concrete` | FAIL | FAIL | **PASS** | UNPROVEN | UNPROVEN | FAIL | **PASS** | V1 miss (chat) — `room.setMaterial` is in `CHAT_UNAVAILABLE`, so the chat never sends it. V3/V7 **PASS by REFUSAL, measured**: the inspector route now refuses a `materialId` out loud (`SetRoomMaterial.ts:86-88`, `MaterialDispatch.ts:129`) instead of reporting success over nothing. §1.8 — this is a correct answer, NOT "room materials work" |
| 5b | change room **colour** | `make this room white` | FAIL | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | V1 NOT OFFERED from chat (miss). From the **inspector** the colour route is source-anchored LIVE and is the positive control of the dead-verb probe: → `UpdateRoomCommand(roomId,{colour})` → `roomStore`; `colour` persists (`roomSnapshotUtils.ts:104/192`) |
| 6 | resize room | `make this room 4m by 5m` | FAIL | FAIL | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | **NOT OFFERED, AND NO VERB EXISTS.** `room.resize` is absent repo-wide. Rooms are *derived* from bounding walls — `room.move` is explicitly refused in `CHAT_UNAVAILABLE` ("Rooms follow their bounding walls"). Arguably correct by design; recorded as a gap because the operation was asked for |
| 7 | delete room | `delete this room` | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | Executed → `commands[element.delete]` intent `delete-selected`, `destructive: true` (Confirm card). V3–V5 source-anchored LIVE: `DeleteRoom.ts:59` bridges → `DeleteRoomCommand` → `roomStore`. V6 `room.delete` is **not** in the 25 synced verbs |
| 8 | **room survives save/reload** | (round-trip) | — | — | — | UNPROVEN | — | FAIL | — | **Strong source evidence, unobserved.** Rooms ARE a first-class persisted collection (`ProjectSerializer.ts:975`, `ProjectLoader.ts:1303-1336`, `BatchCreateRoomsCommand`), and `§LOAD-REDETECT-FREEZE` (`:2098-2160`) treats hydrated rooms as authoritative. `computed` is deliberately recomputed, never trusted from JSON (`roomSnapshotUtils.ts:191`). **Requires a runtime save/reload to settle** |

### Category 7 — VISIBILITY / SELECTION / ISOLATION (7)

**Every mutating row in this category is NOT OFFERED. See §1.3 — the subsystem is wired and unreachable.**

| # | Operation | Utterance probed | V1 | V2 | V3 | V4 | V5 | V6 | V7 | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| 9 | hide wall | `hide this wall` | FAIL | FAIL | UNPROVEN | FAIL | FAIL | FAIL | UNPROVEN | V1 NOT OFFERED (miss). V2 no capability dispatches `visibility.hide.selection` — the only call sites are `composeRuntime.__tests__`. V4 no serializer touches `@pryzm/visibility`; `serialize()` has zero callers. V5 `{forward:[],inverse:[]}` (`composeRuntime.ts:594-601`) — **deliberately not undoable** |
| 10 | show wall | `show this wall` | FAIL | FAIL | UNPROVEN | FAIL | FAIL | FAIL | UNPROVEN | as above; `visibility.reveal.all` exists and is undispatched |
| 11 | isolate room | `isolate the kitchen` | FAIL | FAIL | UNPROVEN | FAIL | FAIL | FAIL | UNPROVEN | NOT OFFERED (miss). `IsolationStateStore` is **triple-instanced and runtime-orphaned** (§1.3) — three call sites can disagree about what is isolated |
| 12 | exit isolation | `exit isolation` | FAIL | FAIL | UNPROVEN | FAIL | FAIL | FAIL | UNPROVEN | NOT OFFERED (miss). `temporaryIsolation` is deliberately session-only (`ViewVisibilityIntentStore.ts:290-295`) |
| 13 | **hide level** | `hide level 2` | **FAIL 🔴** | **FAIL 🔴** | FAIL | FAIL | FAIL | FAIL | **FAIL 🔴** | **§1.2 P0-CLASS MISREAD.** → `local go-to-level / setActiveLevel`. It NAVIGATES. Not in the pinned MISREAD or DRAINED lists — undocumented. V7 the transcript will report a level switch the user did not ask for |
| 14 | **show level** | `show level 2` | **FAIL 🔴** | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | Same single action as row 13. Two opposite asks, one outcome. `go-to-level` is allowlisted in `VISIBILITY_SAFE_INTENTS` so `show` "works"; the guard cannot tell `show` from `hide` |
| 15 | **read-only visibility question** | `what levels are visible?` (+ 6 more) | **PASS 🟢** | **PASS 🟢** | — | — | — | — | UNPROVEN | **THE CRITICAL ROW, AND IT IS CLEAN AT THIS LAYER.** All 7 visibility questions → honest `miss`, **zero mutations**. V7 UNPROVEN: the answer is produced downstream by the LLM planner / `QueryEngine`, which this harness does not reach (§1.1) |

### Category 8 — MATERIALS / METADATA / PROPERTIES (8)

| # | Operation | Utterance probed | V1 | V2 | V3 | V4 | V5 | V6 | V7 | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| 16 | assign material | `assign concrete to this wall` | FAIL | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | V1 miss — `assign` is not a verb in any matcher. The catalogue-material ask has **no chat route on any family**; `CHAT_UNAVAILABLE` says so for 12 families verbatim |
| 17 | change material (colour route) | `make all walls white` | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | Executed → `commands[wall.updateColorBatch]` intent `set-wall-color`, **exactly one** command (ADR-0314 one-undo). Source-anchored LIVE via `UpdateWallsColorBatchCommand` → geometry `wallStore`; `materialColor` is serialized (`ProjectSerializer.ts:506-537`). V6 `wall.updateColorBatch` is declared **`not-synced`** (`syncDisposition.ts:196-202`), and the stated reason is sharper than "batch verbs are excluded": the subject is `wallIds: string[] \| "all"`, resolved *inside* the command, and **the adapter cannot enumerate `"all"` without reading a store, which L3 forbids.** The fix named there is a `plugins/wall` handler change to surface `affectedElementIds` |
| 18 | **remove material** | `remove the material from this wall` | **FAIL 🔴** | **FAIL 🔴** | FAIL | FAIL | UNPROVEN | FAIL | **FAIL 🔴** | **§1.4 P0-CLASS MISREAD → `element.delete`.** A material ask routes to a destructive delete. Mitigated by the destructive Confirm card; not by the resolver. New — not in `QueryEngineDrain.spec.ts` |
| 19 | set classification | `set the classification of this wall to Uniclass EF_25_10` | FAIL | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | NOT OFFERED (miss). No classification capability; `properties`/`ifcData` are serialized but have no chat write route |
| 20 | change element metadata | `set the mark of this wall to W-12` | FAIL | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | UNPROVEN | NOT OFFERED (miss) — **though `element.updateMark` IS a registered, live, CRDT-declared verb** (`syncDisposition.ts:129`). A live command with no grammar: the c1902a5a defect exactly, one instance still open |
| 21 | query property | `what is the height of this wall?` | **PASS** | **PASS** | — | — | — | — | UNPROVEN | Honest miss, **no mutation** — correct. V7 UNPROVEN: answered downstream (§1.1) |
| 22 | query multiple properties | `what are the height, thickness and type of this wall?` | **PASS** | **PASS** | — | — | — | — | UNPROVEN | as above |
| 23 | **invalid property → EXPLICIT REFUSAL** | `set the flurbosity of this wall to 7` | **FAIL** | UNPROVEN | — | — | — | — | **FAIL** | **The requirement is an EXPLICIT REFUSAL; what happens is an honest `miss`.** A miss is not a refusal: it falls through to the LLM, which may say anything. `capabilityGapRefusal` exists (`ZeroTokenChatBridge.ts:1192`) but returns `null` here, and `null` ⇒ `return false` ⇒ LLM. **Failure and emptiness are the same value at this seam** |
| 23b | invalid **value** | `make this wall minus three metres tall` | **FAIL** | **FAIL** | UNPROVEN | — | UNPROVEN | FAIL | UNPROVEN | Executed → `commands[wall.updateDimensions]`. **A negative height is DISPATCHED**; the resolver applies no bound. Whether the command refuses is downstream and UNPROVEN. `PropertyDescriptorGenerator` publishes bounds the resolver does not consult |

### Category 9 — BATCH OPERATIONS (8)

**The engine layer is honest and the reporting layer has been repaired (§1.6). The gap is the GRAMMAR (§1.5).**

| # | Outcome case | Utterance / payload | V1 | V2 | V3 | V4 | V5 | V6 | V7 | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| 24 | **the founder's utterance** | `Raise all exterior walls to 3.2 m` | **FAIL 🔴** | **FAIL** | — | — | — | FAIL | — | **§1.5 — not a supported sentence.** `raise` is not a verb; `set-height` is selection-scoped; there is no wall-height batch command; `exterior` is an ignored qualifier. The founder's acceptance rule cannot be exercised on this sentence |
| 25 | all eligible → success | `make all walls interior partition` | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | **PASS** | One command (`wall.updateSystemTypeBatch`). V7 measured — case 1 transcript, §5 |
| 26 | some eligible → **partial** | engine: `Changed 12 of 40 … 28 skipped` | — | — | UNPROVEN | UNPROVEN | UNPROVEN | FAIL | **PASS** | V7 measured — case 2. The skipped count AND the engine's reason survive to the user verbatim |
| 27 | none eligible → **NOT success** | engine: `No rooms on Level 0 — detect rooms first` | — | — | — | — | — | FAIL | **PASS** | V7 measured — case 5. Distinct from case 4; the refusal reason IS the transcript, and `Done` never appears |
| 28 | invalid selection → refusal | `make the selected walls 3.2m tall` (empty selection) | **PASS** | **PASS** | — | — | — | FAIL | UNPROVEN | Executed → `refusal` intent `set-height`. An honest refusal, not a no-op ✅ |
| 29 | timeout → **timeout** | all stages time out | — | — | — | — | — | FAIL | **PASS** | V7 measured — case 6 `indeterminate`. Was `success:true`; now says it cannot tell. **Residual**: the `floors` stage is `confirmed:true` **by construction** (`roomFinishChatSeam.ts:269-279`) — it can never report a partial |
| 30 | mixed valid/invalid → **discriminated result** | `classifyDispatch` multi-command | — | — | — | — | — | FAIL | **PASS** | Measured. Five distinct kinds; a later report is never discarded by an earlier one |
| 31 | undo entire batch | `undo that` | **PASS** | **PASS** | UNPROVEN | — | UNPROVEN | FAIL | UNPROVEN | Executed → `local undo`. Batch verbs emit **exactly one** command (gate check 6a), which is the *provable* half of "one undo"; whether one history entry results is a runtime fact |
| 32 | save/reload batch result | (round-trip) | — | — | — | UNPROVEN | — | FAIL | — | Requires a runtime save/reload. The mutated fields (`systemTypeId`, `materialColor`) ARE serialized (`ProjectSerializer.ts:506-537`) |

> **⚠ A NUMERICAL HONESTY NOTE ON V7.** `CommandResult` (`packages/command-registry/src/types.ts:403-408`) carries `info?: string[]` — **prose, not structured counts**. There is no `{attempted, applied, skipped, reasons}`. The counts survive because each batch command *formats them into English* and the reporting layer passes the string through untouched. This is honest end-to-end, but it means nothing downstream can *reason* about a partial: `CreatePanelLayout.ts:418-426` records exactly that — toast severity cannot distinguish 12-of-25 from 25-of-25 without re-parsing prose.

### Category 10 — COLLABORATION (8)

**Every row: V6 FAIL. §1.7. The reason is identical for all of them and it is not capacity — it is that leg (b), reading the canonical element map back into local stores, does not exist.**

| # | Operation | V1 | V2 | V3 | V4 | V5 | V6 | V7 | Reason |
|---|---|---|---|---|---|---|---|---|---|
| 33 | A changes wall height 3.5 m → B receives it | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | **FAIL** | UNPROVEN | V1/V2 executed → `commands[wall.updateDimensions]`. `wall.updateDimensions` IS declared synced (`syncDisposition.ts:137`) so leg (a) writes. **B never re-renders** — no observer on `ELEMENTS_NAMESPACE` |
| 34 | A changes material → B receives it | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | **FAIL** | UNPROVEN | **Worse than the others: leg (a) does not even write.** `wall.updateColorBatch` is explicitly `not-synced` because its `"all"` subject is late-bound inside the command and the adapter may not read a store to enumerate it (L3). **Every mass edit the chat can actually perform is in this class** — which is to say the RAC's *strongest* capabilities are its *least* syncable |
| 35 | B moves wall → A receives it | FAIL | FAIL | — | — | — | **FAIL** | — | `wall.move` is in `CHAT_UNAVAILABLE` ("chat has no pointer") — not a RAC operation at all |
| 36 | A changes roof → B receives it | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **FAIL** | UNPROVEN | `roof.update` IS declared synced (`:160`). Legs (b)+(c) absent |
| 37 | B changes room → A receives it | **PASS** | **PASS** | UNPROVEN | UNPROVEN | UNPROVEN | **FAIL** | UNPROVEN | `room.rename` is the **one** `last-writer-wins` declaration (`:165`) — every other synced verb is `conflict: 'disclose'` |
| 38 | simultaneous edits / conflict / resolution | — | — | — | — | — | **FAIL** | UNPROVEN | Disclosure machinery EXISTS (`_rememberLocalWrite` `:715-725`, `_snapshotPendingValues` `:809-821`, `_discloseOverwrittenLocalWrites` `:838-865`) and conflict UI is wired at `engineLauncher.ts:904-961` — **behind a provider that is OFF**. Production is socket.io **silent LWW** |
| 39 | reload both clients | — | — | — | UNPROVEN | — | **FAIL** | — | Cannot be staged without deployed transport |

---

## §3 — THE ADVERSARIAL READ-ONLY SET (38 phrasings) — the highest-severity result

Source: `tools/rac-conformance/probe-categories-6-10.ts` §SECTION A. **Every sentence is a question or a request for information, deliberately phrased to LOOK operational.** Result: **0 mutations in 38.**

| # | Phrasing | Result |
|---|---|---|
| RO-01 | `highlight walls taller than 3m` *(the original P0)* | miss ✅ |
| RO-02 | `highlight all walls taller than 3 metres` | miss ✅ |
| RO-03 | `show me the walls taller than 3m` | miss ✅ |
| RO-04 | `show me every wall thicker than 200mm` | miss ✅ |
| RO-05 | `which walls are taller than 3m?` | miss ✅ |
| RO-06 | `how many walls are taller than 3.2 m?` | miss ✅ |
| RO-07 | `find all walls over 3m tall` | miss ✅ |
| RO-08 | `list the doors wider than 900mm` | miss ✅ |
| RO-09 | `highlight the windows with a sill height above 1m` | miss ✅ |
| RO-10 | `what levels are visible?` | miss ✅ |
| RO-11 | `which levels are visible` | miss ✅ |
| RO-12 | `is level 2 hidden?` | miss ✅ |
| RO-13 | `list the hidden elements` | miss ✅ |
| RO-14 | `am I in isolation mode?` | miss ✅ |
| RO-15 | `what is hidden right now?` | miss ✅ |
| RO-16 | `tell me which walls are hidden on level 2` | miss ✅ |
| RO-17 | `what is the height of this wall?` *(wall selected)* | miss ✅ |
| RO-18 | `how thick is the selected wall?` | miss ✅ |
| RO-19 | `what material is this room?` *(room selected)* | miss ✅ |
| RO-20 | `what type is this wall?` | miss ✅ |
| RO-21 | `what are the height, thickness and type of this wall?` | miss ✅ |
| RO-22 | `what is the area of the kitchen?` | miss ✅ |
| RO-23 | `how many rooms are on level 2?` | miss ✅ |
| RO-24 | `Changed 7 of 10 walls. 3 skipped: locked / invalid / not eligible.` *(paste-back)* | miss ✅ |
| RO-25 | `Level 2 — 14 walls, 6 doors, 3 windows` *(paste-back)* | miss ✅ |
| RO-26 | `Wall height: 3.2 m` *(paste-back)* | **refusal** (intent `set-height`) ✅ |
| RO-27 | `what would happen if I made all the walls 3.2m?` | miss ✅ |
| RO-28 | `do not change the wall height` | miss ✅ |
| RO-29 | `I do not want to hide level 2` | miss ✅ |
| RO-30 | `can you hide a level?` | miss ✅ |
| RO-31 | `are you able to change a room material?` | miss ✅ |
| RO-32 | `check whether every wall on level 2 is 3m tall` | miss ✅ |
| RO-33 | `verify the exterior walls are all the same height` | miss ✅ |
| RO-34 | `compare the wall heights on level 1 and level 2` | miss ✅ |
| RO-35 | `why is this wall 3.2m tall?` | miss ✅ |
| RO-36 | `summarise the materials used in this project` | miss ✅ |
| RO-37 | `where are the load-bearing walls?` | miss ✅ |
| RO-38 | `give me a schedule of all the doors` | miss ✅ |

**Did ANY of them mutate? NO — 0 of 38.**

**Three things this table must not be read as saying:**

1. **It measures the zero-token ladder only.** 35 of 38 are `miss`, which in the app means the sentence continues to the LLM planner and then to `QueryEngine` — and `QueryEngine` **queues mutating command proposals** (§1.1). The P0 risk has been pushed downstream, not eliminated, and downstream is **unmeasured**.
2. **RO-26 is a near-miss worth watching.** `Wall height: 3.2 m` — a pasted *report line* — was claimed by `set-height` and only stopped by the empty-selection guard. Change the guard, or paste it with a wall selected, and it becomes an edit. This is precisely `§FIX-CHAT-REPORT-PASTEBACK`, and it is **not** in the acceptance suite's adversarial corpus.
3. **A `miss` is not a refusal.** The system is *silent*, not *honest*. C68 §5.g wants a refusal that names the gap; row 23 of the scorecard is the same defect seen from the operational side.

---

## §4 — CATEGORY 9: THE SIX OUTCOME CASES, VERBATIM

Produced by `apps/editor/src/ui/ai/__tests__/ReportPayloadHonesty.spec.ts`, which drives one real chat sentence (`furnish all rooms`) to completion through `tryHandleZeroToken` for six engine payloads.

**Result: 17/17 passed. Six engine states → six DISTINCT transcripts.** Verbatim:

**Case 1 — all succeed.** `"Done"` is earned, and it is not the whole message: the engine's counts are.
```
Ceilings 24/24 · Furniture 24/24 (96 items) (furnishing also auto-lights the rooms) · Lighting 24/24. Undo with Ctrl+Z. (resolved without AI tokens)
```

**Case 2 — PARTIAL.** ✅ **This is the founder's acceptance rule, met.** The skipped count AND the engine's own reason reach the user; nothing says "Done."
```
Ceilings 24/24 · Furniture 18/24 (61 items) — 6 rooms skipped: no wall long enough for the bed · Lighting 18/24. Undo with Ctrl+Z. (resolved without AI tokens)
```

**Case 3 — some skipped.** Distinct from case 1; the reason survives verbatim.
```
Furniture 24/24 (96 items) — 3 rooms skipped: room is a corridor. Undo with Ctrl+Z. (resolved without AI tokens)
```

**Case 4 — all fail.** Never reads as success. Quotes the engine.
```
Nothing was changed — Furniture 0/24 — 24 rooms skipped: the room polygon is not closed
```

**Case 5 — none eligible.** The refusal reason IS the transcript, not a generic default — and it is a *different sentence* from case 4 ("it refused" ≠ "it ran and failed").
```
Nothing was changed — No rooms on Level 0 — detect rooms first; nothing was changed.
```

**Case 6 — TIMEOUT / INDETERMINATE.** ✅ The defect the brief names. This used to read *"…Done — undo with Ctrl+Z."* over a command that promised a report and sent none.
```
I can't tell you what happened — the command was dispatched and sent no report back. No report came back, so nothing here is confirmed: check the model before assuming it ran, and Ctrl+Z if something did change.
```

**And the multi-command discrimination** (`classifyDispatch`, all executed):

| Input | Kind | Note |
|---|---|---|
| every command reported success | `applied` | |
| **some** rejected, some ran | **`partial`** | was reported as **total failure**; now carries both `lines` and `failedLines` |
| a later report after an earlier one | both kept | an earlier report no longer discards a later one |
| every command rejected | `dispatch-failed` | distinct from `refused` |
| promised a report, sent none | `indeterminate` | **never** `applied` |
| promises NO report, clean dispatch | `applied` | ✅ *"emptiness here is not failure"* — the inverse error is also guarded |

> **⚠ Read case 2 precisely.** A *single* command whose `info` carries "18/24 … 6 rooms skipped" travels the `applied` path — the honesty lives in the engine's prose, which the layer passes through untouched. The `partial` **kind** is reserved for *multi-command* mixtures. Both are truthful to the user; they are not the same mechanism, and only the second is discriminated structurally.

---

## §5 — WHAT IS UNPROVEN, AS DISTINCT FROM WHAT IS BROKEN

**BROKEN (source-proven, actionable now):**

1. `hide level 2` / `show level 2` → `go-to-level` (§1.2) — **undocumented misread**, not in the pinned inventory.
2. `remove the material from this wall` → `element.delete` (§1.4) — **destructive misread**, new.
3. Visibility has **no capability, no dispatcher, no undo, no persistence, no sync** (§1.3).
4. `room.setFinish` / `room.resize` **do not exist**; `room.create` writes a detached DTO store (§1.8).
5. Collaboration leg (b) — reading the element map back — **does not exist**; transport is **not deployed** (§1.7).
6. An invalid property produces a **silent miss, not a refusal** (row 23).
7. A **negative height is dispatched** without a bound check (row 23b).

**UNPROVEN (could not be established here; needs a runtime harness):**

1. **Every V3 outside category 8.** No browser, no renderer, no fragment builder in this process.
2. **Every V4.** No save→reload was performed against Postgres or the snapshot writer.
3. **Every V5.** Whether one undo restores exactly the prior value — including whether a batch is genuinely one history entry — is a runtime fact the gate itself says it cannot see.
4. **What the LLM planner and `QueryEngine` do with the 35 read-only misses.** This is the largest unmeasured surface in RAC-2's scope and it contains the residual P0 risk.
5. **Whether commands issued in the first ~1.5–4 s reach the Y.Doc at all** (`requestIdleCallback`, `engineLauncher.ts:971-988`) — a real defect, unquantified.

**NOT OFFERED (a finding, but not a defect):** create room · detect room boundary · room finish · room resize · assign catalogue material on any family · set classification · every visibility mutation.

---

## §6 — PRODUCT-SIDE DIFFS HANDED OVER, NOT APPLIED

RAC-2 wrote **no product source**. Two changes are recommended and deliberately **not** applied — both sit in trees owned by other agents:

**D-1 — `packages/ai-host/src/capabilities/CapabilityRefusal.ts` (§1.2).** `VISIBILITY_SAFE_INTENTS` allowlists `go-to-level` so `show level 2` keeps working; it therefore also lets **`hide level 2`** and **`isolate level 2`** reach `go-to-level`. The opener should be split: `show`/`reveal` may reach a view-changing intent; `hide`/`unhide`/`isolate`/`highlight` may not, and must refuse naming the missing visibility capability.

```
 const VISIBILITY_SAFE_INTENTS: ReadonlySet<string> = new Set([
   'go-to-level', 'zoom-fit', 'zoom-selected', 'undo', 'redo',
 ]);
+/** Openers that are NEVER satisfied by changing what you are looking at.
+ *  "hide level 2" reaching go-to-level NAVIGATES instead of hiding — the
+ *  opposite ask, the same action. Until a visibility capability exists these
+ *  must refuse out loud rather than land on the nearest live intent. */
+const VIEW_CHANGE_NEVER_SATISFIES =
+  /^\s*(?:please\s+)?(?:hide|unhide|isolate|highlight)\b/i;
```
…consumed in `visibilityMisreadReason` before the allowlist is consulted. **Owner: whoever owns `packages/ai-host` — not RAC-2, not B3.**

**D-2 — the `remove the material from …` grammar (§1.4).** `delete-selected` claims an utterance whose object is a *property*, not the element. A `remove <property> from <element>` shape must not reach a delete intent. Fix belongs with the `delete-selected` matcher; **also add both sentences to the adversarial corpus in `packages/ai-host/__tests__/capability-acceptance.test.ts`** so check 4c executes them with zero tolerance thereafter.

Both should additionally be recorded in `apps/editor/src/ui/ai/__tests__/QueryEngineDrain.spec.ts`'s MISREAD list, which is the falsifiable inventory C67 §1.6 relies on and which currently does not know about either.

---

## §7 — FILES

**Written by RAC-2 (harness + this document only):**

- `tools/rac-conformance/ladder.ts` — shared ladder driver, context builders, verdict types, markdown emitter. Generic; RAC-1 extends rather than forks.
- `tools/rac-conformance/probe-categories-6-10.ts` — the executable probe: 38 adversarial read-only phrasings, 46 operational utterances, the declaration-surface census.
- `tools/rac-conformance/.out-categories-6-10.json` — machine-readable results.
- `docs/04-reference/RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md` — this file.

**Read as evidence, never edited:** `tools/ga-gate/check-chat-capability-coverage.ts` · `packages/ai-host/src/capabilities/{ChatCapabilityRegistry,ChatCommandClassification,CapabilityRefusal}.ts` · `packages/ai-host/src/intents/{ZeroTokenResolver,LocalNaturalLanguageResolver,SemanticPlan,CapabilityExecutionSpec,ScopeDescriptor}.ts` · `packages/ai-host/src/QueryEngine.ts` · `apps/editor/src/ui/ai/{ZeroTokenChatBridge,AIPanel}.ts` · `apps/editor/src/ui/ai/__tests__/{QueryEngineDrain,ReportPayloadHonesty}.spec.ts` · `apps/editor/src/ui/create/batchCatalogue.ts` · `apps/editor/src/ui/generation/roomFinishChatSeam.ts` · `apps/editor/src/ui/property-inspector/MaterialDispatch.ts` · `apps/editor/__tests__/deadVerbAuthoritativeState.test.ts` · `apps/editor/src/engine/persistence/{ProjectSerializer,ProjectLoader}.ts` · `apps/editor/src/engine/engineLauncher.ts` · `plugins/rooms/src/handlers/*.ts` · `plugins/wall/src/handlers/*.ts` · `packages/visibility/src/intents/*.ts` · `packages/stores/src/IsolationStateStore.ts` · `packages/runtime-composer/src/composeRuntime.ts` · `packages/sync-client/src/{YjsDocAdapter,syncDisposition,event-bridge,collabProvider}.ts` · `packages/room-topology/src/{RoomStore,RoomDataSchema,roomSnapshotUtils}.ts` · `packages/command-registry/src/**/*BatchCommand.ts` · contracts C66/C67/C68.

**Nothing was committed.**
