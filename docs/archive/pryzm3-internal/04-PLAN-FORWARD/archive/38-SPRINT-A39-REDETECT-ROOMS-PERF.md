# 38 — Sprint A39 — REDETECT_ROOMS Cascade, L2 Bus Migration State & Full Element Batch Roadmap

> **Stamp**: 2026-05-04 · **Status**: ✅ IMPLEMENTED — P0 + P1 + P2 landed in this sprint
> **Predecessor**: `37-BATCH-CW-PERF-SPRINT.md` (A38 — BimManager registration drain fixed, command ≤150 ms)
> **Companion**: `34-HANDLER-PROTOCOL-GAP-ANALYSIS.md`, `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md`, `33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`
> **NFT target**: Any `CREATE_*_ON_ALL_*` command end-to-end ≤ 2 s wall-clock (command → geometry visible) for an 11-level reference project.

---

## §1 — Context and Sprint Scope

Sprint A38 fixed the BimManager registration drain for `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`
(command phase: 520 ms → ≤150 ms).  Post-A38 log analysis revealed a **new dominant bottleneck**:
an 8,416 ms LONGTASK from 11 synchronous `REDETECT_ROOMS` commands fired by `_executeFinalSweep()`.

Sprint A39 fixes this specifically for curtain walls and documents the **complete picture** for
all 12 element families so follow-on sprints have a single authoritative reference.

---

## §2 — What A38 Left Behind (Sprint A39 Starting State)

```
[BatchCoordinator] command phase: ~150ms ✅  (A38 fixed)
[StoreEventBus]    endBatchYielded() — 2,728 event(s) in 14 chunks  ← P1 (was 10 for slabs)
[BatchCoordinator] Final sweep: firing 11 REDETECT_ROOMS command(s)
[LONGTASK]         duration=8,416ms                                   ← P0 DOMINANT
[GPU Monitor]      geometries:21  ← CurtainWallBuilder not yet run   (consequence of 8.4s block)
[EdgeProjectorService] 394 edge geometries — 13 ISO layer(s)
[GPU Monitor]      geometries:97 ← scene stable
```

The 8.4 s LONGTASK fires **after** the command returns.  The GPU counter stays at 21 throughout,
confirming the main thread is blocked on pure JS — no WebGL.  The scene appears frozen for
the entire 8.4 seconds before geometry appears.

---

## §3 — Root Cause Hierarchy (Sprint A39)

```
CREATE_CURTAIN_WALLS_ON_ALL_SLABS post-command wall-clock: >20 s (before A39 fixes)
│
├── P0: 8,416 ms LONGTASK — REDETECT_ROOMS cascade (11 levels, synchronous)  ← DOMINANT
│    ├── _executeFinalSweep() checks:  rt.bus.registry.has('rooms.redetect')
│    ├── 'rooms.redetect' NOT registered in runtime.bus → registry.has() = false
│    ├── Falls back: import('ReDetectRoomsCommand').then(all 11 levels in one .then())
│    ├── Each level: PlanarTopologyEngine runs on 6 curtain-wall segments → ~766ms
│    └── 11 × ~766ms = 8,416ms in one unbroken JS task (browser frozen)
│
├── P1: 2,728 storeEventBus events for 66 curtain walls (41 events/wall vs 1/slab)
│    ├── CurtainPanelSyncHandler subscribes to curtainWallStore.subscribe() —
│    │   a NATIVE (non-bus) callback that fires synchronously on every .add()
│    │   regardless of storeEventBus batch depth
│    ├── Each wall: storeEventBus.batch() creates ~40 panel events (panels + mullions)
│    ├── Panel events join the outer storeEventBus batch buffer (depth already ≥1)
│    ├── endBatchYielded() must drain 2,728 events in 14 chunks instead of 10 in 1
│    └── CurtainWallBuilder geometry drain cannot start until ALL chunks delivered
│
└── P2: CREATE_CURTAIN_WALLS_ON_ALL_SLABS not on runtime.bus (structural, zero perf impact)
     ├── Command still routed via legacy commandManager.execute() path
     ├── runtime.bus.registry.has('curtain-wall.create-on-all-slabs') → false
     ├── Required for Immer produceWithPatches, MessagePack ULID, Yjs convergence
     └── Tracked in 34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §C11-4
```

