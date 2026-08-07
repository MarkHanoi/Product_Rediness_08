# C13 — Project Lifecycle and Isolation

> **Stamp**: 2026-05-04 · **Status**: CANONICAL  
> **Scope**: The complete lifecycle of a PRYZM project session — open, active, close, switch — and the isolation invariants that prevent per-project state from leaking across project boundaries.  
> **Key principles**: P1 (single composition root), P3 (single rAF), P6 (commands are the only mutation path).  
> **Authority**: When code disagrees with this contract, the code is wrong. This contract supersedes any implicit lifecycle assumptions in `engineLauncher.ts`, `BatchCoordinator.ts`, or `composeRuntime.ts`.  
> **Companion contracts**: C03 (CQRS / undo), C04 (rendering and scheduling), C11 (element creation pipeline).  
> **Gap notice**: §6 documents where today's code violates this contract. The implementation plan is in `docs/archive/pryzm3-internal/04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md`.

---

## §1 — Why this contract exists

PRYZM's engine is initialized once per browser session. `engineLauncher.ts` constructs a constellation of mutable singletons — wall-rebuild control flags, a `BatchCoordinator`, a `FrameScheduler`, store subscribers, and `window.*` control surfaces — that persist for the lifetime of the tab. When a user opens a second project after working on a first, none of this per-project state is torn down.

The observable symptom: **after an AI batch execution on Project A, opening Project B prevents wall and element creation**. Walls are added to the store but geometry is never built; elements are never registered with `BimManager`; room redetection never fires. The engine is silently broken for the lifetime of the Project B session.

This contract defines the normative lifecycle for a project session and the specific isolation invariants that every subsystem must uphold.

---

## §2 — Project session model

A **project session** is the period between `pryzm-project-switch` (or cold boot) and the next `pryzm-project-switch` (or tab close). Within a session exactly one project is active at a time.

```
TAB OPEN
  │
  └─► engineLauncher.ts runs ONCE
        → constructs global singletons (BatchCoordinator, control surfaces, frame scheduler)
        → these persist for the lifetime of the tab
  │
  └─► COLD BOOT (first project open)
        → pryzm-project-switch fires { from: null, to: projectId }
        → pryzm-project-context-set fires (stores populated from API)
        → pryzm-project-loaded fires (geometry built, camera fitted)
        │
        └─► PROJECT A SESSION — active
              user draws walls, runs AI batch, edits properties
        │
        └─► pryzm-project-switch fires { from: projectIdA, to: projectIdB }
              │
              ├─► TEARDOWN PHASE (Project A)
              │     → must complete BEFORE Project B state loads
              │     → all per-project mutable state reset to clean initial values
              │     → all in-flight async work for Project A cancelled
              │
              └─► OPEN PHASE (Project B)
                    → pryzm-project-context-set fires
                    → pryzm-project-loaded fires
                    │
                    └─► PROJECT B SESSION — active
```

> **Companion spec**: the detailed stage-by-stage trace of the OPEN + CREATE pipelines
> (composeRuntime → engineLauncher → ProjectLoader), their performance characteristics, and
> the handler-registration single-registrar rule (C02 §1) live in
> `docs/03-execution/specs/SPEC-PROJECT-OPEN-CREATE-PIPELINE.md`. Performance work is
> tracked as `PRYZM3-MASTER-STATUS.md §11 → OI-053`.

---

## §3 — Isolation invariants (binding)

Every invariant below is a hard requirement. A session that violates any of these is considered **broken** — element creation, geometry build, and room detection may silently fail.

### §3.1 — BatchCoordinator must be clean at session start

When Project B's session begins (i.e., after `pryzm-project-switch` fires for the transition A → B), `BatchCoordinator` MUST be in its initial clean state:

| Field | Required value at B session start |
|---|---|
| `_isBatching` | `false` |
| `_pendingLevelIds` | empty `Set` |
| `_registrationQueue` | empty `Array` |
| `_postBatchWindowEvents` | empty `Set` |
| `_regDrainDispose` | `null` (any in-flight drain subscription cancelled) |
| `_totalElementCount` | `0` |

