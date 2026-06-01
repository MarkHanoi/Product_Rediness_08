# 34 — Handler Protocol & Pipeline Gap Analysis

> **Stamp**: 2026-05-04 (rev 18 — Sprint A37 batch-indicator + CW perf audit) · **Status**: 🟢 CANONICAL — living document, update on each sprint close

> **Scope**: Comprehensive gap analysis for the L2 Command/Event Bus To-Be state, C11 pipeline compliance, and the universal applicability of handler protocol rules across **all element families and all batch creation flows**.
> **Authority**: When this document contradicts older wave plans (31, 32, 33) on the question of *what is done*, this document wins — it is newer and derived from live code inspection. On the question of *what to do next*, doc 23 (L2 plan) and the wave plans carry the sprint assignments.
> **Companion docs**: `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md` (sprint plan), `C11-ELEMENT-CREATION-PIPELINE.md` (pipeline contract), `C03-SCHEMAS-COMMANDS-AND-STATE.md` (CQRS contract), `C10-PERFORMANCE-AND-OBSERVABILITY.md` (NFTs + OTel).

---

## §0 — Live Audit Snapshot (2026-05-04, rev 3)

> **Method**: every row below was verified against the live codebase using `grep`, `find`, and `ls` on the actual source tree. Rows marked ⚠️ differ materially from what the previous revision of this document stated. The §2–§7 sections carry the full narrative; this table is the single-glance dashboard.