---

## §4 — Sprint A39 Fixes (IMPLEMENTED ✅)

### P0 — Register `rooms.redetect` handler on `runtime.bus`

**What it fixes**: 8,416 ms LONGTASK.

**Mechanism**: `_executeFinalSweep()` gates the REDETECT_ROOMS path on
`rt.bus.registry.has('rooms.redetect')`.  The frame-yielded path was already implemented —
it just needed the registry entry to activate it.

```ts
// BatchCoordinator._executeFinalSweep() — the gate (already existed):
if (rt && rt.bus.registry.has('rooms.redetect')) {
    // ✅ NOW ACTIVE: one level per post-render frame via fsScheduler
    tickNextLevel();  // 11 frames × ≤16ms = ~176ms, FPS stays ≥30
} else {
    // ❌ WAS RUNNING: all 11 levels in one .then() = 8,416ms LONGTASK
    import('ReDetectRoomsCommand').then(levels.forEach(cm.execute))
}
```

**Fix**: Registered a `CommandHandler` for `'rooms.redetect'` in `engineLauncher.ts`
immediately after `batchCoordinator.inject()`.  Handler calls
`commandManager.execute(new ReDetectRoomsCommand(...))` as the bridge to L7.

**Before / After**: 8,416 ms LONGTASK → ~176 ms spread across 11 `post-render` frames.

**File**: `src/engine/engineLauncher.ts` — `§P0-A39` block.

---

### P1 — Gate `CurtainPanelStore.emit()` with `batchCoordinator.isBatching`

**What it fixes**: 2,728 events / 14 drain chunks → ~66 events / 1 chunk.

**Mechanism**: `CurtainPanelSyncHandler` is subscribed to `curtainWallStore.subscribe()`
(a native callback, not storeEventBus), so it fires synchronously on each `.add()` even
while the outer storeEventBus batch is open.  For each curtain wall, the sync handler
calls `storeEventBus.batch(() => panelStore.add() per cell)`.  Each `panelStore.add()`
called `storeEventBus.emit()` unconditionally — accumulating ~40 panel events per wall in
the buffer.

`batchCoordinator.isBatching` is `true` from `beginBatch()` through the entire
`endBatchYielded()` drain.  It becomes `false` only in `onComplete()` after ALL chunks are
delivered.  Gating the emit on this flag suppresses all panel events during the batch drain.

**Safety**: `CurtainWallBuilder` reads `panelStore.getByCurtainWallId()` DIRECTLY when
building wall geometry — it does not require a separate storeEventBus event per panel.
Normal single-edit panel operations (outside a batch) continue to emit fully.

**Before / After**: 14 drain chunks → 1 chunk.  CurtainWallBuilder geometry drain starts
~210 ms earlier.

**File**: `src/engine/subsystems/curtainwalls/CurtainPanelStore.ts` — `§P1-A39` block in `emit()`.

---

### P2 — Register `curtain-wall.create-on-all-slabs` on `runtime.bus`

**What it fixes**: Structural gap (C11 §4).  Zero performance impact in isolation.

**Mechanism**: Added `'curtain-wall.create-on-all-slabs'` payload type to
`packages/command-bus/src/commands.ts` and registered the corresponding `CommandHandler`
in `engineLauncher.ts`.  Existing call site unchanged (dual-write pattern per E.5.x P2).

`runtime.bus.registry.has('curtain-wall.create-on-all-slabs')` now returns `true`.  The
call site can switch to `runtime.bus.executeCommand()` in a follow-up sprint without
further infra changes.  Required precondition for Immer patch production and MessagePack
wire encoding.

**Files**: `packages/command-bus/src/commands.ts` + `src/engine/engineLauncher.ts`.

---

## §5 — L2 Command/Event Bus — Full As-Is vs To-Be

### §5.1 — Architecture items

