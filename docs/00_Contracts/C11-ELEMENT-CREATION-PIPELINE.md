# C11 — Element Creation Pipeline

> **Stamp**: 2026-05-03 · **Status**: CANONICAL  
> **Scope**: The complete end-to-end pipeline for element creation in PRYZM — from user gesture or AI response, through the command bus, through store mutation, geometry build, event fan-out, and renderer update. Covers **both** the UI-initiated path (user clicks a tool) and the AI-initiated path (AI generates a floor plan).  
> **Key principles**: P6 (commands are the only mutation path), P3 (single rAF / frame scheduler), P8 (every public function has ≥ 1 OTel span).  
> **Companion contracts**: C03 (command bus contract), C04 (rendering and scheduling), C06 (tool registration), C09 (AI and visibility intent).  
> **Authority**: When code disagrees with this contract, the code is wrong. When C03, C06 or C09 disagree with this contract on pipeline shape, this contract wins — it is the more specific authority.  
> **Gap notice**: §7 documents where today's code violates this contract. Every site listed there carries a `TODO(E.5.x)` annotation in source. The AS-IS gaps are known, measured, and tracked in `docs/03_PRYZM3/04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`.

---

## §1 — Why this contract exists

C03 defines the CQRS contract in four lines (`UI action → commandBus.dispatch → handler → stores.mutate → subscribers notified`). C06 defines the `Tool` interface. C09 says AI "expresses intent through the command bus." None of these documents shows the full orchestration sequence — what happens between "user clicks wall tool" and "wall mesh appears in the 3D viewport and room boundaries update."

This contract fills that gap. It is the normative description of how **all element creation flows** in PRYZM 3, whether initiated by a user gesture, a keyboard shortcut, or an AI workflow. It governs:

- The exact sequence of calls from gesture to store mutation.
- The handler contract: what a command handler MUST and MUST NOT do.
- The geometry and scene-commit sequence (and where it runs relative to the frame budget).
- The event fan-out that decouples wall creation from room redetection.
- The undo registration requirement.
- The AI-batch coalescing strategy that prevents LONGTASKs.

---

## §2 — The canonical element creation pipeline (target state)

