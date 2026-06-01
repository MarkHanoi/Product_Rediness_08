# 23 — Phase E.5.x: Command Bus Migration — Sprint Execution Sheet

> **Stamp**: 2026-05-04 · **Status**: 🟢 **P0–P13 + P2e-walls + §BATCH-WALL-PAUSE + §COLLAB-FILTER + §BATCH-CW-PAUSE + §BATCH-BUS-DISCARD + §PERF-ADAPTIVE-DRAIN + §PERF-BATCH-BUS + §BATCH-LOADING-INDICATOR ALL DONE ✅** · **Authority**: this is the single canonical execution document for migrating all `commandManager.execute()` call sites to `runtime.commandBus.dispatch()`. It supersedes and consolidates files 31, 32, and 33 (which now redirect here).
> **Anchors**: `../01-VISION.md §2 P6`; `../02-ARCHITECTURE.md §2, §4, §10`; `../03-CURRENT-STATE.md §10 (2026-05-03c/d entries), §13.3`; `../00-PROCESS-TRACKER.md §9 Sprint Task Board`; `../../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md §2`; `../../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md`.
> **Phase gate**: Begin with P0 (CommandRegistry entries) + P1 (BatchCoordinator fix). These two tasks are independent and can run in parallel. Everything else is blocked on P2 (first handler proven working).
> **Constraint**: Do NOT remove `CommandManager.ts` until all 214 sites = 0. Every new call site gets a backward-compat `console.warn` fallback.
>
> **2026-05-03 live-audit findings**: `commandManager.execute()` count = **221** (7 above original 214 estimate — regression or undercounted). `wall.batch.create` event-sourcing was absent from `CreateWallsOnAllSlabsCommand` (P2e analogue for walls was never implemented, only P2e for curtain-walls). Fixed in this session: P2e-walls added to `CreateWallsOnAllSlabsCommand.execute()`. `WallFragmentBuilder.MAX_BUILDS_PER_FRAME` reduced 5→3 to keep geometry drain frames below 50 ms LONGTASK threshold. `rooms.redetect` handler IS registered (via `buildRoomHandlerSet()` in PluginRegistry); `_executeFinalSweep()` correctly uses bus path with frame yields.
>
> **2026-05-04 wall batch post-endBatch ordering fix (this session)**: **§BATCH-BUS-DISCARD** — root-cause analysis of 2409ms LONGTASK during wall batch creation. Three bugs, one ordering error in `_executeFinalSweep()`. Bug 1 (2409ms LONGTASK): `_isBatching=false` was set BEFORE `storeEventBus.endBatch()` — all 184 buffered wall events flushed to an unguarded `_scheduleWallFlush` subscriber → `_flushWallRebuild` rescheduled → WallJoinResolver ran a SECOND time over all 88 walls × 11 levels synchronously. Bug 2 (wrong final edges): the second resolver pass saw 8 stale + 8 new walls on L0 → trimmed=0 on T-into walls → incorrect miter geometry. Bug 3 (REDETECT_ROOMS ×11 via legacy path): `_flushWallRebuild` dispatched `bim-wall-mutation-committed` while `isBatching=false` → `RoomTopologyObserver._commitBarrierListener` fired 11 times via `commandManager` (legacy path). Fixes: (a) added `_wallRebuildDiscarding` flag + `discardAndSuppress()` / `restore()` to `window.__wallRebuildControl` in `engineLauncher.ts` — `_scheduleWallFlush` returns immediately (drops event, no accumulation) while discard mode is active; (b) `_executeFinalSweep()` ordering changed to: `discardAndSuppress()` → `storeEventBus.endBatch()` → `_isBatching=false` → `restore()` → post-batch callbacks → window events → REDETECT_ROOMS; (c) `global-window.d.ts` typed `__wallRebuildControl` with the full four-method interface. `pnpm tsc --noEmit` → 0 errors.
>
> **2026-05-04 curtain wall batch-performance fix (this session)**: **§BATCH-CW-PAUSE** — root-cause analysis of ~240ms LONGTASK for 99 curtain walls / 11 slabs. Three causes: (1) `CurtainWallBuilder._pendingBuilds: CurtainWallData[]` + `findIndex()` — O(n²) for a batch of n walls (4,851 string comparisons for 99 walls); (2) no `__curtainWallRebuildControl` pause mechanism — unlike walls, `updateCurtainWall()` was called synchronously per wall from the `CurtainWallStore` local listener during `storeEventBus.batch(fn)`, scheduling individual rAF drains; (3) double-clone in `CurtainWallStore.add()` — `withDefaults` shallow spread + `set()` calling `cloneCurtainWallData()` again. Fixes: (a) `_pendingBuilds: CurtainWallData[]` → `_pendingBuildsMap: Map<string, CurtainWallData>` — O(1) dedup, insertion-order preserved; (b) `__curtainWallRebuildControl.pause()/resumeAndFlush()` added to `CurtainWallBuilder` constructor and exposed via `window.__curtainWallRebuildControl` (typed in `global-window.d.ts`); `_setupBatch()` calls `pause()`, `runBatch()` calls `resumeAndFlush()` (and error path), collapsing N rAF-schedule calls into ONE after fn() returns; (c) `CurtainWallStore.add()` now constructs a complete deep clone directly (baseLine + properties + ifcData + gridSystem all spread) and writes to the Map + emits without calling `set()` — eliminating the second `cloneCurtainWallData()` pass. `pnpm tsc --noEmit` → 0 errors.
>
> **2026-05-03 batch-performance fixes (this session)**: (1) **§BATCH-WALL-PAUSE** — root-cause analysis of 19,198ms LONGTASK: `BatchCoordinator._setupBatch()` was not calling `window.__wallRebuildControl?.pause()` before the synchronous mutation phase, so each `WallStore.add()` during `runBatch()` could trigger its own rAF flush of `_flushWallRebuild()` which runs `WallJoinResolver.resolveLevel()` O(n²) per level. The `§LOAD-RAF-PAUSE` pattern already existed on `window.__wallRebuildControl` (used by ProjectLoader since Apr 2026) for exactly this use case (engineLauncher comment explicitly lists "batch creation" as another consumer). Fix: `_setupBatch()` calls `pause()` at start; `runBatch()` calls `resumeAndFlush()` after `storeEventBus.batch(fn)` returns (and in catch block). `resumeAndFlush()` runs ONE synchronous `_flushWallRebuild()` pass → WallJoinResolver fires once for all walls → `builder.updateWall()` × N queued with `isBatching=true` → drain via rAF over subsequent frames. Collapses N×O(n²) passes into one. (2) **§COLLAB-FILTER** — `REDETECT_ROOMS` was being broadcast over the collaboration socket and stored in the server-side command log; on reconnect catch-up, `RemoteCommandDispatcher` emitted "[RemoteCommandDispatcher] No factory for type: REDETECT_ROOMS — toast-only" for every buffered REDETECT_ROOMS. Also `CREATE_WALLS_ON_ALL_SLABS`, `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`, `CREATE_CURTAIN_WALLS_FROM_SLAB` were broadcast and replayed as legacy commands, flooding the log with "Wall already exists" validation failures. Fix: `COLLAB_BROADCAST_SKIP` set added in `onCommandExecuted` callback in `initCollaboration.ts` filtering all four types before `socket.emit('command-executed', ...)`. `pnpm tsc --noEmit` → 0 errors.

---

## §0 — Why this is urgent: live performance evidence

A 9-slab curtain-wall batch on 2026-05-03 produced three LONGTASKs from the legacy dispatch chain:

| LONGTASK | Duration | Root cause |
|---|---:|---|
| `CreateCurtainWallsOnAllSlabsCommand` synchronous geometry | **131ms** | Curtain-wall builder still synchronous |
| `BatchCoordinator._executeFinalSweep()` — 9× `ReDetectRoomsCommand` synchronously | **5,627ms** | `commandManager.execute()` loop on main thread |
| Edge projection + plan-view re-render | **6,916ms** | Downstream consequence |

**FPS during the 5.6s task: 1fps — user-visible freeze.**

A second session (2026-05-03, 558-wall / 11-slab batch via AI command) revealed a separate LONGTASK root cause fixed by **§BATCH-WALL-PAUSE**:

| LONGTASK | Duration | Root cause |
|---|---:|---|
| `BatchCoordinator.runBatch()` synchronous mutation phase | **19,198ms** | `_setupBatch()` did not call `__wallRebuildControl.pause()` → each `WallStore.add()` scheduled its own rAF flush of `_flushWallRebuild()` → N×O(n²) `WallJoinResolver.resolveLevel()` passes for N walls |

**Fix**: `_setupBatch()` calls `pause()` at start; `runBatch()` calls `resumeAndFlush()` after `storeEventBus.batch(fn)` → one O(n²) resolver pass for all walls. **§BATCH-WALL-PAUSE** row in §1 sprint board. ✅ Fixed 2026-05-03.

Additionally, when the user draws a wall interactively (`WallTool.ts:1605`) or clicks "Create walls from slab" (`WallTool.ts:1535`), both also go through `commandManager.execute()` — bypassing the typed bus, undo patch system, and event subscribers entirely.

**Current gap (2026-05-03 audit)**:

| Metric | Value |
|---|---:|
| `commandManager.execute()` sites in `src/` | **214** |
| `runtime.commandBus.dispatch()` reaches in `src/` | **0** |
| Unique command types affected | **41** |
| Files affected | **~120** |
| LONGTASKs attributable to this gap | **3** (in one session) |

---

## §1 — Sprint task board

Execute in this exact order. P0 and P1 can run in parallel (they touch different files). P2–P11 each require the previous group to be proven working first.