| Item | Current state (post-A39) | Gap / Sprint needed |
|---|---|---|
| `affectedStores` adoption | ~100% on actual Command classes (4 missing entries are helper utilities, not commands) | Enable CI gate — `eslint-plugin-pryzm/affected-stores-required` in GitHub Actions |
| `rooms.redetect` on runtime.bus | ✅ **REGISTERED (A39 P0)** | Phase F: move handler to `@pryzm/plugin-rooms` producer |
| `curtain-wall.create-on-all-slabs` on runtime.bus | ✅ **REGISTERED (A39 P2)** — type + handler | Switch call site to `runtime.bus.executeCommand()` (drop legacy path) |
| `wall.batch.create` on runtime.bus | ✅ Payload type exists; dual-write dispatch from both `CreateWallsFromSlabCommand` + `CreateWallsOnAllSlabsCommand` | Fire-and-forget parallel; legacy path still authoritative |
| `wall.create-on-all-slabs` on runtime.bus | ❌ No payload type; no handler | Sprint A40+: same P2 pattern as curtain walls |
| `slab.create-on-all-floors` on runtime.bus | ❌ No payload type; no handler | Sprint A40+ |
| `column.batch.create` on runtime.bus | ✅ Payload type exists | No handler registered; Sprint A40+ |
| `beam.batch.create` on runtime.bus | ✅ Payload type exists | No handler registered; Sprint A40+ |
| `door.batch.create` on runtime.bus | ✅ Payload type exists | No handler registered; Sprint A40+ |
| `window.batch.create` on runtime.bus | ✅ Payload type exists | No handler registered; Sprint A40+ |
| `ceiling.batch.create` on runtime.bus | ✅ Payload type exists | No handler registered; Sprint A40+ |
| `stair.batch.create` on runtime.bus | ✅ Payload type stub exists (unknown[] shape) | Needs proper payload type + handler; Sprint A40+ |
| `room.batch.create` on runtime.bus | ❌ No payload type | Only `rooms.redetect` exists; `BATCH_CREATE_ROOMS` has no bus type |
| Immer `produceWithPatches` | ❌ Not implemented anywhere | Full snapshot undo still in use; no patch pairs; Phase F |
| MessagePack ULID wire format | ❌ Not implemented | Bespoke Socket.io JSON; no ULID ordering; Phase F |
| Yjs cross-tab convergence | ❌ Not implemented | No shared CRDT document; no offline merge; Phase F |
| CI gate (`tsc --strict` + eslint + vitest 80%) | ❌ Not enforced | GitHub Actions matrix; Phase F |

### §5.2 — Phase F To-Be (authoritative target)

| Item | Target | Mechanism |
|---|---|---|
| `affectedStores` | 100% + CI hard-fail | `eslint-plugin-pryzm` in GitHub Actions matrix |
| All batch commands on runtime.bus | 100% — legacy `commandManager.execute()` removed | E.5.x P2 full migration |
| `rooms.redetect` handler | Executes `RoomDetectionEngine` directly in `@pryzm/plugin-rooms` | Phase F plugin-rooms producer |
| Immer `produceWithPatches` | All handlers produce `(forward, inverse)` patch pairs | `CommandBus.buildContext` injects Immer draft |
| MessagePack + ULID | All `EventRecord` payloads MessagePack-encoded; `id` fields are ULIDs | ADR-001 §4 wire encoding |
| Yjs cross-tab | Shared `Y.Doc`; one `Y.Map` per store; CRDT merge on reconnect | ADR-002 §5 |
| CI gate | `tsc --strict`, `eslint --max-warnings 0`, `vitest --coverage 80%` | GitHub Actions matrix |

---

## §6 — Element-by-Element Batch Creation Audit

The following table scores every element family against five dimensions:

- **`affectedStores`** — command declares `readonly affectedStores = [...]`
- **`isBatching` guard** — builder / command checks `batchCoordinator.isBatching` before triggering geometry or room observers
- **Sub-element store gated** — all sibling/sub-element stores gate `storeEventBus.emit()` with `batchCoordinator.isBatching` (P1 pattern)
- **`runtime.bus` handler** — command type has a registered handler on the runtime bus
- **`registerMany` drain** — uses `BimManager.registerMany()` + sync-drain (≤50 threshold) instead of per-element `trackRegistration()` rAF loop

