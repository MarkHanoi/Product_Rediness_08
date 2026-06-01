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

---

## §6 — AS-IS gaps (where today's code violates this contract)

> **Last updated**: 2026-05-09. Every site carries a `TODO(C13.x)` annotation once the implementation wave starts. The implementation plan is `docs/archive/pryzm3-internal/04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md`.
> Gap status: C13-G1 through C13-G7 are the original seven gaps. C13-G8 and C13-G9 were discovered and **fixed** during live testing on 2026-05-04. C13-G10 was discovered and **fixed** on 2026-05-09.

### §6.1 — No teardown on `pryzm-project-switch`

| Gap | Status | Description | Contract violated |
|---|:---:|---|---|
| **C13-G1** | Open | `pryzm-project-switch` listener in `engineLauncher.ts:2178` only resets `_levelCamReady = false`. None of the §3.1–§3.6 reset steps execute. | §3.7 |
| **C13-G2** | Open | `BatchCoordinator` has no `forceReset()` method. `_isBatching`, `_pendingLevelIds`, `_registrationQueue`, `_postBatchWindowEvents`, `_regDrainDispose` are never externally resettable. | §3.1 |
| **C13-G3** | Open | `_wallRebuildPaused` and `_wallRebuildDiscarding` are closure-private local variables inside `engineLauncher.ts`. They cannot be reset by an external controller; only `pause()`, `resumeAndFlush()`, `discardAndSuppress()`, and `restore()` can change them. | §3.2 |
| **C13-G4** | Open | `_wallRafHandle` is a closure-private variable. It cannot be cancelled externally. | §3.4 |
| **C13-G5** | Open | `_pendingWallEvents` is a closure-private `Map`. It cannot be cleared externally. | §3.3 |
| **C13-G6** | Open | `BatchCoordinator._executeFinalSweep()` has no cancellation mechanism. In-flight frame-yielded `rooms.redetect` dispatches continue executing after project switch. | §3.6 |
| **C13-G7** | Open | `window.__curtainWallRebuildControl` and `window.__slabRebuildControl` have no `isActive()` query; callers cannot safely determine whether they are paused or not before calling `resumeAndFlush()`. | §3.5 |
| **C13-G8** | **Fixed** | `ClearProjectCommand` removed all levels from `BimManager` but never reset `ProjectContext.activeLevelId`. On the next project, every tool that reads `activeLevelId` (WallTool.getWorldPoint, FurnitureDragDropHandler, AICreatePanel, etc.) received a dangling level ID that no longer existed in BimManager, causing silent aborts — no geometry could be placed. **Fix**: `ClearProjectCommand` now resets `projectContext.activeLevelId = 'L0'` before emitting `bim-project-cleared`. File: `src/engine/subsystems/commands/project/ClearProjectCommand.ts`. | §3.7 (tool context is project-scoped state) |
| **C13-G9** | **Fixed** | `WallFragmentBuilder` does NOT subscribe to `WallStore` remove events. Its THREE.js `Group` objects (tagged `userData.type = 'wall'`, `userData.selectable = true`) are committed to the scene when walls are built. The `bim-project-cleared` sweep in `initTools.ts` only removes `userData.isPreview === true` objects — so `WallFragmentBuilder` committed walls survive the project switch. Result: Project A's wall meshes remained in the THREE.js scene for Project B — GPU-pickable (selectable) and geometrically present, but absent from every store. **Fix**: the `bim-project-cleared` handler in `initTools.ts` now calls `wallTool.getFragmentBuilder().dispose()` first, which invokes `removeWall()` for every `wallId` in `wallRoots` (`scene.remove(root)` + `elementRegistry.unregisterRoot()` + geometry/material disposal). | §3.8 (scene graph is project-scoped state) |
| **C13-G10** | **Fixed** | `CurtainWallBuilder.dispose()` never cancelled `_rafHandle` before clearing `_pendingBuildsMap`. A FrameScheduler pre-render drain (`_drainBuildQueue`) could fire one frame after dispose(), referencing the torn-down builder instance and emitting stale walls into the incoming project's scene. **Fix** (`§FIX-C13-RAFHANDLE`): `dispose()` now calls `this._rafHandle()` and sets it to `null` as the very first step, before any scene teardown. File: `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`. | §3.4 (in-flight rAF subscriptions must be cancelled at session start) |

### §6.2 — Known failure scenarios

| Scenario | Observable symptom | Root gap | Fixed? |
|---|---|---|:---:|
| AI batch on Project A interrupted by project switch while `_isBatching = true` | Project B walls added to store but never registered with BimManager; element creation tools report elements as missing | C13-G2 | No |
| AI batch on Project A calls `discardAndSuppress()`; user switches before `restore()` is called | All of Project B's wall events silently dropped; walls cannot be created | C13-G3 | No |
| AI batch on Project A calls `pause()` on wall rebuild; user switches before `resumeAndFlush()` | Project B's wall events accumulate in `_pendingWallEvents` but no rAF is scheduled; walls have no geometry | C13-G3 | No |
| Frame-yielded `rooms.redetect` sweep still running for Project A when Project B loads | Project B's room topology never initialized; room detection permanently broken | C13-G6 | No |
| `_wallRafHandle` non-null at switch; flushes stale Project A events in Project B rAF | Incorrect miter geometry for Project B walls; potential 2409ms LONGTASK repeat | C13-G4 | No |
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