Both the UI path and the AI path converge at the command bus. From that point forward, the pipeline is **identical**. The diagram below is the normative shape. Every bullet is a binding contract invariant (see §3–§6 for detail).

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  ENTRY POINT A — User gesture (interactive tool)                                         │
│                                                                                          │
│  User pointer/key event (DOM)                                                            │
│    → Tool.onPointerUp() / onKeyDown()              [registered via runtime.tools.register] │
│      → runtime.commandBus.dispatch(typeId, payload, { source: 'user' })                  │
│                                                                                          │
│  ENTRY POINT B — AI workflow                                                             │
│                                                                                          │
│  AI response JSON (from /api/anthropic proxy)                                            │
│    → packages/ai-host/ workflow coordinator                                              │
│      → runtime.commandBus.dispatch(typeId, payload, { source: 'ai' })                   │
│                                                                                          │
│  ENTRY POINT C — Remote collaboration (sync layer)                                       │
│                                                                                          │
│  Sync message (WebSocket frame)                                                          │
│    → packages/sync-client/ replay loop                                                  │
│      → runtime.commandBus.dispatch(typeId, payload, { source: 'remote' })               │
│                                                                                          │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │ All three paths converge here
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  COMMAND BUS (packages/command-bus/ — L1)                                                │
│                                                                                          │
│  runtime.commandBus.dispatch(typeId, payload, meta)                                      │
│    1. Validates payload against typed CommandRegistry entry (throws if unknown type)     │
│    2. Stamps command: { id: nanoid(), timestamp: Date.now(), source, ...payload }        │
│    3. Appends to command log (append-only; used for OTel trace + sync replay)            │
│    4. Routes to registered handler for typeId                                            │
│    5. Awaits handler completion                                                          │
│    6. If source === 'user' AND command is undoable: pushes patch to runtime.undoStack   │
│                                                                                          │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  COMMAND HANDLER (registered in plugins/*/src/handlers/ or packages/*/src/handlers/)     │
│                                                                                          │
│  handler(command, stores): void | Promise<void>                                          │
│    1. Validates domain invariants (level exists, payload in bounds, etc.)                │
│    2. Mutates the appropriate store slice via Immer draft                                │
│       → stores.elements.walls.set(wallId, wallEntity)                                   │
│    3. Registers geometry build as a DEFERRED task — MUST NOT build synchronously        │
│       → FrameScheduler.schedule('pre-render', () => WallGeometryBuilder.buildDeferred(wallId)) │
│    4. Emits a typed domain event to signal downstream subscribers                       │
│       → runtime.events.emit('wall.created', { levelId, wallId })                        │
│    5. (If batch context) registers with BatchCoordinator for coalesced post-batch sweep  │
│                                                                                          │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
         ┌────────────────────────┐    ┌────────────────────────────────┐
         │  GEOMETRY BUILD        │    │  EVENT SUBSCRIBERS             │
         │  (FrameScheduler,      │    │  (plugins/rooms/, plugins/     │
         │   pre-render slot)     │    │   ceiling/, etc.)              │
         │                        │    │                                │
         │  WallGeometryBuilder   │    │  runtime.events.on(            │
         │  .buildDeferred(id)    │    │    'wall.created',             │
         │    → THREE BufferGeom  │    │    async ({ levelId }) => {    │
         │    → scene-committer   │    │      runtime.commandBus         │
         │      .commitMesh()     │    │        .dispatch(              │
         │    → renderer update   │    │          'rooms.redetect',     │
         │      next rAF tick     │    │          { levelId }           │
         │                        │    │        );                      │
         └────────────────────────┘    │    }                           │
                                       │  )                             │
                                       └────────────────────────────────┘
                                                    │
                                                    ▼
                              ┌─────────────────────────────────────────┐
                              │  ROOM REDETECTION HANDLER               │
                              │  (plugins/rooms/src/handlers/)          │
                              │                                         │
                              │  handler dispatched via commandBus      │
                              │  → PlanarTopologyEngine per level       │
                              │  → FrameScheduler.schedule yields       │
                              │    between levels (no LONGTASK)         │
                              └─────────────────────────────────────────┘
```

---

## §3 — UI-initiated element creation (interactive tools)

### §3.1 — The tool activation contract

Tools are activated via `runtime.tools.activate(toolId, mode?)`. Only one tool may be active at a time. The active tool receives pointer and keyboard events from the canvas event dispatcher.

**Today (partially wired)**: `runtime.tools.register(toolId, activatorFn)` is called for 21 tool types in `ToolsAreaLayout.ts`. The activator function wires the tool to the canvas. This part is correct.

**The gap**: the activated tool's internal event handlers (onPointerUp, onKeyDown etc.) still call `commandManager.execute()` instead of `runtime.commandBus.dispatch()`. See §7 for the specific files and lines.

### §3.2 — Invariants for UI-initiated commands

- A tool MUST dispatch commands via `runtime.commandBus.dispatch(typeId, payload, { source: 'user' })`.
- A tool MUST NOT call `commandManager.execute()`. There MUST be no path from a pointer event to `CommandManager.ts` in the target state.
- A tool MUST NOT mutate stores directly (P6 — hard-fail CI gate).
- A tool MUST NOT call `window.dispatchEvent()` to signal element creation; it MUST use `runtime.events.emit()` (via the handler) instead.
- A tool MUST NOT start a geometry build synchronously inside a pointer event handler. Geometry MUST be deferred to the frame scheduler.
- Commands dispatched with `source: 'user'` MUST be pushed to the undo ring buffer automatically by the command bus (unless `{ undoable: false }` is set).
- Interactive wall creation of a single wall (user draws one wall segment) MUST complete within one frame budget (≤ 16 ms) for the store mutation. Geometry build is deferred.

### §3.3 — UI orchestration sequence (normative)

```
1. User presses pointer down on canvas
   → Tool.onPointerDown(event) — preview / snap display only; MUST NOT dispatch