| Element family | `affectedStores` | `isBatching` guard | Sub-element store gated | `runtime.bus` handler | `registerMany` drain | Sprint A40 priority |
|---|---|---|---|---|---|---|
| **Curtain walls** (CREATE_CW_ON_ALL_SLABS) | ✅ | ✅ | ✅ **A39 P1** | ✅ **A39 P2** | ✅ **A38** | — DONE |
| **Walls** (CREATE_WALLS_ON_ALL_SLABS) | ✅ | ✅ | ✅ (no sub-stores; WallStore gated by §BATCH-BUS-DISCARD) | ✅ partial (wall.batch.create dual-write; no create-on-all-slabs handler) | ❌ still per-wall trackRegistration | **P1** |
| **Slabs** (CREATE_SLABS_ON_ALL_FLOORS) | ✅ | ✅ | ✅ (SlabStore: 1 event/slab; SlabFragmentBuilder isBatching-aware) | ❌ no bus handler | ❌ delegates to CreateSlabCommand per floor | **P2** |
| **Stairs** (no create-on-all; stair.batch.create stub) | ✅ | ❌ builder not isBatching-aware | ❌ **StairLandingStore + StairRailingStore emit without isBatching gate** | ❌ no handler (stub type only) | ❌ | **P0 for sub-store gate** |
| **Rooms** (BATCH_CREATE_ROOMS) | ✅ | ✅ (REDETECT_ROOMS now frame-yielded via A39 P0) | ✅ (RoomStore 1 event/room; no sub-stores) | ❌ no room.batch.create bus type | ❌ | **P3** |
| **Columns** (column.batch.create) | ✅ | ❌ not isBatching-aware | ✅ (ColumnStore: 1 event/column; no sub-stores) | ❌ handler not registered (type exists) | ❌ | **P2** |
| **Beams** (beam.batch.create) | ✅ | ❌ not isBatching-aware | ✅ (no sub-stores) | ❌ handler not registered (type exists) | ❌ | **P3** |
| **Doors** (door.batch.create) | ✅ (Update commands) | ❌ DoorStore not isBatching-aware | ✅ (DoorStore: 1 event/door; no sub-element store) | ❌ handler not registered (type exists) | ❌ | **P3** |
| **Windows** (window.batch.create) | ✅ | ❌ not isBatching-aware | ✅ (WindowStore: 1 event/window) | ❌ handler not registered (type exists) | ❌ | **P3** |
| **Ceilings** (ceiling.batch.create) | ✅ | ❌ not isBatching-aware | ✅ (no sub-stores) | ❌ handler not registered (type exists) | ❌ | **P3** |
| **Roofs** (no batch command) | ✅ | ❌ RoofStore not isBatching-aware | ✅ (RoofStore: 1 event/roof) | ❌ | ❌ | **P4** |
| **Furniture** (no batch command) | ✅ | ❌ | ✅ (FurnitureStore: 1 event/item) | ❌ | ❌ | **P4** |

**Score legend**: ✅ done, ❌ missing, **bold** = fixed in this sprint.

---

## §7 — The Universal Batch Performance Pattern

Every element family that achieves maximum performance for batch creation must satisfy all
five of the following conditions.  Curtain walls (post-A39) are the reference implementation.