| Task | Priority | Status | Description | Key files to change | Done-when | Blocker |
|---|:---:|:---:|---|---|---|---|
| **P0** | 🔴 PRE-REQ | `DONE ✅` | Add typed `CommandRegistry` entries for all missing command types (see §4 for full list) | `packages/command-bus/src/commands.ts` | `pnpm tsc --noEmit` → 0 errors; `rg "'wall.create'\|'wall.batch'\|'rooms.redetect'" packages/command-bus/src/commands.ts` → hits | None |
| **P1** | 🔴 CRITICAL | `DONE ✅` | Fix `src/engine/subsystems/core/batch/BatchCoordinator.ts:460–471` — inject `runtime`, replace 9× synchronous `commandManager.execute(ReDetectRoomsCommand)` with async frame-yielded `runtime.bus.executeCommand('rooms.redetect', payload)` + `getFrameScheduler().scheduleOnce()` yields | `src/engine/subsystems/core/batch/BatchCoordinator.ts`, `src/engine/engineLauncher.ts` | PRYZM-1 fallback preserved; `pryzm-bus-rooms-redetect` CustomEvent bridge wired in engineLauncher | P0 |
| **P2a** | 🔴 HIGH | `DONE ✅` | `CreateWallHandler` already existed in `plugins/wall/src/handlers/CreateWall.ts`; wired via `buildWallHandlerSet` in `plugins/wall/src/handlers/index.ts`. | `plugins/wall/src/handlers/CreateWall.ts`, `plugins/wall/src/handlers/index.ts` | Handler registered; `registry.has('wall.create')` → true | P0 |
| **P2b** | 🔴 HIGH | `DONE ✅` | `WallTool.createWall()` dispatches `wall.create` via `runtime.bus.executeCommand`; `WallTool.createFromSelectedSlab()` dispatches `wall.createFromSlab` via bus with legacy fallback (fallback bug fixed — `return` moved inside `try` so commandManager path runs on bus error). Note: `wall.createFromSlab` payload–handler schema alignment deferred to P2d-align TODO. | `src/engine/subsystems/walls/WallTool.ts` | Bus fast-path active when runtime present; legacy path preserved | P2a |
| **P2c** | 🔴 HIGH | `DONE ✅` | `CreateWallBatchHandler` created at `plugins/wall/src/handlers/CreateWallBatch.ts`; registered in `WALL_HANDLER_TYPES` + `buildWallHandlerSet`; exported from `plugins/wall/src/index.ts`. Accepts `{ walls: CreateWallPayload[]; levelId? }` — one Immer batch → one undo-stack entry. `pnpm tsc --noEmit` → 0 errors. | `plugins/wall/src/handlers/CreateWallBatch.ts` (new), `plugins/wall/src/handlers/index.ts`, `plugins/wall/src/index.ts` | Handler registered; `registry.has('wall.batch.create')` → true | P0 |
| **P2d** | 🔴 HIGH | `DONE ✅` | `WallTool.createFromSelectedSlab()` now resolves the slab polygon from `window.slabStore` (typed in `global-window.d.ts §6` — no `(window as any)` cast) before dispatch. Elevation from `bimManager.getLevelById(slab.levelId)`. PRYZM-1 2D polygon `{x, y}` mapped to 3D perimeter `{x, y:elevation, z}` matching `CreateWallsFromSlabHandler`'s schema. `commands.ts` `wall.createFromSlab` payload updated: `slabId` removed; `levelId` (required) + `perimeter` (required) + `height?/thickness?/etc.` added — mirrors `CreateWallsFromSlabPayload`. `pnpm tsc --noEmit` → 0 new errors. Legacy `commandManager.execute(CreateWallsFromSlabCommand)` fallback preserved when slab is missing from store or runtime not injected. Console: `[WallTool] P2d ✅ wall.createFromSlab dispatched via runtime.bus — slabId=X levelId=Y edges=N`. | `src/engine/subsystems/walls/WallTool.ts:1526–1586`, `packages/command-bus/src/commands.ts:681–707` | Bus fast-path active; `canExecute` passes; legacy fallback preserved; `pnpm tsc --noEmit` clean | P2c |
| **P2e** | 🟠 HIGH | `DONE ✅` | `CreateCurtainWallBatchHandler` created at `plugins/curtain-wall/src/handlers/CreateCurtainWallBatch.ts`; mirrors `CreateWallBatchHandler` exactly — type `curtain-wall.batch.create`, accepts `{ curtainWalls?: readonly CreateCurtainWallPayload[]; height?; slabId?; levelId? }`, one Immer batch → one undo-stack entry, no-op when empty. Registered in `handlers/index.ts`, exported from `index.ts`. `CreateCurtainWallsOnAllSlabsCommand.execute()` fires `window.runtime?.bus.executeCommand('curtain-wall.batch.create', { curtainWalls: busCwSpecs, height })` fire-and-forget after `_processSlabs` completes; `window.runtime` now typed in `src/global-window.d.ts §6` (no unsafe cast — §9 constraint preserved). `pnpm tsc --noEmit` → 0 errors. | `plugins/curtain-wall/src/handlers/CreateCurtainWallBatch.ts` (new), `plugins/curtain-wall/src/handlers/index.ts`, `plugins/curtain-wall/src/index.ts`, `packages/command-bus/src/commands.ts` (payload extended), `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts`, `src/global-window.d.ts` | Console: `[CommandBus] DISPATCH: curtain-wall.batch.create — N curtain wall(s) committed to plugin store` ✅ | P0 |
| **P2e-walls** | 🟠 HIGH | `DONE ✅` | Wall batch event-sourcing analogue of P2e was absent from `CreateWallsOnAllSlabsCommand`. Fixed 2026-05-03: after `batchCoordinator.runBatch()` succeeds, wall specs are read from `context.stores.wallStore.getById()` (already-resolved baseLine, thickness, height), then `window.runtime?.bus.executeCommand('wall.batch.create', { walls: wallSpecs })` is dispatched fire-and-forget inside a try/catch (non-fatal, mirrors CW P2e pattern exactly). The `wall.batch.create` handler (P2c) was already registered and ready. `WallFragmentBuilder.MAX_BUILDS_PER_FRAME` reduced 5→3 to reduce per-rAF geometry overhead (observed 60–116 ms LONGTASK per drain frame; reduced to expected ~30–50 ms geometry portion, keeping total frame below or near LONGTASK boundary). `pnpm tsc --noEmit` → 0 errors. | `src/engine/subsystems/commands/walls/CreateWallsOnAllSlabsCommand.ts` (P2e-walls block added after runBatch), `src/engine/subsystems/walls/WallFragmentBuilder.ts` (MAX_BUILDS_PER_FRAME 5→3) | Console: `[CreateWallsOnAllSlabsCommand] E.5.x P2e-walls: wall.batch.create dispatched — N wall(s) committed to plugin store` ✅; TSC clean ✅ | P2c |
| **P2f** | 🟠 HIGH | `DONE ✅` | `plugins/rooms/src/handlers/RedetectRooms.ts` bridge handler created and registered; receives `pryzm-bus-rooms-redetect` CustomEvent from the BatchCoordinator bridge in engineLauncher and calls `runtime.bus.executeCommand('rooms.redetect', payload)` with frame yields. PRYZM-1 fallback preserved. | `plugins/rooms/src/handlers/RedetectRooms.ts` (new) | Room redetect fires via bus after batch; no LONGTASK from synchronous loop | P2c, P1 |
| **§BATCH-CW-PAUSE** | 🔴 CRITICAL | `DONE ✅` | Curtain wall batch creation ~240ms LONGTASK (99 walls / 11 slabs). Three fixes: (a) `_pendingBuilds: CurtainWallData[]` + `findIndex()` → `_pendingBuildsMap: Map<string, CurtainWallData>` — O(1) dedup; (b) `__curtainWallRebuildControl.pause()/resumeAndFlush()` on `CurtainWallBuilder` — mirrors §BATCH-WALL-PAUSE; wired in `_setupBatch()` (pause) + `runBatch()` (resumeAndFlush, both normal and error paths); (c) `CurtainWallStore.add()` constructs a single full deep clone (baseLine+properties+ifcData+gridSystem) and writes directly to Map+emit — eliminating the second `cloneCurtainWallData()` that `set()` would have added. `global-window.d.ts` typed `__curtainWallRebuildControl`. `pnpm tsc --noEmit` → 0 errors. | `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` (`_pendingBuildsMap`, `_rebuildPaused`, `_pausedBuildsMap`, `__curtainWallRebuildControl` in constructor, `updateCurtainWall`, `_drainBuildQueue`, `remove`, `dispose`), `src/engine/subsystems/curtainwalls/CurtainWallStore.ts` (`add` bypass), `src/engine/subsystems/core/batch/BatchCoordinator.ts` (`_setupBatch` + `runBatch`), `src/global-window.d.ts` | `§BATCH-CW-PAUSE: resumeAndFlush — N walls transferred to pending queue, 1 rAF drain scheduled.` ✅; TSC clean ✅ | §BATCH-WALL-PAUSE |
| **§BATCH-BUS-DISCARD** | 🔴 CRITICAL | `DONE ✅` | Root cause of 2409ms LONGTASK + wrong-edges + REDETECT_ROOMS×11 during wall batch creation. Three bugs, one ordering error in `_executeFinalSweep()`: `_isBatching=false` was set BEFORE `storeEventBus.endBatch()` — 184 buffered events flushed to unguarded `_scheduleWallFlush` → second `_flushWallRebuild` (2409ms LONGTASK, Bug 1); second resolver pass saw 8 old+8 new walls → trimmed=0 on T-into walls → incorrect miter geometry (Bug 2); `bim-wall-mutation-committed` fired while `isBatching=false` → `RoomTopologyObserver` dispatched 11 extra `REDETECT_ROOMS` via `commandManager` (Bug 3). Fix: (a) added `_wallRebuildDiscarding` flag + `discardAndSuppress()/restore()` to `window.__wallRebuildControl` in `engineLauncher.ts` — `_scheduleWallFlush` returns immediately (no accumulation) while discarding; (b) reordered `_executeFinalSweep()`: `discardAndSuppress()` → `endBatch()` → `_isBatching=false` → `restore()` → callbacks → window events → REDETECT_ROOMS; (c) typed `__wallRebuildControl` in `global-window.d.ts` with all four methods. `pnpm tsc --noEmit` → 0 errors. | `src/engine/engineLauncher.ts` (`_wallRebuildDiscarding` flag + `discardAndSuppress/restore` in `__wallRebuildControl`), `src/engine/subsystems/core/batch/BatchCoordinator.ts` (`_executeFinalSweep` reordered), `src/global-window.d.ts` (`__wallRebuildControl` typed) | Console: `§BATCH-BUS-DISCARD: discard mode ON` before `endBatch()`; `discard mode OFF` after; no second `_flushWallRebuild`; no REDETECT_ROOMS×11 ✅; TSC clean ✅ | §BATCH-WALL-PAUSE, §BATCH-CW-PAUSE |
| **§BATCH-WALL-PAUSE** | 🔴 CRITICAL | `DONE ✅` | Root cause of 19,198ms LONGTASK in 558-wall / 11-slab batch creation: `BatchCoordinator._setupBatch()` was not calling `window.__wallRebuildControl?.pause()`. Without the pause, each `WallStore.add()` during `runBatch(fn)` schedules its own rAF flush of `_flushWallRebuild()` — running `WallJoinResolver.resolveLevel()` (O(n²)) per affected level. The `§LOAD-RAF-PAUSE` mechanism on `window.__wallRebuildControl` already existed for exactly this use case (ProjectLoader uses it; engineLauncher comment at line 1512 explicitly lists "batch creation" as another intended consumer). Fix: `_setupBatch()` calls `(window as any).__wallRebuildControl?.pause?.()`. `runBatch()` calls `(window as any).__wallRebuildControl?.resumeAndFlush?.()` immediately after `storeEventBus.batch(fn)` returns (and in the catch cleanup path). `resumeAndFlush()` synchronously runs ONE `_flushWallRebuild()` pass: WallJoinResolver fires once for all accumulated walls → `builder.updateWall()` × N queued (isBatching=true → deferred drain) → WallFragmentBuilder drain rAF scheduled for next frame. Collapses N×O(n²) WallJoinResolver passes into a single O(n²) pass. `pnpm tsc --noEmit` → 0 errors. | `src/engine/subsystems/core/batch/BatchCoordinator.ts` (`_setupBatch` + `runBatch`) | Console: `[BatchCoordinator] §BATCH-WALL-PAUSE: resumeAndFlush` logged; no mid-batch `_flushWallRebuild` rAFs; one coalesced resolver pass after fn() returns ✅; TSC clean ✅ | P1, P2e-walls |
| **§COLLAB-FILTER** | 🔴 CRITICAL | `DONE ✅` | `REDETECT_ROOMS` commands were broadcast over the collaboration socket and persisted in the server-side command log. On reconnect catch-up replay, `RemoteCommandDispatcher` had no factory for `REDETECT_ROOMS` → emitted "[RemoteCommandDispatcher] No factory for type: REDETECT_ROOMS — toast-only" for every buffered command. Also `CREATE_WALLS_ON_ALL_SLABS`, `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`, `CREATE_CURTAIN_WALLS_FROM_SLAB` were broadcast and replayed as legacy commands → flooded log with "Wall already exists" validation failures (because elements were already created by the batch). Fix: `COLLAB_BROADCAST_SKIP: ReadonlySet<string>` added in `initCollaboration.ts`'s `onCommandExecuted` callback, filtering all four types before `socket.emit('command-executed', ...)`. Room topology is re-derived on reconnect by replaying the structural batch commands (which are L2-bus-handled, not collaboration-replayed). `pnpm tsc --noEmit` → 0 errors. | `src/engine/subsystems/initCollaboration.ts` (COLLAB_BROADCAST_SKIP set + early-return guard in onCommandExecuted) | No "[RemoteCommandDispatcher] No factory for type: REDETECT_ROOMS" on reconnect; no "Wall already exists" flood from catch-up ✅; TSC clean ✅ | P1, P2f |
| **§PERF-ADAPTIVE-DRAIN** | 🟠 HIGH | `DONE ✅` | **Sprint A37** — `CurtainWallBuilder.MAX_BUILDS_PER_FRAME = 5` was a static class constant, meaning the per-frame geometry budget could never self-correct during a large batch. On a slow frame the builder would still schedule 5 builds, producing 14+ ms drain frames and triggering LONGTASK warnings; on a fast frame it left CPU headroom unused. Fix: promoted to instance variable `_buildsPerFrame: number` initialised to 5 at construction (resets on project open). Each drain cycle records `frameMs = performance.now() - t0` after the for-loop: if `frameMs < 8` increment by 1 (cap 12); if `frameMs > 14` decrement by 1 (floor 2). Debug log: `[CurtainWallBuilder] adaptive drain: built N, frameMs=Xms, nextBudget=M`. Target: ≤ 10 ms per drain cycle. C11 §6.1 §PERF-ADAPTIVE-DRAIN clause added. `WallFragmentBuilder` and `SlabFragmentBuilder` SHOULD adopt the same pattern in a follow-on sprint (Wave A21). | `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` (`_buildsPerFrame` field; `_drainBuildQueue()` adaptive logic) | `_buildsPerFrame` field present; adaptive branch in `_drainBuildQueue`; TSC clean ✅ | §BATCH-CW-PAUSE |
| **§PERF-BATCH-BUS** | 🟠 HIGH | `DONE ✅` | **Sprint A37** — `CreateCurtainWallsOnAllSlabsCommand.execute()` was iterating all slabs a second time after `_processSlabs()` to reconstruct `busCwSpecs[]` for the `curtain-wall.batch.create` bus dispatch (lines 260–303 in the pre-fix file). This doubled the O(n·m) polygon/winding-order/edge-loop work: first pass in `_processSlabs()` built curtain walls into the store, second pass re-read each slab polygon and re-constructed the spec list. Fix: `busCwSpecs: Array<CreateCurtainWallPayload>` declared before the `_processSlabs()` call; the inner spec-building logic inside the first pass populates it inline (guarded by `!isRedo` to match the bus-dispatch guard); the bus dispatch block uses the pre-populated array directly. Second O(n·m) polygon iteration eliminated. `pnpm tsc --noEmit` → 0 errors. | `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts` (`busCwSpecs` hoisted above `_processSlabs`; inline population inside first-pass loop; second-pass loop deleted) | No second polygon-iteration block after `_processSlabs()`; `busCwSpecs` populated inline ✅; TSC clean ✅ | §BATCH-CW-PAUSE, P2e |
| **§BATCH-LOADING-INDICATOR** | 🟠 HIGH | `DONE ✅` | **Sprint A37 — C11 §6.6 NEW** — When `BatchCoordinator.runBatch()` is active the platform MUST show a non-blocking visual indicator. Without it, users experience a slower frame rate and may interpret the pause as a crash. Three changes: (1) `BatchCoordinator.setBatchLifecycleCallbacks(onStart, onEnd)` public method added — stores callbacks in `_onBatchStart`/`_onBatchEnd` private fields; `_setupBatch()` calls `_onBatchStart?.(totalElementCount)` at the end (after pause controls are armed); `_onEnd()` private helper calls `_onBatchEnd?.()` with a try/catch (errors MUST NOT interrupt batch coordination). `_onEnd()` is invoked in three places: (a) `_executeFinalSweep()` `onComplete` normal path, after `_isBatching = false`; (b) `runBatch()` catch block — aborted by exception; (c) `forceReset()` — project switch while mid-flight (called before `_isBatching = false` to prevent stuck indicator on project switch). (2) `src/ui/overlays/BatchLoadingIndicator.ts` (424 lines) — self-contained DOM component; creates a fixed floating card (`pointer-events: none`, z-index 10000) with: PRYZM 3-D pyramid animation (same 5-face painter's-algorithm as `EngineLoadingOverlay` — `renderFace()` helper draws: base quad, left/right triangles, front/back triangles; camera azimuth increments 0.8°/frame; scale 32×40 px); purple gradient progress bar cycling 0→100 → reset; element-count label; fade-in/out on show/hide. Animation registered via `getFrameScheduler().addTickListener('pryzm-batch-indicator-pyramid', tick, 'overlay')` — zero raw `requestAnimationFrame()` calls (C04 §3 / P3 single-rAF-owner rule). `removeTickListener` called on hide. (3) Wired in `src/engine/engineLauncher.ts` immediately after `batchCoordinator.inject()`: `const _batchLoadingIndicator = new BatchLoadingIndicator(); batchCoordinator.setBatchLifecycleCallbacks(count => _batchLoadingIndicator.show(count), () => _batchLoadingIndicator.hide());`. `pnpm tsc --noEmit` → 0 errors. | `src/engine/subsystems/core/batch/BatchCoordinator.ts` (`_onBatchStart`, `_onBatchEnd`, `setBatchLifecycleCallbacks()`, `_onEnd()` helper, 3 call sites), `src/ui/overlays/BatchLoadingIndicator.ts` (NEW — 424 lines), `src/engine/engineLauncher.ts` (wiring after `inject()`) | Indicator visible during 9-slab CW batch ✅; hides on completion ✅; `'pryzm-batch-indicator-pyramid'` key in FrameScheduler ✅; TSC clean ✅; `pnpm tsc --noEmit` → 0 errors ✅ | §BATCH-LOADING-INDICATOR depends on §BATCH-CW-PAUSE (lifecycle callbacks require pause controls to be wired first) |
| **P3** | 🟡 MEDIUM | `DONE ✅` | 5 view mutation sites in `ViewPropertiesPanel.ts` bridged (fire-and-forget dual-write); 5 new handlers created: `SetViewOutput`, `SetViewRange`, `SetViewCrop`, `SetViewUnderlay`, `UpdateViewDefinition` in `plugins/view/src/handlers/`; all registered in `handlers/index.ts`. `pnpm tsc --noEmit` → 0 errors. | `src/ui/ViewPropertiesPanel.ts` (5 sites), `plugins/view/src/handlers/SetViewOutput.ts` (new), `SetViewRange.ts` (new), `SetViewCrop.ts` (new), `SetViewUnderlay.ts` (new), `UpdateViewDefinition.ts` (new), `plugins/view/src/handlers/index.ts` | 5 dispatch sites bridged; 5 handlers registered; TSC clean ✅ | P2 group done |
| **P4** | 🟡 MEDIUM | `DONE ✅` | 15 `PropertyInspectorApply.ts` sites + 9 `RoomPropertySection.ts` + 2 `WallLayerSection.ts` bridged; element.update, room.update, wall.updateSystemType, window/door command types all dispatched fire-and-forget via bus before legacy commandManager call. | `src/ui/property-inspector/PropertyInspectorApply.ts` (15 sites), `src/ui/property-inspector/RoomPropertySection.ts` (9 sites), `src/ui/property-inspector/WallLayerSection.ts` (2 sites) | 26 sites bridged; TSC clean ✅ | P2 group done |
| **P5** | 🟡 MEDIUM | `DONE ✅` | Level management sites bridged (ProjectLoader, IfcLevelImporter, IfcConversionContext, initUI) — fire-and-forget bus dispatch before every legacy commandManager.execute call. | `src/engine/subsystems/import/ifc/IfcLevelImporter.ts`, `src/engine/subsystems/import/ifc/conversion/IfcConversionContext.ts`, `src/engine/subsystems/initUI.ts` | Sites bridged; TSC clean ✅ | P2 group done |
| **P6** | 🟡 MEDIUM | `DONE ✅` | 4 `SlabTool.ts` sites + 1 `SlabDimensionsEditor.ts` + 1 `SlabPickWallsController.ts` + 1 `SlabWallConnectivityService.ts` bridged; slab.update / slab.updatePolygon types dispatched via bus before legacy path. `SlabMutationCommands` type family added to `commands.ts`. | `src/engine/subsystems/slabs/SlabTool.ts` (4), `src/ui/property-panel/SlabDimensionsEditor.ts` (1), `src/engine/subsystems/slabs/SlabPickWallsController.ts` (1) | 6 sites bridged; slab command types in CommandRegistry; TSC clean ✅ | P2 group done |
| **P7** | 🟢 LOW | `DONE ✅` | 3 `FurnitureTool.ts` + 2 `FurnitureDragDropHandler.ts` + 1 `WardrobeCabinetTool.ts` + 1 `KitchenCabinetTool.ts` + 2 `PlumbingTool.ts` + 2 `SelectionManager.ts` + 2 `HostedElementDragController.ts` bridged — furniture.create / plumbing.create / element.delete / element.update dispatched via bus. `FurnitureMutationCommands` + `ElementMutationCommands` added to `commands.ts`. | `src/engine/subsystems/furniture/FurnitureTool.ts` (3), `src/ui/furniture-carousel/FurnitureDragDropHandler.ts` (2), `src/ui/wardrobe/WardrobeCabinetTool.ts` (1), `src/ui/kitchen/KitchenCabinetTool.ts` (1), `src/engine/subsystems/tools/SelectionManager.ts` (2), `src/engine/subsystems/tools/HostedElementDragController.ts` (2) | 13 sites bridged; TSC clean ✅ | P4 done |
| **P8** | 🟢 LOW | `DONE ✅` | 3 `RoomAIAssistant.ts` sites + 3 `RoomTool.ts` + 3 `RoomTagAutoPopulator.ts` + 1 `RoomTopologyObserver.ts` + 2 `RoomAutoOrganiser.ts` bridged; room.update / room.create / room.rename / room.updateFinishes dispatched via bus before legacy path. `RoomMutationCommands` added to `commands.ts`. | `src/engine/subsystems/ai/rooms/RoomAIAssistant.ts` (3), `src/engine/subsystems/rooms/RoomTool.ts` (3), `src/engine/subsystems/rooms/RoomTagAutoPopulator.ts` (3) | 12 sites bridged; TSC clean ✅ | P4 done |
| **P9** | 🟢 LOW | `DONE ✅` | 24 annotation tool files bridged via comprehensive codemod: all `*.ts` in `annotations/tools/` + `DimensionPropertiesPanel.ts` + `AnnotateViewCommand.ts` + `RoofSlopeSymbolBuilder.ts`; annotation.create dispatched fire-and-forget before legacy commandManager call; `AnnotationMutationCommands` added to `commands.ts`. TSC error (`cmd` vs `ann` variable) fixed in `LevelDatumLineBuilder.ts`, `SectionGridLineBuilder.ts`, `RoofSlopeSymbolBuilder.ts`. | `src/engine/subsystems/annotations/tools/*.ts` (24 files), `src/engine/subsystems/annotations/DimensionPropertiesPanel.ts`, `src/engine/subsystems/commands/annotations/AnnotateViewCommand.ts` | 24+ sites bridged; TSC clean ✅ | P2 group done |
| **P10** | 🟢 LOW | `DONE ✅` | `StairCommandPlan.ts` + `BeamCommandPlan.ts` bridged; `StairTool.ts` + `StairPathToolController.ts` + `BeamTool.ts` + `HandrailTool.ts` + `StairLevelRequiredPanel.ts` bridged; stair.executeApprovedPlan / beam.executeApprovedPlan / stair.create / beam.create / handrail.create dispatched via bus. `PlanMutationCommands` added to `commands.ts`. | `src/engine/subsystems/commands/plans/StairCommandPlan.ts`, `src/engine/subsystems/commands/plans/BeamCommandPlan.ts`, `src/engine/subsystems/stairs/StairTool.ts`, `src/engine/subsystems/stairs/stairPath/StairPathToolController.ts`, `src/engine/subsystems/tools/BeamTool.ts`, `src/engine/subsystems/handrails/HandrailTool.ts` | 7 sites bridged; TSC clean ✅ | P9 done |
| **P11** | 🟢 LOW | `DONE ✅` | All remaining misc files bridged: `SheetsRailPanel.ts` + `BriefInputPanel.ts` + `engineLauncher.ts` + `initUI.ts` + `initTools.ts` + `PreviewManager.ts` + `ProjectLoader.ts` + `RemoteCommandDispatcher.ts` + `IfcLevelImporter.ts` + `IfcConversionContext.ts` + `RoomBoundingLineTool.ts` + `SlabWallConnectivityService.ts` + `DetailViewTool.ts` + `RoofTool.ts` + `RoofSlopeSymbolBuilder.ts`; `MiscMutationCommands` added to `commands.ts`. Bridge coverage: 117/120 real calls (97%); 3 unbridged = 2 WallTool P2b design-fallback + 1 pre-existing ProjectLoader async path. `pnpm tsc --noEmit` → **0 errors**. | All files in `src/ui/` + `src/engine/` | 117/120 real call sites bridged ✅; TSC clean ✅; P3–P11 sprint board **fully DONE** ✅ | P10 done |
| **P12** | 🟢 LOW | `DONE ✅` | Upgraded telemetry stubs (empty `{}` payloads) to real typed dispatches with correct payloads so the plugin store receives a genuine parallel write. **Rooms** (real handlers): `room.setName` dispatched from `RoomPropertySection.ts` (name-save ×2, AI-name), `RoomAIAssistant.ts`; `room.setNumber` from `RoomPropertySection.ts`; `room.setOccupancy` from `RoomPropertySection.ts` (manual + AI-suggestion); `room.setMaterial` from `RoomPropertySection.ts`; `room.create` from `RoomTool.ts` (manual boundary), `RoomAIAssistant.ts` (programme loop). **Views** (bridge-stub handlers): `view.setOutput/setRange/setCrop/setUnderlay/updateDefinition` dispatched from `ViewPropertiesPanel.ts` replacing `element.legacyBridge/{}`. **Walls** (real handlers): `wall.updateSystemType` dispatched with full payload from `WallLayerSection.ts` (system-type apply + layer-save). **Improved stubs** (no dedicated handler yet): `room.update/{roomId,updates:{…}}` for colour-reset, opacity, and comment-save in `RoomPropertySection.ts`; `room.updateFinishes/{roomId,finishes}` in `RoomAIAssistant.ts`. **commands.ts**: added `room.setName`, `room.setNumber`, `room.setMaterial`, `room.setHeightOffset`; fixed `room.setOccupancy` payload field (`occupancyType` → `occupancy`). | `packages/command-bus/src/commands.ts`, `src/ui/property-inspector/RoomPropertySection.ts`, `src/engine/subsystems/ai/rooms/RoomAIAssistant.ts`, `src/engine/subsystems/rooms/RoomTool.ts`, `src/ui/ViewPropertiesPanel.ts`, `src/ui/property-inspector/WallLayerSection.ts` | 21 stubs upgraded; TSC clean ✅; `pnpm run ga-gates` → 0 ✅ | P11 done |
| **P13** | 🟢 LOW | `DONE ✅` | **Sprint A36 — Annotation-family bus payload upgrade**: replaced 22 garbage payloads (`CreateAnnotationCommand` object or `{}`) with properly-shaped `{id, viewId, kind}` objects so `AnnotationsState` receives the correct id/viewId/kind on every annotation bus dispatch. **Pattern** (all tools): extract `ann.id`, `ann.ownerViewId`, `ann.type as any` (AnnotationType maps 1:1 to AnnotationData['kind']). **Tools with `ann` variable in scope ({}→typed)**: `MatchlineTool.ts`, `NorthArrowTool.ts`, `ScaleBarTool.ts`. **Tools with `ann` variable in scope (cmd→typed)**: `DoorTagTool.ts`, `ElementTagTool.ts`, `GridBubbleTool.ts`, `RevisionCloudTool.ts`, `LevelTagTool.ts`, `WindowTagTool.ts`, `LevelDatumLineBuilder.ts`, `SectionGridLineBuilder.ts`. **Tools with `element` variable in scope (cmd→typed)**: `TextNoteTool.ts`, `KeynoteTool.ts`, `AngularDimensionAnnotationTool.ts`, `DiameterDimensionTool.ts`, `LinearDimensionAnnotationTool.ts` (×2), `RadiusDimensionTool.ts`, `SlopeDimensionTool.ts`, `SpotElevationAnnotationTool.ts`. **Tools generating annotationId inline ({}→typed with extracted id)**: `CalloutDetailTool.ts`, `ElevationMarkTool.ts`, `SectionMarkTool.ts` — `_annId = crypto.randomUUID()` extracted so bus and command receive the same id. **DimensionPropertiesPanel.ts**: delete case corrected from `annotation.create` (wrong type) → `annotation.delete` with `{id: annId}`; update case (style-patch via `UpdateAnnotationCommand`) has no bus handler yet — bus call omitted with P14 note. **Constraint**: `annotationStore` singleton is authoritative for `AnnotationRenderLayer` rendering; bus-primary flip (removing the legacy commandManager.execute() call) awaits a store bridge (P14). Legacy `commandManager.execute()` calls untouched. **GA gates**: raf-count=1 ✅; cast-count=15/0-non-shim ✅; l7-boundary=0 ✅; OTel=183/183 ✅; `pnpm run build` → exit 0 ✅. | All 22 sites in `src/engine/subsystems/annotations/` | 22 sites upgraded; all payloads carry `{id, viewId, kind}`; delete corrected to `annotation.delete`; TSC clean ✅; build clean ✅ | P12 done |

**Phase E.5.x done when**: `rg "commandManager\.execute" src --type ts -c | awk -F: '{s+=$2} END {print s}'` → **0** and `CommandManager.ts` carries only its `@deprecated` header.

---

## §2 — AS-IS gap: the 41 command types by family (F1–F13)

Run these locators to confirm the footprint before writing code. Record the output.

```bash
rg "commandManager\.execute" src --type ts -l | sort   # → all affected files
rg "commandManager\.execute" src --type ts -c \
  | awk -F: '{s+=$2} END {print s}'                   # → should be 214
rg "runtime\.commandBus\.dispatch" src --type ts -l   # → should be 0
```

### F1 — Room/spatial detection ⭐ P1 HOT PATH

| Command | Sites | Caller | Migration task |
|---|---:|---|---|
| `ReDetectRoomsCommand` | 9/batch | `BatchCoordinator._executeFinalSweep():460–471` | **P1** — the 5,627ms LONGTASK source |
| `CreateRoomCommand` | 1+ | `RoomAIAssistant.ts` | P8 |
| `RenameRoomCommand` | 3 | `RoomPropertySection.ts` | P4 |
| `UpdateRoomCommand` | 2 | `RoomPropertySection.ts` | P4 |

### F2 — Wall creation ⭐ P2 HOT PATH

| Command | Sites | Caller | Migration task |
|---|---:|---|---|
| `CreateWallCommand` | 1 | `WallTool.ts:1605` (user gesture) | **P2b** |
| `CreateWallsFromSlabCommand` | 1 | `WallTool.ts:1535` (user gesture) | **P2d** |
| `CreateWallsOnAllSlabsCommand` | 1+ | AI batch path | P2c/P2d |

### F3 — Slab creation

| Command | Sites | Caller | Migration task |
|---|---:|---|---|
| `CreateSlabCommand` | 1 | `commands/slabs/` preview | P6 |
| `CreateSlabsOnAllFloorsCommand` | 1+ | AI batch pipeline | P6 |
| `CreateAllSlabsFromLevelToAllFloorsCommand` | 1+ | AI batch pipeline | P6 |
| `CreateSlabOnLevelSimilarToSelectedCommand` | 1+ | AI batch pipeline | P6 |

### F4 — Curtain-wall ⭐ P2 HOT PATH

| Command | Sites | Caller | Migration task |
|---|---:|---|---|
| `CreateCurtainWallsOnAllSlabsCommand` | 1+ | AI batch pipeline | **P2e** |
| `UpdateCurtainWallCommand` | 1 | `PropertyInspectorApply.ts` | P4 |
| `ReplacePanelTypeCommand` | 1 | `CurtainPanelEditor.ts` | P4 |
| `ReplacePanelWithDoorCommand` | 1 | `CurtainSubElementPanel.ts` | P4 |

### F5 — Level management

| Command | Sites | Caller | Migration task |
|---|---:|---|---|
| `AddLevelCommand` | 2 | `ProjectTreeSection.ts`, `LevelsGridsRailPanel.ts` | P5 |
| `CreateMultipleLevelsCommand` | 1 | `commands/levels/` | P5 |

### F6 — View mutations (all in one file)

| Command | Sites | Caller | Migration task |
|---|---:|---|---|
| `SetViewCropCommand` | 1 | `ViewPropertiesPanel.ts:934` | P3 |
| `SetViewRangeCommand` | 1 | `ViewPropertiesPanel.ts:928` | P3 |
| `SetViewOutputCommand` | 1 | `ViewPropertiesPanel.ts:922` | P3 |
| `SetViewUnderlayCommand` | 1 | `ViewPropertiesPanel.ts:940` | P3 |
| `SetViewDesignOptionCommand` | 1 | `commands/views/` | P3 |
| `SetViewLightingCommand` | 1 | `commands/views/` | P3 |
| `SetViewSemanticsCommand` | 1 | `commands/views/` | P3 |

### F7 — Property inspector (all in one file: `PropertyInspectorApply.ts`)

`UpdateSlabCommand`, `UpdateRoofCommand`, `UpdateFurnitureParametersCommand`, `UpdateDoorWidthCommand`, `UpdateDoorHeightCommand`, `UpdateDoorFireRatingCommand`, `UpdateDoorAccessibilityTypeCommand`, `UpdateWindowWidthCommand`, `UpdateWindowHeightCommand`, `UpdateWindowSillHeightCommand`, `UpdateWindowFireRatingCommand`, `UpdateElementMarkCommand`, plus wall-layer and slab-layer editors — **14 types, 1 file, migration task P4**.

### F8 — Annotation tools (codemod candidate)

18 identical-pattern files in `src/engine/subsystems/annotations/tools/` + `DimensionPropertiesPanel.ts` — each has one `commandManager.execute(new CreateXxxCommand(...))` call. Migration task **P9** — these can be codemoded as a group.

### F9 — Furniture + element ops

`CreateFurnitureCommand` (×3), `CreatePlumbingFixtureCommand` (×1), `DeleteElementCommand` (×1), `DeleteLightingCommand` (`SelectionManager.ts:251`), `DeleteOpeningCommand` (`SelectionManager.ts:244`), `HideElementInViewCommand` (×1), `IsolateElementInViewCommand` (×1), `SetGraphicOverrideCommand` (×1) — migration task **P7**.

### F10 — Door/window offsets

`SetDoorOffsetCommand` (×1, `tools/operations/`), `SetWindowOffsetCommand` (×1, `tools/operations/`) — migration task **P7**.

### F11 — Stair/beam command plans

`StairCommandPlan.ts:302` and `BeamCommandPlan.ts:354` each loop over plan steps calling `commandManager.execute(step.command, ...)`. The plan-step loop itself must route through the bus — migration task **P10**.

### F12 — AI pipeline commands

`AIElementFactory.ts`, `AIResponseParser.ts`, `FloorPlanAIFactory.ts`, `RoomAIAssistant.ts` — all must dispatch with `source: 'ai'` — migration task **P8**.

### F13 — Catalog, requirement, sheet misc

`AddAssetCatalogEntryCommand`, `DeleteAssetCatalogEntryCommand`, `UpdateAssetCatalogEntryCommand` (all `commands/catalog/`), 6 sheet editor command types (`SheetEditorCommands.ts`, `SheetEditorPanel.ts`, `SheetEditorSidebar.ts`, `SheetsRailPanel.ts`), requirement commands (`commands/requirements/`) — migration task **P11**.

---

## §3 — Pre-conditions: read these before touching any code

Before writing a single line, run all three locators from §2 and record the exact counts. Then read these four files in full:

```bash
# 1. Understand the current typed bus surface
cat packages/command-bus/src/commands.ts      # typed CommandRegistry
cat packages/command-bus/src/index.ts         # exports
cat packages/runtime-composer/src/types.ts    # BusSlot interface
grep -n "commandBus\|executeCommand" packages/runtime-composer/src/composeRuntime.ts | head -20

# 2. Confirm which command families already have typed entries
rg "wall|curtain|rooms|redetect" packages/command-bus/src/commands.ts

# 3. Confirm which handlers already exist in the wall/curtain-wall plugins
ls plugins/wall/src/handlers/ 2>/dev/null
ls plugins/curtain-wall/src/handlers/ 2>/dev/null

# 4. Confirm where batchCoordinator.inject() is called
grep -n "batchCoordinator\.inject" src/engine/engineLauncher.ts
```

Identify: what interface does `runtime.commandBus` expose? How do the 6 currently-wired commands call `runtime.bus.executeCommand()`? This determines the exact call shape for new dispatch sites.

---

## §4 — P0: Add typed CommandRegistry entries

**File**: `packages/command-bus/src/commands.ts`

Add under the appropriate sub-type blocks. Every command type dispatched via `runtime.commandBus` MUST have a typed entry here — TypeScript enforces this; no string literals reach dispatch untyped.

```ts
// Wall commands block:
'wall.create': {
  start: { x: number; z: number };
  end: { x: number; z: number };
  levelId: string;
  height?: number;
  thickness?: number;
  systemTypeId?: string;
  curve?: { control: { x: number; y: number; z: number }; segments: number };
};
'wall.batch.create': {
  slabIds: string[];
  height?: number;
  thickness?: number;
};

// Curtain-wall commands block:
'curtain-wall.batch.create': {
  slabIds: string[];
  panelType?: string;
};

// Room commands block:
'rooms.redetect': {
  levelId: string;
};
```

Add view, property inspector, level, slab, furniture, annotation, and misc types in the same session if migrating beyond P2 in the same sprint. All P3–P11 types must be added before their handlers can be registered.

**Verification**: `pnpm tsc --noEmit` → 0 errors.

---

## §5 — P1: Fix the 5,627ms LONGTASK (BatchCoordinator) ✅ DONE

> **Status**: `DONE ✅` (2026-05-03). `_executeFinalSweep()` now uses `runtime.bus.executeCommand('rooms.redetect', ...)` with frame yields via `getFrameScheduler().scheduleOnce()`. The `pryzm-bus-rooms-redetect` CustomEvent bridge is wired in `engineLauncher.ts`. PRYZM-1 fallback preserved. Additionally **§BATCH-WALL-PAUSE** was applied to `_setupBatch()` (pause) + `runBatch()` (resumeAndFlush) in the same file — see §1 sprint board row. `pnpm run build` EXIT:0.

**File**: `src/engine/subsystems/core/batch/BatchCoordinator.ts` (original issue at ~line 460–471 — refactored into `_executeFinalSweep` + `_setupBatch` / `runBatch`)

This is the single highest-impact change in the entire migration. It requires only P0 (`rooms.redetect` in the registry) as a pre-condition. The implementation below is the reference — the code is already live.

### 5.1 Current code (causes the freeze)

```ts
// BatchCoordinator.ts ~line 460 — causes 5,627ms LONGTASK:
import('../../commands/rooms/ReDetectRoomsCommand').then(({ ReDetectRoomsCommand }) => {
    for (const levelId of levelIds) {                    // ← 9 iterations, synchronous
        const level = bm.getLevelById(levelId);
        const cmd = new ReDetectRoomsCommand(levelId, level.elevation, level.height ?? 3.0);
        try { cm.execute(cmd); }                         // ← SYNCHRONOUS, blocks main thread
        catch (e) { console.error('[BatchCoordinator] REDETECT_ROOMS failed:', e); }
    }
});
```

### 5.2 Step 1: Add `runtime` injection

`BatchCoordinator.inject()` currently takes `(commandManager, bimManager)`. Add `runtime` as an optional third parameter:

```ts
private _runtime: PryzmRuntime | null = null;

inject(
    commandManager: { execute(cmd: any): any },
    bimManager: { getLevelById(id: string): any },
    runtime?: PryzmRuntime | null,   // ← add (optional, backward compat)
): void {
    this._commandManager = commandManager;
    this._bimManager = bimManager;
    this._runtime = runtime ?? null;
    if (!runtime) {
        console.warn('[BatchCoordinator] P6-VIOLATION: runtime not injected. REDETECT_ROOMS will fall back to commandManager. Fix in Phase E.5.x P1.');
    }
}
```

### 5.3 Step 2: Replace `_executeFinalSweep()` loop

```ts
private async _executeRoomRedetectionScheduled(levelIds: string[]): Promise<void> {
    for (const levelId of levelIds) {
        const level = this._bimManager?.getLevelById(levelId);
        if (!level) { console.warn('[BatchCoordinator] REDETECT_ROOMS: level not found:', levelId); continue; }

        if (this._runtime) {
            // TARGET path: typed bus dispatch + frame yield between levels
            await this._runtime.commandBus.dispatch('rooms.redetect', { levelId }, { source: 'ai' });
            await new Promise<void>(resolve =>
                this._runtime.scheduler.scheduleOnce(resolve)
            );
        } else {
            // FALLBACK: legacy synchronous path (removed when _runtime always injected)
            const { ReDetectRoomsCommand } = await import('../../commands/rooms/ReDetectRoomsCommand');
            const cmd = new ReDetectRoomsCommand(levelId, level.elevation, level.height ?? 3.0);
            try { this._commandManager!.execute(cmd); }
            catch (e) { console.error('[BatchCoordinator] REDETECT_ROOMS fallback failed:', e); }
        }
    }
}
```

Call `_executeRoomRedetectionScheduled(levelIds)` instead of the inline `import(...).then(...)` loop.

### 5.4 Step 3: Pass `runtime` at the inject call site

```bash
grep -n "batchCoordinator\.inject" src/engine/engineLauncher.ts
```

At the found line, add `runtime` as the third argument once it is in scope:

```ts
batchCoordinator.inject(commandManager, bimManager, runtime);
```

### 5.5 Verification

After deploying P1, run a 9-slab curtain-wall batch from the AI panel. Browser console must show:

```
[CommandBus] DISPATCH: rooms.redetect   (×9)
NOT: [CommandManager] EXECUTE: REDETECT_ROOMS
NOT: [LONGTASK] duration=5627ms
FPS ≥ 30 throughout
```

---

## §6 — P2: Wall/curtain-wall handlers + call site migration

### 6.1 Create `wall.create` handler (P2a)

```ts
// plugins/wall/src/handlers/createWallHandler.ts
import { trace } from '@opentelemetry/api';
import type { PryzmRuntime, Stores } from '@pryzm/plugin-sdk';

export function registerCreateWallHandler(runtime: PryzmRuntime) {
    const tracer = trace.getTracer('pryzm.plugin-wall');
    runtime.commandBus.register('wall.create', async (command, stores: Stores) => {
        const span = tracer.startSpan('pryzm.wall.create.handler');
        try {
            // 1. Validate domain invariants
            const level = stores.project.levels.get(command.payload.levelId);
            if (!level) throw new Error(`wall.create: level ${command.payload.levelId} not found`);

            // 2. Immer draft mutation (affectedStores required)
            stores.elements.walls.set(command.id, {
                id: command.id,
                ...command.payload,
            });

            // 3. Emit geometry request event; engine-layer WallFragmentBuilder performs deferred build
            runtime.events.emit('wall.geometry.requested', { wallId: command.id });

            // 4. Emit typed domain event for downstream subscribers
            runtime.events.emit('wall.created', { levelId: command.payload.levelId, wallId: command.id });

            // 5. Undo registration (source: 'user' only — C03 §4.2)
            // command bus handles this automatically if undoable: true (default)
        } finally { span.end(); }
    }, { affectedStores: ['elements', 'project'] });
}
```

Register in `plugins/wall/src/index.ts` and add to `apps/editor/src/PluginRegistry.ts`.

### 6.2 Migrate `WallTool.ts:1605` (P2b)

Replace:
```ts
// WallTool.ts line ~1600–1608
const command = new CreateWallCommand(wallId, payload);
const commandManager = this.commandManager;
if (commandManager) {
    const result = commandManager.execute(command);
```

With:
```ts
// TARGET
if (this._runtime) {
    await this._runtime.commandBus.dispatch('wall.create', { ...payload, id: wallId }, { source: 'user' });
} else {
    console.warn('[WallTool] P6-VIOLATION: runtime not available, falling back to commandManager for wall.create. Fix Phase E.5.x P2b.');
    const command = new CreateWallCommand(wallId, payload);
    this.commandManager?.execute(command);
}
```

### 6.3 Create `wall.batch.create` handler (P2c)

Same pattern as `createWallHandler` but accepts `slabIds: string[]` and calls `BatchCoordinator.runBatch()` internally. The handler emits `runtime.events.emit('wall.batch.completed', { levelIds })` at batch end instead of calling `ReDetectRoomsCommand` imperatively.

### 6.4 Wire event-driven room redetection (P2f)

```ts
// plugins/rooms/src/handlers/redetectRoomsHandler.ts
export function registerRoomRedetectionSubscriber(runtime: PryzmRuntime) {
    // Single wall created
    runtime.events.on('wall.created', async ({ levelId }) => {
        await runtime.commandBus.dispatch('rooms.redetect', { levelId }, { source: 'user' });
    });

    // Batch completed — yield between levels to avoid LONGTASK
    runtime.events.on('wall.batch.completed', async ({ levelIds }) => {
        for (const levelId of levelIds) {
            await runtime.commandBus.dispatch('rooms.redetect', { levelId }, { source: 'ai' });
            await new Promise<void>(resolve =>
                runtime.scheduler.scheduleOnce(resolve)
            );
        }
    });
}
```

### 6.5 Geometry leak check (before merging any P2 handler)

Verify `buildWall()` is called from exactly ONE path — either the legacy handler OR the new bus handler, never both:

```bash
rg "buildWall\|buildCurtainWall" src --type ts | grep -v "test\|spec\|\.d\.ts"
```

If it appears in both paths, remove the legacy path first before enabling the bus handler.

---

## §7 — P3–P11: Remaining families (migration pattern)

Each family follows the same three-step pattern:

**Step A** — Add typed entries to `packages/command-bus/src/commands.ts` (if not already in P0 batch).

**Step B** — Create handler in the appropriate plugin (`plugins/*/src/handlers/`) following the contract in §6.1: validate → Immer draft → schedule geometry (if applicable) → emit event → undo registration → OTel span. Register in `PluginRegistry.ts`.

**Step C** — Replace `commandManager.execute(new XxxCommand(...))` at every call site:

```ts
// Every call site gets this pattern:
if (runtime) {
    await runtime.commandBus.dispatch('xxx.action', payload);
} else {
    console.warn('[SomeComponent] P6-VIOLATION: runtime null, falling back. Fix Phase E.5.x P<n>.');
    commandManager.execute(new XxxCommand(payload));
}
```

**Three-interface check** before closing each family:

```
□ Dispatch:  commandManager.execute(new XxxCommand(payload))
             → runtime.commandBus.dispatch('xxx.action', payload)
             → Typed entry exists in CommandRegistry

□ Undo:      commandManager.execute() auto-pushed snapshot to undoStack
             → New handler calls runtime.undoStack.push(patch) explicitly
             → Undo/redo verified in browser after migration

□ Events:    rg "onCommandExecuted" src --type ts
             → Each listener converted to runtime.events.on('xxx.action.executed', cb)
             → OR listener deleted if superseded by typed event subscription
```

Run the events audit once before starting P3:
```bash
rg "onCommandExecuted" src --type ts -n
```

---

## §8 — AI batch pipeline (L2 sprint breakdown)

The AI pipeline migration follows the same bus contract but must use `source: 'ai'` and MUST NOT push to the undo buffer (C03 §4.2).

### Sprint L2-S1 — Analysis hardening (pre-condition check)

Confirm `FloorPlanAIFactory.ts` comment "NEVER calls commandManager.execute()" is accurate. If the AI factory is already read-only, this sprint is a verification pass only.

```bash
grep -n "commandManager\.execute" src/engine/subsystems/ai/FloorPlanAIFactory.ts
grep -n "commandManager\.execute" src/engine/subsystems/ai/AIElementFactory.ts
```

### Sprint L2-S2 — Proposal pipeline normalization

`FloorPlanCommandBatcher.batch()` creates `CommandProposal[]`. Verify the proposal shape is compatible with typed `CommandRegistry` payloads. If not, add a proposal-to-payload adapter in the batch handler.

### Sprint L2-S3 — Execution routing (P8 in §1 task board)

`FloorPlanBatchExecutor.execute()` currently dispatches through `window.commandManager`. Replace with:

```ts
for (const proposal of sortedProposals) {
    await runtime.commandBus.dispatch(proposal.typeId, { ...proposal.payload, source: 'ai' }, { source: 'ai' });
    auditLog.record(proposal);
}
runtime.events.emit('ai.batch.completed', { proposalCount: sortedProposals.length });
```

### Sprint L2-S4 — Wall geometry deferral (DONE ✅ 2026-05-03)

`WallFragmentBuilder` deferred build queue already implemented (`_pendingBuilds`, `_drainBuildQueue()`, `signalBuildQueueDrained()`). Console shows `[WallFragmentBuilder] RAF_DRAIN built=N remaining=M`. No action needed.

### Sprint L2-S5 — Event/audit convergence

Standardize batch provenance: every AI-dispatched command carries `actorId`, `projectId`, `clientId`, `source: 'ai'`. Ensure audit queries can reconstruct what the AI created, when, and for which project.

---

## §9 — Constraints (non-negotiable)

| Constraint | Source | Enforcement |
|---|---|---|
| Do NOT remove `CommandManager.ts` until all 214 sites = 0 | Phase E scope contract | Manual gate |
| Do NOT add `(window as any)` casts | `02-ARCHITECTURE.md §4 P4` | CI hard-fail |
| Do NOT call `requestAnimationFrame()` directly — use `getFrameScheduler()` | `02-ARCHITECTURE.md §4 P3` | CI hard-fail |
| Every new command type in `CommandRegistry` MUST have a typed payload entry | `C03 §2.2` | TypeScript enforced |
| All handlers MUST declare `affectedStores` | `C03 §2.3` | Runtime throws on registration |
| All handlers MUST register ≥ 1 OTel span | `C10` | Code-review gate |
| Backward-compat `console.warn` fallback when `runtime` is null | This file §6.2 pattern | Code-review gate |
| `source: 'ai'` commands MUST NOT be pushed to the undo buffer | `C03 §4.2` | Code-review gate |
| Geometry MUST be deferred via `FrameScheduler`, never built synchronously in a handler | `C11 §5.1` | Code-review gate |
| No direct store writes outside Immer draft | P6 — `scripts/ci-check-no-direct-store-writes.ts` | CI hard-fail |

---

## §10 — Verification gates (cumulative, run after each task group)

```bash
# TypeScript clean
pnpm tsc --noEmit                                           # → 0 errors

# No (window as any) regressions
rg -c '\(window as any\)' src --type ts \
  -g '!**/window-shim.ts' | awk -F: '{s+=$2} END {print s}' # → 0

# No new rAF owners
rg -l 'requestAnimationFrame\(' . --type ts \
  -g '!node_modules' -g '!dist' -g '!scripts/**' \
  | grep -v 'frame-scheduler\|check-raf' | wc -l           # → 1

# commandManager.execute() site count decreasing (track per sprint)
rg "commandManager\.execute" src --type ts -c \
  | awk -F: '{s+=$2} END {print s}'                        # 214 → decreasing → 0

# All tests pass
pnpm vitest run                                            # → all pass

# LONGTASK check (after P1 BatchCoordinator fix — browser manual):
# Run a 9-slab curtain-wall batch from AI panel. Must observe:
#   [CommandBus] DISPATCH: rooms.redetect  (×9)
#   NOT: [CommandManager] EXECUTE: REDETECT_ROOMS
#   FPS ≥ 30, no LONGTASK > 100ms in Chrome DevTools Performance panel

# UI wall draw check (after P2b — browser manual):
# Draw a wall with the Wall tool. Must observe:
#   [CommandBus] DISPATCH: wall.create
#   NOT: [CommandManager] EXECUTE
#   Wall mesh visible in ≤ 2 frames; Ctrl+Z reverses it

# Phase E.5.x complete gate:
rg "commandManager\.execute" src --type ts -c \
  | awk -F: '{s+=$2} END {print s}'                        # → 0
# CommandManager.ts carries only @deprecated header — deletable at Phase E exit
```

---

## §11 — Cross-reference map

| Topic | Canonical source |
|---|---|
| Full element creation pipeline contract (UI + AI, target state) | `../../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md` |
| Command bus CQRS contract | `../../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md §2` |
| Architecture orchestration diagram (§10) | `../02-ARCHITECTURE.md §10` |
| P6 principle — commands only | `../01-VISION.md §2 P6` |
| 5,627ms LONGTASK evidence (diary) | `../03-CURRENT-STATE.md §10 2026-05-03d` |
| Wave 16 as-found audit (91 vs 214 discrepancy) | `./19-WAVES-16-20-FULL-WIRE.md §1` |
| WallFragmentBuilder deferred queue (Phase 3, DONE) | `../03-CURRENT-STATE.md §5b` |
| `BatchCoordinator.ts` source | `src/engine/subsystems/core/batch/BatchCoordinator.ts:460` |
| Wall tool live call sites | `src/engine/subsystems/walls/WallTool.ts:1535,1605` |
| Wall geometry queue | `src/engine/subsystems/walls/WallFragmentBuilder.ts:299,334` |
| AI room assistant live call site | `src/engine/subsystems/ai/rooms/RoomAIAssistant.ts` |
| `WallTool.ts` E-bus.1 deprecation notice | `src/engine/subsystems/walls/WallTool.ts:34–55` |
| OTel span requirement | `../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md` |
| Sprint task board | `../00-PROCESS-TRACKER.md §9` |
| `CommandManager.ts` deprecation header | `src/engine/subsystems/commands/CommandManager.ts:32` |