2. User moves pointer
   → Tool.onPointerMove(event) — preview update (THREE ghost mesh); MUST NOT dispatch

3. User releases pointer (wall endpoint fixed)
   → Tool.onPointerUp(event)
     → runtime.commandBus.dispatch('wall.create', {
         start, end, levelId, height, thickness, systemTypeId, source: 'user'
       })

4. Command bus routes to plugins/wall/src/handlers/createWallHandler
   → Validates level exists in stores.project.levels
   → stores.elements.walls.set(wallId, wallEntity)   [Immer draft, ≤ 2 ms]
   → FrameScheduler.schedule('pre-render', () => WallGeometryBuilder.buildDeferred(wallId))
   → runtime.events.emit('wall.created', { levelId, wallId })

5. FrameScheduler fires at pre-render (next tick after command returns)
   → WallGeometryBuilder.buildDeferred(wallId)
   → scene-committer.commitMesh(wallId, geometry)
   → THREE mesh visible in renderer on next rAF tick

6. runtime.events subscriber in plugins/rooms/ fires asynchronously
   → runtime.commandBus.dispatch('rooms.redetect', { levelId })
   → PlanarTopologyEngine runs for one level (≤ 16 ms budget per level)
   → stores.elements.rooms updated (Immer draft)
   → plan-view re-renders via FrameScheduler subscription
```

---

## §4 — AI-initiated element creation

### §4.1 — The AI dispatch contract

AI workflows dispatch commands with `source: 'ai'`. The command bus pipeline is **identical** to the user path from dispatch onward. The only differences are:

| Aspect | UI path | AI path |
|---|---|---|
| `source` field | `'user'` | `'ai'` |
| Undo registration | Automatic (pushed to undo ring buffer) | MUST NOT push to undo buffer (C03 §4.2) |
| Batch coalescing | Not applicable (single element per gesture) | MUST use `BatchCoordinator.runBatch()` when creating multiple elements |
| Rate | One command per user gesture (interactive) | Potentially hundreds of commands (batch floor plan generation) |

### §4.2 — AI batch pipeline invariants

- AI workflows that create multiple elements MUST call them through `BatchCoordinator.runBatch()`, which suppresses intermediate `StoreEventBus` flushes and coalesces them into a single post-batch flush.
- The AI workflow coordinator (`packages/ai-host/`) MUST dispatch a batch command (e.g. `wall.batch.create`) rather than looping individual element commands. The batch command handler calls `BatchCoordinator.runBatch()` internally.
- `BatchCoordinator.endBatch()` MUST emit `runtime.events.emit('wall.batch.completed', { levelIds })` or equivalent. It MUST NOT call `commandManager.execute(new ReDetectRoomsCommand(...))` imperatively.
- Room redetection after a batch MUST be triggered as a typed event subscriber (async, frame-yielded), not as a synchronous imperative loop.

### §4.3 — AI batch orchestration sequence (normative)

```
1. AI response arrives (JSON from /api/anthropic proxy)
   → packages/ai-host/ parses response
   → Validates wall/slab/room entities against packages/schemas/ Zod schemas
   → Dispatches ONE batch command per element family:
       runtime.commandBus.dispatch('wall.batch.create',
         { slabIds: [...], source: 'ai' })

2. Command bus routes to plugins/wall/src/handlers/createWallBatchHandler
   → BatchCoordinator.runBatch(async () => {
       for (const slabId of slabIds) {
         await createWallsForSlab(slabId, stores);   // Immer draft mutations
         BatchCoordinator.trackRegistration(() => bimManager.registerElement(...));
       }
     }, { levelIds })

3. BatchCoordinator.endBatch() fires
   → StoreEventBus.flush() — coalesced single flush (2,034 events for a 9-slab batch)
   → runtime.events.emit('wall.batch.completed', { levelIds })
                                   ↑
                   NOT: commandManager.execute(ReDetectRoomsCommand) ×N