```
BATCH CREATION PERFORMANCE CHECKLIST
─────────────────────────────────────────────────────────────────────────────
1. affectedStores declared
   Command class declares: readonly affectedStores = ["<elementType>"] as const;
   Required for: runtime.bus routing, Immer patch scoping, CI gate.

2. batchCoordinator.runBatch() wraps the create loop
   The entire _processSlabs() / _processFloors() loop runs inside runBatch().
   This opens storeEventBus.beginBatch(), keeps _isBatching=true throughout,
   and closes via endBatchYielded() when the loop completes.

3. Sub-element stores gate storeEventBus.emit() with batchCoordinator.isBatching
   Any store that is populated synchronously by a native .subscribe() callback
   (not storeEventBus) and emits per-element bus events MUST check isBatching:

   private emit(event: EventType, entity: EntityData): void {
       this.listeners.forEach(l => l(event, entity));       // always fire native
       if (!batchCoordinator.isBatching) {                  // ← THE GATE
           storeEventBus.emit({ elementId: entity.id, ... });
       }
   }

   Without this gate: each sub-element add() accumulates N events × M sub-elements
   in the storeEventBus buffer, multiplying drain chunks and delaying geometry drain.

   KNOWN VIOLATIONS (as of A39):
   - StairLandingStore   — fires 'stairLanding' events unconditionally
   - StairRailingStore   — fires 'stairRailing' events unconditionally

4. registerMany() + sync-drain for BimManager registration
   Instead of batchCoordinator.trackRegistration(fn) per element (which drains
   at REG_PER_FRAME = 8 per rAF → 29 frames for 231 walls):

   batchCoordinator.registerMany([
     { elementId, levelId, elementType }  // all elements grouped by level
   ]);  // → 0 rAF frames, single BimManager.registerMany() call, O(L+N)

   Reference: A38 implementation in CreateCurtainWallsOnAllSlabsCommand.

5. runtime.bus handler registered
   A CommandHandler for '<element>.create-on-all-<host>' is registered in
   engineLauncher.ts so runtime.bus.registry.has('<type>') returns true.
   Required precondition for Immer patches, MessagePack wire, Yjs convergence.
   The existing commandManager.execute() call site stays as the dual-write
   authoritative path until Phase F removes the legacy stack entirely.
─────────────────────────────────────────────────────────────────────────────
```

---

## §8 — Sub-Element Store Fan-Out Audit

The P1 problem (CurtainPanelStore fan-out, fixed in A39) is not unique to curtain walls.
The table below audits every store that emits `storeEventBus.emit()` and flags those that
are populated by a native synchronous subscriber (not storeEventBus), making them P1
candidates for any future batch operation that creates their parent element.

| Store | Events/mutation | Populated by | isBatching gate | P1 risk | Action needed |
|---|---|---|---|---|---|
| `CurtainPanelStore` | 1/panel (create/update/delete) | `CurtainPanelSyncHandler` via `curtainWallStore.subscribe()` | ✅ **FIXED A39 P1** | — | Done |
| `StairLandingStore` | 1/landing (create/update/delete) | `StairCreationController` populates synchronously on stair add | ❌ **NOT GATED** | HIGH — ~3 landings/stair × N stairs | Gate with `batchCoordinator.isBatching` |
| `StairRailingStore` | 1/railing (create/update/delete) | Populated on stair add | ❌ **NOT GATED** | HIGH — ~2 railings/flight × N stairs | Gate with `batchCoordinator.isBatching` |
| `WallStore` | 1/wall | Commands directly | ✅ (§BATCH-BUS-DISCARD in `_executeFinalSweep`) | — | Done via discard mechanism |
| `CurtainWallStore` | 1/wall | Commands directly | ✅ (outer batch from BatchCoordinator) | — | Done |
| `SlabStore` | 2/slab | Commands directly | ✅ (SlabFragmentBuilder isBatching-aware) | Low | Done |
| `RoomStore` | 3/room | `ReDetectRoomsCommand` (now frame-yielded) | Partial (REDETECT_ROOMS frame-yielded A39 P0) | Low (1 per level per frame) | Monitor |
| `ColumnStore` | 1/column | Commands directly | ❌ | Low (no batch-create-on-all yet) | Gate when column batch creation lands |
| `DoorStore` | 4/door | Commands directly | ❌ | Low (no batch-create-on-all yet) | Gate when door batch creation lands |
| `WindowStore` | 4/window | Commands directly | ❌ | Low | Gate when window batch creation lands |
| `RoofStore` | 4/roof | Commands directly | ❌ | Low | Gate when roof batch creation lands |
| `FurnitureStore` | 3/item | Commands directly | ❌ | Low | Gate when furniture batch creation lands |
| `PlumbingStore` | 3/item | Commands directly | ❌ | Low | Gate when plumbing batch creation lands |
| View/config stores (Sheet, Schedule, ViewDefinition, Template, etc.) | varies | Config operations | — | Negligible | Not batch-creation targets |