**Why**: if `_isBatching = true` survives the switch, every `BatchCoordinator.trackRegistration()` call in Project B queues registrations that never drain — walls are added to the store but never registered with `BimManager`. Element creation tools cannot find newly created elements; the project appears permanently broken.

### §3.2 — Wall-rebuild control flags must be clean at session start

The three boolean flags inside `engineLauncher.ts` that gate the wall-rebuild rAF pipeline MUST be reset to `false` before Project B's store events begin loading:

| Flag | Required value | Risk if left set |
|---|---|---|
| `_wallRebuildPaused` | `false` | Wall events accumulate in `_pendingWallEvents` forever; `_scheduleWallFlush` never requests a rAF; no wall geometry is ever built |
| `_wallRebuildDiscarding` | `false` | Wall events are silently dropped; `_scheduleWallFlush` is a no-op; no wall geometry is ever built |
| `_joinsResolving` | `false` | Re-entrant guard permanently locked; the WallJoinResolver never runs; wall joints are never resolved |

**Why**: an AI batch on Project A calls `discardAndSuppress()` (sets `_wallRebuildDiscarding = true`) and then `restore()` (clears it) inside `_executeFinalSweep()`. If the user switches projects after `discardAndSuppress()` is called but before `restore()` completes — or if an exception prevents `restore()` from being reached — `_wallRebuildDiscarding` stays `true`. Every wall event in Project B is silently dropped. Walls cannot be created.

### §3.3 — Pending wall events must be cleared at session start

`_pendingWallEvents: Map<string, _WallDirtyEntry>` MUST be cleared before Project B's store events begin loading.

**Why**: if Project A's wall events are still pending when Project B loads, `_flushWallRebuild()` will attempt to process them using Project B's `wallTool.getFragmentBuilder()` and `wallTool.getWallStore()`. The wall IDs no longer exist in the store; the flush silently no-ops but the map is drained. More critically, if `_wallRebuildPaused` was left `true` (§3.2), the events accumulate but the map is never drained.

### §3.4 — The wall-rebuild rAF subscription must be cancelled at session start

If `_wallRafHandle` (a `TickListenerDisposer`) is non-null at the moment of project switch, it MUST be invoked before Project B's state loads.

**Why**: a live FrameScheduler subscription from Project A's rAF pipeline will fire on the next animation frame in Project B's context, calling `_flushWallRebuild()` with stale `_pendingWallEvents` content. This can trigger a second WallJoinResolver pass over stale wall IDs, producing incorrect miter geometry or a second 2409ms LONGTASK (§BATCH-BUS-DISCARD root-cause pattern).

### §3.5 — CurtainWall and Slab rebuild controls must be clean at session start

By symmetry with §3.2, the curtain-wall and slab rebuild controls MUST be in their un-paused state:

- `window.__curtainWallRebuildControl.resumeAndFlush()` MUST be called if the builder is paused.
- `window.__slabRebuildControl.resumeAndFlush()` MUST be called if the builder is paused.

**Why**: `BatchCoordinator._setupBatch()` calls `pause()` on both builders at batch start. If the batch is interrupted, both builders remain paused. Project B's slab and curtain-wall store events accumulate but geometry is never drained.

### §3.6 — In-flight async work for Project A must be cancelled

Async operations that were dispatched during Project A's session MUST NOT execute in Project B's context. Specifically:

- Frame-yielded `rooms.redetect` dispatches from `_executeFinalSweep()` (dispatched with Project A's level IDs) MUST be discarded before they reach the command bus.
- In-flight FrameScheduler `scheduleOnce` subscriptions from Project A's `_drainRegistrations()` MUST be cancelled via their disposers.

**Why**: `_executeFinalSweep()` dispatches `rooms.redetect` with Project A's level IDs using frame-yielded async steps. If the user switches projects mid-sweep, those dispatches arrive at Project B's command bus with foreign level IDs. The `rooms.redetect` handler silently no-ops (level not found in new project's store), but the room topology for Project B is never initialized — room detection fails permanently in the new session.

### §3.7 — `pryzm-project-switch` must be the synchronous teardown trigger

The teardown sequence (§3.1–§3.6) MUST begin synchronously when `pryzm-project-switch` fires and MUST complete before `pryzm-project-context-set` fires.

**Why**: `pryzm-project-context-set` populates the stores with Project B's data. If store events begin firing before the wall-rebuild flags are cleared, Project B's first wall events may be silently dropped (if `_wallRebuildDiscarding = true`) or accumulated without a drain rAF scheduled (if `_wallRebuildPaused = true`).

### §3.8 — No direct store writes during the switch window

Between `pryzm-project-switch` and `pryzm-project-loaded`, no command handler or background callback MUST mutate `ElementStore` or `ProjectStore` slices belonging to Project A.

**Why**: Zustand stores are global singletons shared across sessions. A command from Project A's async tail (e.g., a deferred `rooms.redetect` that somehow reached the handler) would corrupt Project B's newly populated store slices.

### §3.9 — Lifecycle listeners MUST subscribe on the bus the events are EMITTED on (binding)

`pryzm-project-switch`, `pryzm-project-context-set` and `pryzm-project-loaded` are emitted on the **typed `runtime.events` bus** (`EventBus`, `composeRuntime.ts`). `EventBus.emit()` invokes only handlers registered via `.on()` — **it does not dispatch a DOM event.**

Therefore any subsystem participating in teardown or open MUST subscribe via `runtime.events.on(...)` (directly, or via the deferred `onRuntimeEvent` bridge for pre-runtime singletons). **Binding a lifecycle event through `window.addEventListener` is a silent no-op and is PROHIBITED.**

**Why this rule exists (L-224).** The `F.events` migration re-pointed the *emitters* to the typed bus but left six listeners on `window.addEventListener`. They became dead code. Among them: **`ProjectLifecycleController` — the owner of the entire §4 teardown — and `ProjectIsolationAudit` — the tripwire meant to catch exactly this class of bug.** The teardown had not run since the migration, and the audit that would have reported it was watching a channel nobody broadcasts on. A seventh dead listener (`FrustumCullingService`) was found only once the CI gate below existed.

**CI gate (binding):** `scripts/check/check-project-isolation.mjs` MUST fail on any occurrence of `window.addEventListener('pryzm-project-{switch,loaded,context-set}'`. A listener that cannot fire is worse than a missing one: it reads as protection while providing none.

### §3.10 — A project switch is a full teardown with NAMED OWNERS; the audit enumerates owners, not symptoms (binding)

Every stateful surface reset on a project switch MUST have exactly one **named owner**: a `ProjectLifecycleController` step, a `ProjectScopeRegistry` scope, or a `ClearProjectCommand` step. `ProjectScopeRegistry` is the registry of owners; **a store that registers no `clear` MUST fail a test.**

The runtime audit MUST run on **every** project load — not only `empty: true` loads — and MUST compare live state against **the loaded snapshot's expected contents** (`__pryzmLoadedProjectExpectation`: the element ids the snapshot declared). This keeps the false-positive rate at zero on a legitimately-populated load *without* abandoning coverage of the open-another-project path, which is where users actually hit leakage. Derived state (redetected rooms, room-bounding lines, annotations, curtain panels) is deliberately excluded, because post-load redetection legitimately creates entries absent from the snapshot.

The audit MUST span stores, graphs, caches, registries and undo — **not only the THREE scene.**

**Why**: the pre-L-224 audit inspected the scene graph and two `window` globals. It touched **none** of the 37 registered stores. A stale schedule, sheet, view-template or annotation carried from Project A sailed past it as "✓ loaded clean" — a clean verdict that never looked is worse than no verdict, because it manufactures confidence. An audit that enumerates **symptoms** always lags the code; one that enumerates **owners** fails loudly the moment a 38th store appears with no clear-path.

### §3.11 — Isolation probes are DECLARED, not discovered (ADR-0298, binding)

Per **ADR-0298** (`§PROBE-SET-DECLARED`, implemented `372e0c95`): the isolation audit
checks a **declared expected probe set** (`declaredProjectScopes.ts`), not whatever
happened to register. A DECLARED owner that did not answer is a violation
(`scope.probeMissing`) as loud as a registered owner reporting foreign state — "clean"
means "every required owner answered". Each declaration carries `resets`, `counts` and
written `uncounted` justifications, and the gate
(`tools/ga-gate/check-declared-project-scopes.ts`) enforces
`resets ⊆ counts ∪ uncounted` with a shrink-only debt baseline.

### §3.12 — The event channel is project-scoped state (binding; L-713, `da4559d8`)

**A leak can live in an undelivered message, not only in a held value.** The store event
bus (`StoreEventBus`) and its queued/buffered events are project-scoped state, declared as
such (Declaration v3 `events.storeBus` — the first declared surface that is a **CHANNEL**,
not a value; fourth variant of one family: L-676 no owner → L-694 wrong property → L-711
incomplete expected set → L-713 unmodelled channel).

Binding rules:

1. **The outgoing project's teardown events MUST NOT cross into the incoming project.**
   The observed leak: the incoming project's `beginBatch()` bracket (opened by
   `ProjectLoader`) was open while the OUTGOING project's teardown ran inside it
   (`ClearProjectCommand` → `projectScopeRegistry.clearAll()` → per-element `delete`
   events), so 74 buffered deletes of destroyed elements were flushed into the new
   project's subscribers. The bracket was never unbalanced — the leak was cross-project
   CONTENT inside a correctly-paired bracket.
2. **`StoreEventBus.suppressDuring(reason, fn)`** — a lexical region whose emits are
   dropped, COUNTED (`lastSuppression`) and logged. `ClearProjectCommand`'s body runs
   inside it. Dropping is correct here, not a shortcut: the clear resets
   `elementRegistry` FIRST, so every event it then emits names an element nothing can
   resolve, and every `storeEventBus` subscriber is a derived index the clear resets
   wholesale anyway. The per-store `subscribe()` channel used for mesh teardown is
   untouched.
3. **The "No Event Drops" guarantee (Master Architecture §9 / STR-04 §9.1) has exactly
   TWO declared exceptions**, both fenced, both counted:
   `discardBatch()` (the C13 teardown of an open bracket) and `suppressDuring()` (above).
   Any third drop site is a violation; add it here by amendment or do not write it.
4. **Bracket state is owned by the bus, not by a coordinator's shadow flag**
   (`§C13-BUS-QUEUE-OWNER`): `BatchCoordinator.forceReset()` gates `discardBatch()` on the
   BUS's own state, so a bracket opened directly by `ProjectLoader` is visible to the C13
   teardown. `discardBatch()` also drops a stray buffer left at depth 0 by
   `endBatchYielded()`.
5. **A stale id after a clear is REFUSED, not repaired** (`§C13-STALE-AFTER-CLEAR`,
   ADR-0299 §RECOVERY-MUST-REFUSE): `ElementRegistry` records `lastClearedAt` /
   `clearedSince(t)`; `ViewDependencyTracker` distinguishes an undo/redo stale id from a
   cross-project one and refuses the latter — no views dirtied, logged as
   `[C13 VIOLATION]`, counted. (The old fallback coarse-invalidated every non-3D view of
   the new project 74 times and was the only thing between this leak and a founder
   report.)
6. **Attribution honesty**: the probe cannot attribute a queued event
   (`StoreChangeEvent` has no `projectId`), so it answers
   `'<in-flight-events-unattributed>'` rather than filing an unknown as a clean. Owners
   whose teardown fires inside another owner's bracket declare `ownsTeardown: false` +
   a required `teardownOwner`, gate-enforced.

---

## §4 — The normative teardown sequence

When `pryzm-project-switch` fires, the `ProjectLifecycleController` MUST execute the following steps synchronously in this exact order before yielding to any async continuations:

```
1. batchCoordinator.forceReset()
   → clears _isBatching = false
   → clears _pendingLevelIds (Set.clear())
   → clears _registrationQueue (length = 0)
   → clears _postBatchWindowEvents (Set.clear())
   → cancels _regDrainDispose (invoke disposer if non-null → set null)
   → resets _totalElementCount = 0

2. engineLauncher teardown hook fires
   → sets _wallRebuildPaused    = false
   → sets _wallRebuildDiscarding = false
   → sets _joinsResolving        = false
   → if (_wallRafHandle !== null): _wallRafHandle(); _wallRafHandle = null
   → _pendingWallEvents.clear()
   → _prevJoinMap.clear()

3. window.__curtainWallRebuildControl.resumeAndFlush()
   (safe to call even if not paused — resumeAndFlush is idempotent)

4. window.__slabRebuildControl.resumeAndFlush()
   (safe to call even if not paused — resumeAndFlush is idempotent)

5. Cancel any in-flight frame-yielded rooms.redetect sweep
   → BatchCoordinator sets an internal _sweepCancelled flag
   → the async generator for _executeFinalSweep checks this flag before each dispatch
   → if _sweepCancelled: returns without dispatching
```

Steps 1–5 are synchronous. The caller MAY yield to microtasks after step 5.

---

## §5 — The normative open sequence

After teardown completes, the open sequence for Project B proceeds as before:

```
1. pryzm-project-context-set fires
   → stores populated from API (level/wall/slab/room data)
   → store events begin flowing through the now-clean wall-rebuild pipeline

2. pryzm-project-loaded fires
   → geometry build drains (FrameScheduler pre-render pass)
   → camera fit executes
   → _levelCamReady = true
```

No changes to the open sequence are required. The invariant is that teardown is complete before context-set fires.

### §5.3 — Load timeout MUST be progress-aware (binding)

> **Added**: 2026-07-02 · closes ADR-0098 finding **F2** (project-open freeze). Files: `PlatformVersionController.loadVersion` (`§LOAD-TIMEOUT-PROGRESS`), `ProjectLoader.load` (`pryzm-load-progress`).

A load-guard timeout MUST NOT declare failure while `ProjectLoader` is still making forward progress. A legitimately-slow large open (e.g. the 40-storey office: 1300 elements / 22.7 MB / 40 levels, ~62 s of **steady** progress) is not a hang.

- **Prohibited**: a fixed wall-clock cap (the old `Promise.race(load(), setTimeout(30_000))`). It surfaced `Load timed out after 30 s` and "Load failed" while `§LOAD-WATCHDOG` showed the load still advancing (`load still running after 56.5s`) and it then completed (`PHASE_TIMINGS total=62831ms`), leaving the app half-initialised.
- **Required**: `ProjectLoader` emits a `pryzm-load-progress` forward-progress tick on every `§LOAD-PHASE` boundary **and** on every 5 s watchdog heartbeat. The load guard is a **stall** watchdog: each tick RESETS the deadline, so the guard fires **only** when no progress happens for `STALL_TIMEOUT_MS` (a real hang) — regardless of total load duration.
- The guard MUST clean up its listener + timer on both the success and error paths (no leaked `pryzm-load-progress` listeners across loads).

### §5.4 — Clear-on-switch teardown MUST be batched (binding)

> **Added**: 2026-07-02. Files: `ClearProjectCommand` (`§CLEAR-PROJECT-BATCH`), `SpatialTree.refreshTree`, `StairStore`/`StairMeshBuilder` (project-load log gate).

The teardown that `ClearProjectCommand` runs at the start of every load removes **all** elements one-by-one (1065 walls, 78 stairs, 940 room-bounding-lines, 40 levels for the reported office). This is on the critical open path and MUST NOT amplify into per-element UI/console cost:

1. **One spatial-tree refresh per burst, not per level.** `SpatialTree.refreshTree` MUST coalesce the N synchronous `bim-level-removed` / `bim-level-added` events of a teardown/load into a **single** tree rebuild (a P3-safe microtask coalescer — no new rAF). Previously each `bim-level-removed` fired a full `treeContent` rebuild + an 8-store `getAll()` scan (40× on a 40-storey switch).
2. **No per-element console logging on the clear/load path.** Per-element remove logs (`[StairStore] Removed stair …`, `[StairMeshBuilder] Removed group …`) MUST be suppressed while `globalThis.__pryzmProjectLoadActive === true` (the flag `ProjectLoader` already sets around the whole load/restore). At 40-storey scale DevTools serialising + painting each line is itself measurable jank. `ClearProjectCommand` emits one `§CLEAR-PROJECT-BATCH` summary line instead of one-per-store-category.

These are performance invariants of the OPEN PHASE (§2) — they change no semantic model state.

### §5.5 — Autosave MUST NOT serialize during the load window

Cross-reference: **C05 §3.2a** (autosave suppressed for the entire load/restore, including the fire-and-forget post-load sweep). The self-inflicted freeze in ADR-0098 F2 was an autosave `saveVersionInternal` serializing 22.7 MB **mid-load** because the caller-driven `isLoading` fence closed the instant `loadAdapter.load()` resolved — before the deferred post-load rebuild/re-anchor sweep (whose mutations trigger the debounce) had drained. See C05 §3.2a for the normative rule and the `pryzm-load-suppress-begin`/`-end` mechanism.

---

## §6 — AS-IS gaps (where today's code violates this contract)

> **Last updated**: 2026-07-16 (L-342). Every site carries a `TODO(C13.x)` annotation once the implementation wave starts. The implementation plan is `docs/archive/pryzm3-internal/04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md`.
> Gap status: C13-G1 through C13-G7 (the original seven gaps) are now all **Fixed** — the batch/wall-rebuild teardown surfaces were implemented by the Wave 35 project-isolation wave (`BatchCoordinator.forceReset`, `WallRebuildCoordinator._resetState` via `window.__engineTeardown`, `_sweepCancelled`) and wired into the `pryzm-project-switch` path by `ProjectLifecycleController`; **L-342 (2026-07-16)** closed the remaining hole by routing the SAME §3.1–§3.6 teardown through the project-**LOAD** chokepoint (`ProjectLoader.load` → `window.__pryzmProjectTeardown` → `ProjectLifecycleController.runTeardown`), so direct opens / version restores / hydrator replays (which never emit `pryzm-project-switch`) also start from a clean pipeline. C13-G8 and C13-G9 were discovered and **fixed** during live testing on 2026-05-04. C13-G10 was discovered and **fixed** on 2026-05-09.

### §6.1 — No teardown on `pryzm-project-switch`

| Gap | Status | Description | Contract violated |
|---|:---:|---|---|
| **C13-G1** | **Fixed** | The `pryzm-project-switch` listener now runs the full §3.1–§3.6 teardown, not just `_levelCamReady = false`. Owner: `ProjectLifecycleController` (`packages/runtime-composer/`), subscribed on the typed `runtime.events` bus (§3.9 / L-224) and wired via `engineLauncher.ts` (`_lifecycle.bind()`). **L-342**: the same sequence is also run on the LOAD path (`ProjectLoader.load` → `window.__pryzmProjectTeardown` → `ProjectLifecycleController.runTeardown`) so opens that never fire `pryzm-project-switch` are covered too. | §3.7 |
| **C13-G2** | **Fixed** | `BatchCoordinator.forceReset()` exists (`packages/core-app-model/src/batch/BatchCoordinator.ts`). It sets `_isBatching=false`, clears `_pendingLevelIds`/`_registrationQueue`/`_postBatchWindowEvents`, cancels `_regDrainDispose` + the deferred resume-flush + watchdog, `discardBatch()`es the open bus bracket, and resets `_totalElementCount=0`. Called at Step 1 of `runTeardown` on BOTH switch + load. | §3.1 |
| **C13-G3** | **Fixed** | `WallRebuildCoordinator._resetState()` resets `_wallRebuildPaused`, `_wallRebuildDiscarding`, and `_joinsResolving` to `false`. Exposed externally as `window.__engineTeardown.resetWallRebuildState()` and invoked at Step 2 of `runTeardown`. | §3.2 |
| **C13-G4** | **Fixed** | `_resetState()` cancels `_wallRafHandle` (`this._wallRafHandle(); this._wallRafHandle = null`) before clearing pending state. Reachable externally via `window.__engineTeardown`. | §3.4 |
| **C13-G5** | **Fixed** | `_resetState()` clears `_pendingWallEvents` (and `_prevJoinMap`, `_lastBuildKey`, generation-coalesce state). Reachable externally via `window.__engineTeardown`. | §3.3 |
| **C13-G6** | **Fixed** | `BatchCoordinator` carries a `_sweepCancelled` flag set to `true` by `forceReset()`; the in-flight `_executeFinalSweep` frame-scheduled `tickNextLevel` callbacks check it before every `rooms.redetect` dispatch and bail out. The flag is reset to `false` on the next microtask so Project B's own batches run normally. | §3.6 |
| **C13-G7** | **Fixed** | Both `window.__curtainWallRebuildControl` and `window.__slabRebuildControl` expose `isPaused(): boolean` (see `src/global-window.d.ts`). `runTeardown` reads them for the teardown span and calls `resumeAndFlush()` (idempotent) at Steps 3/4. | §3.5 |
| **C13-G8** | **Fixed** | `ClearProjectCommand` removed all levels from `BimManager` but never reset `ProjectContext.activeLevelId`. On the next project, every tool that reads `activeLevelId` (WallTool.getWorldPoint, FurnitureDragDropHandler, AICreatePanel, etc.) received a dangling level ID that no longer existed in BimManager, causing silent aborts — no geometry could be placed. **Fix**: `ClearProjectCommand` now resets `projectContext.activeLevelId = 'L0'` before emitting `bim-project-cleared`. File: `src/engine/subsystems/commands/project/ClearProjectCommand.ts`. | §3.7 (tool context is project-scoped state) |
| **C13-G9** | **Fixed** | `WallFragmentBuilder` does NOT subscribe to `WallStore` remove events. Its THREE.js `Group` objects (tagged `userData.type = 'wall'`, `userData.selectable = true`) are committed to the scene when walls are built. The `bim-project-cleared` sweep in `initTools.ts` only removes `userData.isPreview === true` objects — so `WallFragmentBuilder` committed walls survive the project switch. Result: Project A's wall meshes remained in the THREE.js scene for Project B — GPU-pickable (selectable) and geometrically present, but absent from every store. **Fix**: the `bim-project-cleared` handler in `initTools.ts` now calls `wallTool.getFragmentBuilder().dispose()` first, which invokes `removeWall()` for every `wallId` in `wallRoots` (`scene.remove(root)` + `elementRegistry.unregisterRoot()` + geometry/material disposal). | §3.8 (scene graph is project-scoped state) |
| **C13-G10** | **Fixed** | `CurtainWallBuilder.dispose()` never cancelled `_rafHandle` before clearing `_pendingBuildsMap`. A FrameScheduler pre-render drain (`_drainBuildQueue`) could fire one frame after dispose(), referencing the torn-down builder instance and emitting stale walls into the incoming project's scene. **Fix** (`§FIX-C13-RAFHANDLE`): `dispose()` now calls `this._rafHandle()` and sets it to `null` as the very first step, before any scene teardown. File: `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`. | §3.4 (in-flight rAF subscriptions must be cancelled at session start) |

### §6.2 — Known failure scenarios

| Scenario | Observable symptom | Root gap | Fixed? |
|---|---|---|:---:|
| AI batch on Project A interrupted by project switch while `_isBatching = true` | Project B walls added to store but never registered with BimManager; element creation tools report elements as missing | C13-G2 | **Yes** |
| AI batch on Project A calls `discardAndSuppress()`; user switches before `restore()` is called | All of Project B's wall events silently dropped; walls cannot be created | C13-G3 | **Yes** |
| AI batch on Project A calls `pause()` on wall rebuild; user switches before `resumeAndFlush()` | Project B's wall events accumulate in `_pendingWallEvents` but no rAF is scheduled; walls have no geometry | C13-G3 | **Yes** |
| Frame-yielded `rooms.redetect` sweep still running for Project A when Project B loads | Project B's room topology never initialized; room detection permanently broken | C13-G6 | **Yes** |
| `_wallRafHandle` non-null at switch; flushes stale Project A events in Project B rAF | Incorrect miter geometry for Project B walls; potential 2409ms LONGTASK repeat | C13-G4 | **Yes** |
| `ProjectContext.activeLevelId` holds Project A's non-default level after switch | WallTool.getWorldPoint returns null on every pointer move; no walls or furniture can be placed in Project B | C13-G8 | **Yes** |
| `WallFragmentBuilder` committed walls not removed from THREE.js scene on project switch | Project A's walls selectable and visible in Project B's viewport; GPU geometry count does not drop; picks return stale Project A element IDs | C13-G9 | **Yes** |
| `CurtainWallBuilder._rafHandle` non-null at switch; `_drainBuildQueue` fires on disposed builder emitting stale walls into next project's scene | Curtain wall geometry from Project A appears in Project B's viewport for one frame; potential stale InstancedMesh objects in scene graph | C13-G10 | **Yes** |

---

## §7 — Testability gates

### §7.1 — Static CI gate

A new GA gate script `tools/ga-gate/check-project-isolation.ts` MUST verify:

1. `BatchCoordinator` exports a `forceReset()` method.
2. `engineLauncher.ts` registers a `pryzm-project-switch` listener that calls `batchCoordinator.forceReset()`.
3. `window.__wallRebuildControl` exports a `reset()` method (or equivalent teardown surface).

### §7.2 — E2E integration test

`tests/e2e/project-isolation.spec.ts` MUST pass the following scenario:

```
1. Open Project A (or create a new project).
2. Execute an AI batch that creates ≥ 10 walls.
3. Before the batch completes (simulate interrupt OR wait for full completion).
4. Navigate to Project B (switch projects via UI or programmatic event).
5. Assert: pryzm-project-switch fires.
6. Assert: after pryzm-project-loaded fires for Project B:
     a. Draw one wall segment in Project B → wall mesh appears within 2 rAF ticks.
     b. `batchCoordinator.isBatching` → false.
     c. `window.__wallRebuildControl` is not in paused or discard state.
7. Assert: wall count in Project B's WallStore === walls drawn only in Project B.
```

### §7.3 — Runtime telemetry

`ProjectLifecycleController.teardown()` MUST emit an OTel span `project.session.teardown` with attributes:
- `priorProjectId` (string)
- `batchWasActive` (boolean — was `_isBatching = true` at teardown?)
- `wallRebuildWasPaused` (boolean)
- `wallRebuildWasDiscarding` (boolean)
- `pendingWallEventCount` (number)
- `pendingRegistrationCount` (number)

This span is the canonical audit trail for isolation failures.

---

## §8 — Principles this contract enforces

| Principle | How this contract enforces it |
|---|---|
| **P1** — Single composition root | `ProjectLifecycleController` is composed inside `composeRuntime()` or `engineLauncher.ts`; no second teardown path exists |
| **P3** — Single rAF owner | Teardown cancels `_wallRafHandle` via `TickListenerDisposer`, not via raw `cancelAnimationFrame()` |
| **P6** — Commands are the only mutation path | Teardown does NOT write to stores directly; it only resets the pipeline infrastructure that processes commands |
| **P8** — Spans required | `project.session.teardown` OTel span required (§7.3) |