4. plugins/rooms/ subscriber fires asynchronously (via runtime.events.on)
   → for each levelId:
       await runtime.commandBus.dispatch('rooms.redetect', { levelId })
       await FrameScheduler.schedule('post-render', nextLevel)
                     ↑
         Yields between levels — no LONGTASK. Each level ≤ 16 ms.

5. Geometry build per element (batched)
   → FrameScheduler.schedule('pre-render', () => WallGeometryBuilder.buildDeferred(wallId))
                        ↑ registered once per wall during step 2; builds asynchronously
```

---

## §5 — Command handler contract (normative)

Every element creation handler registered with `runtime.commandBus` MUST conform to the following contract. This extends C03 §2.3.

### §5.1 — Handler signature

```ts
type ElementCreationHandler<P> = (
  command: Command<string, P>,
  stores: Stores
) => void | Promise<void>;
```

### §5.2 — Handler MUST

- Validate all domain invariants (level exists, payload values in bounds, no duplicate IDs) before any store mutation. If validation fails, throw a typed `DomainError` — do NOT silently succeed.
- Mutate stores ONLY via Immer draft (the `stores` argument). MUST NOT import store singletons directly.
- Register geometry build via `FrameScheduler.schedule('pre-render', buildFn)`. MUST NOT build geometry synchronously inside the handler.
- Emit a typed domain event via `runtime.events.emit(eventName, payload)` after store mutation succeeds.
- Register ≥ 1 OpenTelemetry span covering the handler body (C10 §3 requirement).
- Declare `affectedStores: ['elements', ...]` in the handler descriptor (runtime throws if absent).
- Complete the synchronous portion (store mutation only) within ≤ 16 ms (C10 NFT 4).

### §5.3 — Handler MUST NOT

- Call `commandManager.execute()` — this is a hard violation.
- Dispatch other commands (no cascading dispatch — C03 §2.3).
- Call `window.dispatchEvent()` — use `runtime.events.emit()` instead.
- Access DOM (`document.querySelector`, etc.).
- Call `requestAnimationFrame()` directly — use `FrameScheduler` (P3).
- Import from `src/engine/` or `src/ui/` — handlers live in `plugins/` or `packages/` and obey the layer boundary matrix (C01 §2).
- Mutate stores of other element families (e.g. a wall handler MUST NOT write to `stores.elements.rooms`). Cross-element effects are achieved through event subscribers.

---

## §6 — Post-command lifecycle

### §6.1 — Geometry build (frame-deferred)

After a handler writes to `stores.elements.walls`, the geometry build is scheduled into the frame pipeline:

```
FrameScheduler 'pre-render' slot
  → WallGeometryBuilder.buildDeferred(wallId)
      → packages/geometry-kernel/ computes BufferGeometry
      → scene-committer.commitMesh(wallId, bufferGeometry)
          → THREE mesh added to scene graph
              → Visible in renderer on next rAF tick