**Rule of thumb**: Any store populated synchronously by a native parent-store `.subscribe()`
callback (not via storeEventBus dispatch) is a P1 candidate if the parent element can be
batch-created.  Gate its `storeEventBus.emit()` with `batchCoordinator.isBatching` before
enabling batch creation of the parent.

---

## §9 — Per-Sprint Batch Creation Readiness Roadmap

### Curtain Walls — COMPLETE ✅

All five checklist items satisfied post-A39.

```
Bottleneck history:
  A36/A37: §BATCH-CW-PAUSE, §PERF-ADAPTIVE-DRAIN, §PERF-VIEW-BATCH-SUPPRESS  ✅
  A38:     registerMany, per-level grouping, sync-drain                        ✅
  A39:     rooms.redetect bus (P0), CurtainPanelStore gate (P1), bus type (P2) ✅
End-to-end: >20s → ≤1s for 11-slab / 66-wall reference project ✅
```

---

### Walls — Sprint A40 P1 (registerMany + create-on-all-slabs bus handler)

**Current state**: `CREATE_WALLS_ON_ALL_SLABS` uses `batchCoordinator.runBatch()` and
`wall.batch.create` dual-write, but still uses per-wall `trackRegistration()` rAF drain
(not `registerMany`).  No `wall.create-on-all-slabs` bus type or handler.

**Bottleneck to fix**:
```
CREATE_WALLS_ON_ALL_SLABS for 21 slabs × 4 walls = 84 walls:
├── trackRegistration per wall: ⌈84/8⌉ = 11 rAF frames = ~176ms  ← primary remaining gap
├── WallStore: no sub-element fan-out (§BATCH-BUS-DISCARD covers it)
├── wall.batch.create dual-write: fire-and-forget (legacy still authoritative)
└── No LONGTASK — WallJoinResolver already deferred by §BATCH-BUS-DISCARD
```

**Actions needed**:
1. Apply A38 `registerMany` pattern to `CreateWallsOnAllSlabsCommand._processSlabs()`
2. Add `'wall.create-on-all-slabs'` payload type to `packages/command-bus/src/commands.ts`
3. Register `wall.create-on-all-slabs` handler in `engineLauncher.ts`

---

### Slabs — Sprint A40 P2 (bus handler + registerMany)

**Current state**: `CREATE_SLABS_ON_ALL_FLOORS` delegates to individual `CreateSlabCommand`
instances per floor.  Each `CreateSlabCommand.execute()` calls `batchCoordinator.trackRegistration()`
once.  For 21 floors: ⌈21/8⌉ = 3 rAF frames = ~48 ms — already fast, but not zero.
No bus handler registered.

**Actions needed**:
1. Add `'slab.create-on-all-floors'` payload type to `packages/command-bus/src/commands.ts`
2. Register handler in `engineLauncher.ts`
3. Optional: inline registration into `registerMany` batch (low priority — only 21 slabs typical)

---

### Stairs — Sprint A40 P0 (critical: sub-element store gate)

**Current state**: `StairLandingStore` and `StairRailingStore` both emit `storeEventBus.emit()`
unconditionally on every `.add()` / `.update()` / `.delete()`.  This is the IDENTICAL P1 pattern
to the pre-A39 `CurtainPanelStore`.

**Impact**: A 10-stair batch (11-floor building, 1 stair/floor):
```
Without gate:
  10 stairs × (3 landings + 2 railings/flight × 2 flights) = 10 × 7 = 70 sub-element events
  + 10 stair events = 80 total (vs expected 10)
  stair.batch.create payload type is a stub — 'stairs: unknown[]' — needs a real shape

With gate (like CurtainPanelStore A39 P1):
  10 stair events only → 1 drain chunk → geometry drain starts immediately
```

**Actions needed**:
1. Gate `storeEventBus.emit()` in `StairLandingStore.add/update/delete()` with `batchCoordinator.isBatching`
2. Gate `storeEventBus.emit()` in `StairRailingStore.add/update/delete()` with `batchCoordinator.isBatching`
3. Verify `StairBuilder` reads `StairLandingStore` + `StairRailingStore` directly (not via bus events)
4. Promote `stair.batch.create` payload type from stub to typed shape