| Metric | Verification command | As-Is (live) | To-Be target | Status |
|---|---|---|---|---|
| Plugin handler files | `find plugins/*/src/handlers -name '*.ts' ! -name index.ts \| wc -l` | **184** (Sprint A30 — `CreateStairBatch.ts` added; 183 gate-visible, 1 excluded via `@command-gate: not-a-command-bus-handler`) | ~110 after DROP/MERGE | 🟡 74 over target |
| Legacy command classes (`src/`) | `find src/engine/subsystems/commands -name '*.ts' \| wc -l` | **265** | 0 | 🔴 265 to delete |
| `affectedStores` — production handlers | runtime throw in `CommandBus.ts` | **177/177 ✅** | 177/177 | ✅ |
| `affectedStores` — test/config files | `grep -rL affectedStores plugins/ --include='*.ts' \| grep /handlers/ \| grep -v index` | **9 test files** ⚠️ | 0 | 🟡 acceptable (tests only) |
| CI test: `affected-stores.test.ts` | `cd tests/commands && pnpm run test` | **✅ EXISTS — 181 tests pass** (R1 affectedStores, R2 type-uniqueness, R3 count floor, R4 interface completeness) | 181 tests pass | ✅ |
| `produceWithPatches` wired in `CommandBus` | `grep produceWithPatches packages/command-bus/src/CommandBus.ts` | **0 hits** (by design — handlers call `produceCommand()` which wraps `produceWithPatches`; CommandBus reads `result.forward/inverse`) | 162/177 handlers use `produceCommand`; 15 use hand-crafted or empty patches (selection ephemeral, view RFC 6902, stubs — all return valid `{forward, inverse}` pairs; view handlers use RFC 6902 format because ViewStore is Map-based; `attachStores.applyPatch()` consumes all patch types) | 🟡 162/177 via Immer; 15/177 via valid RFC 6902 |
| `PatchPair.affectedStores` store-routing field | `grep "affectedStores" packages/runtime-undo-stack/src/RingBufferUndoStack.ts` | **✅ ADDED (Sprint A34 — C03 §4.1)** — `PatchPair` now carries `readonly affectedStores?: readonly string[]`; `CommandBus._ringBuffer.push()` passes `affectedStores: stores` (the handler's declared store keys) on every dispatch. Enables `applyRingBufferSide()` (also A34) to route inverse patches to the correct stores at Ctrl-Z time without inferring store from path segment. | field exists; `CommandBus` populates it | ✅ A34 DONE |
| `applyRingBufferSide` Phase D prep utility | `grep applyRingBufferSide packages/command-bus/src/PatchSnapshot.ts` | **✅ ADDED (Sprint A34 — C03 §4.1)** — `applyRingBufferSide(side, affectedStores, storeMap)` in `packages/command-bus/src/PatchSnapshot.ts`; exported from `@pryzm/command-bus`; handles single-store (all ops → one store) and multi-store (route by `path[0]`) cases; never throws. Sprint A22 (Phase D Ctrl-Z) calls this to replace `commandManager.undo()`. | exists + exported | ✅ A34 DONE |
| **Phase D Ctrl-Z wired** (`buildPhaseDUndoStackSlot`) | `grep buildPhaseDUndoStackSlot packages/runtime-composer/src/composeRuntime.ts` | **✅ WIRED (Sprint A35 — C03 §4.1)** — `buildPhaseDUndoStackSlot(ringBuffer, bus)` in `composeRuntime.ts`; `undo()` snapshots `pair = ringBuffer.current()` THEN calls `ringBuffer.undoPatch()` (atomic cursor-- + inverse PatchSide), then `applyRingBufferSide(side, pair.affectedStores, bus.fetchStores(ids))`; `redo()` mirrors with `peek()/redoPatch()`; `subscribe` adapts `() → void` → `(UndoStackState) → void` by computing counts on each tick. `CommandBus.fetchStores(ids)` public method added (delegates to private `storesProvider`, catch-all guard). Default composition path now uses Phase D slot; `opts.undoStackBackend` override falls back to Phase C `buildUndoStackSlot`. `pnpm run build` → exit 0 ✅. | wired + default path | ✅ A35 DONE |
| `UndoStack` wired in `CommandBus` | `grep undoStack packages/command-bus/src/CommandBus.ts` | **✅ custom `UndoStack`** (push/undo/redo on `EventRecord[]`) + **`_ringBuffer: RingBufferUndoStack \| null` (Sprint A31 — C03 §4.1)** — `setRingBuffer(rb)` attaches post-construction; `executeCommand()` pushes `PatchPair` to ring buffer after `undoStack.push(record)` | `RingBufferUndoStack` with `PatchPair` on every dispatch | ✅ A31 DONE |
| `PatchSnapshot.ts` file exists | `ls packages/command-bus/src/PatchSnapshot.ts` | **✅ EXISTS** — `captureOne`, `captureMany`, `toJsonPointer`, `fromJsonPointer` exported; re-exports `produceCommand` + `produceWithPatchesPerStore` | EXISTS | ✅ |
| `RingBufferUndoStack` connected | `grep RingBufferUndoStack packages/runtime-composer/src/composeRuntime.ts` | **✅ WIRED (Sprint A31 — upgraded)** — `RingBufferUndoStack` created in `composeRuntime.ts`; `inner.bus.setRingBuffer(ringBuffer)` attaches it directly to `CommandBus` (replaces the A30 `patches.subscribe()` indirection). Push now happens synchronously inside `CommandBus.executeCommand()` after `undoStack.push(record)` — no PatchEmitter subscription double-hop. `@pryzm/runtime-undo-stack` added to `packages/command-bus/package.json` deps; `RingBufferUndoStack` re-exported from `@pryzm/command-bus`. Passed as default backend to `buildUndoStackSlot`. | wired + direct push | ✅ |
| `CommandEventBridge` wired (runtime.events relay) | `grep wireCommandEventBridge packages/runtime-composer/src/composeRuntime.ts` | **✅ EXISTS** — `packages/runtime-composer/src/CommandEventBridge.ts` wired in `composeRuntime.ts` after bootstrap; emits `'command.executed'` on `runtime.events` for every successful dispatch; disposed in `tearDown()`. | Every dispatch emits typed event | ✅ |
| OTel `startSpan` in handler files | `npx tsx tools/ga-gate/check-otel-spans.ts` | **183 / 183 ✅** (Sprint A30 — HARD_FLOOR ratcheted 182→183; `CreateStairBatch.ts` auto-detected; gate output: "183/183 handler files have OTel spans ✅") | 183/183 gate-visible | ✅ |
| `commandManager.execute()` active sites in `src/` | `grep -rn "commandManager\.execute\b" src/ --include='*.ts' \| grep -v "^\s*//"` | **201 active call sites across 124 files** ⚠️ (doc previously stated "~120/50+" — stale; exhaustive grep 2026-05-04 A36) | 0 | 🔴 massive gap |
| `commandManager.execute()` — annotation tools alone | above grep, filter annotations/ | **22 sites** in `src/engine/subsystems/annotations/` — **bus payloads upgraded to typed `{id, viewId, kind}` in Sprint A36 (P13)**; previously passed garbage (`cmd` object or `{}`) | 0 legacy calls | 🟡 P13 DONE (A36) — payloads correct; legacy call still present (bus-primary flip awaits store bridge) |
| `commandManager.execute()` — UI/property-inspector | above grep, filter src/ui/ | **~55 sites** in `src/ui/` | 0 | 🔴 |
| `FrameScheduler.schedule()` in `WallFragmentBuilder` | `grep "FrameScheduler.schedule" src/.../WallFragmentBuilder.ts` | **✅ 2 hits (Sprint A32 — C11 §5.2/§6.1)** — `schedule()` instance method added to `FrameScheduler` class (`packages/frame-scheduler/src/FrameScheduler.ts`); drain calls migrated: `const FrameScheduler = getFrameScheduler(); this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue())` at both call sites (initial schedule + reschedule after partial drain). Priority upgraded from default `'post-render'` → `'pre-render'` — geometry now lands in the scene graph BEFORE the renderer pass. | wired | ✅ A32 DONE |
| `FrameScheduler.schedule()` in `CurtainWallBuilder` | same | **✅ 5 hits (Sprint A32 — C11 §5.2/§6.1)** — same `schedule()` API; 3 drain-builds sites → `'pre-render'`; 2 shadow-reactivate sites → `'post-render'` (shadow mesh enables should run after geometry is built and committed to scene). No stale `scheduleOnce('curtainwall-drain-builds', ...)` or `scheduleOnce('curtainwall-shadow-reactivate', ...)` calls remain. | wired | ✅ A32 DONE |
| `FrameScheduler.schedule()` in `SlabFragmentBuilder` | `rg "FrameScheduler.schedule" src/engine/subsystems/slabs/SlabFragmentBuilder.ts` | **✅ 3 hits (Sprint A33 — C11 §5.2/§6.1)** — 3 `getFrameScheduler().scheduleOnce('slab-drain-builds', ...)` sites migrated to `const FrameScheduler = getFrameScheduler(); this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue())` at: (a) `updateSlab()` batch-path initial schedule, (b) `resumeAndFlush()` post-pause schedule, (c) `_drainBuildQueue()` reschedule when queue non-empty. Priority corrected from default `'post-render'` → `'pre-render'`. No stale `scheduleOnce('slab-drain-builds', ...)` calls remain. | wired | ✅ A33 DONE |
| Raw `requestAnimationFrame` in builders | `grep -c requestAnimationFrame WallFragmentBuilder.ts CurtainWallBuilder.ts SlabFragmentBuilder.ts` | **0 each** ✅ (no raw rAF — uses FrameScheduler internally) | 0 | ✅ |
| CustomEvent bridge (`pryzm-bus-rooms-redetect`) | `grep pryzm-bus-rooms-redetect src/engine/engineLauncher.ts` | **✅ active at line 1297** | replaced by `runtime.events` | 🟡 working but non-canonical |
| `'wall.created'` typed event in `RuntimeEvents` | `grep "wall.created" packages/runtime-composer/src/types.ts` | **✅ EXISTS** (Sprint A24 — C11 §5.2 partial closure; `CommandEventBridge` emits after `wall.create`/`wall.batch.create`) | EXISTS + wired | ✅ |
| `runtime.events.on('wall.created')` in rooms plugin | `grep -rn "runtime\.events\.on" plugins/rooms/` | **0 hits** (Phase F — rooms redetect CustomEvent bridge stays until room detection algorithm migrates to L4; see `RedetectRooms.ts` comment) | wired | 🟡 Phase F |
| Batch handler: Wall | `ls plugins/wall/src/handlers/CreateWallBatch.ts` | **✅ EXISTS** | ✅ | ✅ |
| Batch handler: Curtain Wall | `ls plugins/curtain-wall/src/handlers/CreateCurtainWallBatch.ts` | **✅ EXISTS** | ✅ | ✅ |
| Batch handler: Slab | `ls plugins/slab/src/handlers/CreateSlabBatch.ts` | **✅ EXISTS** (Sprint A27) | EXISTS | ✅ |
| Batch handler: Column / Beam / Door / Window / Ceiling (Sprint A28) | same pattern | **ALL DONE ✅** — `CreateColumnBatch.ts`, `CreateBeamBatch.ts` (pre-existing, wired A28); `CreateDoorBatch.ts`, `CreateWindowBatch.ts`, `CreateCeilingBatch.ts` (NEW A28); all registered in plugin indices; `commands.ts` typed entries added; `CommandEventBridge` cases added (A29) | all exist | ✅ |
| Batch handler: Stair | `ls plugins/stair/src/handlers/CreateStairBatch.ts` | **✅ EXISTS** (Sprint A30) — `stair.batch.create` handler; `CreateStairBatchPayload { stairs: readonly CreateStairPayload[] }`; per-entry `isFiniteVec3(origin)` + `validateStairDims` at `canExecute`; `numRisers < 2` + `Stair.parse` in `execute`; single `produceCommand<StairsState>` batch → one patch pair; `withHandlerSpan` wrapped; registered in plugin index + `commands.ts` typed entry added; `CommandEventBridge` case added; `stair.created` RuntimeEvent updated with batch `commandType` union + `elementCount` | ✅ |
| `__wallRebuildControl` (pause / resumeAndFlush / discardAndSuppress / restore) | `grep -n "discardAndSuppress\|resumeAndFlush\|pause\|restore" src/engine/engineLauncher.ts` | **✅ all 4 methods** | ✅ | ✅ |
| `__curtainWallRebuildControl` (pause / resumeAndFlush) | `grep pause src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | **✅ both methods** | ✅ | ✅ |
| `__slabRebuildControl` | `grep -rn slabRebuildControl src/` | **✅ WIRED** — `SlabFragmentBuilder.pause()/resumeAndFlush()` + `window.__slabRebuildControl` in engineLauncher + BatchCoordinator calls (Sprint A27) | EXISTS | ✅ |
| `COLLAB_BROADCAST_SKIP` active | `grep COLLAB_BROADCAST_SKIP src/engine/subsystems/initCollaboration.ts` | **✅ active** (REDETECT_ROOMS + batch commands filtered) | ✅ | ✅ |
| `PatchEmitter` codec | `grep "JSON.stringify\|msgpack" packages/command-bus/src/PatchEmitter.ts` | **✅ `@msgpack/msgpack` — ADR-004 IMPLEMENTED** (Sprint A26) | `@msgpack/msgpack` | ✅ |
| ULID stamping | `grep ulid packages/command-bus/src/CommandBus.ts` | **✅ `id: ulid()` on every dispatch** | ✅ | ✅ |
| `event_log` Postgres table | `grep event_log server.js` | **✅ EXISTS** — `server/dbMigrate.js` SCHEMA_SQL table 16; `POST /api/event-log` endpoint; `EventLogPersistor` subscriber wired in `composeRuntime` (Sprint A26) | created | ✅ |
| `YjsDocAdapter` wired to app | `grep YjsDocAdapter packages/runtime-composer/src/composeRuntime.ts` | **NOT wired** (exists in `packages/sync-client/` only) | wired | 🔴 staged (S43) |
| `(window as any)` non-shim count | `grep -rn "(window as any)" src/ --include='*.ts' \| grep -v "^\s*//"` | **15** ✅ = baseline (regression resolved in rev 4; `__slabRebuildControl` added without cast — typed in `global-window.d.ts`) | 15 (baseline) | ✅ |
| `pnpm tsc --noEmit` | CI | **0 errors** ✅ | 0 | ✅ |
| Plugin L7 boundary (CI gate) | `pnpm run check-l7-boundary` | **0 violations** ✅ (84 raw grep hits are `@pryzm/renderer-three/three` Three.js re-export + peer-plugin deps — explicitly exempted by the CI gate rule) | 0 | ✅ |
| **§PERF-ADAPTIVE-DRAIN** — `CurtainWallBuilder._buildsPerFrame` adaptive budget (Sprint A37) | `grep "_buildsPerFrame" src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | **✅ DONE** — instance variable `_buildsPerFrame: number` (init 5, cap 12, floor 2); drain cycle records `frameMs`; increments if `< 8 ms`, decrements if `> 14 ms`; resets at construction; debug log `nextBudget=N`; C11 §6.1 §PERF-ADAPTIVE-DRAIN clause added | adaptive budget in all three builders (A21 follow-on for Wall + Slab) | ✅ A37 DONE (CurtainWallBuilder); 🟡 Wall + Slab pending Wave A21 |
| **§PERF-BATCH-BUS** — `CreateCurtainWallsOnAllSlabsCommand` double polygon iteration eliminated (Sprint A37) | `grep "busCwSpecs" src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts` | **✅ DONE** — `busCwSpecs: Array<CreateCurtainWallPayload>` declared before `_processSlabs()`; populated inline during first pass (guarded `!isRedo`); second O(n·m) polygon/winding/edge-loop iteration after `_processSlabs()` deleted; bus dispatch block reads pre-populated array directly | 0 post-`_processSlabs` polygon iterations | ✅ A37 DONE |
| **§BATCH-LOADING-INDICATOR** — `BatchLoadingIndicator` + `BatchCoordinator.setBatchLifecycleCallbacks()` (Sprint A37, C11 §6.6) | `ls src/ui/overlays/BatchLoadingIndicator.ts` | **✅ DONE** — `BatchLoadingIndicator.ts` (424 lines); `setBatchLifecycleCallbacks(onStart, onEnd)` on `BatchCoordinator`; `_onEnd()` fires in 3 places (normal, error, forceReset); `addTickListener('pryzm-batch-indicator-pyramid', tick, 'overlay')` (P3-compliant); wired in `engineLauncher.ts` after `inject()` | indicator visible during every runBatch() invocation | ✅ A37 DONE |
| **§REG-MANY-P0** — `BimManager.registerMany(ids[], levelId)` batch registration (Sprint A38, C10 §3.2) | `grep "registerMany" src/engine/subsystems/core/BimKernel.ts` | **✅ DONE** — `registerMany(elementIds: readonly string[], levelId: string): void`; single O(L + N) pass: one `levels.forEach` with `!idSet.has(id)` filter on non-target levels; Set-based dedup append to target level; one `console.log` for the batch; same `SpatialResolutionError` guards as `registerElement()`; exclusive-containment invariant preserved | zero-overhead O(L + N) batch path | ✅ A38 DONE |
| **§REG-MANY-P1** — `CreateCurtainWallsOnAllSlabsCommand` per-level registration grouping (Sprint A38, C10 §3.2) | `grep "_regGroupsByLevel" src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts` | **✅ DONE** — `_regGroupsByLevel: Map<string, string[]>` declared inside `_processSlabs()`; per-wall `trackRegistration(() => registerElement())` removed; after slab loop: ONE `trackRegistration()` per unique level that calls `registerMany(ids, levelId)` + per-element `registerSemantic()` loop; queue shrinks from N=231 entries → L≤21 entries | queue ≤ SYNC_DRAIN_THRESHOLD → P2 sync-drain fires | ✅ A38 DONE |
| **§REG-MANY-P2** — `BatchCoordinator` sync-drain for small queues (Sprint A38, C10 §3.2) | `grep "SYNC_DRAIN_THRESHOLD" src/engine/subsystems/core/batch/BatchCoordinator.ts` | **✅ DONE** — `static readonly SYNC_DRAIN_THRESHOLD = 50`; `signalBuildQueueDrained()` sync-drain branch: when `_registrationQueue.length ≤ 50`, splices entire queue, runs all lambdas synchronously, fires `_onShadowReactivation`, calls `_executeFinalSweep()` — 0 rAF frames; rAF path (`_drainRegistrations`) preserved for queue > 50 | registration phase: ~462 ms → ~2 ms; total NFT: ~720 ms → ~258 ms ✅ sub-500 ms | ✅ A38 DONE |
| **§REG-MANY-P3** — `CreateCurtainWallsFromSlabCommand` post-loop `registerMany()` (Sprint A38, C10 §3.2) | `grep "registrationIds" src/engine/subsystems/commands/curtainwall/CreateCurtainWallsFromSlabCommand.ts` | **✅ DONE** — `registrationIds: string[]` accumulates IDs of newly-created walls; post-loop `bimManager.registerMany(registrationIds, levelId)` + per-element `registerSemantic()` loop replaces per-wall `registerElement()` calls; idempotency guard (`has()` skip) preserved — walls skipped by guard are not added to `registrationIds` | single O(L + N) registration call per command invocation | ✅ A38 DONE |

---

## §1 — Does the handler protocol apply to all element families?

**Answer: Yes, unconditionally.** The binding authority comes from four contracts simultaneously, not just from the L2 plan doc.

### §1.1 — Contract basis

| Contract | Clause | What it mandates universally |
|---|---|---|
| **C03 §2.1** | "All state mutations in PRYZM flow through commands. There is exactly one path." | Every element family. No exceptions. The path is `commandBus.dispatch → handler → stores.mutate`. |
| **C03 §2.3** | "A handler MUST be a pure function … MUST complete within 16 ms" | Every handler, every family. |
| **C03 §4.2** | "Every command dispatched with `source: 'user'` MUST be pushed to the undo ring buffer" | Every user-initiated element creation, every family. |
| **C03 §5** | "Protocol wire types MUST be serialisable to MessagePack binary frames" | All wire types across all families. |
| **C10 §2** | "Every new exported function MUST add ≥ 1 OpenTelemetry span. This is a merge blocker." | Every handler's exported function, every family. |
| **C11 §5.2** | "Every element creation handler registered with `runtime.commandBus` MUST conform to the following contract." | Explicitly universal. Applies to all 177 existing handlers plus every future one. |
| **C11 §5.2** | "Declare `affectedStores` in the handler descriptor (runtime throws if absent)" | All handlers. |
| **C11 §5.2** | "Register geometry build via `FrameScheduler.schedule('pre-render', buildFn)`. MUST NOT build geometry synchronously." | All element geometry builders. |
| **C11 §5.2** | "Emit a typed domain event via `runtime.events.emit(eventName, payload)` after store mutation succeeds." | All handlers. |
| **C11 §4.2** | "AI workflows that create multiple elements MUST call them through `BatchCoordinator.runBatch()`" | All AI batch creation, all families. Not just walls and curtain walls. |
| **SPEC-21 §3 Step 3** | "all handlers idempotent; replay-from-event-log produces deepEqual store state" | Every element family (the 9-step recipe applies to all 30+ families). |

### §1.2 — Implication for batch creation

The batch requirement is not specific to walls or curtain walls. C11 §4.2 states the rule for any AI workflow creating multiple elements, across any family. This means:

- `BatchCoordinator.runBatch()` is required for any batch creation of: slabs, doors, windows, columns, beams, stairs, handrails, ceilings, roofs, rooms, grids, annotations, furniture, and all future families.
- The pause/resume mechanism (`__curtainWallRebuildControl`, `__wallRebuildControl`) established for walls and curtain walls is **the required pattern** for every element family that has a geometry builder with a deferred queue.
- Every batch command handler (`wall.batch.create`, `curtain-wall.batch.create`, etc.) MUST use `storeEventBus.batch(fn)` and `BatchCoordinator.runBatch()` internally.

---

## §2 — L2 To-Be table: precise current state (2026-05-04)

The table below is the L2 vision from the plan doc, with the honest current state filled in per live code inspection. Each row is tagged with a sprint stage and a blocker or gap.

| # | To-Be target | Current state | Stage | Gap | Done when |
|---|---|---|---|---|---|
| **1** | **~110 handlers across ~25 plugin packages** (after DROP 13 / MERGE 47 / PORT / PLUGIN-LIFT triage) | **177 handlers** across 32 plugin packages. Legacy 264 command classes in `src/engine/subsystems/commands/` still coexist. The "~110" refers to *net unique operation types* after triage — the triage has not happened yet. Current count is inflated because (a) PLUGIN-LIFT ported new handlers without dropping legacy equivalents, and (b) DROP/MERGE candidates are documented but not executed. | Ongoing | No sprint is yet assigned for the DROP 13 / MERGE 47 sweep. Should be Wave A21 scope. | `find plugins/*/src/handlers -name '*.ts' -not -name index.ts \| wc -l` → ≤ 110; all 13 DROP candidates deleted; all 47 MERGE candidates collapsed to a single handler each. |
| **2** | **`affectedStores` 100% + failing CI test** | **Runtime enforcement: ✅ 100% on production handlers** — `CommandBus.ts` throws `CommandBusError` with code `pryzm/affected-stores-required` at registration time if `affectedStores` is missing. All 177 plugin handlers declare it. **ESLint rule: ✅** — `packages/eslint-plugin-pryzm/src/rules/affected-stores-required.js` exists. **9 test/config files lack `affectedStores`** ⚠️ — `grep -rL affectedStores plugins/ --include='*.ts' \| grep /handlers/` yields 9 files: `plugins/curtain-wall/__tests__/handlers/{AddPanel,RemovePanel,RotatePanel,SwapPanel}.test.ts`, `plugins/ifc-import/src/handlers/pluginHandlers.ts`, `plugins/selection/__tests__/handlers/{ClearSelection,Deselect,Select}.test.ts`, `plugins/view/__tests__/handlers/view-handlers.test.ts`. These are all test files or a special plugin-aggregation file — not production handlers. **CI test file: ❌ MISSING** — `tests/commands/affected-stores.test.ts` does not exist. | S03 | Create `tests/commands/affected-stores.test.ts` that imports all registered handlers and asserts `affectedStores` is a non-empty array. | `tests/commands/affected-stores.test.ts` exists and passes in CI; `pnpm test -- affected-stores` exits 0; introducing a handler without `affectedStores` causes the test to fail. |
| **3** | **Immer `produceWithPatches` mandatory for every handler; forward + inverse patches stored** | **`PatchSnapshot.ts` does NOT exist** ⚠️ — `ls packages/command-bus/src/PatchSnapshot.ts` → file not found. The plan doc referenced `PatchSnapshot.capture()` but this file was never created. `PatchSnapshotEntry` type IS imported in `CommandBus.ts` (line 27) and used to build patch envelopes (line 178), but `produceWithPatches` itself has **0 hits** in `CommandBus.ts`. All 177 handlers mutate stores via direct `Map.set()` / spread patterns or plain `produce()` — no forward/inverse patch pairs are being generated. | S03 | Create `packages/command-bus/src/PatchSnapshot.ts` wrapping `produceWithPatches + applyPatches`. Wire `PatchSnapshot.capture()` as a post-handler hook inside `CommandBus.execute()` — no individual handler changes needed. | `rg "produceWithPatches" packages/command-bus/src/CommandBus.ts` → hits; `PatchSnapshot.ts` exists; every `commandBus.dispatch()` call produces a `PatchPair`. |
| **4** | **Undo: `{forward[], inverse[]}` patch pairs; `< 5 ms` vs current 80 ms** | **A custom `UndoStack` IS wired in `CommandBus`** ⚠️ — `packages/command-bus/src/UndoStack.ts` holds `EventRecord[]` with `push() / undo() / redo()` methods. `CommandBus.execute()` calls `this.undoStack.push(record)` on every successful dispatch (line 205). This is NOT the `RingBufferUndoStack` from `packages/runtime-undo-stack/` — that class exists and is exported but has zero callers. The current `UndoStack` stores whole `EventRecord` objects (not `PatchPair` forward/inverse tuples), so undo currently means replaying from the beginning, not applying inverse patches. `CommandManager.createSnapshot()` still calls `structuredClone()` (80 ms on large projects). | S03 | Swap `CommandBus.undoStack` from the custom `UndoStack` → `RingBufferUndoStack`. Wire `PatchSnapshot.capture()` to generate `PatchPair` entries so `undo()` applies `applyPatches(inverse)` rather than re-running from snapshot. Retire `CommandManager.createSnapshot()`. | Undo latency ≤ 5 ms on a 200-wall project (NFT bench); `CommandManager.createSnapshot()` deleted or no-ops; `RingBufferUndoStack.undo()` restores store state via `applyPatches`. |
| **5** | **Wire format: MessagePack + ULIDs — same bytes for undo, persistence, sync, audit, public WS API** | **ULID: ✅** — `CommandBus.ts` imports `ulid` from the `ulid` package and stamps every dispatched command with `id: ulid()`. **MessagePack: ❌ (deliberately staged)** — `PatchEmitter.ts` uses `JSON.stringify/parse` over `Uint8Array`. The code comment reads: "S02 ships JSON-only; codec swap is a single-file change later — ADR-004 in S04." The `encode/decode` public surface is stable and a `@msgpack/msgpack` swap requires changing only those two static methods. | S04 | Swap `PatchEmitter.encode/decode` from `JSON` to `@msgpack/msgpack`. Wire `PatchEmitter` as a subscriber of `CommandBus` output. Covered by ADR-004. | `PatchEmitter.encode()` uses `@msgpack/msgpack`; round-trip test `encode(decode(x)) deepEquals x`; `rg "msgpack" packages/command-bus/src/PatchEmitter.ts` → hits; ULID already ✅. |
| **6** | **Audit trail: `actorId`, `projectId`, `timestamp`, `clientId` → queryable from `event_log` Postgres table** | `actorId`, `projectId`, `clientId` are typed on `EventRecord` in `packages/command-bus/src/types.ts` (line 30+). `timestamp` is on the `Command` interface. **No Postgres `event_log` table exists.** `PatchEmitter` emits encoded records to its subscriber set but has zero subscribers — there is no persistor wired. The audit trail is specified, typed, and emittable but not stored anywhere. | S04 | Create `event_log` Postgres table in `server.js` migrations. Wire `PatchEmitter.subscribe()` → server-side persistor that INSERTs rows. | `SELECT COUNT(*) FROM event_log` returns rows after a wall is created; `PatchEmitter` has ≥ 1 subscriber; `event_log` schema matches `EventRecord` type (`actorId`, `projectId`, `clientId`, `timestamp`, `payload`). |
| **7** | **Cross-tab safety: Yjs document is single source of truth; tabs converge** | `packages/sync-client/src/YjsDocAdapter.ts` implements a full `Y.Doc` adapter with OTel spans (`pryzm.sync-client.yjs`). `CRDTConflictResolver.ts` handles semantic conflicts. Both are complete. **Not wired to the running application** — there is no evidence `YjsDocAdapter` is instantiated in `engineLauncher.ts` or `composeRuntime.ts`. ADR-002 Phase rollout: bidirectional translator lands S43; Yjs replaces LWW everywhere at S48. | S43–S48 | Activate `YjsDocAdapter` in `composeRuntime.ts`. Wire `packages/sync-client/` into the runtime. Per ADR-002, this is Wave A19 (doc 29) scope. | Two browser tabs on the same project converge after one tab creates a wall; `YjsDocAdapter` is instantiated in `composeRuntime.ts`; `rg "YjsDocAdapter" packages/runtime-composer/src/composeRuntime.ts` → hits. |
| **8** | **CI gate: `tests/commands/affected-stores.test.ts` fails build on any handler without `affectedStores`** | ESLint rule in `eslint-plugin-pryzm/src/rules/affected-stores-required.js` catches violations statically. Runtime throw in `CommandBus.ts` catches violations at registration. **No Jest/Vitest test file exists at `tests/commands/affected-stores.test.ts`.** The plan doc named a specific file path that was never created. | S03 | Create the test file. It should import each handler from `plugins/*/src/handlers/index.ts` and assert `handler.affectedStores` is a readonly non-empty array. Merge the ESLint rule into the CI configuration. | `tests/commands/affected-stores.test.ts` exists; adding a handler stub with `affectedStores: []` causes the test to fail with a clear message; file is imported by `pnpm test` (vitest config includes `tests/`). |

---

## §3 — C11 pipeline compliance: all element families (2026-05-04)

C11 §5 defines the handler contract that every element creation handler MUST satisfy. The table below scores compliance across all 177 plugin handlers.

| C11 §5 requirement | Compliant? | Evidence | Gap | Done when |
|---|---|---|---|---|
| Handler lives in `plugins/*/src/handlers/` (not `src/engine/`) | ✅ 100% | All 177 handlers confirmed in `plugins/` | None | Already done — no action needed. |
| `affectedStores` declared | ✅ 100% | Runtime throw enforces it; ESLint rule exists; **CI test ✅ EXISTS** — `tests/commands/__tests__/affected-stores.test.ts` passes 181/181 (R1 affectedStores, R2 type-uniqueness, R3 count floor, R4 interface completeness); `pnpm test` in `tests/commands/` → 181/181 ✅ (confirmed Sprint A25 live run) | None | Done ✅ |
| Store mutation via Immer draft only | ⚠️ Partial | `PatchSnapshot.ts` **EXISTS** ✅ — `captureOne`, `captureMany`, `toImmerPatch`, `fromImmerPatch` exported; re-exports `produceCommand` + `produceWithPatchesPerStore`. **162/177 handlers use `produceCommand`** which internally wraps `produceWithPatches`; 15 use hand-crafted or empty patches (selection ephemeral, view RFC 6902, stubs). `CommandBus.ts` reads `result.forward/inverse` from HandlerResult. | `RingBufferUndoStack` swap deferred to A22 (breaking test change) — see process tracker. | `rg "RingBufferUndoStack" packages/command-bus/src/CommandBus.ts` → hits; `CommandManager.createSnapshot()` deleted or no-ops; `RingBufferUndoStack.undo()` restores store state via `applyPatches`. |
| Geometry deferred — no synchronous build inside handler | ✅ All handlers | Handlers do not call builders directly; builders are called from store listeners in `initUI.ts` subscriber path | Subscribers use own rAF queues, not canonical `FrameScheduler` API | Already done — no action needed for this clause. `FrameScheduler` migration is the next clause. |
| Geometry deferred via `FrameScheduler` (packages/frame-scheduler) | ✅ **Sprint A32 + A33 DONE** | `WallFragmentBuilder` (2 hits, A32), `CurtainWallBuilder` (5 hits, A32), and `SlabFragmentBuilder` (3 hits, A33) all call `FrameScheduler.schedule('pre-render', fn)` — canonical C11 §5.2/§6.1 path. `schedule(phase, callback)` instance method added to `FrameScheduler` class in A32 (thin wrapper: `return this.scheduleOnce(phase, callback, phase)`). Builders obtain instance via `const FrameScheduler = getFrameScheduler()` (lazy, inside method). Priority: drain-builds → `'pre-render'` (geometry before renderer pass); CurtainWall shadow-reactivate → `'post-render'`. No raw `scheduleOnce('*-drain-builds', ...)` calls remain in any of the three builders. `check-raf-count.ts` → 1 owner ✅. `pnpm run build` → exit 0 ✅. | `rg "FrameScheduler.schedule" src/engine/subsystems/walls/WallFragmentBuilder.ts` → 2 hits ✅; CurtainWallBuilder → 5 hits ✅; SlabFragmentBuilder → 3 hits ✅; `check-raf-count.ts` exits 0 | ✅ A32+A33 DONE |
| `runtime.events.emit(eventName, payload)` after mutation | ✅ **19 families × (single + batch) via bridge** | **Sprint A25 + A29**: `CommandEventBridge.ts` (L2) emits typed domain events for all 19 element families after every successful create dispatch — `'wall.created'` (A24, single+batch), `'slab.created'` (A25 single; A29 +batch), `'curtain-wall.created'` (single+batch), `'column.created'` (A29 +batch), `'beam.created'` (A29 +batch), `'door.created'` (A29 +batch), `'window.created'` (A29 +batch), `'ceiling.created'` (A29 +batch), `'stair.created'`, `'room.created'`, `'grid.created'`, `'handrail.created'`, `'furniture.created'`, `'lighting.created'`, `'plumbing.created'`, `'structural.created'`, `'annotation.created'`, `'dimension.created'`, `'roof.created'` — all typed in `RuntimeEvents` with `commandType` union covering single+batch variants and `elementCount` field. Handlers remain pure (0 handler files call `runtime.events.emit()` directly — L4→L2 boundary preserved per ADR-002). **Remaining gap**: `pryzm-bus-rooms-redetect` CustomEvent bridge in `engineLauncher.ts:1297` not yet replaced by `runtime.events.on('wall.created', ...)` in `plugins/rooms/` (Phase F — staged to Sprint 90+). | Phase F: replace CustomEvent bridge with `runtime.events.on('wall.created', ...)` subscriber in `plugins/rooms/` | `plugins/rooms/` registers `runtime.events.on('wall.created', ...)`; CustomEvent bridge at `engineLauncher.ts:1297` removed. |
| OTel span covering handler body | ✅ **183/183 ✅** | **Sprint A30 ratchet**: `withHandlerSpan` wrapper wraps every handler's `execute()` body including `CreateStairBatch.ts`. `check-otel-spans.ts` HARD_FLOOR ratcheted 182→183; gate output: `183/183 handler files have OTel spans ✅`. | None | Done ✅ — `check-otel-spans.ts` exits 0; 183/183 gate-visible handler files instrumented. |
| Handler completes synchronous portion ≤ 16 ms | ✅ Observed | Batch path with BatchCoordinator meets this; single-element handlers are synchronous and fast | No outstanding violation | Already done — monitor via NFT bench `tool-latency.bench.ts` (handler budget ≤ 16 ms). |
| MUST NOT call `commandManager.execute()` | ✅ 100% in plugins | No handler in `plugins/` calls `commandManager.execute()`. The legacy sites are in `src/engine/`. | The 2 remaining `src/` sites (engineLauncher:1306, RemoteCommandDispatcher:84) are outside the handler contract boundary | `rg "commandManager\.execute" src --type ts \| grep -v "//" \| wc -l` → 0; both remaining sites migrated to `runtime.bus.executeCommand()`. |
| MUST NOT import from `src/engine/` or `src/ui/` | ✅ 100% | Plugin L7-violation reach = 0 (verified, CI gate active) | None | Already done — `check-l7-boundary.ts` exits 0; ESLint `no-direct-pryzm-in-plugins` ERROR rule active. |
| MUST NOT dispatch other commands (no cascading) | ✅ 100% in plugins | No plugin handler dispatches secondary commands | CascadeRunner cross-element effects are handled via subscriber pattern, not within handlers | Already done — no action needed; verified by code inspection and CI. |

---

## §4 — Batch creation: which families are wired and which are not

C11 §4.2 requires ALL AI-initiated multi-element creation to go through `BatchCoordinator.runBatch()`. The table below scores every element family.

| Family | Batch handler exists | `BatchCoordinator.runBatch()` used | Pause/resume wired | Notes | Done when |
|---|---|---|---|---|---|
| **Wall** | ✅ `CreateWallBatch.ts` | ✅ | ✅ `__wallRebuildControl` | §BATCH-WALL-PAUSE — DONE | Already done ✅ |
| **Curtain Wall** | ✅ `CreateCurtainWallBatch.ts` | ✅ | ✅ `__curtainWallRebuildControl` | §BATCH-CW-PAUSE — DONE 2026-05-04 | Already done ✅ |
| **Slab** | ✅ `CreateSlabBatch.ts` (Sprint A27) | ✅ `batchCoordinator.runBatch()` called from `CreateSlabsOnAllFloorsCommand`; `slab.batch.create` registered | ✅ `__slabRebuildControl` — `SlabFragmentBuilder.pause()/resumeAndFlush()` + engineLauncher wiring + BatchCoordinator calls | §BATCH-SLAB-PAUSE — DONE 2026-05-04 | Already done ✅ |
| **Room** | ✅ `rooms.redetect` handler | Via frame-yielded loop post-batch | N/A (no geometry builder) | Room is redetected not batch-created | Already done ✅ — no batch-create path needed; redetect fires via bus after wall/slab batch. |
| **Column** | ✅ `CreateColumnBatch.ts` (Sprint A28) | ✅ registered; `registry.has('column.batch.create')` → true; `'column.batch.create'` added to `COLUMN_HANDLER_TYPES` + `buildColumnHandlerSet()` (pre-existing); `commands.ts` type entry added | N/A (no geometry builder — columns are placed objects, no deferred rebuild queue) | §A28 DONE 2026-05-04 | Already done ✅ |
| **Beam** | ✅ `CreateBeamBatch.ts` (Sprint A28) | ✅ registered; `registry.has('beam.batch.create')` → true; `'beam.batch.create'` added to `BEAM_HANDLER_TYPES` + `buildBeamHandlerSet()` (pre-existing); `commands.ts` type entry added | N/A (no geometry builder) | §A28 DONE 2026-05-04 | Already done ✅ |
| **Stair** | ✅ `CreateStairBatch.ts` (Sprint A30) | ✅ registered; `registry.has('stair.batch.create')` → true; `'stair.batch.create'` added to `STAIR_HANDLER_TYPES` + `buildStairHandlerSet()`; `commands.ts` typed entry added; `CommandEventBridge` case added; `stair.created` RuntimeEvent updated with batch union + `elementCount` | N/A (no geometry builder — stairs are placed objects with discrete geometry, no deferred rebuild queue) | §A30 DONE 2026-05-04 | Already done ✅ |
| **Door** | ✅ `CreateDoorBatch.ts` (Sprint A28) | ✅ registered; `registry.has('door.batch.create')` → true; each entry supplies its own `wallId` + `openingId` (pre-reserved via `wall.createOpening`); `commands.ts` type entry added | N/A (doors are hosted elements in wall openings — no independent geometry builder) | §A28 DONE 2026-05-04 | Already done ✅ |
| **Window** | ✅ `CreateWindowBatch.ts` (Sprint A28) | ✅ registered; `registry.has('window.batch.create')` → true; each entry supplies its own `wallId` + `openingId`; `commands.ts` type entry added | N/A (hosted elements — no independent geometry builder) | §A28 DONE 2026-05-04 | Already done ✅ |
| **Ceiling** | ✅ `CreateCeilingBatch.ts` (Sprint A28) | ✅ registered; `registry.has('ceiling.batch.create')` → true; `'ceiling.batch.create'` added to `CEILING_HANDLER_TYPES` + `buildCeilingHandlerSet()`; `commands.ts` type entry added | N/A (no geometry builder) | §A28 DONE 2026-05-04 | Already done ✅ |
| **All other families** | ❌ | N/A | ❌ | Batch creation not yet scoped | Each family gets a `Create<Family>Batch.ts` handler before any AI workflow targets it; `BatchCoordinator.runBatch()` is the sole entry point per C11 §4.2. |

**Key finding (updated Sprint A30)**: Wall, Curtain Wall, Slab, Column, Beam, Door, Window, Ceiling, and Stair now all have C11 §4.2-compliant batch handlers registered on the command bus. All major structural and MEP element families are covered. The `slab.batch.create`, `column.batch.create`, `beam.batch.create`, `door.batch.create`, `window.batch.create`, `ceiling.batch.create`, and `stair.batch.create` types are all registered in `commands.ts` for type-safe dispatch. The "All other families" row covers only minor/rare families not yet targeted by AI workflows.

---

## §5 — Active gaps requiring sprint assignment (prioritised)

These are gaps confirmed from live code that have no sprint assigned or whose assigned sprint has not started.

### §5.1 — S03 scope (high priority, blocking undo + audit trail)

| Gap | Contract violated | Effort | Done when |
|---|---|---|---|
| `PatchSnapshot.ts` does not exist; `produceWithPatches` never wired — no forward/inverse patches generated | C11 §5.2, C03 §4 | Medium — create `packages/command-bus/src/PatchSnapshot.ts` wrapping `produceWithPatches + applyPatches`; wire `PatchSnapshot.capture()` as a post-handler hook in `CommandBus.execute()` — no individual handler changes needed | `rg "produceWithPatches" packages/command-bus/src/CommandBus.ts` → hits; `PatchSnapshot.ts` exists; every `commandBus.dispatch()` call appends a `PatchPair` to `RingBufferUndoStack`. |
| `RingBufferUndoStack` not connected — custom `UndoStack` (EventRecord[], no patch reversal) is wired instead; `CommandManager.createSnapshot()` still structuredClone | C03 §4.1 | Medium — swap `CommandBus.undoStack` from `UndoStack` → `RingBufferUndoStack`; combine with `PatchSnapshot.capture()` so `undo()` applies `applyPatches(inverse)` | `CommandManager.createSnapshot()` deleted or is a no-op; Ctrl-Z triggers `RingBufferUndoStack.undo()` and restores store state via `applyPatches` in ≤ 5 ms on a 200-wall project. |
| `runtime.events.emit('wall.created')` / `'<family>.created'` not emitted by any handler (0 / 177) | C11 §5.2, §6.3 | Low per family — add one `runtime.events.emit()` call to each Create handler | `grep -rl "runtime\.events\.emit" plugins/ --include='*.ts' \| wc -l` → ≥ 177; one emit per Create handler; event names match the schema in `packages/command-bus/src/commands.ts`. |
| `plugins/rooms/` not subscribing to `runtime.events.on('wall.created')` — rooms redetect still goes via `pryzm-bus-rooms-redetect` CustomEvent bridge at `engineLauncher.ts:1297` | C11 §6.3 | Low — wire `runtime.events.on()` subscriber in rooms plugin; remove CustomEvent bridge | `grep "pryzm-bus-rooms-redetect" src/engine/engineLauncher.ts` → 0 hits; `plugins/rooms/src/index.ts` registers `runtime.events.on('wall.created', ...)` subscriber. |
| OTel spans absent from all handler files | C10 §2 | **CLOSED ✅ Sprint A30** — `check-otel-spans.ts` gate: 183/183 ✅; HARD_FLOOR ratcheted 182→183 for `CreateStairBatch.ts`; all handlers use `withHandlerSpan` wrapper | `npx tsx tools/ga-gate/check-otel-spans.ts` → 183/183 ✅ |
| `tests/commands/affected-stores.test.ts` CI test file missing | L2 plan doc 23 | Low — create one test file | `tests/commands/affected-stores.test.ts` exists; `pnpm test -- affected-stores` exits 0; adding a handler with `affectedStores: []` causes test to fail with a descriptive message. |
| `(window as any)` count regressed from 15 → 16 — `BatchCoordinator.ts:312` uses `(window as any).__wallRebuildControl?.resumeAndFlush?.()` instead of typed `window.__wallRebuildControl?.resumeAndFlush?.()` | CI gate `check-cast-count` (baseline 15) | Trivial — replace the cast with the typed accessor; `window.__wallRebuildControl` is already declared in `global-window.d.ts` | `grep -rn "(window as any)" src/engine/subsystems/core/batch/BatchCoordinator.ts` → 0 hits; `pnpm run check-cast-count` → exits 0 at count 15. |
| `commandManager.execute()` active sites in `src/`: **201 call sites across 124 files** ⚠️ (exhaustive grep 2026-05-04 A36; doc previously stated "~120/50+" — stale) — breakdown: 22 in `src/engine/subsystems/annotations/` (bus payloads upgraded to typed `{id,viewId,kind}` in Sprint A36 P13; legacy commandManager call still present), ~55 in `src/ui/` (property-inspector, ViewPropertiesPanel, etc.), ~43 in `src/engine/subsystems/` engine tools, ~81 elsewhere. The "2 remaining E.5.x sites" referred narrowly to `engineLauncher.ts:1306` + `RemoteCommandDispatcher.ts:84` in the P0–P11 bus-migration scope; annotation tools, property-inspector, and all tool classes are a separate longer-horizon migration (Wave A21+). **P13 (A36)** fixes annotation bus payloads; bus-primary flip for annotations awaits `annotationStore` ↔ `AnnotationsState` bridge (P14). | C11 §8.1 (gate: 0 `commandManager.execute()` in `src/`) | Large — annotation bus payloads fixed P13 ✅; UI/property-inspector (~55 sites), engine tools (~43 sites), AI/services, and full bus-primary flip Wave A21+. | `grep -rn "commandManager\.execute\b" src/ --include='*.ts' \| grep -v "^\s*//" \| wc -l` → 0; `pnpm run ga-gates` exits 0. |

### §5.2 — S04 scope (deliberately staged)

| Gap | Contract | Staging reason | Done when |
|---|---|---|---|
| MessagePack codec in `PatchEmitter` (currently JSON) | C03 §5, ADR-004 | **Sprint A26 DONE ✅** — `PatchEmitter.encode/decode` use `@msgpack/msgpack`; `@msgpack/msgpack: ^3.1.3` added to `packages/command-bus/package.json`; round-trip tests pass in `patch-emitter.test.ts` and `move-cube.test.ts`; `rg "msgpack" packages/command-bus/src/PatchEmitter.ts` → 2 hits; `encode(decode(x)) deepEquals x` ✅. | `rg "msgpack" packages/command-bus/src/PatchEmitter.ts` → hits; `encode(decode(x)) deepEquals x` round-trip test passes; ADR-004 status updated to IMPLEMENTED. |
| Postgres `event_log` table and persistor subscriber | C03 §4, ADR-002 | **Sprint A26 DONE ✅** — `event_log` table created in `server/dbMigrate.js` SCHEMA_SQL (#16); `POST /api/event-log` endpoint added to `server.js` (202 Accepted, non-blocking insert); `packages/command-bus/src/EventLogPersistor.ts` exports `createEventLogPersistor()`; wired in `composeRuntime.ts` when `opts.eventLogEndpoint` provided; `disposeEventLog()` in tearDown. | `SELECT COUNT(*) FROM event_log` returns rows after a command is dispatched; `PatchEmitter` has ≥ 1 server-side subscriber; schema includes `id`, `actor_id`, `project_id`, `client_id`, `timestamp`, `payload`. |

### §5.3 — Wave A19+ scope (long-horizon, architecture-complete)

| Gap | Contract | Staging reason | Done when |
|---|---|---|---|
| `YjsDocAdapter` not wired to running application | C08 §1, ADR-002 | S43 bidirectional translator; S48 Yjs replaces LWW everywhere | `YjsDocAdapter` instantiated in `composeRuntime.ts`; two tabs on the same project converge after one tab creates a wall; `rg "YjsDocAdapter" packages/runtime-composer/src/composeRuntime.ts` → hits; ADR-002 Phase rollout milestone S43 closed. |
| ~~Batch handlers for columns, beams, slabs, doors, windows, ceilings (AI batch path)~~ | ~~C11 §4.2~~ | **CLOSED ✅ Sprint A27/A28** — All six batch handlers exist and are registered: `slab.batch.create` (A27), `column.batch.create`, `beam.batch.create`, `door.batch.create`, `window.batch.create`, `ceiling.batch.create` (A28). All wired in plugin indices + `commands.ts`. `CommandEventBridge` emits typed `*.created` events for all batch variants (A29). | `registry.has('slab.batch.create') && registry.has('column.batch.create') && registry.has('door.batch.create') && registry.has('window.batch.create') && registry.has('ceiling.batch.create')` → all true ✅ |

### §5.4 — DROP/MERGE triage (Wave A21 recommendation)

| Gap | Impact | Done when |
|---|---|---|
| 187 handlers vs target ~110 — no DROP 13 / MERGE 47 sweep scheduled | Technical debt accumulation; test surface larger than needed; naming confusion for new engineers | `find plugins/*/src/handlers -name '*.ts' -not -name index.ts \| wc -l` → ≤ 110; all 13 DROP-tagged handlers deleted; all 47 MERGE-tagged pairs collapsed; doc 23 DROP/MERGE triage row stamped DONE. |
| 264 legacy `src/engine/subsystems/commands/` classes not yet deleted | Each remaining class is a shadow API that could be called accidentally; increases `commandManager.execute()` risk surface | `find src/engine/subsystems/commands -name '*.ts' \| wc -l` → 0; `commandManager.execute()` count in `src/` = 0; `rg "commandManager\.execute" src --type ts \| grep -v "//" \| wc -l` → 0; `pnpm tsc --noEmit` → 0 errors. |

---

## §6 — What is already done and should not be re-done

The following are complete and verified as of 2026-05-04. They MUST NOT be re-implemented or reverted.

| Item | Verification |
|---|---|
| `affectedStores` 100% on plugin handlers + runtime throw | `CommandBus.ts:67` throws `CommandBusError` at registration |
| ULID stamping on every command (`id: ulid()`) | `CommandBus.ts:195` |
| `BatchCoordinator.runBatch()` for wall and curtain-wall batch | `§BATCH-WALL-PAUSE` + `§BATCH-CW-PAUSE` — both DONE |
| `StoreEventBus.batch(fn)` coalescing all intermediate flushes | Active in `BatchCoordinator._setupBatch()` |
| Room redetect frame-yielded via bus (NOT synchronous loop) | `_executeFinalSweep()` uses `runtime.bus.executeCommand('rooms.redetect', ...)` + `getFrameScheduler().scheduleOnce()` |
| 5,627ms LONGTASK eliminated | Replaced by frame-yielded dispatch; live browser logs show normal LONGTASKs only from geometry drain (150ms, 82ms) |
| P0–P11 command bus bridging (117/120 call sites) | `23-L2` plan doc; 2 WallTool design-fallback + 1 ProjectLoader path remain |
| Plugin L7 boundary (zero direct `@pryzm/*` imports in `plugins/`) | CI gate active; 0 violations |
| rAF single-owner gate | `check-raf-count.ts` → 1 owner |
| `(window as any)` non-shim reaches = 0 | `check-cast-count.ts` → 0 non-shim |
| TypeScript clean | `pnpm tsc --noEmit` → 0 errors |

---

## §7 — Alignment verdict: C11 + 00_Contracts + 03_PRYZM3

**Question**: Is the current L2 implementation aligned with the contracts and all plan docs?

**Answer**: The architectural skeleton is aligned. The interior protocol has four systematic gaps that are explicitly required by contract but not yet implemented.

### Aligned ✅

- The pipeline shape (commandBus → handler → stores → geometry deferred) is correct and matches C11 §2.
- The handler location (`plugins/*/handlers/`) matches C01 and C11 §5.3.
- `affectedStores` enforcement matches C11 §5.2 and is runtime-enforced.
- Batch coalescing via `BatchCoordinator.runBatch()` + `StoreEventBus.batch()` matches C11 §4.2.
- ULID stamping matches ADR-004 and C03 §2.2.
- The undo/redo data structures (`RingBufferUndoStack`, `PatchPair`) match C03 §4.
- `PatchPair.affectedStores` field (Sprint A34) gives the undo applicator full store-routing info without path-segment inference.
- `applyRingBufferSide()` utility (Sprint A34) implements the single-store / multi-store patch-routing logic ready for Sprint A22 Phase D wiring.

### Gaps vs contracts ❌

| Gap | Contracts violated | Sprint | Done when |
|---|---|---|---|
| ~~`PatchSnapshot.ts` missing; `produceWithPatches` never wired → no `{forward[], inverse[]}` patch pairs; custom `UndoStack` wired instead of `RingBufferUndoStack`~~ | ~~C11 §5.2, C03 §4.1~~ | **CLOSED ✅ Sprint A31** — `PatchSnapshot.ts` exists (`captureOne`, `captureMany`, `toJsonPointer`, `fromJsonPointer`, `patchSideToImmer` — all exported); `RingBufferUndoStack` wired via `inner.bus.setRingBuffer(ringBuffer)` in `composeRuntime.ts` line 643; every dispatch pushes `PatchPair` to ring buffer **synchronously** inside `CommandBus.executeCommand()` after `undoStack.push(record)`; `runtime.undoStack` backed by ring buffer (passed as default backend to `buildUndoStackSlot`, line 700). Sprint A34 adds `affectedStores` field to `PatchPair` + `applyRingBufferSide` prep utility. Full Ctrl-Z → `applyPatches` wiring remains Sprint A22. | ✅ CLOSED A31 — `ls packages/command-bus/src/PatchSnapshot.ts` → EXISTS; `grep ringBuffer packages/runtime-composer/src/composeRuntime.ts` → wired |
| ~~0 / 177 handler files emit `runtime.events.emit()` → `plugins/rooms/` cannot subscribe; CustomEvent bridge still active at `engineLauncher.ts:1297`~~ | ~~C11 §5.2, C11 §6.3~~ | **CLOSED ✅ Sprint A24+** — `CommandEventBridge` (`packages/runtime-composer/src/CommandEventBridge.ts`) emits typed `*.created` domain events on `runtime.events` for every successful dispatch across all 19 element families (single + batch variants). Bridge wired in `composeRuntime.ts`; disposed in `tearDown()`. Handler files themselves do NOT directly call `runtime.events.emit()` per ADR-002 L4→L2 boundary — the bridge is the compliant emission mechanism. `plugins/rooms/` CustomEvent bridge remains Phase F (blocked by room detection algorithm migration to L4). | ✅ CLOSED — `grep wireCommandEventBridge packages/runtime-composer/src/composeRuntime.ts` → wired |
| ~~0 / 177 handler files have OTel spans~~ | ~~C10 §2~~ | **CLOSED ✅ Sprint A30** — 183/183 handler files have `withHandlerSpan` (or equivalent OTel span) gate-verified via `npx tsx tools/ga-gate/check-otel-spans.ts`; HARD_FLOOR ratcheted 182→183 when `CreateStairBatch.ts` was added. | ✅ CLOSED — `npx tsx tools/ga-gate/check-otel-spans.ts` → 183/183 ✅ |
| ~~FrameScheduler canonical API (`packages/frame-scheduler` `schedule('pre-render', fn)`) not called by geometry builders~~ | ~~C11 §5.2, §6.1~~ | **CLOSED ✅ Sprint A32+A33** — All three geometry builders with drain queues migrated: `WallFragmentBuilder` 2 sites (A32), `CurtainWallBuilder` 5 sites (A32), `SlabFragmentBuilder` 3 sites (A33). All use `FrameScheduler.schedule('pre-render', () => this._drainBuildQueue())`; `check-raf-count.ts` → 1 owner ✅. | ✅ CLOSED — `check-raf-count.ts` → 1 owner ✅ |
| **201 active `commandManager.execute()` sites across 124 files in `src/`** ⚠️ — exhaustive count 2026-05-04 A36 (doc previously stated "~120/50+" — stale). Breakdown: `src/engine/subsystems/annotations/` (22 sites — **bus payloads upgraded to typed `{id,viewId,kind}` Sprint A36 P13 ✅**; legacy commandManager call still present until annotationStore↔AnnotationsState bridge), `src/ui/property-inspector/` + `src/ui/ViewPropertiesPanel.ts` + other UI (~55), engine tools (WallTool, SlabTool, RoofTool, FurnitureTool, RoomTool, RoomAIAssistant, handrails, plumbing, stairs, etc. ~43), and ~81 elsewhere. The "2 E.5.x sites" referred narrowly to `engineLauncher.ts:1306` + `RemoteCommandDispatcher.ts:84` in P0–P11 scope; annotation bus-primary flip and all other sites are Wave A21+ (Doc 33). | C11 §8.1 (gate: 0 `commandManager.execute()` in `src/`) | Wave A21+ (Doc 33) — P13 annotation payload fix done A36 ✅ | `grep -rn "commandManager\.execute\b" src/ --include='*.ts' \| grep -v "^\s*//" \| wc -l` → 0; `pnpm run ga-gates` exits 0. |
| ~~No batch handlers for slabs, doors, windows, columns, beams, ceilings, stairs (AI path)~~ | ~~C11 §4.2~~ | **CLOSED ✅ Sprint A27/A28/A29/A30** — All 9 major structural batch handlers exist, registered, typed in `commands.ts`, and wired in `CommandEventBridge` with typed `*.created` RuntimeEvents (`commandType` union + `elementCount`). | `registry.has('stair.batch.create') && registry.has('ceiling.batch.create') && registry.has('column.batch.create') && registry.has('door.batch.create') && registry.has('window.batch.create')` → all true ✅ |

### Staging alignment ✅

Rows 5 and 6 (MessagePack, Postgres event_log) are **CLOSED** as of Sprint A26 (2026-05-04). Row 7 (Yjs activation) remains on the S43–S48 schedule per ADR-002 and ADR-004. The contracts described Rows 5–6 as targets on a deliberate sprint schedule; both are now implemented and gate-verified.

---

## §9 — Production Run Forensics (2026-05-04, Sprint A36 build `engineLauncher-H1pOCaES.js`)

> **Method**: live browser console capture from the published `.replit.app` domain after Replit checkpoint `2fca9e78`. All timestamps from the console log attached by the user. Build hash `H1pOCaES` = Sprint A36 production bundle.

### §9.1 — Command pipeline: CONFIRMED WORKING ✅

The `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` command completed successfully in production for the first time in this sprint cycle. The full §BATCH-CW-PAUSE pipeline fired in the correct sequence:

| Step | Log line | Status |
|---|---|---|
| Batch open | `[StoreEventBus] beginBatch() — depth now 1` | ✅ |
| Slab loop (9 slabs × 17 walls = 153 CWs) | per-slab elapsed: 51.8 → 65.5 → 84.5 → 100.0 → 155.8 → 209.0 → 169.6 ms (7 of 9 shown) | ✅ complete |
| §BATCH-CW-PAUSE resume | `resumeAndFlush — 153 walls transferred to pending queue, 1 rAF drain scheduled` | ✅ |
| Command complete | `COMPLETE total=892.5ms` | ✅ |
| Build queue drain | `Build queue drained — beginning registration drain (153 queued / 153 expected)` | ✅ |
| BimManager registrations | 153 × `[BimManager] Registered element … to level L-0x` (9 levels) | ✅ |
| StoreEventBus flush | `endBatch() — flushed 6867 buffered event(s) in emission order` | ✅ |
| Final sweep | `Final sweep: firing 9 REDETECT_ROOMS command(s). Observers re-enabled. StoreEventBus flushed (depth now 0)` | ✅ |
| Geometry pass | `Post-batch geometry pass: shadow flags + PBR upgrade run once for 556 mesh(es)` | ✅ |
| Room detection | 9 × `[PlanarTopologyEngine] Topology: 1 room(s) detected` | ✅ |
| 2D projection | `EdgeProjectorService project() … 179 group(s), 10709 edge geometries` | ✅ |

**Architecture verdict**: §BATCH-CW-PAUSE, §BATCH-BUS-DISCARD, §COLLAB-FILTER, and the registration drain are all correct. The C11 §4.2 pipeline shape is conformant.

### §9.2 — Performance gap: "took too long" (C10 NFT breach)

**Observed**: `CREATE_CURTAIN_WALLS_ON_ALL_SLABS COMPLETE total=892.5ms` (9 slabs, 17 walls each, 153 curtain walls)

**C10 NFT target**: AI batch commands ≤ 500 ms (C10 §3.2 batch-command SLA).

**Root causes of the 892.5 ms latency** (two compounding issues):

#### Issue A — Per-slab loop O(store-size) growth (dominant)

The slab iteration times grow non-linearly: 51.8 → 65.5 → 84.5 → 100.0 → 155.8 → 209.0 → 169.6 ms. Each slab creates 17 walls via synchronous `curtainWallStore.add()` calls. Although `§BATCH-CW-PAUSE` correctly defers the geometry build to rAF, each `curtainWallStore.add()` still:
1. Appends to the store's internal `Map`/`Array`.
2. Fires the store's subscriber notification path synchronously — one notification per wall.

Because `storeEventBus.batch()` is wrapping the inner sync bracket (depth 2), these notifications are **buffered** rather than immediately dispatched. However, the subscriber notification loop inside the store itself (not the bus) may still be O(current store size). With 17 walls per slab and a growing `_pendingBuildsMap`, each `add()` costs slightly more than the previous, explaining the monotonically increasing per-slab times.

**Fix path** (Wave A21, perf sprint): Profile `curtainWallStore.add()` under Perfetto to identify the exact subscriber-notification hot path. Candidate optimisation: batch the subscriber notification inside the store's `addMany(items[])` API (avoids per-item subscriber iteration); C11 §4.2 already requires this for any batch-create path.

#### Issue B — 6867-event endBatch flush (secondary)

`StoreEventBus.endBatch()` in `_executeFinalSweep()` flushed **6867 buffered events** in a single synchronous pass. This is 153 walls × ~45 events each (store-change events across curtainWallStore, bimManager, levelStore subscriptions). The flush is the single largest synchronous block after the command completes and is the primary cause of the visual "frozen" perception between `COMPLETE` and the moment geometry appears.

**Fix path** (Wave A21): Introduce an `endBatchYielded()` variant of `StoreEventBus.endBatch()` that drains events in chunks of N per rAF frame (same pattern as `_drainRegistrations`). This would distribute the 6867-event flush across ~17 frames (400 events/frame) instead of one synchronous 300–500 ms block.

### §9.3 — Defensive hardening + P1.3–P1.4 fixes applied (Sprint A36, rev 17–18)

The following five fixes were applied to `main` on 2026-05-04 in response to this forensic analysis:

| Fix | File | Change | Gap addressed | Contract |
|---|---|---|---|---|
| **FrameScheduler singleton pinning** | `vite.config.ts` | Added `if (id.includes('@pryzm/frame-scheduler')) return 'runtime-frame-scheduler'` to `manualChunks` | Prevents singleton duplication across the `engineLauncher` dynamic-import chunk boundary — non-deterministic freeze root cause | C04 §3 (single rAF owner) |
| **EngineLoadingOverlay listener guard** | `src/ui/platform/EngineLoadingOverlay.ts` | `show()` calls `stopProgressTimers()` before re-registering `'engine-loading-progress'` | Prevents duplicate tick-listener ID throw on rapid second project-open (aborts bootstrap before `scheduler.start()`) | C04 §3 (FrameScheduler lifecycle) |
| **BatchCoordinator watchdog** | `src/engine/subsystems/core/batch/BatchCoordinator.ts` | 30 s `setTimeout` set in `runBatch()` normal-exit path; cancelled in `signalBuildQueueDrained()` and the fn()-threw catch | Last-resort: if `_drainBuildQueue` never fires, force-calls `signalBuildQueueDrained()` after 30 s — storeEventBus cannot stay at depth 1 permanently | C11 §4.2 (batch bracket must close) |
| **P1.3 post-batch traversal deferred to `'post-render'`** | `src/engine/subsystems/initScene.ts` | `batchCoordinator.setPostBatchCallback(...)` inner body changed from `setTimeout(() => {...}, 0)` → `getFrameScheduler().scheduleOnce('post-render', () => {...})` | The 556-mesh `scene.traverse()` (shadow flags + PBR upgrade) was blocking the frame that first revealed new geometry → **visible "second freeze"** after `endBatch()`. Deferring to `'post-render'` means users see the geometry rendered first, then the shadow/PBR pass fires in the following frame — eliminating the perceived freeze | C04 §3, C11 §6.1 (P3 single rAF owner; MUST NOT call setTimeout in geometry post-processing paths) |
| **P1.4 §BATCH-EVENT-YIELD — yielded event drain** | `packages/core-app-model/src/StoreEventBus.ts` + `BatchCoordinator._executeFinalSweep()` | Added `endBatchYielded(scheduler, onComplete, chunkSize=200)` to `StoreEventBus`. `_executeFinalSweep()` now calls `endBatchYielded()` instead of `endBatch()`, scheduling 200 events per `'pre-render'` frame via the injected `fsScheduler`. All post-flush logic (`_isBatching=false`, `restore()`, P1.3 callback, PERF-FIX-3, REDETECT_ROOMS) moved into the `onComplete` callback fired after the final chunk. `§BATCH-BUS-DISCARD` ordering preserved — `discardAndSuppress()` before first chunk, `restore()` inside `onComplete` after all events delivered. | **Root-cause freeze eliminated**: 117 curtain walls → 5,859 buffered events × 20 listeners = 116,980 synchronous listener calls in one JS task (~500–900 ms LONGTASK). Yielded drain distributes this across ~30 `'pre-render'` frames of ≤ 16 ms each. `StoreEventBus` has no `@pryzm/frame-scheduler` import (C01 §2 layer boundary) — scheduler is injected by `BatchCoordinator`. | C04 §3 (single rAF owner; scheduler injected not imported), C11 §4.2 (`onComplete` fires after ALL events), §9 Master Architecture "No Event Drops" (all events delivered in emission order, no coalescing) |

### §9.4 — Architectural soundness: all five fixes vs contracts

| Fix | C11 | C04 | C03 | C10 | Doc 34 |
|---|---|---|---|---|---|
| FrameScheduler chunk pinning | ✅ §6.1 (FrameScheduler singleton is the single rAF owner — pinning enforces it across chunk boundaries) | ✅ §3 (P3 invariant preserved) | — | — | §0 row "Raw `requestAnimationFrame` in builders → 0 each" depends on a single scheduler |
| EngineLoadingOverlay show() guard | ✅ §5.2 (tick listeners MUST be disposed before re-registration) | ✅ §3 (TickListenerDisposer contract honoured) | — | — | §6 baseline `(window as any)` count unaffected |
| BatchCoordinator watchdog | ✅ §4.2 (batch bracket MUST always close; depth 0 MUST be reached after every runBatch) | — | ✅ §2.1 (single mutation path; bus stuck at depth 1 silently drops mutations) | ✅ §3.2 (30 s SLA > 500 ms batch target — only fires on definitive failure) | §5.1 gap closure |
| P1.3 `post-render` slot | ✅ §6.1 (geometry post-processing MUST NOT block the frame that commits geometry) | ✅ §3 (single rAF owner; `scheduleOnce` is the canonical API) | — | ✅ §3.2 (eliminates the secondary 556-mesh LONGTASK) | §9.2 Issue B mitigation |
| P1.4 `endBatchYielded()` | ✅ §4.2 (batch bracket closes via `onComplete` after all events; §9 "No Event Drops" preserved — emission order, no coalescing) | ✅ §3 (scheduler injected; `StoreEventBus` has no direct `@pryzm/frame-scheduler` import — C01 §2 layer boundary obeyed) | ✅ §2.1 (`_isBatching` stays true throughout drain; `discardAndSuppress` active; no spurious mutations during yield) | ✅ §3.2 (5,859-event LONGTASK distributed to ~30 × ≤16ms chunks; eliminates the principal `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` freeze) | §9.2 Issue A — **root cause fixed** |

### §9.5 — Coverage: does the §BATCH-*-PAUSE pattern cover all element families?

The pause/resume wiring in `BatchCoordinator._setupBatch()` is **only required for geometry builders that maintain a rAF drain queue** — a deferred list of pending builds that drains across multiple frames. The pattern does NOT need to be applied to builders that commit geometry synchronously.

| Builder | Drain queue? | Pause/resume wired | §BATCH-*-PAUSE status |
|---|---|---|---|
| `WallFragmentBuilder` | ✅ Yes — `_pendingWallEvents` rAF loop | ✅ `__wallRebuildControl` | ✅ `§BATCH-WALL-PAUSE` — DONE |
| `CurtainWallBuilder` | ✅ Yes — `_pendingBuildsMap` rAF drain | ✅ `__curtainWallRebuildControl` | ✅ `§BATCH-CW-PAUSE` — DONE |
| `SlabFragmentBuilder` | ✅ Yes — `_pendingBuilds` rAF drain | ✅ `__slabRebuildControl` | ✅ `§BATCH-SLAB-PAUSE` — DONE |
| `ColumnFragmentBuilder` | ❌ No drain queue — synchronous build | N/A — no pause needed | ✅ Covered by `storeEventBus.batch()` coalescing alone |
| `BeamFragmentBuilder` | ❌ No drain queue — synchronous build | N/A | ✅ |
| `HandrailFragmentBuilder` | ❌ No drain queue | N/A | ✅ (not yet AI-targeted) |
| `RoofFragmentBuilder` | ❌ No drain queue | N/A | ✅ (not yet AI-targeted) |
| `PlumbingFragmentBuilder` | ❌ No drain queue | N/A | ✅ (not yet AI-targeted) |
| `FurnitureFragmentBuilder` | ❌ No drain queue | N/A | ✅ (not yet AI-targeted) |
| Door / Window / Stair / Ceiling | ❌ Hosted or placed elements — no independent geometry builder | N/A | ✅ |

**Verdict**: The §BATCH-*-PAUSE pattern is **complete for all currently AI-targeted element families**. The three wired builders (Wall, CurtainWall, Slab) are the only ones with rAF drain queues; every other family builds synchronously and is fully protected by `storeEventBus.batch(fn)` coalescing alone.

**When a new element family gains a rAF drain queue** (i.e., it becomes complex enough to require multi-frame geometry builds), the implementation checklist is:
1. Add `pause()` / `resumeAndFlush()` methods to the builder.
2. Expose `window.__<family>RebuildControl` in `engineLauncher.ts` (typed in `global-window.d.ts`).
3. Call `pause()` in `BatchCoordinator._setupBatch()`.
4. Call `resumeAndFlush()` in `BatchCoordinator.runBatch()` after `storeEventBus.batch(fn)` returns.
5. Call `resumeAndFlush()` in the `runBatch()` error catch path.
6. Call `signalBuildQueueDrained()` from the builder when its drain queue empties.
7. Add a row to this table (§9.5).

### §9.6 — C11 §7.4 staleness note

C11 §7.4 lists Slab, Column, Beam, Stair, Door, Window, Ceiling as gaps "Wave A21". This is stale — those batch handlers were implemented in Sprint A27 (Slab), A28 (Column/Beam/Door/Window/Ceiling), and A30 (Stair). Doc 34 §4 carries the authoritative live state. C11 §7.4 should be updated when C11 next enters a revision cycle; until then, **doc 34 §4 is the authority on batch handler coverage** (doc 34 §0 preamble: "When this document contradicts older wave plans … this document wins").

---

### §9.4 — Open performance NFT gap (command loop latency — partially fixed)

| NFT | Measured | Target | Status | Sprint |
|---|---|---|---|---|
| `StoreEventBus.endBatch()` event flush | 5,859 events × 20 listeners = 116,980 synchronous listener calls (~500–900 ms LONGTASK) | ≤ 16 ms per frame (200 events/frame yielded) | **FIXED ✅** — `endBatchYielded()` distributes across ~30 `'pre-render'` frames; `_executeFinalSweep()` migrated | Done rev 18 |
| P1.3 post-batch mesh traversal blocking first-visible frame | 556-mesh `scene.traverse()` blocking geometry-reveal frame | ≤ 16 ms | **FIXED ✅** — `scheduleOnce('post-render')` defers traversal to after render | Done rev 17 |
| `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` command loop (9 slabs × 13 walls) | **749.4 ms** (increasing per slab: 13→31→39→62→72→94→116→175→144 ms — quadratic growth) | ≤ 500 ms (C10 §3.2) | **OPEN** — separate from the event-flush fix; root cause is O(n²) wall-intersection detection as wall count grows per slab. Requires `SlabWallCoupling` / spatial-query optimization. | Wave A22 |

---

## §8 — Cross-references

| Topic | Document |
|---|---|
| L2 sprint plan with task rows | `04-PLAN-FORWARD/23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md` |
| Element creation pipeline contract | `00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md` |
| CQRS and undo contract | `00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md` |
| OTel and NFT contract | `00_Contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md` |
| Handler location and layer boundary | `00_Contracts/C01-ARCHITECTURE-AND-GOVERNANCE.md §2` |
| CRDT / event-log wire format | `reference/adrs/ADR-002-crdt-event-log-bridge.md` |
| MessagePack codec decision | `reference/adrs/ADR-004-wire-format.md` |
| 9-step element family recipe | `reference/specs/SPEC-21-ELEMENT-CREATION-PROTOCOL.md` |
| Legacy commandManager migration plan | `04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md` |
| Engine migration (FrameScheduler) | `04-PLAN-FORWARD/26-WAVE-A16-ENGINE-MIGRATION.md` |
| Yjs activation plan | `04-PLAN-FORWARD/29-WAVE-A19-YJS-COLLABORATION.md` |
| Current codebase metrics | `03-CURRENT-STATE.md §1` |