```

- Geometry build MUST NOT block the main thread for > 16 ms per element for a single wall.
- For batch creation (AI-generated floor plans), geometry build MUST be spread across multiple frames via the scheduler — not run as a single synchronous loop.
- The `FrameScheduler` is the single rAF owner (P3). Geometry builders MUST NOT call `requestAnimationFrame()` directly.
- **§PERF-ADAPTIVE-DRAIN**: Geometry builders that drain a per-frame queue SHOULD implement an adaptive budget rather than a fixed constant. The `CurtainWallBuilder` is the reference implementation: instance variable `_buildsPerFrame` starts at 5, increments by 1 (cap 12) when the previous drain took < 8 ms, decrements by 1 (floor 2) when it took > 14 ms. Target is ≤ 10 ms per drain cycle. The budget resets to the baseline at builder construction (project open). All three builders (`WallFragmentBuilder`, `CurtainWallBuilder`, `SlabFragmentBuilder`) SHOULD adopt this pattern. Source: `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` — `_buildsPerFrame` field; Sprint A37.

### §6.2 — Plan-view update

The 2D plan-view (Canvas2D pipeline) subscribes to `ElementStore` at 'render' priority via the frame scheduler. It re-renders automatically when `stores.elements.walls` changes. No explicit signal from the command handler is required.

- Plan-view re-render MUST complete within < 100 ms p95 after element mutation (C06 §5.1 / NFT 5).
- Plan-view rendering MUST run on an OffscreenCanvas worker thread when available (C06 §5.1).

### §6.3 — Room redetection (event-driven, not imperative)

Room boundaries are derived geometrically from walls, slabs, and ceiling elements. They MUST be recomputed after wall mutations. The trigger MUST be event-driven, not imperative.

**Target mechanism**:

```ts
// plugins/rooms/src/handlers/redetectRoomsHandler.ts
runtime.events.on('wall.created', async ({ levelId }) => {
  await runtime.commandBus.dispatch('rooms.redetect', { levelId });
});
runtime.events.on('wall.batch.completed', async ({ levelIds }) => {
  for (const levelId of levelIds) {
    await runtime.commandBus.dispatch('rooms.redetect', { levelId });
    await FrameScheduler.schedule('post-render', nextLevel);   // yield between levels
  }
});
```

- `rooms.redetect` MUST be dispatched once per affected level, not once per affected wall.
- Each `rooms.redetect` dispatch MUST run `PlanarTopologyEngine` for that level only.
- Multiple levels MUST be processed serially with a `FrameScheduler` yield between each (preventing LONGTASKs).
- Room redetection MUST NOT run synchronously on the main thread while the store mutation is still pending (i.e., MUST NOT run inside `BatchCoordinator.endBatch()` synchronously).

### §6.4 — Undo registration

- Commands dispatched with `source: 'user'` AND `undoable: true` (default): the command bus automatically pushes an undo patch to `runtime.undoStack` after the handler returns.
- The handler MUST produce a reversible store mutation. The Immer draft produces a structural patch automatically; handlers that use manual store writes MUST register a reverse patch explicitly.
- Commands with `source: 'ai'` or `source: 'remote'` MUST NOT be pushed to the undo buffer (C03 §4.2).
- For batch AI commands: the batch is a single undoable unit. One patch covering all elements in the batch is registered after `BatchCoordinator.endBatch()`.

### §6.5 — OTel spans

Every command handler MUST open a span at entry and close it at exit:

---

### §6.6 — Batch progress UX (BatchLoadingIndicator)

When `BatchCoordinator.runBatch()` is active, the platform MUST show a non-blocking visual indicator so the user knows the batch is in progress and does not interpret the slower frame rate as a crash.

**Contract invariants:**

- `BatchCoordinator` MUST expose `setBatchLifecycleCallbacks(onStart, onEnd)` — a public method that wires two fire-and-forget callbacks. Errors in callbacks MUST be caught; indicator failures MUST NOT interrupt batch coordination or store mutations.
- `onStart(elementCount: number)` MUST be called at the end of `_setupBatch()`, after all pause controls are armed and before any geometry is scheduled. `elementCount` is the estimated total (same value passed to `runBatch opts.totalElementCount`).
- `onEnd()` MUST be called in **three** places: (1) `_executeFinalSweep()` `onComplete` — normal happy path, after `_isBatching = false`; (2) `runBatch()` error catch block — batch aborted by exception; (3) `forceReset()` — project switch while a batch was mid-flight, BEFORE `_isBatching = false` (guards against stuck indicator on project switch).
- The indicator implementation MUST use `getFrameScheduler().addTickListener(key, tick, 'overlay')` for its animation — MUST NOT call `requestAnimationFrame()` directly (P3 single-rAF-owner rule, C04 §3).
- The indicator MUST be positioned as an overlay element (fixed positioning, z-index in the overlay layer) and MUST NOT intercept pointer events (`pointer-events: none`).
- The indicator animation key MUST be unique and not collide with existing keys (`'engine-loading-pyramid'`, `'engine-loading-progress'`). Reference implementation uses `'pryzm-batch-indicator-pyramid'`.

**Reference implementation:**
- `BatchCoordinator`: `src/engine/subsystems/core/batch/BatchCoordinator.ts` — `_onBatchStart`, `_onBatchEnd`, `setBatchLifecycleCallbacks()` (Sprint A37)
- `BatchLoadingIndicator`: `src/ui/overlays/BatchLoadingIndicator.ts` — 424-line self-contained DOM component; pyramid animation; purple gradient bar; fade in/out (Sprint A37)
- Wired at: `src/engine/engineLauncher.ts` — after `batchCoordinator.inject()` (Sprint A37)

```ts
const span = runtime.tracer.startSpan('wall.create.handler');
try {
  // handler body
} finally {
  span.end();
}
```

The span MUST include: `elementType`, `source` (user/ai/remote), `levelId`, `wallId`. Batch handlers MUST include `elementCount`.

---

## §7 — AS-IS gaps (where today's code violates this contract)

> **Last updated**: 2026-05-04. These are known, measured, and tracked. Every in-progress site carries a `TODO(E.5.x)` annotation in source. The full migration plan is in `docs/03_PRYZM3/04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`. The comprehensive gap analysis including alignment with all contracts and all element families is in `docs/03_PRYZM3/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md`.

### §7.1 — UI tool path violations (2 remaining)

| File | Line(s) | Violation | Target | Status |
|---|---|---|---|---|
| `src/engine/subsystems/walls/WallTool.ts` | 1535 | `commandManager.execute(new CreateWallsFromSlabCommand(...))` — user clicks "Create walls from slab" in a UI gesture | `runtime.commandBus.dispatch('wall.batch.create', ...)` | ⚠️ Active — design-fallback path, tracked TODO E.1 |
| `src/engine/subsystems/walls/WallTool.ts` | 1605 | `commandManager.execute(new CreateWallCommand(...))` — user draws a single wall segment | `runtime.commandBus.dispatch('wall.create', ...)` | ⚠️ Active — tracked TODO E.1 |

The deprecation header of `WallTool.ts` (lines 34–55) already names these as `E-bus.1` violations. The plugin replacement (`plugins/wall/src/tool.ts`) is wired with `runtime.bus.executeCommand` — the legacy `WallTool.ts` must be retired (TODO E.1).

**Previously listed violations now fixed (2026-05-03/04)**:

| File | Fix | Date |
|---|---|---|
| `BatchCoordinator._executeFinalSweep()` | `commandManager.execute(new ReDetectRoomsCommand(...))` ×N → `runtime.bus.executeCommand('rooms.redetect', ...)` with `getFrameScheduler().scheduleOnce()` frame yields between levels. 5,627ms LONGTASK eliminated. | 2026-05-03 |
| `CreateCurtainWallsOnAllSlabsCommand` | Bus dispatch via `runtime?.bus.executeCommand('curtain-wall.batch.create', ...)` after `_processSlabs()` | 2026-05-03 |
| `CreateWallsOnAllSlabsCommand` | Bus dispatch via `runtime?.bus.executeCommand('wall.batch.create', { walls: wallSpecs })` after `batchCoordinator.runBatch()` | 2026-05-03 |
| All 117 other `commandManager.execute()` call sites across P0–P11 families | Bridged via `runtime.commandBus.dispatch()` fire-and-forget before legacy path | 2026-05-03 |

### §7.2 — Handler interior protocol gaps (all 177 plugin handlers)

These gaps apply to **all element creation handlers across all families**, not just walls. See `34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3` for full compliance table.

| Gap | C11 clause | Handlers affected | Sprint |
|---|---|---|---|
| **`runtime.events.emit(eventName, payload)` not called after mutation** — no handler emits `'wall.created'`, `'slab.created'`, etc. Room redetect is triggered via a CustomEvent bridge workaround in `engineLauncher.ts:1306` instead of the canonical `runtime.events.on('wall.created', ...)` subscriber in `plugins/rooms/`. | §5.2, §6.3 | All 177 handlers (0 compliant) | S03 |
| **No OTel span in any handler** — `plugin-sdk` does not expose a tracer; no `tracer.startSpan(...)` call exists in any handler file | §5.2, §6.5; **C10 §2 merge blocker** | All 177 handlers (0 compliant) | S03 |
| **Geometry builders use internal rAF queues, not `FrameScheduler.schedule('pre-render', fn)`** — `WallFragmentBuilder` and `CurtainWallBuilder` manage their own deferred `requestAnimationFrame` queues. The rAF-owner gate passes (1 owner) but the canonical FrameScheduler API from `packages/frame-scheduler` is not used. | §5.2, §6.1 | All geometry builders | Wave A16 |
| **No `produceWithPatches` → no `{forward[], inverse[]}` patch pairs** — handlers use direct Map mutations or plain `produce()`. `PatchSnapshot.ts` utility exists but is not called. `RingBufferUndoStack` exists but receives no entries. Undo works via `CommandManager.createSnapshot()` (structuredClone — 80ms per undo on large projects). | §5.2; C03 §4.1 | All 177 handlers (0 compliant) | S03 |

### §7.3 — Remaining commandManager.execute() sites in src/

| File | Line | Context | Category | Blocker |
|---|---|---|---|---|
| `src/engine/engineLauncher.ts` | ~1437 | CustomEvent bridge fallback dispatching `commandManager.execute()` inside `pryzm-bus-rooms-redetect` handler (was line 1306 pre-§P2-A39 insertions) | Legacy bridge | Replace with `runtime.events.on('rooms.redetect', ...)` subscriber in P2f completion |
| `src/engine/subsystems/RemoteCommandDispatcher.ts` | 96 | `this.commandManager.execute(command, { source: 'REMOTE' })` — Entry Point C from §2 (remote collaboration path) is still going through legacy | Legacy bridge | Should use `runtime.commandBus.dispatch(command.type, command.payload, { source: 'remote' })` |
| `src/engine/engineLauncher.ts` | ~1475 | `commandManager.execute(command)` inside `curtain-wall.create-on-all-slabs` bus handler (§P2-A39 structural registration) | Intentional dual-write bridge | Full migration deferred to Wave A16 once `CreateCurtainWallsOnAllSlabsCommand` moves to plugins |
| `src/engine/engineLauncher.ts` | ~1505 | `commandManager.execute(command)` inside `wall.create-on-all-slabs` bus handler (§A40-W03 structural registration) | Intentional dual-write bridge | Full migration deferred to Wave A16 |
| `src/engine/engineLauncher.ts` | ~1536 | `commandManager.execute(command)` inside `slab.create-on-all-floors` bus handler (§A41-S04 structural registration) | Intentional dual-write bridge | Full migration deferred to Wave A21 |

Down from 214 (pre-P0) → 117 bridged (P0–P11) → **2 legacy-bridge** + **3 intentional-dual-write** = **5 remaining** (updated 2026-05-09). TSC clean throughout.

> **Note (2026-05-09):** The §7.3 table was last updated 2026-05-04 and reported "2 remaining". The §P2-A39 / §A40-W03 / §A41-S04 structural registrations (bus handler stubs that still delegate to `commandManager.execute()` as a transitional dual-write bridge) were added after that snapshot, raising the count to 5. The 3 new sites are intentional and carry C11 §7.3-gap annotations in engineLauncher.ts.

### §7.4 — Batch creation gaps for non-wall/curtain-wall families

C11 §4.2 requires ALL AI-initiated multi-element creation to use `BatchCoordinator.runBatch()`. Currently only walls and curtain walls satisfy this. See `34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §4` for the full family matrix.

| Family | Batch handler | BatchCoordinator | Status |
|---|---|---|---|
| Wall | ✅ `CreateWallBatch.ts` | ✅ | DONE |
| Curtain Wall | ✅ `CreateCurtainWallBatch.ts` | ✅ | DONE (2026-05-04) |
| Slab | ❌ | ❌ | Gap — Wave A21 |
| Column / Beam / Stair / Door / Window / Ceiling | ❌ | ❌ | Gap — Wave A21 |

### §7.5 — Previously listed §7.4 CommandRegistry entries

All entries from the original §7.4 have been added to `packages/command-bus/src/commands.ts` during P0–P11 (doc 23). The following were added: `wall.create`, `wall.batch.create`, `curtain-wall.create`, `curtain-wall.batch.create`, `rooms.redetect`, plus all F3–F13 family entries. No missing entries remain for currently implemented handlers.

---

## §8 — Verification contract

An implementation satisfies this contract when all of the following hold simultaneously:

### §8.1 — Static gates (CI)

```bash
# No commandManager.execute() anywhere in src/
rg "commandManager\.execute" src --type ts -l | wc -l        # → 0