---

### Columns — Sprint A40 P2 (handler registration)

**Current state**: `column.batch.create` payload type exists in `commands.ts`.  No handler.
`ColumnStore` emits 1 event/column (no sub-stores).  No batch-create-on-all command.

**Actions needed**:
1. Register `column.batch.create` handler in `engineLauncher.ts`
2. Create `CreateColumnsOnAllLevelsCommand` (or equivalent) if multi-level column placement needed

---

### Beams — Sprint A40 P3

`beam.batch.create` payload type exists.  No handler.  No sub-stores.  Wire handler.

---

### Doors and Windows — Sprint A40 P3

`door.batch.create` + `window.batch.create` types exist.  No handlers.
Doors/windows are hosted inside wall openings — batch creation requires wall bus routing
to be settled first (E.5.x P2 wall migration).

---

### Ceilings — Sprint A40 P3

`ceiling.batch.create` type exists.  No handler.  No sub-stores.  Wire handler.

---

### Rooms — Sprint A41 (post-REDETECT_ROOMS frame-yield)

`BATCH_CREATE_ROOMS` (used by `ImportProjectCommand`) has `affectedStores` and runs
synchronously during project load.  No bus type.  Performance is acceptable today because
import is done during the loading overlay.  Add bus type + handler when Phase F Yjs
convergence requires it for cross-tab room sync.

---

### Roofs, Furniture, Plumbing — Sprint A42+

No batch-create-on-all commands exist.  Single-element commands are already fast (≤50 ms).
These become relevant when AI floor-plan generation produces large batches.

---

## §10 — Performance Budget (post-A39)

| Phase | Before A39 | After A39 | Target NFT |
|---|---|---|---|
| Command execution (CREATE_CW_ON_ALL_SLABS) | ≤150 ms ✅ | ≤150 ms ✅ | ≤500 ms |
| storeEventBus drain | 14 chunks × ~16 ms = ~224 ms | 1 chunk × ~16 ms = ~16 ms ✅ | — |
| REDETECT_ROOMS final sweep | 8,416 ms LONGTASK ❌ | ~176 ms / 11 frames ✅ | — |
| CurtainWallBuilder geometry drain | ~320 ms (after 8.4 s delay) | ~320 ms (starts immediately) ✅ | — |
| **Total end-to-end** | **>20 s** ❌ | **≤ 1 s** ✅ | **≤ 2 s** |

### Projected budgets for other element families (sprint A40 targets)

| Element | Current estimate | After A40 target | Dominant remaining bottleneck |
|---|---|---|---|
| Walls (21 slabs × 4 = 84 walls) | ~500 ms | ≤300 ms | registerMany drain (~176 ms) |
| Slabs (21 floors) | ~150 ms | ≤100 ms | Already fast; bus handler structural only |
| Stairs (10 stairs, 11 floors) | ~800 ms | ≤200 ms | Sub-element store fan-out (P1 pattern) |
| Columns (100 columns, 11 levels) | ~350 ms | ≤150 ms | No batch-create-on-all; bus handler missing |

---

## §11 — Invariants

| # | Invariant | Owner |
|---|---|---|
| I-1 | Panel geometry is always consistent with panelStore data after any batch | CurtainWallBuilder reads panelStore directly |
| I-2 | `batchCoordinator.isBatching` is `true` from `beginBatch()` through entire `endBatchYielded()` drain; `false` only in `onComplete` | BatchCoordinator §P1.4 |
| I-3 | `rooms.redetect` handler never runs during a batch (`_isBatching` guard in `_executeFinalSweep`) | BatchCoordinator §BATCH-BUS-DISCARD |
| I-4 | Legacy `commandManager.execute(ReDetectRoomsCommand)` path is preserved as fallback when `runtime` not injected | BatchCoordinator final sweep else-branch |
| I-5 | `curtain-wall.create-on-all-slabs` bus handler is additive — existing `commandManager.execute()` call site unchanged | Dual-write pattern (E.5.x P2) |
| I-6 | Gating sub-element store `storeEventBus.emit()` with `isBatching` only suppresses bus events; native `.subscribe()` callbacks always fire | §P1 contract (stores fire both layers independently) |
| I-7 | After `isBatching` → `false` (in `onComplete`), all subsequent sub-element operations emit normally | No permanent suppression |