# No window.dispatchEvent in element creation paths
rg "window\.dispatchEvent.*bim-wall\|bim-curtain\|bim-slab\|bim-room" src --type ts   # → 0

# No requestAnimationFrame outside frame-scheduler
rg -l 'requestAnimationFrame\(' . --type ts \
  -g '!node_modules' -g '!dist' | grep -v 'frame-scheduler' | wc -l  # → 0

# TypeScript clean
pnpm tsc --noEmit                                             # → 0 errors
```

### §8.2 — Runtime gates (browser observation, 9-slab curtain-wall batch)

After a 9-slab curtain-wall batch via the AI panel:

```
MUST observe in browser console:
  [CommandBus] DISPATCH: wall.batch.create   (NOT: [CommandManager] EXECUTE)
  [CommandBus] DISPATCH: rooms.redetect ×9  (NOT: [CommandManager] EXECUTE)
  FPS ≥ 30 throughout batch completion
  No LONGTASK with duration > 100ms in browser performance panel

MUST NOT observe:
  [CommandManager] EXECUTE: REDETECT_ROOMS
  [LONGTASK] duration=5627ms (or any LONGTASK > 100ms during batch)
  "geometry grew 2300%" warning from GPU Monitor
```

### §8.3 — Runtime gates (UI single wall creation)

After the user draws a single wall segment with the Wall tool:

```
MUST observe in browser console:
  [CommandBus] DISPATCH: wall.create   (NOT: [CommandManager] EXECUTE: CREATE_WALL)
  [CommandBus] DISPATCH: rooms.redetect ×1  (for the affected level)

MUST observe in renderer:
  Wall mesh appears within 2 frames of pointer-up event (< 33ms)
  Room boundaries update within 100ms of pointer-up (plan-view NFT 5)

Undo behavior:
  Ctrl+Z reverts the wall (wall mesh disappears, room boundaries revert)
  Ctrl+Y re-applies the wall
```

### §8.4 — OTel verification

```bash
# Every handler must emit at least one span
pnpm run ci:check-spans                                        # → 0 missing spans
```

---

## §9 — Cross-references

| Topic | Canonical source |
|---|---|
| CQRS command bus shape (4-line overview) | `C03-SCHEMAS-COMMANDS-AND-STATE.md §2` |
| Tool registration interface (`Tool` interface) | `C06-UI-SHELL-AND-TOOLS.md §4` |
| AI dispatch contract (`source: 'ai'`) | `C09-AI-AND-VISIBILITY-INTENT.md §1` |
| Rendering and frame scheduler | `C04-RENDERING-AND-SCHEDULING.md` |
| Performance NFTs (16ms budget, plan-view 100ms) | `C10-PERFORMANCE-AND-OBSERVABILITY.md` |
| Full 214-site migration plan (P1–P11) | `docs/03_PRYZM3/04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md` |
| Wall/curtain-wall/room hot path task (file 32) | `docs/03_PRYZM3/04-PLAN-FORWARD/32-TASK-WALL-CURTAINWALL-CMD-BUS-AUDIT.md` |
| Layer boundary matrix (handler package placement) | `C01-ARCHITECTURE-AND-GOVERNANCE.md §2`, `docs/03_PRYZM3/02-ARCHITECTURE.md §2` |
| `BatchCoordinator` source | `src/engine/subsystems/core/batch/BatchCoordinator.ts` |
| `WallTool` E-bus.1 deprecation notice | `src/engine/subsystems/walls/WallTool.ts:34–55` |
| Live LONGTASK evidence diary entry | `docs/03_PRYZM3/03-CURRENT-STATE.md §10 2026-05-03d` |