---

## §12 — Files Changed in Sprint A39

| File | Change | Fix |
|---|---|---|
| `src/engine/engineLauncher.ts` | Register `rooms.redetect` CommandHandler on `runtime.bus` (`§P0-A39` block) | P0 |
| `src/engine/subsystems/curtainwalls/CurtainPanelStore.ts` | Gate `storeEventBus.emit()` with `batchCoordinator.isBatching` (`§P1-A39` comment) | P1 |
| `packages/command-bus/src/commands.ts` | Add `'curtain-wall.create-on-all-slabs'` payload type to `CommandPayloadMap` | P2 |
| `src/engine/engineLauncher.ts` | Register `curtain-wall.create-on-all-slabs` CommandHandler (`§P2-A39` block) | P2 |
| `docs/03_PRYZM3/03-CURRENT-STATE.md` | Sprint A39 stamp (rev 3) | doc |

---

## §13 — Follow-On Sprint Backlog (Sprint A40+)

The following work items are scoped, ready to implement, and ordered by impact.

### A40-W01 — Apply `registerMany` to `CreateWallsOnAllSlabsCommand`
**Impact**: Eliminates ~176 ms rAF drain for 84-wall batch.
**File**: `src/engine/subsystems/commands/walls/CreateWallsOnAllSlabsCommand.ts`
**Pattern**: Mirror `§REG-MANY-P1` from `CreateCurtainWallsOnAllSlabsCommand.ts`.

### A40-W02 — Gate `StairLandingStore` + `StairRailingStore` storeEventBus emissions
**Impact**: Prevents P1 fan-out for any future stair batch creation.
**Files**: `src/engine/subsystems/stairs/StairLandingStore.ts`, `StairRailingStore.ts`
**Pattern**: Mirror `§P1-A39` from `CurtainPanelStore.ts`:
```ts
import { batchCoordinator } from '../core/batch/BatchCoordinator';
// In add/update/delete:
if (!batchCoordinator.isBatching) {
    storeEventBus.emit({ elementId: id, elementType: 'stairLanding', ... });
}
```

### A40-W03 — Add `wall.create-on-all-slabs` + `slab.create-on-all-floors` bus types + handlers
**Impact**: Structural — closes E.5.x P2 gap for walls and slabs.
**Files**: `packages/command-bus/src/commands.ts`, `src/engine/engineLauncher.ts`
**Pattern**: Mirror `§P2-A39` from the curtain-wall registration.

### A40-W04 — Register handlers for all existing batch payload types
**Impact**: Structural — makes `registry.has()` return true for: `column.batch.create`,
`beam.batch.create`, `door.batch.create`, `window.batch.create`, `ceiling.batch.create`.
**File**: `src/engine/engineLauncher.ts`
**Risk**: Low — purely additive; no legacy path changes.

### A40-W05 — Promote `stair.batch.create` from stub to typed payload
**Impact**: Enables real stair batch creation routing via runtime.bus.
**File**: `packages/command-bus/src/commands.ts` — replace `{ stairs: unknown[] }` with typed shape.

### A41-W01 — Enable `affectedStores` CI gate
**Impact**: Prevents regressions — any new command missing `affectedStores` fails CI.
**File**: `.github/workflows/ci.yml` — enable `eslint-plugin-pryzm/affected-stores-required`.

### A41-W02 — Add `room.batch.create` bus type
**Impact**: Enables room batch creation routing for future AI floor-plan generators.
**File**: `packages/command-bus/src/commands.ts`.

### Phase F — Immer `produceWithPatches` + MessagePack ULID + Yjs
These are multi-week structural items.  All five checklist items must be green for ALL
element families before these begin.  See `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md`
and `29-WAVE-A19-YJS-COLLABORATION.md` for full specs.
