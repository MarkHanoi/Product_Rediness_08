# C11 — Element Creation Pipeline

> **Stamp**: 2026-05-03 · **Status**: CANONICAL · **Last amended**: 2026-05-19 (Comprehensive Audit Rev 7)
> **Scope**: The complete end-to-end pipeline for element creation in PRYZM — from user gesture or AI response, through the command bus, through store mutation, geometry build, event fan-out, and renderer update. Covers **all three views** (3D, plan/2D, elevations) and **all element types** (wall, slab, curtain wall, ceiling, roof, column, beam, floor, opening, stair, handrail, furniture, plumbing, lighting, annotation, door, window, grid, room). Covers **both** the UI-initiated path (user clicks a tool) and the AI-initiated path (AI generates a floor plan).
> **Key principles**: P6 (commands are the only mutation path), P3 (single rAF / frame scheduler), P8 (every public function has ≥ 1 OTel span).
> **Companion contracts**: C03 (command bus contract), C04 (rendering and scheduling), C06 (tool registration), C09 (AI and visibility intent), C14 (legacy elimination — bridge-pattern invariants).
> **Authority**: When code disagrees with this contract, the code is wrong. When C03, C06 or C09 disagree with this contract on pipeline shape, this contract wins — it is the more specific authority.
> **Gap notice**: §7 documents where today's code violates this contract. Every site listed there carries a `TODO(E.5.x)` annotation in source. The AS-IS gaps are known, measured, and tracked in `docs/archive/pryzm3-internal/04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`.
> **2026-05-19 Comprehensive Audit Rev 2**: §3.2 extended with the MANDATORY ID pre-generation invariant (root cause of FIX-WALL-ID, FIX-CW-ID, FIX-BEAM-ID). §7.0 updated with FIX-BEAM-ID. §11.0 added: Plan Tool ID Pre-generation Compliance Matrix (all 17 element types). §12 added: Three-Pipeline Architecture Reference. All element types audited end-to-end for the first time. Three additional silent failure sites remained (discovered in subsequent session — see Rev 3).
> **2026-05-19 Comprehensive Audit Rev 3**: §7.0 updated with three additional production-breaking defects (FIX-PLAN-VDT-BIMMANAGER, FIX-NAN-Y, FIX-DEACTIVATE-GUARD) that together caused walls to be invisible in both plan view and 3D view even after FIX-WALL-ID was applied. Root causes: (1) missing `viewDependencyTracker.registerElement` + `bimManager.registerElement` calls in §P2.1 bridge → plan view always rendered blank; (2) `wall.baseOffset ?? 0` missing in `WallFragmentBuilder` → NaN vertex Y coordinates in all wall meshes; (3) `PlanViewManager.deactivate()` throw propagating out of view switch → 3D view permanently blocked. All three are now fixed and permanently recorded in §7.0.
> **2026-05-19 Comprehensive Audit Rev 4**: §7.0 updated with two additional defect groups. **FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES**: the same missing `viewDependencyTracker.registerElement` + `bimManager.registerElement` pair that caused plan-view blank for walls (Rev 3) was absent from ALL six remaining geometry-element bridges in `initTools.ts` — curtain wall (§P3.1-CW), ceiling (§P3.2-CL), roof (§P3.2-RF), column (§P3.3-CO), slab (§FT1), and beam (§FT2). Each bridge created a 3D mesh via the legacy store but never populated `level.childrenIds` → `NativeElementMeshExporter.exportForView()` returned 0 elements of that type → plan-view always blank for those element types when created via the bus path. **FIX-P4-FLOOR-BIMMANAGER**: the floor bridge (§P3.2-FL) did have `bimManager.registerElement()` but invoked it as `(window as any).bimManager?.registerElement?.()` — a C14 §LP-01 P4 prohibited pattern (window-as-namespace). Replaced with the properly-imported `bimManager` instance that is already in scope; `viewDependencyTracker.registerElement` also added. §10.2 updated with Bridge Invariant 7 and 8. §11 matrix updated with VDT+bimManager compliance column. §11.2 checklist updated with mandatory registration steps.
> **2026-05-19 Comprehensive Audit Rev 5**: §7.0 updated with **FIX-EVENTBUS-DISPOSABLE-CALL** — the *true* root cause behind FIX-DEACTIVATE-GUARD (Rev 3). `runtime.events.on()` (the `EventBus`, C02) returns a `Disposable` (`{ dispose() }`), **not** an unsubscribe function. `SplitViewManager` and `PlanViewManager` stored that return in `(() => void) | null` fields and invoked it as `unsub?.()`, throwing `TypeError: … is not a function` and aborting `deactivate()` — this wedged the split-view toggle button and, pre-FIX-DEACTIVATE-GUARD, blocked 3D-view activation. FIX-DEACTIVATE-GUARD's `try/catch` only masked the symptom (and silently leaked every listener/timer/DOM node below the throw site). Rev 5 fixes the throw at source and retypes the unsub fields `{ dispose(): void } | null` so the misuse is compiler-caught. The FIX-DEACTIVATE-GUARD row carries a Rev 5 correction note.
> **2026-05-19 Comprehensive Audit Rev 6**: §7.0 updated with **FIX-VIEWSWITCH-DROP** — `WallRebuildCoordinator._scheduleFlush()` dropped wall mutations that arrived during a view switch (the early-return ran *before* the event was queued, with no re-queue path). Events are now always queued; the `_viewSwitchInProgress` check only defers the flush, and the `view-activated` clear handler drains the queue. New **§12 — Split-View 3D Synchronization & Camera Framing** added: documents the split-view 3D-pane (canvas-mirror) architecture, the bus→builder 3D-mesh path for plan-pane element creation, and the normative first-element camera-framing rule.


---

## §0.0 — ⛔ CORRECTION 2026-08-18: §11's MATRIX ORDERS THREE BRIDGES BUILT THAT SHIPPED — AND THIS CONTRACT ALREADY SAID SO

§11's normative matrix marks **handrail**, **furniture** and **lighting** as **"❌ No bridge"**, and
**§11.1 carries an OPEN work order to build one of them.** All three are live in
`apps/editor/src/engine/initTools.ts`:

| Family | Registration log line | Measured `file:line` |
|---|---|---|
| handrail | `[initTools] §FT-HANDRAIL: handrail.created bus→legacy-store bridge registered.` | `initTools.ts:2050` |
| lighting | `[initTools] §FT-LIGHTING: lighting.created bus→legacy-store bridge registered.` | `initTools.ts:2111` |
| furniture | `[initTools] §FT-FURNITURE: furniture.created bus→legacy-store bridge registered.` | `initTools.ts:2217` |

```
grep -n "bridge registered" apps/editor/src/engine/initTools.ts
```

⚠ **Cite these line numbers only after re-running that grep** — `initTools.ts` is under active edit
and the numbers move; an earlier statement of this same finding cited `:1919/:1967/:2031`, which now
point at unrelated lines. **The `§FT-*` tags are stable; the line numbers are not. Grep the tag.**

⭐ **§11.9, §11.11 and §11.19 of THIS CONTRACT already describe these bridges as existing.** C11
contradicts itself, and the matrix — the part an engineer reads to decide what to build — is the
half that is wrong. **§11.1's work order is DISCHARGED; do not execute it.**

### §7.2's "no OTel span" claim is also false

§7.2 states there is *"no OTel span, and `plugin-sdk` exposes no tracer"*. Measured:

```
grep -rIl "withHandlerSpan" --include=*.ts --exclude-dir=node_modules packages apps plugins | wc -l
# -> 253
```

**`withHandlerSpan` is used in 253 files.** The tracer is exposed and used at scale.

⚠ **But do not read that as P8 satisfied** — the two facts are independent. The span *gate*
(`tools/ga-gate/check-otel-spans.ts`) is **RC=3**: Zone A 246/246, **Zone B 54 uninstrumented of 70
against a shrink-only baseline of 52**, and Zone C (the "every exported function" clause) is
**ungated** at 1772 of 2023 without a span. **The plumbing exists; the coverage invariant does not
hold.** State both.

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

### §3.4 — Plan-surface capability parity (main plan view ≡ split-view plan pane)

**Normative.** PRYZM exposes the plan through two surfaces: the MAIN full-screen plan
view (`apps/editor/src/engine/views/PlanViewToolOverlay.ts`, owned by `PlanViewManager`)
and the SPLIT-view plan pane (`apps/editor/src/engine/views/SvpPlanToolOverlay.ts`, owned
by `SplitViewManager`). **Both surfaces MUST expose the IDENTICAL element-tool and
interaction capability set. There is no "primary" plan surface with a richer tool set.**
Enforced structurally, not by parallel hand-maintained lists:

- **Draw / annotation tools** — both overlays build their handler map from the SINGLE
  shared `plantools/planToolHandlerRegistry.ts` (`createPlanToolHandlers()`). A new tool
  added there appears on BOTH surfaces automatically; neither overlay may declare a private
  handler map or subset. (§FIX-PLAN-VIEW-PARITY / L-73.)
- **ContextualEditBar element tools (Move / Copy-place / Align)** — activated
  programmatically via `<overlay>.setActiveTool(toolId)`. BOTH overlays expose the same
  `setActiveTool` + `isAttached` API, and the ContextualEditBar routes to whichever plan
  surface is attached (`ContextualEditBar._activatePlanTool`), so an element transform
  (e.g. move a window → `window.setOffset` / `MOVE_WINDOW`) commits the SAME command on
  either surface. (§FIX-PLAN-ELEMENT-TOOL-PARITY / L-95.) Rotate / Scale are driven by the
  surface-independent 3-D transform tools (`transformControls` / `scaleTool`) acting on the
  selected element, so they are already plan-surface-agnostic.
- **Applied SYSTEM TYPE (element authoring)** — plan-surface parity includes the applied
  system type, not just thickness/geometry. The selected wall system type (the layered
  composition) MUST be stored in a stable, surface-independent source
  (`plantools/activeWallSystemType.ts`), NOT only on the transient `window.wallTool`
  instance, so a wall drawn in the SPLIT plan pane threads the SAME `systemTypeId` into
  `wall.create` as one drawn in the MAIN plan view (never `systemTypeId=none` → a plain
  wall). (§FIX-SPLIT-WALL-SYSTEMTYPE / L-98; ADR-0055; C16.)
- **Direct element move/drag + snapping + hover + selection** — owned by the shared,
  canvas-agnostic `PlanViewInteraction` + `planElementDragController` singleton, attached
  by BOTH `PlanViewManager` (main canvas) and `SplitViewManager` (SVP canvas). A hosted
  door/window drag commits the same command regardless of which pane started it. (L-73.)
- **The split-view 3-D pane MUST be a true mirror of the main 3-D view** — same scene,
  camera-synchronised, with identical picking/interaction — so any change to the main 3-D
  view (geometry, camera, selection, edits) is ALWAYS reflected in the split 3-D pane.
  (§FIX-SPLIT-3D-MIRROR / L-96.)

Invariant: **a plan capability that works in one surface MUST work in the other.** New
plan tools/interactions are wired through the shared registry / shared interaction layer,
never per-overlay, so the two surfaces cannot drift.

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

### §5.2.1 — MUTATIONS EMIT TOO, AND FOR EIGHT MONTHS NONE DID (NORMATIVE), added 2026-08-23

> Added by lane MIRROR3 (L-9940…L-9948). §5.2 above says *"Emit a typed domain event via
> `runtime.events.emit(eventName, payload)` after store mutation succeeds"* — and it was
> read, universally, as a rule about **creation**.

**MEASURED, and it is one number:**

```
grep -c "\.created'"  apps/editor/src/engine/initTools.ts   ->  17
grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->   0
```

Seventeen create-mirrors. **Zero update-mirrors.** Every element family could be CREATED
and reach the render layer; **none could be UPDATED and reach it.** That single asymmetry
is the mechanical cause of four separately-reported founder defects — the invisible pool,
the invisible boundary line, the lift shaft that penetrates the model and not the screen
(L-9403), and the thirteen `*.setMaterial` verbs that had to be turned into refusals
(§FIX-MATERIAL-DEAD-DISPATCH, ADR-0117).

**THE RULE.** §5.2's emit obligation binds **every** verb that mutates authoritative state,
not only creates. Concretely, there are now **three** channels and a verb MUST use the one
that fits:

| what changed | channel | shape |
|---|---|---|
| a new element exists | `<family>.created` | per-family, carries GEOMETRY |
| its storey changed | `element.level-changed` (§L-946) | family-agnostic, TABLE-driven (`LEVEL_CHANGE_VERBS`) |
| a field of it changed | `element.updated` (§MIRROR-UPDATE, L-9942) | family-agnostic, TABLE-driven (`ELEMENT_UPDATE_VERBS`) |

⭐ **THE TWO MUTATION CHANNELS ARE TABLES, NOT `case` BLOCKS, AND THE REASON IS IN THIS
CONTRACT'S OWN HISTORY.** The twelve (now eighteen) `.created` cases are one block per
family, and §7 of this contract is a table of the fields they each silently dropped —
`materialColor`, `layers`, `curve`, `finishSpec`, one family at a time, each its own
founder-visible defect (L-927, L-239, L-972, L-973). A mutation carries the same three
facts for every family, so it gets ONE event, ONE subscriber, and a row per verb.

⛔ **A COMPOUND EMITS ITS MEMBERS' EVENTS — INCLUDING ITS MUTATIONS.** §5.2's create rule
already produces the balcony/lift/pool idiom (one member event per member, stamped with the
MEMBER's own verb, because every legacy mirror keys on COMMAND TYPE). The same applies to
the parts of a compound that MUTATE something pre-existing: `pool.create` punches a void in
its host slab and `lift.create` punches one per served storey, and both are `replace`
patches on an EXISTING record that no create-mirror can see. Both now emit
`element.updated`. **A compound that mutates a host and emits only creates is a partial
create reported as a complete one.**

⛔ **AND A MEMBER WITH NO CHANNEL IS NAMED, NEVER SMUGGLED.** C104 §13.3 R-13 is generalised
here: a create that produces a member no renderer can draw MUST say so, at the layer that
knows, and MUST NOT reuse another family's channel to make something appear. The pool's
WATER is the live instance — emitting `slab.created` for it would put one id on two
families and give the water a thickness it does not have (C84 EI-9). It is reported by name
(L-9941) and left invisible until it gets a builder of its own.

⚠ **The diagnostic that reports it MUST go quiet when there is nothing to report.** A
warning on every successful create is a warning nobody reads, which fails in exactly the way
silence does — and it MUST NOT be deleted when its last row closes, because its job is to
notice the NEXT member kind that arrives without a mirror.

**GATE.** `tools/ga-gate/check-mirror-completeness.ts` (registered) enumerates every verb
whose `affectedStores` names a plugin DTO store and requires a channel or a measured ledger
row. ⚠ **It establishes DECLARATION, not reachability** — it says so on every run. C16 §5.1
`CA-21` is the other half, and it needs an executed read-back from a RENDER / PERSIST /
EXPORT store.

### §5.3 — Handler MUST NOT

- Call `commandManager.execute()` — this is a hard violation.
- Dispatch other commands (no cascading dispatch — C03 §2.3).
- Call `window.dispatchEvent()` — use `runtime.events.emit()` instead.
- Access DOM (`document.querySelector`, etc.).
- Call `requestAnimationFrame()` directly — use `FrameScheduler` (P3).
- Import from `src/engine/` or `src/ui/` — handlers live in `plugins/` or `packages/` and obey the layer boundary matrix (C01 §2).
- Mutate stores of other element families (e.g. a wall handler MUST NOT write to `stores.elements.rooms`). Cross-element effects are achieved through event subscribers.

### §5.4 — Element-type DOMAIN RULES resolve at the command, NEVER in the tool (NORMATIVE)

> Added by §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240), after the same class of defect
> recurred five times in one cycle (L-213 floor finishes, L-214 wardrobe rotation, L-220
> plumbing drag, L-239 wall layers, L-240 floor finishes AGAIN).

**The rule.** If a property of an element is determined by the *kind of thing it is* — not by
what the user drew — then it MUST be derived **inside the create command**, keyed off the
payload's declared intent. It MUST NOT be derived in a tool and passed in.

**Why.** "One element type ⇒ one creation pipeline" (§1) is not satisfied by making N tools each
call the same helper. That is convergence *by coincidence*: it holds only until tool N+1 is
written, and nothing fails when tool N+1 omits the call. L-213 converged two of three
floor-finish paths onto `deriveRoomFinishBoundary` and shipped a test named *"UI↔batch
convergence"*; the test stayed green for a month because **it compared the two paths that were
already converged and never enumerated the third**, which was shipping wrong geometry the whole
time. A derivation that lives at the chokepoint cannot be omitted, because there is nowhere to
omit it from.

**Therefore, when adding a creation path:**

1. A tool's job is to capture **intent + raw input**. It declares *what the polygon/transform
   means*; it does not compute the element's final geometry.
2. Any *"a &lt;type&gt; is always …"* rule belongs in the command handler.
3. If a payload can carry BOTH a derived and a non-derived form of the same field, the payload
   MUST carry an explicit **intent discriminator**, and the command MUST behave safely when the
   discriminator is **omitted** (a new tool that says nothing must get the *correct* behaviour,
   not the legacy one).
4. Convergence tests MUST be **N-way and enumerate every path**, and MUST exercise the
   **chokepoint**, not the shared helper. A test that compares two callers of one function proves
   nothing about a third caller that never calls it.

#### §5.4.1 — Floor-finish boundary (the worked example, BINDING)

> **A floor finish is bounded by the INNER FACES of its bounding walls.**

A room's `boundary.polygon` runs along the wall **CENTRELINES** (the planar face tracer walks
wall-graph nodes on `wall.baseLine`). A finish built on that ring overshoots into every bounding
wall by half its thickness and overlaps the neighbouring room's finish *under* the partition.

- The derivation is `deriveRoomFinishBoundary` (pure geometry) wrapped by
  `resolveRoomFinishBoundary` (the single store-aware wall resolution), both in
  `@pryzm/room-topology`.
- It is applied **once**, inside **`CreateFloorCommand`** (`packages/command-registry/src/floors/`),
  which every floor-creation path passes through. Tools do not inset polygons.
- `CreateFloorPayload.boundarySource` is the intent discriminator:
  - **`'room-centreline'`** — the polygon is a room ring; the command insets it to the inner
    faces. (3D FloorTool AUTO_FROM_ROOM, `CreateFloorsByRoomTypeCommand`, any future
    floor-a-room tool.)
  - **`'explicit-polygon'`** — the polygon is stated geometry; it is stored **VERBATIM**.
  - **omitted** — the command *infers*: a polygon that IS the host room's centreline ring
    (`ringsCoincide`) is a room-derived boundary whose author forgot to declare it, and is
    inset. This is what makes omission non-fatal for a future tool.
- **Double-insetting is impossible by construction:** the command only ever insets a ring it has
  *proven* to be a centreline, and a correctly-inset finish lies strictly inside that ring.
  Converge, never compensate.

#### §5.4.2 — DRAW vs AUTO: explicit user intent is never re-derived (BINDING)

> **A hand-drawn polygon is the user's stated geometry. It MUST NOT be silently re-inset.**

Only **room-derived** boundaries are inset. `FloorTool` auto-detects a host room from a drawn
polygon's centroid — that autodetect exists to **HOST** the floor (so `hostRoomId` /
`coveredRoomIds` / the room's finish material resolve), and **hosting ≠ re-deriving**. A DRAW-mode
floor declares `'explicit-polygon'` and is stored exactly as drawn, host room or not.

This is settled. Do not re-litigate it by "fixing" DRAW mode to match AUTO.

#### §5.4.3 — Known residual: `floor` has TWO command implementations (C11 debt)

Floors are created through **two** code paths that are not yet unified:

| | implementation | reached by |
|---|---|---|
| legacy | `CreateFloorCommand` (`@pryzm/command-registry`) | 3D FloorTool (AUTO + DRAW), `CreateFloorsByRoomTypeCommand` (all AI/batch generators), residential + office executors, ProjectLoader, `ImportProjectCommand`, IFC import, `CREATE_FLOOR` replay |
| bus | `CreateFloorHandler` (`plugins/floor`) — the `floor.create` handler | `FloorPlanToolHandler` (plan-view tool) only |

The bus handler **cannot** host the §5.4.1 rule today: its `HandlerContext` exposes only the
`floor` store, rooms and walls live in the legacy singletons, and `pryzm/store-single-channel`
(plus P4) forbids a plugin handler reaching for them. So `FloorPlanToolHandler` derives the
boundary in the tool via the same canonical `resolveRoomFinishBoundary` and dispatches the
finished ring. **This is the one sanctioned exception**, and it is a symptom of the dual-command
debt, not a licence for other tools. Retiring `CreateFloorCommand` in favour of the bus handler
(once rooms/walls are in the plugin store world) collapses the exception.

---

### §5.5 — ⭐ `affectedStores` IS A PROMISE THE **REGISTRATION** KEEPS, NOT THE HANDLER (NORMATIVE — ADR-0367, L-9921/L-9922)

§5.2 requires every handler to declare `affectedStores`. **That declaration is
inert on its own.** In production the bus's stores provider is
`storesAsRecordView(stores)` over `stores[plugin.storeKey]`, accumulated from
`ALL_PLUGINS` in `bootstrap.everything.ts`. If no registration contributes a
matching `storeKey`, `CommandBus.buildContext` throws

```
<verb>: required store '<key>' is missing from HandlerContext.stores
```

**BEFORE any mutation.** The handler is registered, correct, unit-tested — and
undispatchable by the application.

⛔ **This is not hypothetical and it is not rare. It has happened TEN times:**
furniture, plumbing, rooms, structural, dimensions (E-finish.0.E), lighting
(§LIGHTING-STORE-FIX), pool (L-5200), lift (L-5700), balcony (L-5600) and
`section-view` (L-9922). The last was registered on the real runtime bus by
`engineLauncher.ts:711` and threw on **every** dispatch of all six `section.*`
verbs.

**NORMATIVE — a PR that adds or moves a command handler MUST satisfy all four:**

1. **A registration exists** for the plugin in `ALL_PLUGINS`, authored either
   inline or — preferred — in `plugins/<x>/src/registration.ts` against the L5
   `PluginRegistration` contract (C01 §2.1).
2. **`storeKey` equals the key the handlers read**, which is *not* required to
   equal the plugin id. `section-view` registers `'section'`;
   §FIX-DIMENSION-STOREKEY-SINGULAR (L-138) is the same divergence in the other
   direction. ⚠ Verify against `affectedStores` and `ctx.stores.<key>`, never
   against the directory name.
3. **`id` equals the directory name under `plugins/`**, because
   `check-plugin-census-equivalence.ts` compares that set against `ls plugins/` in
   both directions.
4. **The id is listed in `ELEMENT_PLUGIN_IDS`** (or named in
   `STORE_ONLY_PLUGIN_IDS` with a written reason). ⚠ Omitting it fails nothing
   loudly — the bootstrap suite's per-plugin storeKey assertion simply stops
   iterating it. That silent hole is census arm F.

⭐ **PROOF OBLIGATION — a plugin's own suite CANNOT discharge this.** A plugin test
builds its own stores object and hands it to the bus as the provider; **the
provider is the thing that breaks**, so a test that supplies it cannot observe its
absence. `pool.create` passed its own suite for months while being undispatchable.
The proof must read the store off the **REAL composition root** and construct
nothing —
`apps/editor/__tests__/sectionViewReachableThroughComposedRuntime.test.ts` and its
boundary-line / lift / pool siblings are the pattern.

⚠ **AND IT IS STILL NOT A CLAIM THAT THE FEATURE WORKS.** Dispatchability is one
axis. C104 R-10 makes a reachability claim inadmissible without a **pointer-layer**
proof, and neither axis says the element renders. Three separate facts, three
separate proofs — see [[verification-dispatch-rendering-three-milestones]].


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

### §6.2 — Plan-view update (ACTUAL mechanism — 2026-05-19 rewrite)

> **Note**: The previous description of this section ("subscribes to `ElementStore` at 'render' priority via the frame scheduler") was aspirational (target state). It did not match the AS-IS implementation. This rewrite documents the actual mechanism. The target-state version is preserved in §6.2.T below.

**AS-IS mechanism (canonical as of 2026-05-19)**

The plan-view (Canvas2D) update is NOT driven by a direct `ElementStore` subscription. It is driven by a **five-stage event chain** that begins with a legacy store mutation:

```
Stage 1 — Legacy store mutation
  initTools.ts bus→legacy-store bridge (runtime.events subscriber)
    calls LegacyXxxStore.add(element)
        ↓
Stage 2 — storeEventBus signal
  Every legacy element store's add() MUST call:
    storeEventBus.emit({ elementType, elementId, operation: 'create', timestamp })
  (The storeEventBus singleton is packages/core-app-model/src/storeEventBus.ts)
        ↓
Stage 3 — ViewTechnicalDrawingCache._onStoreChange()
  packages/core-app-model/src/views/ViewTechnicalDrawingCache.ts
    Filters via GEOMETRY_ELEMENT_TYPES set (wall, slab, curtainwall, curtain-panel,
    window, door, roof, stair, stair-landing, stair-railing, opening, ceiling,
    floor, handrail, furniture, plumbing, column, beam)
    Fires: window.dispatchEvent(new CustomEvent('vd:projection-stale', { detail: { viewId } }))
        ↓
Stage 4 — PlanViewManager debounce (300 ms)
  apps/editor/src/engine/subsystems/planView/PlanViewManager.ts
    Listens to 'vd:projection-stale'; debounces 300 ms to coalesce burst events
    After debounce expires → calls EdgeProjectorService.project(viewId)
        ↓
Stage 5 — EdgeProjectorService + Canvas2D render
  packages/core-app-model/src/views/EdgeProjectorService.ts
    Reads BimManager.getLevelById(levelId).childrenIds for geometry
    Computes 2D edge projection
    Triggers Canvas2D render → plan-view refreshes
```

**Critical invariants (MUST — violation breaks plan-view for that element type)**

- Every legacy element store's `add()` method MUST call `storeEventBus.emit()` with a valid `elementType` string that is present in `GEOMETRY_ELEMENT_TYPES` (`ViewDependencyTracker.ts` line 40).
- The `initTools.ts` bridge subscriber MUST complete `LegacyStore.add()` before returning. If `add()` throws, plan-view will not update for that element.
- The bridge MUST NOT call `storeEventBus.emit()` directly UNLESS the target store's `add()` is known to omit it. The one confirmed exception is `CurtainWallStore.add()` — it uses an internal `this.emit()` path and does NOT call `storeEventBus`; only `addMany()` does. The `initTools.ts §P3.1` bridge compensates with an explicit `storeEventBus.emit()` after `curtainWallStoreInstance.add()`. This asymmetry MUST be fixed in `CurtainWallStore.add()` itself (tracked as TODO-CW-STORE-BUS, Wave A16).
- The 300 ms debounce in `PlanViewManager` is intentional — it absorbs burst events from batch creation without redundant projections. Single-element creation (user tool path) will appear in plan-view within ~330 ms of the `storeEventBus` signal (300 ms debounce + ~30 ms projection).

**Plan-view update MUST complete within < 100 ms p95 after `storeEventBus` fires** (C06 §5.1 / NFT 5). The 300 ms debounce is outside this window and is a known transitional-state deviation; it MUST be reduced to ≤ 50 ms as part of the Stage-2 `storeEventBus` → frame-scheduler migration (Wave A21+).

**Target-state mechanism (§6.2.T)**

In the target state (post-Wave A21), the plan-view update will be driven by a direct frame-scheduler subscription to the Immer `ElementStore`, eliminating the storeEventBus intermediary:

```ts
// Target: packages/scene-committer/ or packages/plan-view-renderer/
runtime.scheduler.onFrame(() => {
  const snapshot = runtime.stores.elements.getSnapshot();
  if (snapshot.version !== lastCommittedVersion) {
    planViewRenderer.invalidate(snapshot);
    lastCommittedVersion = snapshot.version;
  }
}, 'render');
```

The `initTools.ts` bridge layer and `storeEventBus` will be removed in this migration.

### §6.3 — Room redetection (event-driven, not imperative)

Room boundaries are derived geometrically from walls, slabs, and ceiling elements. They MUST be recomputed after wall mutations. The trigger MUST be event-driven, not imperative.

**AS-IS mechanism (canonical as of 2026-05-19)**

Room redetection uses a CustomEvent bridge (`pryzm-bus-rooms-redetect`) as a transitional L4→L7 escape hatch (ADR-0202 §3.D). The `RedetectRoomsHandler.execute()` dispatches this CustomEvent; the listener in `engineLauncher.ts` calls `commandManager.execute(new ReDetectRoomsCommand(...))` to run detection.

```ts
// AS-IS: RedetectRooms.ts — handler dispatches CustomEvent
window.dispatchEvent(new CustomEvent('pryzm-bus-rooms-redetect', {
  detail: { levelId, elevation, height }
}));

// AS-IS: engineLauncher.ts — listener calls legacy commandManager
window.addEventListener('pryzm-bus-rooms-redetect', (e) => {
  const cmd = (e as CustomEvent).detail;
  commandManager.execute(new ReDetectRoomsCommand(cmd.levelId, cmd.elevation, cmd.height));
  //                      ↑ SYNCHRONOUS — returns CommandResult, NOT a Promise
});
```

**CRITICAL ANTI-PATTERN — DO NOT DO THIS (Bug F-1.4-REDETECT-LOOP, fixed 2026-05-19)**

The listener MUST NOT call `bus.executeCommand('rooms.redetect', ...)`. Doing so re-enters `RedetectRoomsHandler.execute()`, which fires `pryzm-bus-rooms-redetect` again → **infinite synchronous recursion → `RangeError: Maximum call stack size exceeded`**.

```ts
// ❌ FORBIDDEN — infinite loop:
window.addEventListener('pryzm-bus-rooms-redetect', (e) => {
  bus.executeCommand('rooms.redetect', e.detail);  // ← DO NOT DO THIS
});

// ✅ CORRECT — synchronous commandManager, no re-entry:
window.addEventListener('pryzm-bus-rooms-redetect', (e) => {
  const cmd = (e as CustomEvent).detail;
  commandManager.execute(new ReDetectRoomsCommand(cmd.levelId, cmd.elevation, cmd.height));
  //              ↑ synchronous, does NOT dispatch 'rooms.redetect' on the bus
});
```

**Target mechanism (post-Wave A21)**:

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

**Amendment (2026-05-19) — `RoomTopologyObserver.pause()` MUST suppress ALL scheduling, including the forced-fire path** (root cause of "old projects stuck on load"; §7.0 FIX-ROOMOBSERVER-PAUSE)

`RoomTopologyObserver` subscribes to `WallStore`/`SlabStore`/`CurtainWallStore`/`ColumnStore` `add`/`update`/`remove` events and schedules room re-detection with a 150 ms debounce plus a `MAX_DEBOUNCE_RESETS` (12) / `MAX_DEADLINE_MS` (2 s) **forced-fire** safety valve.

`ProjectLoader` **correctly** calls `observer.pause()` before a bulk import and owns one explicit post-load redetect per level. **The defect**: `_scheduleRedetect()` honoured `this.paused` *only* inside the debounce-timer callback — the forced-fire branch called `_executeRedetect()` **directly**, bypassing that check. So during `ImportProjectCommand` bulk load every imported wall/slab still reached `_scheduleRedetect`, reset the debounce, and after 12 resets force-fired `ReDetectRoomsCommand` **mid-import** (`forced fire … resets=12`, 150–284 ms LONGTASKs); self-intersecting room polygons additionally failed `RoomStore.add` validation on every pass. The project appeared to hang on load.

**Contract requirement (binding)**: `RoomTopologyObserver.pause()` MUST make scheduling a **complete no-op** — `_scheduleRedetect()` returns immediately when `paused` (or `_disposed`), accumulating no debounce/reset state and **never force-firing**. Bulk import (`ProjectLoader`) retains ownership of running room detection exactly once after the import completes. Per-element room re-detection during a bulk load is a **prohibited anti-pattern**. Self-intersecting imported room polygons SHOULD be repaired (or skipped non-fatally) rather than re-failing validation on every redetect pass. **Fixed** — `RoomTopologyObserver._scheduleRedetect()` now guards `if (this.paused || this._disposed) return;` at the top (§FIX-ROOMOBSERVER-PAUSE).

### §6.4 — Undo registration

- Commands dispatched with `source: 'user'` AND `undoable: true` (default): the command bus automatically pushes an undo patch to `runtime.undoStack` after the handler returns.
- The handler MUST produce a reversible store mutation. The Immer draft produces a structural patch automatically; handlers that use manual store writes MUST register a reverse patch explicitly.
- Commands with `source: 'ai'` or `source: 'remote'` MUST NOT be pushed to the undo buffer (C03 §4.2).
- For batch AI commands: the batch is a single undoable unit. One patch covering all elements in the batch is registered after `BatchCoordinator.endBatch()`.

### §6.4a — ⭐ THE LEVEL DATUM IS AN INPUT TO EVERY CREATE, AND IT MOVES AFTERWARDS (NORMATIVE)

> Added 2026-08-23 (lane LEVEL36, **ADR-0345**, L-7200..L-7202). Binding on **every element
> family**, alongside **C84 §EI-PROP-e**.

Every create in this pipeline seats its element against `level.elevation`. **That datum is not
constant for the life of the element** — a user can change a level's elevation, or change the
floor-to-floor **height** of any level below it, and the whole stack above translates. A creation
path that is correct at `t=0` and never re-derives is the same defect class as
`§FIX-INTERIOR-FFL-SEATING`: *a fix for a project nobody edits*.

**A PR that adds an element family MUST state which of these two shapes it uses, and the choice
is not free — it follows from where the family stores its Y:**

1. **DERIVED-AT-BUILD (preferred).** The builder recomputes world Y from `level.elevation` on
   every build (`ColumnFragmentBuilder.ts:225`, `RoofFragmentBuilder.ts:305`,
   `WallFragmentBuilder.ts:861`). Following a level move is then just **re-invoking the builder**,
   with **no store write and no undo entry**. Register the rebuild entry point in the level
   reconcile (`initWallLevelSubscribers.ts`) and add the kind to `RECONCILABLE_TYPES`
   — **together, in one commit** (C72 §5.1).
2. **PERSISTED-ABSOLUTE.** The record stores an absolute `position.y` (furniture, plumbing,
   lighting). Re-seating is then a **mutation**, so P6 puts it on the **command** path: compose
   `ReseatLevelElementsCommand` into the parent command's undo unit. ⛔ **Never** re-seat these
   from the reconcile callback — it runs at render time, so the write would be un-undoable *and*
   a P6 breach.

⚠ **A family that fits NEITHER shape must say so by name.** `packages/geometry-beam/src/` contains
**zero** `elevation` references, so a beam cannot follow a level move at all until its builder
consults the datum. Such a family is declared **REFUSES** on the C84 §EI-PROP-e table and is
counted and named to the user at commit time — **it is never left to look as though it followed.**

⭐ **The trap this section exists to prevent:** wiring a rebuild call for a family whose builder
does not read `level.elevation`. The call succeeds, the element rebuilds **in the same place**,
and the ledger gains a `PROPAGATES` row that propagates nothing — **a false verdict, which is
worse than the honest gap it replaced.** Measure the builder before claiming the row.

### §6.5 — OTel spans

Every command handler MUST open a span at entry and close it at exit:

---

### §6.6 — The loading overlay: ONE surface, N producers (§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY, L-270)

Whenever the platform is doing work the user must wait for — a `BatchCoordinator.runBatch()`
generation, **or** a Cesium view activation ("3D globe" / "3D Site") — it MUST show **the same**
loading overlay, and MUST NOT let the user act on the half-assembled result underneath it.

There is exactly **ONE** overlay surface. Producers register with it; they do not fork it.
(Superseded the "BatchLoadingIndicator" of Sprint A37, which was a single-producer component —
the exact defect L-270 was raised for.)

**Contract invariants:**

- **CI-1 (one surface).** There MUST be exactly one loading-overlay surface
  (`LoadingOverlayView`), arbitrated by `LoadingOverlayController`. Any new long operation that
  needs a loading screen MUST register as a **producer** (`controller.begin(id, …)` →
  `session.end()`); adding a second overlay component is a contract violation.
- **CI-2 (ref-counted).** The overlay is visible while ≥ 1 session is open. One producer ending
  MUST NOT dismiss an overlay another producer still holds (e.g. a batch that runs during a
  globe activation).
- **CI-3 (dismiss on a REAL signal, never a timer).** A session MUST end on a genuine terminal
  event of the work it represents. For the batch that is the post-GPU-compile `onEnd()`; for a
  Cesium view activation it is the chain *viewer ready → tiles streamed → content placed →
  **ground datum settled*** (the L-259 seat-and-reveal terminal, C12 §1.4). A timed dismissal
  while the scene is still streaming is a LIE and is forbidden.
- **CI-4 (input gate).** While the overlay is up, the scene underneath MUST NOT be navigable:
  the backdrop is `pointer-events: all` **and** the view producer disables the Cesium camera
  controller (`setNavigationEnabled(false)`). The gate MUST be released on **every** exit path —
  ready, failure, or cancellation.
- **CI-5 (never hang).** If a readiness signal never arrives, the overlay MUST enter its ERROR
  state with escape actions ("Try again" / "Continue anyway"). Detection MUST be a **progress-
  freeze** watchdog (nothing advanced for N s), never a fixed deadline race — a fixed deadline
  fails a slow-but-healthy load and passes a frozen one (§LOAD-TIMEOUT-PROGRESS, G2/0.3a).
- **CI-6 (real progress).** The bar MUST be driven by a real signal where one exists — the
  fragment-builder drain frames for a batch (`built`/`remaining`), Cesium's own pending/
  processing tile counters for a view activation — never by an elapsed-time guess.
- **CI-7 (LONGTASK-proof animation).** The overlay's animation MUST be compositor-driven CSS.
  It MUST NOT use `requestAnimationFrame` (P3, C04 §3) **nor** a frame-scheduler tick: the
  overlay is shown precisely during the 100 ms–20 s main-thread LONGTASKs (geometry drain,
  WebGPU PSO compile, Cesium tile upload) that would freeze any main-thread animation.
  (This supersedes the Sprint-A37 `addTickListener('overlay')` rule — §FIX-PYRAMID-ANIM.)
- **CI-8 (batch lifecycle).** `BatchCoordinator` MUST expose `setBatchLifecycleCallbacks(onStart,
  onEnd)`; errors in callbacks MUST be caught — an overlay failure MUST NOT interrupt batch
  coordination or store mutations. `onStart(elementCount)` fires at the end of `_setupBatch()`;
  `onEnd()` fires in **three** places: (1) `_executeFinalSweep()` `onComplete`; (2) the
  `runBatch()` error catch; (3) `forceReset()` (project switch mid-batch).

**Reference implementation:**
- `LoadingOverlayView`: `apps/editor/src/ui/overlays/LoadingOverlayView.ts` — the ONE surface
  (frosted white backdrop, CSS 3-D prism, absolute progress ratio, error state).
- `LoadingOverlayController`: `apps/editor/src/ui/overlays/LoadingOverlayController.ts` — the
  ref-counted producer registry.
- `loadingProgress.ts` — pure progress maths (batch accumulation, view-activation stage plan,
  tile-stream ratio, stall verdict).
- Producer #1 (batch): `apps/editor/src/engine/initBatchLifecycle.ts`.
- Producer #2 (view activation): `apps/editor/src/ui/geospatial/viewActivationLoading.ts`,
  driven from `GISAreaLayout` (`applyResultView('3D')` → globe, `engageFormaCesium` → 3D Site);
  its readiness signals are `CesiumViewport.whenReady()`, `.onTileLoadProgress()` /
  `.sampleTileLoadProgress()`, `.whenGroundSettled()` and `.setNavigationEnabled()`.
- Guards: `apps/editor/__tests__/viewActivationLoadingOverlay.test.ts`.

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

> **Last updated**: 2026-05-19. These are known, measured, and tracked. Every in-progress site carries a `TODO(E.5.x)` annotation in source. The full migration plan is in `docs/archive/pryzm3-internal/04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`. The comprehensive gap analysis including alignment with all contracts and all element families is in `docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md`.

### §7.0 — Critical bugs fixed (2026-05-19)

Twenty-five production-breaking defects in the element creation pipeline (and its view-switch / split-view / project-load surface) were identified and fixed on 2026-05-19. They are documented here permanently so they cannot recur silently.

| ID | File | Bug | Root Cause | Fix | Contract clause |
|---|---|---|---|---|---|
| **F-1.4-REDETECT-LOOP** | `apps/editor/src/engine/engineLauncher.ts` | `RangeError: Maximum call stack size exceeded` on every wall/curtain-wall creation — engine hard-crashed. | `window.addEventListener('pryzm-bus-rooms-redetect', ...)` called `bus.executeCommand('rooms.redetect', ...)`, which re-entered `RedetectRoomsHandler.execute()`, which dispatched the CustomEvent again → infinite recursion. | Listener now calls `commandManager.execute(new ReDetectRoomsCommand(...))` — the synchronous legacy path that does NOT dispatch on the bus. See §6.3 anti-pattern. | §6.3 |
| **P3.1-CW-PLAN** | `apps/editor/src/engine/initTools.ts` | Curtain walls never appeared in plan view after creation. | `CurtainWallStore.add()` uses an internal `this.emit()` path and does NOT call `storeEventBus.emit()`. Only the batch path (`addMany()`) does. Without `storeEventBus`, `ViewTechnicalDrawingCache._onStoreChange()` never fired, `vd:projection-stale` was never dispatched, and the plan-view projector never ran. All other stores (`WallStore`, `SlabStore`, `BeamStore`, `FloorStore`, `CeilingStore`) DO emit `storeEventBus` from `add()`. | Added explicit `storeEventBus.emit({ elementType: 'curtainwall', ... })` in the `curtain-wall.created` bridge in `initTools.ts §P3.1` after `curtainWallStoreInstance.add()`. `'curtainwall'` is present in `GEOMETRY_ELEMENT_TYPES` (ViewDependencyTracker.ts:41). | §6.2 |
| **FT1-C11-SLAB-BOUNDARY** | `plugins/slab/src/handlers/CreateSlab.ts` | Part A: Slabs created via the plan tool stored `boundary: undefined` in the Immer slab store — breaking undo/redo, schedule extraction, and IFC export. Only the 3D mesh worked (via the legacy bridge which reads `ev.polygon`). Part B: After resolving boundary from `cmd.polygon`, `Slab.parse()` threw `SlabSchemaError: boundary[0].z undefined` because `SlabPlanToolHandler` sends polygon as `{x: worldX, y: worldZ}[]` (2D — no `z` field), but the Slab Zod schema requires `Vec3[] = {x, y, z}[]`. | Part A: `CreateSlabHandler.execute()` only read `cmd.boundary`, leaving Immer store without boundary. Part B: `polygon` points have no `z`, but `Slab.parse()` (via `packages/schemas/src/elements/Slab.ts`) requires all boundary Vec3 points to have a finite `z`. | Part A: `CreateSlabPayload` now accepts `polygon` as an alias for `boundary`. Part B: When resolving from `cmd.polygon`, `z` is coerced to `p.z ?? 0` in both `canExecute` and `execute` before calling `validateSlabBoundary()` and `Slab.parse()`. `PlanPoint2D` local type accepts `z?: number` for type safety. | §3.2, §5.2 (handler MUST produce complete Immer patch) |
| **FIX-WALL-ID** | `apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts` | Walls never appeared in plan view (or 3D) when drawn from the plan tool. The §P2.1 legacy-store bridge in `initTools.ts` was silently skipping every `wall.created` event. | `WallPlanToolHandler._commitWall()` dispatched `wall.create` **without an `id` field**. The `CreateWall.ts` handler auto-mints the ID via `createId('wall')` internally — it is never in the payload. The CEB extracts `p.id` → `wallId: undefined`. The §P2.1 bridge guards `!ev.wallId` → `true` → bridge returns early on every event → wall never mirrors to legacy `WallStore` → no mesh, no plan-view storeEventBus emission → `ViewTechnicalDrawingCache` never fires → Canvas2D never redraws. | `WallPlanToolHandler._commitWall()` now pre-generates `const wallId = createId('wall')` (from `@pryzm/schemas`) and passes `id: wallId` in the bus payload. `createId('wall')` generates `wall_<ulid>` format which passes `CreateWallHandler.WALL_ID_RE`. The CEB now forwards a non-undefined `wallId` → bridge mirrors to legacy store → `WallStore.add()` emits `storeEventBus` → plan view updates instantly. | §3.2 (tools MUST pre-generate branded IDs and pass them in the payload), §5.2 |
| **FIX-CW-ID** | `apps/editor/src/engine/views/plantools/CurtainWallPlanToolHandler.ts` | Curtain walls never appeared in plan view or 3D when drawn from the plan tool — identical pattern to FIX-WALL-ID. | `CurtainWallPlanToolHandler._commit()` dispatched `curtainwall.create` **without an `id` field** for both straight and arc-segment paths. The CEB emits `curtain-wall.created` with `id: undefined`. The §P3.1-CW bridge guards `!ev.id` → bridge skips every event → `curtainWallStoreInstance.add()` never called → no mesh and no `storeEventBus.emit()` → plan view never updates. | `CurtainWallPlanToolHandler._commit()` now pre-generates `const cwId = createId('curtainwall')` (straight path) and `createId('curtainwall')` per-segment (arc path) and passes `id` in the payload. The CEB forwards a non-undefined `id` → §P3.1-CW bridge mirrors to `curtainWallStoreInstance` and explicitly emits `storeEventBus({ elementType: 'curtainwall', ... })` → plan view updates. | §3.2 (tools MUST pre-generate branded IDs), §5.2 |
| **FIX-PLAN-VDT-BIMMANAGER** | `apps/editor/src/engine/initTools.ts` §P2.1 | Walls reached the legacy `WallStore` (via FIX-WALL-ID) and emitted `storeEventBus`, but the **plan-view still rendered blank** — `EdgeProjectorService.project()` ran but exported 0 elements. Two registrations were missing after `WallStore.add()`. | (A) `viewDependencyTracker.registerElement(wallId, levelId)` was never called → VDT had no entry in `_elementLevelMap` for the new wallId → every `storeEventBus` emission fell into the §G3-STALE-EVENT fallback path, which marks all non-3D views dirty but does not populate level geometry. (B) `bimManager.registerElement(wallId, levelId)` was never called → `level.childrenIds` never contained the new wallId → `NativeElementMeshExporter.exportForView()` returned 0 elements → `EdgeProjectorService` had nothing to project → Canvas2D showed an empty canvas. | Added both calls in the `wall.created` bridge block immediately after `_legacyWallStoreForBridge.add()`: `viewDependencyTracker.registerElement(ev.wallId, ev.levelId ?? 'L0')` and `bimManager.registerElement(ev.wallId, ev.levelId ?? 'L0')` (wrapped in try/catch to stay non-fatal). Browser logs confirmed: NME now exports 20 elements (was 0); full EdgeProjectorService wall-projection chain fires on every wall creation. | §6.2 (Stage 5: EdgeProjectorService reads `bimManager.getLevelById(levelId).childrenIds`) |
| **FIX-NAN-Y** | `packages/geometry-wall/src/WallFragmentBuilder.ts` lines 786, 2190 | All wall meshes in the 3D view had every vertex Y coordinate as `NaN` — `THREE.BufferGeometry.computeBoundingBox` emitted `"Computed min/max have NaN values"` for every wall; meshes were invisible in the 3D viewport. | `WallData.baseOffset` is an optional field in the schema (`baseOffset?: number`). `WallFragmentBuilder` read `wall.baseOffset` without a null-check in two places: (1) `const wallBaseOffset = wall.baseOffset` at line 786 — used as `yBot = wallBaseOffset + height` throughout the straight-wall branch; (2) the `createWallBodyFragment()` call at line 2190 passed `wall.baseOffset` directly as the `baseOffset` argument. When `baseOffset` is `undefined`, all arithmetic produces `NaN`, which propagates to every vertex Y coordinate in every buffer attribute, producing an invisible (NaN-bbox) mesh. | Changed both sites to `wall.baseOffset ?? 0`. Line 786: `const wallBaseOffset = wall.baseOffset ?? 0;`. Line 2190: `wall.baseOffset ?? 0,` as the `baseOffset` argument to `createWallBodyFragment()`. Annotated with `§FIX-NAN-Y` comment at both sites. `THREE.BufferGeometry.computeBoundingBox` NaN warnings are gone; wall meshes render at floor level (Y=0) when no explicit base offset is set. | §6.1 (geometry builders MUST produce valid BufferGeometry — NaN vertices violate THREE's buffer contract) |
| **FIX-DEACTIVATE-GUARD** | `apps/editor/src/engine/ViewController.ts` lines 1814–1822 | Switching from plan view to 3D view silently failed — `[ViewController] Error activating view: {}` was logged and the 3D view never activated. The engine was permanently locked in a broken intermediate state. | `ViewController._deactivateFloorPlanView()` calls `this._planViewManager.deactivate()`. `PlanViewManager.deactivate()` calls `window.runtime?.events?.emit('split-view-deactivated', {})` (line 242). If any `runtime.events` subscriber for `'split-view-deactivated'` threw an exception, the throw propagated out of `deactivate()` and aborted the entire view-switch sequence, leaving `_activate3DView()` never called. The error value was `{}` (the event payload object), matching the logged `Error activating view: {}`. | Wrapped the `this._planViewManager.deactivate()` call in a `try/catch` block. Failures are logged as `[ViewController] PlanViewManager.deactivate() threw (non-fatal, continuing view switch)` and execution continues unconditionally to `_activate3DView()`. Plan-view cleanup failures MUST NOT block 3D activation — the render surface must always reach a valid state. **Rev 5 correction**: the Root Cause stated above is incomplete. The thrown value was not "a subscriber for `'split-view-deactivated'` threw" — it was `PlanViewManager.deactivate()` itself invoking a `Disposable` returned by `runtime.events.on()` as if it were a function (`this._unsubSplitActivated?.()`). See **FIX-EVENTBUS-DISPOSABLE-CALL** below for the real root cause and source fix. The `try/catch` added here is retained as defence-in-depth, but `deactivate()` no longer throws. | §8.3 (3D view activation MUST succeed; renderer must always reach a valid state) |
| **FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES** | `apps/editor/src/engine/initTools.ts` §P3.1-CW, §P3.2-CL, §P3.2-RF, §P3.3-CO, §FT1, §FT2 | **Six element types** (curtain wall, ceiling, roof, column, slab, beam) were **invisible in plan view** when created via the bus path, even though their 3D meshes rendered correctly. The defect was structurally identical to FIX-PLAN-VDT-BIMMANAGER (walls, Rev 3) but affected all remaining geometry-element bridges. | Both registrations were missing from all six bridges after `LegacyStore.add()`. (A) `viewDependencyTracker.registerElement(id, levelId)` was never called → VDT had no `_elementLevelMap` entry for those element IDs → every `storeEventBus` emission from their store `add()` fell into the §G3-STALE-EVENT fallback path. (B) `bimManager.registerElement(id, levelId)` was never called → `level.childrenIds` never contained those element IDs → `NativeElementMeshExporter.exportForView()` returned 0 elements of each type when the plan projector ran → Canvas2D always blank for curtain walls, ceilings, roofs, columns, slabs, and beams created via the bus path. The wall bridge (§P2.1) received this fix in Rev 3 but the pattern was not propagated to the other six bridges. Root cause discovery: grep showed `viewDependencyTracker.registerElement` appeared only once (wall bridge, line 853); `bimManager.registerElement` appeared only at wall (line 854) and floor (line 1397, but via `(window as any)` — see FIX-P4-FLOOR-BIMMANAGER). | Added both `viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '')` and `try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }` to each of the six bridges immediately after the respective `LegacyStore.add()` call. Each site is annotated `§FIX-PLAN-VDT-BIMMANAGER (<type>)`. | §6.2 (Stage 5: `bimManager.getLevelById(levelId).childrenIds` must contain elementId before `EdgeProjectorService.project()` runs); §10.2 Bridge Invariant 7 (new) |
| **FIX-P4-FLOOR-BIMMANAGER** | `apps/editor/src/engine/initTools.ts` §P3.2-FL line 1397 | The floor bridge had `bimManager.registerElement()` present but invoked it as `(window as any).bimManager?.registerElement?.(ev.floorId, ev.levelId ?? '')` — a C14 §LP-01 prohibited P4 pattern (window-as-namespace global access). Additionally, `viewDependencyTracker.registerElement` was absent, leaving floors without targeted VDT dirty-marking (§G3-STALE-EVENT fallback only). | `(window as any).bimManager` reaches the same singleton as the locally-scoped `bimManager` variable (already in scope throughout `initTools.ts`), but the `(window as any)` cast constitutes a C14 §LP-01 P4 violation — bypasses TypeScript type checking, bypasses ESLint boundary rules, and relies on global namespace pollution which is explicitly prohibited by C14. The `?.` optional chaining also silently swallows failures if `window.bimManager` is ever undefined (which can happen during test/headless execution), whereas the directly-scoped `bimManager` is always guaranteed to be the correctly-initialised instance. | Replaced `(window as any).bimManager?.registerElement?.(ev.floorId, ev.levelId ?? '')` with `bimManager.registerElement(ev.floorId, ev.levelId ?? '')` (wrapped in `try/catch`). Added `viewDependencyTracker.registerElement(ev.floorId, ev.levelId ?? '')` immediately before it. Annotated `§FIX-P4-FLOOR-BIMMANAGER` at the site. TODO comment updated to reference this fix. | C14 §LP-01 (no `(window as any)` pattern); §10.2 Bridge Invariant 7 |
| **FIX-EVENTBUS-DISPOSABLE-CALL** | `apps/editor/src/engine/views/SplitViewManager.ts` line 660; `apps/editor/src/engine/views/PlanViewManager.ts` lines 196–199, 205–206 (+ field declarations 66, 81–84, 91) | The split-view toggle button was wedged. Clicking it threw `TypeError: _unsubSelectionChanged is not a function` in `SplitViewManager._unsubscribeSelectionEvents()`, aborting `deactivate()` mid-teardown. The structurally identical defect in `PlanViewManager.deactivate()` is the **true root cause behind FIX-DEACTIVATE-GUARD**: pre-guard it aborted the entire view switch; post-guard the `try/catch` swallowed it but every listener, timer and DOM node below the throw site (lines 197–235) silently leaked. | `runtime.events.on()` (`EventBus.on()` — `packages/runtime-composer/src/EventBus.ts`) returns a **`Disposable`** — an object `{ dispose(): void }` — **not** an unsubscribe function. Both files stored that return value in fields typed `(() => void) | null` and later invoked it as `unsub?.()`. Because `?.()` only short-circuits on `null`/`undefined`, calling a non-null object as a function throws `TypeError`. tsc did not catch the type lie because `window.runtime` is loosely typed, widening the assignment to `any`. | `SplitViewManager`: the `bim-selection-changed` subscription now disposes via `.dispose()`, matching the correct `svp:drawing-refreshed` pattern 14 lines below it. `PlanViewManager`: the six split-view / IFC / selection unsub fields are retyped `{ dispose(): void } | null` and disposed via `?.dispose()`. The retype makes the EventBus `Disposable` contract compiler-enforced so this misuse cannot silently recur. Verified: `@pryzm/editor` `tsc --noEmit` reports 0 errors in both files. | §8.3 (view deactivation MUST complete cleanly — a throwing teardown leaks resources and wedges the view-switch / split-view toggle); EventBus `on()` → `Disposable` contract (C02 §composition-root event bus) |
| **FIX-VIEWSWITCH-DROP** | `apps/editor/src/engine/WallRebuildCoordinator.ts` — `_scheduleFlush()` + the `view-activated` handler in `init()` | A wall created (or moved/removed) while a view switch was in progress never received a 3D mesh — the store mutation was silently and permanently lost. This affected walls drawn in the plan pane around split-view activation and other view transitions. | `_scheduleFlush()` checked `if (this._viewSwitchInProgress) return;` **before** `_pendingWallEvents.set()`. Unlike the `_wallRebuildPaused` path — which queues first, defers, and is drained by `_resume()` — the view-switch early-return dropped the event entirely. There was no re-queue path, so when `_viewSwitchInProgress` cleared on the next frame the mutation was already gone. The original intent (suppress *redundant rebuilds of existing walls* triggered by a view switch) was over-broad: it also discarded genuine new-wall `add` events. | `_scheduleFlush()` now always queues the event into `_pendingWallEvents` first; the `_viewSwitchInProgress` check moved below the `set()` and only DEFERS the flush (mirroring `_wallRebuildPaused`). The `view-activated` clear handler now drains `_pendingWallEvents` when it clears the flag. New walls created mid-switch are built ≤ 2 frames after the switch completes. | §6.1 (geometry build MUST run for every committed store mutation — a deferral mechanism MUST NOT drop mutations); C04 §2 (frame scheduler) |
| **FIX-FURNITURE-ROTATION** | `apps/editor/src/engine/views/plantools/FurniturePlanToolHandler.ts` — `_commit()`, all 3 dispatch sites (kitchen, wardrobe, plain) | Every furniture placement from the plan tool failed: `CommandBusError: furniture.create: canExecute rejected — rotation must be finite`. No furniture was ever created (plain `corner_sofa` confirmed by the user). | `furniture.create`'s `canExecute` validates `Number.isFinite(rotation)` — `rotation` is a **scalar yaw angle** in radians. `FurniturePlanToolHandler._commit()` dispatched `rotation: { x: 0, y: 0, z: 0 }` (a Vec3 object). `Number.isFinite({…})` is `false` → the guard rejected every command. | All three `_commit()` dispatch sites changed `rotation: { x: 0, y: 0, z: 0 }` → `rotation: 0`. Annotated `§FIX-FURNITURE-ROTATION`. | §3.2 (tool payloads MUST match the handler's command schema); §5.2 (handler validation is binding) |
| **FIX-SLAB-ZERO-AREA** | `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts` — `_commitSlab()` | Every slab drawn from the plan tool failed: `CommandBusError: slab.create: canExecute rejected — boundary has zero area`. No slab created in plan view. | `plugins/slab/src/intent.ts validateSlabBoundary()` → `signedAreaXZ()` computes the boundary area in the **X-Z plane** (`p.x*q.z − q.x*p.z`). `SlabPlanToolHandler` sent `polygon` as `{ x: worldX, y: worldZ }` — `worldZ` in the **`y`** field, no `z`. The handler coerces missing `z → 0` (C11 §7.0 FT1) → every vertex has `z = 0` → X-Z signed area = 0 → "zero area". A genuine convention clash: the PRYZM3 handler keys area on X-Z; the legacy `§FT1` bridge / `SlabStore` read the polygon as `{x,y}` with `y = worldZ`. | `_commitSlab()` now emits `polygon` as `{ x: worldX, y: worldZ, z: worldZ }` — `worldZ` in **both** `y` and `z`. The PRYZM3 X-Z area check sees a real rectangle; the legacy `{x,y}` consumers are unchanged. Annotated `§FIX-SLAB-ZERO-AREA`. **Follow-up (§7.4 — SLAB-BOUNDARY-CONVENTION)**: unify on a single world-Vec3 convention `{x, y:0, z}` and translate in the `§FT1` bridge. | §3.2, §5.2; §7.4 (SLAB-BOUNDARY-CONVENTION follow-up) |
| **FIX-BEAM-PAYLOAD** | `plugins/beam/src/handlers/CreateBeam.ts` | Beams drawn from the plan tool produced a 3D mesh (via the legacy `§FT2` bridge) but the PRYZM3 Immer `beam` store held a beam with **no real geometry** (schema-default `baseLine`) — breaking undo/redo, schedule extraction and IFC export. | `BeamPlanToolHandler` dispatches `beam.create` with `startPoint` + `endPoint`; `CreateBeamHandler`'s payload only declared `baseLine`. `canExecute` saw `baseLine === undefined` → skipped validation; `execute` set `seed.baseLine` only `if (cmd.baseLine)` → the Immer beam got the schema default. The legacy `§FT2` bridge reads `startPoint`/`endPoint` independently, masking the gap. Structurally identical to FT1-C11-SLAB-BOUNDARY Part A. | `CreateBeamHandler` now accepts `startPoint`/`endPoint` as an alias — a private `resolveBaseLine()` folds them into a `baseLine` tuple (`baseLine` wins when both supplied); used in both `canExecute` and `execute`. | §3.2, §5.2; §10.2 Bridge Invariant 5 (payload field names) |
| **FIX-HANDRAIL-PAYLOAD** | `apps/editor/src/engine/views/plantools/RailingPlanToolHandler.ts` | Handrails drawn from the plan tool were created in the PRYZM3 Immer `handrail` store as a **default 1 m rail at the origin** — the drawn start/end were discarded. | `RailingPlanToolHandler` dispatched `handrail.create` with `start`/`end` (2D `{x,z}`) + `thickness`. `CreateHandrailHandler`'s payload is `path` (Vec3[]) + `diameter`. `cmd.path` was `undefined` → `execute` used its fallback `seed.path = [{0,0,0},{1,0,0}]`; `thickness` was ignored. | `RailingPlanToolHandler` now dispatches `path: [{x,y:0,z},{x,y:0,z}]` + `diameter`, conforming to `CreateHandrailPayload`. The remaining bus-bridge gap is now also closed — see **FIX-HANDRAIL-BRIDGE** below. | §3.2, §5.2; §11.1 HANDRAIL-BUS-MIGRATION |
| **FIX-HANDRAIL-BRIDGE** (HANDRAIL-BUS-MIGRATION) | `packages/runtime-composer/src/types.ts` + `CommandEventBridge.ts` + `apps/editor/src/engine/initTools.ts` | A handrail drawn from the plan tool reached the PRYZM3 Immer `handrail` store but produced **no 3D mesh and no plan-view projection** — there was no path from the bus command to the legacy `HandrailStore`. | The CEB `handrail.create` case emitted a geometry-free `handrail.created` event (`levelId` only) and **no `initTools` bridge subscribed to it** — violating §10.2 Bridge Invariant 1 (geometry-complete payload) and Invariant 2 (a bridge MUST exist for every bus-dispatched element type). | Three coordinated changes: (1) `RuntimeEvents['handrail.created']` widened with geometry fields (id, path, height, diameter, shape, hostId, materialId); (2) the CEB `handrail.create` case now forwards the full geometry; (3) new `initTools §FT-HANDRAIL` bridge — `runtime.events.on('handrail.created')` translates the PRYZM3 `path[]`/`diameter` shape into the legacy `HandrailData` (`baseLine[2]`/`thickness`), calls `handrailStore.add()` (→ storeEventBus + `bim-handrail-added`), then `viewDependencyTracker.registerElement` + `bimManager.registerElement`. Mirrors the §FT2 beam bridge exactly. | §10.2 Bridge Invariants 1, 2, 7; §6.1, §6.2 |
| **FIX-ROOMOBSERVER-PAUSE** | `packages/room-topology/src/RoomTopologyObserver.ts` — `_scheduleRedetect()` | Old / large projects appeared to **hang on load** — repeated 150–284 ms LONGTASKs and `[RoomTopologyObserver] forced fire … resets=12` logged throughout the import. | `ProjectLoader` correctly `pause()`s the observer for the bulk import, but `_scheduleRedetect()` honoured `this.paused` **only** inside the debounce-timer callback. Its forced-fire branch (`resets ≥ MAX_DEBOUNCE_RESETS` / `elapsed ≥ MAX_DEADLINE_MS`) called `_executeRedetect()` **directly**, bypassing the pause. Every imported wall/slab reset the debounce → `ReDetectRoomsCommand` force-fired mid-import; self-intersecting room polygons failed `RoomStore.add` validation on every pass. | `_scheduleRedetect()` now returns immediately when `this.paused || this._disposed` — a paused observer accumulates no debounce/reset state and never force-fires. `ProjectLoader` keeps ownership of the single post-load redetect. | §6.3 (room redetection MUST NOT thrash during bulk load); C10 NFT (no LONGTASK > 100 ms) |
| **FIX-LIGHTING-PAYLOAD** | `apps/editor/src/engine/views/plantools/LightingPlanToolHandler.ts` | A lighting fixture placed from the plan tool was created at the default origin `{0,0,0}` with the schema-default `kind` — the clicked position and chosen fixture type were both discarded. | The tool dispatched `lighting.create` with `fixtureType` + `position`; `CreateLightingPayload` declares `kind` + `origin`. The handler read only `kind`/`origin` → `fixtureType`/`position` were dropped → `origin` fell back to `{0,0,0}`, `kind` to the schema default. Verified a **pure field rename** — `LightingFixtureType` and the schema `LightingKind` share the value space (both default `'downlight'`, both include `'pendant'`). | `LightingPlanToolHandler` now dispatches `kind` + `origin`, conforming to `CreateLightingPayload`. **Remaining**: no `§FT-LIGHTING` bridge yet → bus-created lighting reaches the Immer store but not the legacy `lightingStore` / `LightingFragmentBuilder` → no 3D mesh. The bus-bridge gap is now also closed — see **FIX-LIGHTING-BRIDGE** below. | §3.2, §5.2 |
| **FIX-LIGHTING-BRIDGE** (LIGHTING-BUS-MIGRATION) | `LightingPlanToolHandler.ts` + `runtime-composer/types.ts` + `CommandEventBridge.ts` + `apps/editor/src/engine/initTools.ts` | A lighting fixture created from the plan tool reached the PRYZM3 Immer store but produced **no 3D mesh** — there was no path from the bus command to the legacy `LightingStore` / `LightingFragmentBuilder`. | The CEB `lighting.create` case emitted a geometry-free `lighting.created` event and **no `initTools` bridge subscribed** to it; additionally the tool dispatched no `id`, so any bridge guard would have skipped the event. | Four coordinated changes: (1) `LightingPlanToolHandler` now pre-generates `createId('lighting')`; (2) `RuntimeEvents['lighting.created']` widened with `id`/`kind`/`origin`; (3) the CEB case forwards the geometry; (4) new `initTools §FT-LIGHTING` bridge translates the PRYZM3 `kind`/`origin` shape into the legacy `LightingData` (`fixtureType`/`position`), calls `lightingStore.add()` (→ `bim-lighting-added` → `LightingFragmentBuilder`) + `bimManager.registerElement`. Mirrors the §FT-HANDRAIL bridge. Lighting is not in `GEOMETRY_ELEMENT_TYPES` (no plan-view projection — by design). | §10.2 Bridge Invariants 1, 2; §6.1 |
| **FIX-OVERLAY-DUP-ID** | `apps/editor/src/ui/platform/EngineLoadingOverlay.ts` — `startProgressAnimation()` (+ new `tickId` field) | Opening a project intermittently threw `Uncaught (in promise) Error: [FrameScheduler] addTickListener: duplicate id "engine-loading-progress"` from `EngineLoadingOverlay.show()` inside `PlatformRouter._openProjectViaRuntime`. The uncaught rejection aborted the project-open path — a contributor to the "old projects don't open" report (distinct from the §7.0 FIX-ROOMOBSERVER-PAUSE root cause). | `EngineLoadingOverlay.startProgressAnimation()` registered a FrameScheduler tick listener under the **constant** id `'engine-loading-progress'`. `FrameScheduler.addTickListener` (`FrameScheduler.ts:327`) **throws** on a duplicate id — its contract is "each listener must register a unique id" — and the scheduler exposes no `removeTickListener(id)`. The engine-bootstrap overlay and the project-open overlay are **separate `EngineLoadingOverlay` instances** that can be alive simultaneously; when the second called `show()` while the first's listener was still registered, `addTickListener` threw. The instance-local `stopProgressTimers()` guard in `show()` cannot prevent this — a freshly-constructed instance has `rafHandle = null`, so it has no handle to the *other* instance's registration. | Each `EngineLoadingOverlay` instance now mints a **unique** tick-listener id — `engine-loading-progress-${++_overlayTickSeq}` (module-level monotonic counter) — stored in a `readonly tickId` field and used in `addTickListener`. Two overlays can never collide; each still disposes its own listener via the returned `TickListenerDisposer` (`stopProgressTimers()`), and `animate()` self-disposes at `elapsed ≥ TOTAL_MS` so a leaked instance is bounded. Respects the scheduler's unique-id contract without modifying the shared `@pryzm/frame-scheduler` package. | §8.3 / project-load surface (overlay `show()` MUST NOT throw — a throwing overlay aborts `_openProjectViaRuntime`); FrameScheduler unique-id contract (`FrameScheduler.ts:327`) |
| **FIX-PLUMBING-FIXTURE-CMD** (PLUMBING-FIXTURE-MODEL-GAP — resolved) | `apps/editor/src/engine/views/plantools/PlumbingPlanToolHandler.ts` — `_commit()` | A plumbing **fixture** (toilet/shower/bath/sink) placed from the plan tool was created with every fixture field discarded — `fixtureType`, `position`, `toiletVariant`/`showerVariant` were all dropped; the fixture defaulted to a pipe `origin` of `{0,0,0}` with the schema-default `kind`. | The tool dispatched `plumbing.create`, which routes to `CreatePlumbingHandler` — the **pipe** handler (`CreatePlumbingPayload = { kind, origin, diameter, bendRadius, … }`). A fixture payload fed to the pipe handler has no overlapping fields → all fixture data silently dropped. The Phase-12 re-audit (§11.11) **over-classified** this as a deep "model gap" needing a new schema + architecture decision — that was incorrect. A fixture handler **already existed**: `CreatePlumbingFixtureHandler` (`type: 'plumbing.createFixture'`, `plugins/plumbing/src/handlers/CreatePlumbingFixture.ts`) — an F-1.3 bridge to the legacy `CreatePlumbingFixtureCommand` → fixture `PlumbingStore` → `PlumbingFragmentBuilder`. It is registered by `registerPlumbingHandlers()` (`engineLauncher.ts §P3.5-PL`) and typed in `commands.ts:672`. The plan tool merely dispatched the wrong command name. | `PlumbingPlanToolHandler._commit()` now dispatches **`plumbing.createFixture`**. **No payload change was required** — the tool's existing payload (`fixtureType`, `position {x,y,z}`, `rotation {x,y,z}`, `toiletVariant`, `showerVariant`, `width/length/height`, `levelId`, `baseOffset`) already matches `CreatePlumbingFixturePayload` / `commands.ts:672` verbatim, **including `rotation` as a Vec3** (the fixture handler expects a Vec3 — unlike furniture's scalar yaw, so no FIX-FURNITURE-ROTATION-style coercion applies). This is the same command the furniture-carousel drag-drop path already dispatches (`FurnitureDragDropHandler.ts:367`). No `§FT-PLUMBING` bridge is needed — `CreatePlumbingFixtureHandler.execute()` writes straight to the legacy fixture store. | §3.2, §5.2 (a tool MUST dispatch the command whose handler models the element being created) |
| **FIX-STAIR-EVENT-PAYLOAD** (TASK-10) | `packages/geometry-stair/src/StairMeshBuilder.ts`, `StairRailingBuilder.ts`, `StairLandingBuilder.ts` | A stair created from the plan tool (or restored on project load) reached the legacy `StairStore` / `StairRailingStore` / `StairLandingStore` but produced **no 3D mesh and no plan-view symbol** for the stair body, its railings, or its landings. Runtime log: `[StairRailingBuilder] railing.stairId is undefined — skipping mesh build` on **every** railing, while `StairRailingStore` simultaneously logged `Added railing … for stair <valid-id>`. | The three stair stores emit their `bim-stair*-added` / `-updated` / `-removed` window events with a **lightweight `{ id }`** payload — the `F.events.18` / `TASK-10` convention (the store is the authoritative source). But the three builders still read the **pre-migration** payload shape: `StairMeshBuilder.onAdded` read `detail.stair`, `StairLandingBuilder` read `detail.landing`, `StairRailingBuilder` read `detail.railing`; every `*-removed` handler read `detail.stairId` / `detail.railingId` / `detail.landingId`. Those keys are never present → the destructured value is `undefined` → `updateStair()` / `buildLanding()` / `buildRailing()` were skipped (the `stairId` guard in `StairRailingBuilder` made the failure loud; the body and landing failed silently). The stores' `// TODO(TASK-10)` markers flagged the unfinished migration. | All three builders now read `detail.id` and **resolve the full element from their store** (`StairStore.get` / `StairLandingStore.get` / `StairRailingStore.get`) — matching the §P0-A40 design intent ("consumers read the store"). The `*-updated` handlers additionally still accept an inline `.stair` (the transform-drag `runtime.events` channel sends the full object) via a tolerant `payload.stair ?? store.get(payload.id)` resolve. `*-removed` handlers read `detail.id`. Annotated `§FIX-STAIR-EVENT-PAYLOAD` / `§FIX-STAIR-RAILING-EVENT`. | §6.1 (a store mutation MUST drive the geometry build — the store→builder event hop is part of the pipeline); §10.2 Bridge Invariant 5 (payload field names); §11.3 amendment |
| **FIX-SLAB-UPDATE-ID** | `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts` — `_commitSlab()` | A slab drawn from the plan tool with a system type that carries layers logged `slab.update: canExecute rejected — slab id is required` immediately after creation — the slab was created but its layer assignment (system type / layers / thickness) was never applied. | After `slab.create` resolved, `_commitSlab()` dispatched a follow-up `slab.update` with the slab id under the key **`slabId`**. `UpdateSlabHandler.canExecute` (`plugins/slab/src/handlers/UpdateSlab.ts:37`) checks **`cmd.id`** → `cmd.id` was `undefined` → rejected. The other `slab.update` callers (`SlabLayerSection.ts`, `PropertyPanelBodyRenderer.ts`) already use `id`; the plan tool was the lone outlier. | `_commitSlab()` now dispatches `slab.update` with `id: slabId`. Annotated `§FIX-SLAB-UPDATE-ID`. | §3.2, §5.2 (tool payload field names MUST match the handler's command schema) |
| **FIX-FURNITURE-BRIDGE** (FURNITURE-BUS-MIGRATION — §11.19) | `packages/runtime-composer/src/types.ts` + `CommandEventBridge.ts` + `apps/editor/src/engine/initTools.ts` (+ `apps/editor/src/types/globals.d.ts`) | Furniture placed from the plan tool, the carousel drag-drop, the kitchen tool or the wardrobe tool was **never created** — `FurniturePlanToolHandler` logged `Furniture created …`, but no 3D mesh, no plan symbol, and no `BimManager` registration ever followed. | `furniture.create` is handled by the PRYZM3 Immer `CreateFurnitureHandler`, whose `CreateFurniturePayload` is representation-based (`catalogId`/`origin`/`size`/`representations` — ADR-0027) — it does not read the tool's legacy-shaped payload (`furnitureType`/`position`/`width`/`length`/`height`/`material`). And the CEB `furniture.create` case emitted a **geometry-free** `furniture.created` (`levelId` only) with **no `initTools` bridge** subscribing — violating §10.2 Bridge Invariants 1 & 2. The §11.19 audit identified this as FURNITURE-MODEL-GAP and proposed option (b): bridge to the legacy furniture store. | Implemented §11.19 option (b), mirroring §FT-HANDRAIL / §FT-LIGHTING: (1) `RuntimeEvents['furniture.created']` widened with the plan-tool geometry; (2) the CEB `furniture.create` case forwards it; (3) new `initTools §FT-FURNITURE` bridge translates it into legacy `FurnitureData` (lifting the scalar yaw into the `EulerDTO` `.y`) and calls `furnitureStore.add()` → `bim-furniture-added` (furniture builder 3D mesh) + `storeEventBus` (plan symbol), then `viewDependencyTracker.registerElement` + `bimManager.registerElement`. `window.furnitureStore` declared in `globals.d.ts`. Kitchen / wardrobe runs pass `kitchenConfig` / `wardrobeCabinetConfig` through. **Residual (non-blocking)**: the PRYZM3 Immer furniture store still receives the representation default — an ADR-0027 task, tracked separately, no longer blocks rendering. | §10.2 Bridge Invariants 1, 2, 7; §6.1, §6.2; §11.19 |

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

### §7.6 — KNOWN VIOLATION + CONTRACT GAP: element-ID minting is uncontracted (L-665 / L-666, 2026-08-01)

**⚠ This section records a gap in THIS contract, not only in the code.** §3.2 lists seven invariants for
UI-initiated commands and **none of them concerns ids** — yet the §7.0 rows **FIX-WALL-ID** and **FIX-CW-ID**
both cite *"§3.2 (tools MUST pre-generate branded IDs and pass them in the payload)"* as their governing
clause. **C11 is being cited for a rule it does not state.** C03 is silent on id minting; the ONE factory is
`createId(prefix)` (`packages/schemas`), ratified by **ADR-0001**, whose own §4 records its enforcement as
unbuilt (*"`pryzm/no-id-casts` … scheduled for S07"* — never written). Net effect: any creation path may
invent an id, and the only check is the element schema's regex applied at COMMIT inside the handler — where
a rejection surfaces to the user as a **dead click behind a perfect preview**, because the preview path
validates nothing.

**Instances (three, all the same class):**

| Item | Path | Ad-hoc id | Symptom |
|---|---|---|---|
| **L-145** | `applyAutoDimensions` (annotations) | `crypto.randomUUID()` | every `annotation.create` Zod-rejected; nothing rendered |
| **L-665** | `KitchenCabinetTool._placeKitchen` | `` `kitchen_${Date.now()}_${n}` `` | founder-reported: L-shape kitchen preview perfect, click does nothing (`FurnitureSchemaError`) |
| **L-665** | `WardrobeCabinetTool._placeWardrobe` | `` `wardrobe_cab_${Date.now()}_${n}` `` | identical break, **never reported** — an invisible failure generates no bug report |

The kitchen id was introduced deliberately by **ADR-0113 §FIX-KITCHEN-SECOND-PLACE** (a monotonic counter, to
keep two same-millisecond placements distinct) — i.e. an ADR decision that silently contradicted ADR-0001.

**Code status (L-665): IMPLEMENTED — PENDING VERIFICATION.** The canonical
`apps/editor/src/engine/furniture/furnitureCreatePayload.ts` builder now owns the furniture id: `id` is
optional and minted via `newFurnitureId()` (= `createId('furniture')`), and a caller-supplied id is validated
with `isId(id,'furniture')` and rejected at that single convergence point. Both parametric tools deleted
their local generators. **No schema regex was weakened** — a test pins that the pre-fix id still throws
`FurnitureSchemaError` at the handler. This closes the FURNITURE family only.

**Contract status: OPEN (L-666).** The clause itself is NOT yet written. Proposed: add to **§3.2** —
*"every element id MUST be minted by `createId(<prefix>)` from `@pryzm/schemas`; a tool MUST NOT construct an
id string"* — and reconcile the §7.0 rows that already cite it; then build the §8.1 static gate ADR-0001 §4
promised (fail on a template-literal id whose prefix matches a known `ElementType` outside
`packages/schemas`, with an allowlist for non-element entities such as view definitions and render jobs).
Until that lands, this contract does not govern id minting and must not be cited as though it does.

### §7.7 — THE DEAD CLICK HAS TWO MORE MECHANISMS, AND NEITHER IS ID MINTING (L-9300..L-9310, lane POOL55, 2026-08-23)

**⚠ §7.6 above names the symptom and one cause.** Three founder reports in two days on two different
element families measured **two further causes of the identical symptom**, and both are more general than
id minting. This subsection records them so §7.6 is not cited as though it were the whole class.

> *"testing the swimmingpool … even with rectangle mode doesn't work — the swimming pool would not create"*
> *"testing boundary line … doesn't actually work — it doesn't create"*

**⭐ Both families already had a green pointer-layer proof on the founder's own surface.**
`pointerReachesArmedHandler.spec.ts` and `boundaryLinePointerReach.spec.ts` each drive the REAL
`SvpPlanToolOverlay` with REAL DOM `MouseEvent`s and each obtains exactly one `*.create` — 36 assertions.
The pointer path was never the defect. **A reachability proof at the pointer layer does not bound the
class of defect that produces a dead click**, and C104 R-10 should be read with that limit attached.

#### Mechanism A — A REFUSAL THAT IS COMPUTED, CORRECT, AND ERASED BEFORE IT CAN BE READ

`PoolPlanToolHandler` and `BoundaryLinePlanToolHandler` each route every declined creation through a
`_refuse()` that draws the reason **on the plan preview canvas**. That canvas is cleared by the overlay at
the head of **every pointer sample** (`SvpPlanToolOverlay._onMouseMove` → `ctx.clearRect(...)` → handler),
and `_refuse()` has just reset the stroke to zero points — so the handler redraws the idle hint over the
reason. **Measured: after one `mousemove` the on-screen text was `"Pool · Click the first corner"`.**

The refusal was well-written, named both routes back to success (C16 CA-18), and survived roughly one
frame. **This is worse than no refusal**, because the code reads as compliant at every review.

> **RULE.** A creation refusal MUST be delivered on a channel the ARCHITECT'S NEXT ACTION CANNOT ERASE.
> A preview-canvas draw is a legitimate SECOND leg and MUST NOT be the only one. The live first leg in
> this repo is `runtime.toasts` (L-7005 measured `pryzm:toast` at 40+ emitters and **zero** subscribers).
> ⛔ A refusal whose lifetime is bounded by the next pointer sample does not satisfy §3.2.

#### Mechanism B — A COMMAND THAT SUCCEEDS AND RENDERS NOTHING: **DISPATCHABLE IS NOT VISIBLE**

`pool.create` and `boundaryLine.create` are both genuinely registered, reached by `composeRuntime()`,
validated, undoable — and **neither has a `case` in `packages/runtime-composer/src/CommandEventBridge.ts`**.
Both fall to `default:`, so no member event reaches the legacy mirrors in `initTools.ts` and no builder ever
runs. Repo-wide, `PoolMeshBuilder` / `WaterBuilder` return **zero** matches and `boundaryLineSolid()` has
**zero** production callers; `ProjectSerializer` has no `boundaryLines` field, so that record also dies on
save. To the architect, a successful creation and a silent refusal are **the same number of pixels**.

⚠ **The existing silent-drop detector (L-7825) cannot see half of this.** It requires
`patch.path.length === 2` **and** more than one store, so it catches the multi-store pool and misses the
**single-store** boundary line entirely.

> **RULE.** A creation command is NOT complete when it dispatches, validates and commits. **§8 verification
> for a new element family MUST include a reading at the layer the user experiences** — a mesh in the scene
> or a symbol in the plan — and a family with no render path MUST be recorded as such in
> `elementCreationMatrix`'s `gap:` field. ⛔ *"Fully dispatchable and the plan arm drives it"* MUST NOT be
> written where it can be read as *"it works"*; both rows said exactly that and both were wrong in the way
> that mattered.
>
> **RULE (ORDERING).** Where a family has no render path, a NEW activation surface (a 3-D arm, an AI verb,
> a palette row) MUST NOT be added first. It reproduces the dead click at a second surface. **Render first,
> arm second.** Lane POOL55 declined to build the requested 3-D arm on exactly this ground (L-9309).

#### Mechanism C (corollary) — A FINISH GESTURE IS PART OF THE CREATION PATH

`SvpPlanToolOverlay` preserved a half-drawn stroke across `mouseleave` (§T-B1) while gating `keydown` on
hover focus — so **Enter and Escape were dropped for exactly the strokes the same file had gone out of its
way to keep alive.** `PlanViewToolOverlay` has no such gate, so this was split-view-only and invisible to
every main-plan test. Measured: four clicks + `mouseleave` + Enter → **zero** dispatches, both families.

> **RULE.** For any tool whose gesture terminates on a KEY, that key MUST reach the handler wherever the
> handler holds uncommitted state. A hover gate that outlives the stroke it guards is a creation-path bug,
> not an input-routing preference.

**Full measurement, per-mode census (12 combinations) and the 17-site 3-D-arm checklist:
`docs/04-reference/ISSUE-LOG.md` L-9300..L-9310.**

---

### §7.8 — THE INVERSE OF THE DEAD CLICK: **A PERFECT RENDER BEHIND A MESSAGE NO BROWSER EVER PRODUCED** (L-9600..L-9603, lane OPENUI57, 2026-08-23)

**⚠ §7.6 and §7.7 record three mechanisms by which a working-looking surface does nothing. This one
is their mirror image and it is not covered by any of them: the surface DID the work, correctly, and
then told the user it could not.**

> Founder, live deploy `2f8d9470`: the window-type dialog read *"3-D preview unavailable — this
> browser did not provide a WebGL context"* **while his main viewport was rendering his model in
> WebGL on the same GPU.**

Four causes were suspected — a lazy rig that returned `null` and never retried, a device loss with no
rebuild, the WebGPU→WebGL fallback leaving a dead device, an exhausted context budget. **None of them
was it.** `ElementPreviewCanvas` inferred failure from the ALPHA OF THE TARGET CANVAS'S TOP-LEFT 8x8
PIXELS, 120 ms after mount. The blit is letterboxed —
`drawImage(buf, dx, dy, s, s)`, `s = min(w, h)`, `dx = (w - s) / 2` — and the box was 516 x 172 CSS px,
so the picture started 172 px from the left edge and the probe read 164 px of margin that `clearRect`
had wiped. **The probe could not pass. It reported "no context" on a perfect render, in every
browser, on every mount.**

Two aggravations, both structural rather than incidental:

- **It LATCHED** (`firstDrawChecked`). The widget is mounted while its panel is still DETACHED — the
  modal appends the overlay to `document.body` as its last statement — so the first frame legitimately
  draws into a 1x1 canvas, and that frame's answer was frozen for the life of the dialog.
- **It BLOCKED THE POINTER.** The overlay is `position:absolute;inset:0` with no
  `pointer-events:none`, so it swallowed every `pointerdown`. **The drag-orbit, wheel-zoom, arrow keys,
  `Home` and Reset view the founder was asking for were already implemented and unreachable behind it.**

> **RULE — A SURFACE MUST NOT INFER ITS OWN FAILURE FROM ITS OUTPUT PIXELS.** A renderer knows whether
> it drew; ask it. A creation, preview or viewport surface that reports failure MUST take that report
> from the operation that ran, MUST re-evaluate it on every operation rather than latching the first,
> and MUST NOT block interaction while the report is displayed.
>
> **RULE — A FAILURE MESSAGE THAT NAMES A CAUSE IS A CLAIM, AND IT IS SUBJECT TO §CONTEXT-DATA-HONESTY
> LIKE ANY OTHER.** *"this browser did not provide a WebGL context"* is a statement about the user's
> machine. Emitting it from a detector that cannot distinguish "no context" from "drew correctly" is
> the same defect class as reporting an empty result for a failed query — inverted, and worse, because
> it sends the reader to debug a subsystem that is working.

**The compliant shape already existed in this repo, one directory away.** `GraphViewport.ts:184-186`
drives its identical overlay from the renderer's own per-draw answer:

```ts
requestGraphDraw(subject, canvas, orbit, (p) => {
  failure.style.display = p === null ? 'flex' : 'none';
```

`requestPreviewDraw` now takes the same `onResult` callback and `drawNow` returns a named
`PreviewDrawResult` (`ok` / `no-webgl` / `context-lost` / `no-2d-context` / `empty-subject`) — five
outcomes with five sentences, where there had been one sentence for all five. ⛔ **"nothing to draw"
must never be rendered with the word WebGL in it, and a 2-D surface failure must never be blamed on
WebGL** — those were the old message's second and third lies, under the first.

⚠ **A REAL latent defect was found while proving this one, and it is worth separating from it.**
`ensureRig()` returned any non-null rig unconditionally, and `WebGLRenderer.render()` on a LOST
context throws nothing and draws nothing — so one driver reset would have blanked every preview in the
application for the rest of the session while every draw "succeeded". That is precisely hypothesis (b),
**true as a bug and false as an explanation of the founder's report.** Both facts are recorded because
collapsing them is how a fixed bug gets credited with a symptom it never caused.


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

### §8.4 — Runtime gates (plan-view — all element types, 2026-05-19)

After creating each element type via its plan tool in split-view mode, the element MUST appear in the 2D plan panel within ≤ 400 ms (300 ms debounce + ≤ 100 ms projection time) with no page reload or manual refresh required.

| Element type | Plan tool | Expected log on success | Plan-view appears? |
|---|---|---|---|
| Wall | Wall plan tool | `[initTools] §P2.1: wall mirrored to legacy store` | MUST |
| Slab | Slab plan tool | `[initTools] §FT1: slab mirrored to legacy store` | MUST |
| Curtain Wall | Curtain-wall plan tool | `[initTools] §P3.1-CW: curtain wall mirrored to legacy store + storeEventBus fired` | MUST |
| Ceiling | Ceiling plan tool | `[initTools] §P3.2-CL: ceiling mirrored to legacy store` | MUST |
| Roof | Roof plan tool | `[initTools] §P3.2-RF: roof mirrored to legacy store` | MUST |
| Column | Column plan tool | `[initTools] §P3.3-CO: column mirrored to legacy store` | MUST |
| Beam | Beam plan tool | `[initTools] §FT2: beam mirrored to legacy store` | MUST |
| Floor | Floor plan tool | `[initTools] §P3.2-FL: floor mirrored to legacy store` | MUST |

MUST NOT observe:
- `RangeError: Maximum call stack size exceeded` (§7.0 bug F-1.4-REDETECT-LOOP — must never recur)
- Any element type that creates a 3D mesh but does NOT appear in plan view (§7.0 bug P3.1-CW-PLAN pattern)

### §8.5 — OTel verification

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
| Full 214-site migration plan (P1–P11) | `docs/archive/pryzm3-internal/04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md` |
| Wall/curtain-wall/room hot path task (file 32) | `docs/archive/pryzm3-internal/04-PLAN-FORWARD/32-TASK-WALL-CURTAINWALL-CMD-BUS-AUDIT.md` |
| Layer boundary matrix (handler package placement) | `C01-ARCHITECTURE-AND-GOVERNANCE.md §2`, `docs/01-strategy/STR-04-architecture.md §2` |
| `BatchCoordinator` source | `src/engine/subsystems/core/batch/BatchCoordinator.ts` |
| `WallTool` E-bus.1 deprecation notice | `src/engine/subsystems/walls/WallTool.ts:34–55` |
| Live LONGTASK evidence diary entry | `docs/archive/pryzm3-internal/03-CURRENT-STATE.md §10 2026-05-03d` |
| Bridge pattern invariants (C14) | `C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md` |
| Per-element pipeline compliance | §11 (this document) |

---

## §10 — Transitional Bridge Architecture (AS-IS, 2026-05-19)

This section documents the **accepted transitional architecture** for element creation in the current PRYZM3 codebase. It describes the two-layer bridge pattern that sits between the bus pipeline and the legacy geometry/plan-view systems. Engineers working on element creation MUST understand this pattern to avoid breaking plan-view, 3D-mesh, or room-redetect for any element type.

### §10.1 — The two-layer bridge

Element creation in the current codebase flows through two sequential bridges after the Immer store mutation:

```
PRYZM3 PIPELINE          │  BRIDGE LAYER 1           │  BRIDGE LAYER 2
─────────────────────────┼───────────────────────────┼──────────────────────────────
User/AI gesture           │                           │
  → commandBus.dispatch() │                           │
  → CommandHandler         │                           │
    → Immer store patch   │                           │
  → CommandEventBridge    │                           │
    emits typed event     │                           │
    (runtime.events)      │                           │
                          │  initTools.ts subscriber  │
                          │  runtime.events.on(        │
                          │    'xxx.created', (ev) => │
                          │    LegacyStore.add(ev)    │
                          │  )                        │
                          │                           │  LegacyStore.add()
                          │                           │    → storeEventBus.emit()
                          │                           │    → ViewTechnicalDrawing
                          │                           │      Cache._onStoreChange()
                          │                           │    → vd:projection-stale
                          │                           │    → PlanViewManager (300ms)
                          │                           │    → EdgeProjectorService
                          │                           │    → Canvas2D render
                          │                           │
                          │  bim-xxx-added DOM event  │  (parallel)
                          │  → XxxFragmentBuilder     │
                          │    → THREE mesh build     │
                          │    → 3D view update       │
```

### §10.2 — Bridge invariants (binding, must hold for every element type)

1. **CommandEventBridge MUST emit a geometry-complete payload.** The `runtime.events` event for a creation command MUST include all geometry fields needed by `LegacyStore.add()` — id, levelId, and all shape-defining coordinates. A geometry-free payload (only `commandId`, `commandType`, `levelId`) is insufficient and breaks the 3D mesh build.

2. **initTools.ts MUST have a subscriber for every element type dispatched via the bus.** If a bus command succeeds but no `runtime.events.on('xxx.created', ...)` subscriber exists in `initTools.ts`, the legacy store is never populated, no geometry is built, and neither the 3D view nor plan view will show the element.

3. **Every legacy element store's `add()` MUST call `storeEventBus.emit()`** with an `elementType` in `GEOMETRY_ELEMENT_TYPES`. This is the only way the plan-view knows to re-project. The confirmed exception is `CurtainWallStore.add()` (tracked: TODO-CW-STORE-BUS, Wave A16) — the `initTools.ts §P3.1` bridge compensates with an explicit `storeEventBus.emit()` call.

4. **The bridge subscriber MUST have a dedup guard** (`if (store.getById(id)) return;`) to prevent double-adds when the legacy commandManager path also populates the store directly (e.g., columns).

5. **Bus command payload field names MUST match what the plan tool sends.** Field mismatches (e.g., `polygon` vs `boundary` in slabs — Bug FT1-C11-SLAB-BOUNDARY) corrupt the Immer store even when the 3D mesh builds correctly.

6. **`commandManager.execute()` MUST be synchronous in CustomEvent bridge listeners.** It returns `CommandResult`, NOT a `Promise`. Do not add `.then()` or `.catch()` — call it bare. Adding `.catch()` hides the return type mismatch but does not make it asynchronous.

7. **Every bridge MUST call `viewDependencyTracker.registerElement(elementId, levelId)` and `bimManager.registerElement(elementId, levelId)` immediately after `LegacyStore.add()`.** These two calls are the registration spine of the plan-view pipeline. Without them the element is invisible in plan view even when the 3D mesh renders correctly. `viewDependencyTracker.registerElement` populates `_elementLevelMap` so storeEventBus events use the targeted dirty-marking path instead of the §G3-STALE-EVENT broad fallback. `bimManager.registerElement` adds the element to `level.childrenIds` so `NativeElementMeshExporter.exportForView()` includes it in its element list. If either is absent, `EdgeProjectorService.project()` projects 0 elements and Canvas2D stays blank. The `bimManager.registerElement` call MUST use the directly-scoped `bimManager` variable — **never** `(window as any).bimManager` (C14 §LP-01 P4 violation). Both calls MUST be wrapped in `try/catch` to stay non-fatal (failure should log a warning but not abort the bridge). Root cause history: FIX-PLAN-VDT-BIMMANAGER (Rev 3, walls) + FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES (Rev 4, all other geometry elements) + FIX-P4-FLOOR-BIMMANAGER (Rev 4, P4 fix for floor).

8. **The §G3-STALE-EVENT log is a diagnostic signal, not a functional block.** When `[VDT] §G3-STALE-EVENT for unregistered element` appears in the browser console, it means `storeEventBus` fired (from the Immer store mutation inside the handler) before `viewDependencyTracker.registerElement` was called by the bridge. This is a sequencing artifact of the two-layer bridge: the Immer handler emits storeEventBus synchronously, and the bridge fires later via `runtime.events.on('xxx.created')`. The §G3-STALE-EVENT fallback still marks all non-3D views dirty and triggers a VDT flush; the plan-view renders correctly as long as `bimManager.registerElement` is called before that flush resolves. The correct long-term fix is to call `viewDependencyTracker.registerElement` inside the command handler itself (before Immer store mutation) so the element is in the VDT map when storeEventBus fires. This requires adding `viewDependencyTracker` to `HandlerContext` — tracked as a Wave A21 handler-protocol upgrade.

### §10.3 — Bridge removal criteria (Wave A21+)

A bridge for element type X MAY be removed when:
1. The geometry builder for X reads directly from the Immer store (not from the legacy store).
2. The plan-view pipeline subscribes directly to the Immer store change (not via `storeEventBus`).
3. The `bimManager.registerElement()` call is moved into the command handler or a direct Immer store subscriber.

The target state is zero bridges — all geometry builders read from Immer, plan-view subscribes to Immer via the frame scheduler (§6.2.T).

---

## §11 — Per-Element Pipeline Compliance Matrix (2026-05-19)

This matrix is the normative record of which elements are fully wired through the bus pipeline for all three views (3D, plan, elevation). It MUST be updated whenever a bridge is added, removed, or repaired.

**Column key:**

- **CEB case** — `CommandEventBridge.ts` has a `case 'xxx.create'` with geometry-complete payload
- **initTools bridge** — `initTools.ts` has a `runtime.events.on('xxx.created', ...)` subscriber that calls `LegacyStore.add()`
- **Store `add()` → storeEventBus** — `LegacyStore.add()` emits `storeEventBus` (plan-view trigger)
- **Plan-view tracked** — `elementType` string is in `GEOMETRY_ELEMENT_TYPES` (`ViewDependencyTracker.ts:40`)
- **VDT + bimManager** — bridge calls `viewDependencyTracker.registerElement` + `bimManager.registerElement` after `LegacyStore.add()` (Bridge Invariant 7 — required for plan-view projection)
- **3D via bus** — 3D mesh builds via bus path (not legacy-only `commandManager.execute()`)
- **Status** — overall bus-path correctness

| Element | CEB case (geometry-complete) | initTools bridge | Store `add()` → storeEventBus | Plan-view tracked | VDT + bimManager | 3D via bus | Status |
|---|---|---|---|---|---|---|---|
| **Wall** | ✅ `wall.create` + `wall.batch.create` | ✅ §P2.1 | ✅ `WallStore.add()` | ✅ `'wall'` | ✅ (Rev 3 — FIX-PLAN-VDT-BIMMANAGER) | ✅ | ✅ FULL |
| **Slab** | ✅ `slab.create` + `slab.batch.create` | ✅ §FT1 | ✅ `SlabStore.add()` | ✅ `'slab'` | ✅ (Rev 4 — FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES) | ✅ | ✅ FULL |
| **Curtain Wall** | ✅ `curtainwall.create` + `curtain-wall.batch.create` | ✅ §P3.1 (+ explicit `storeEventBus.emit`) | ⚠️ `CurtainWallStore.add()` omits storeEventBus — compensated by bridge emit | ✅ `'curtainwall'` | ✅ (Rev 4 — FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES) | ✅ | ✅ FULL (TODO-CW-STORE-BUS active) |
| **Ceiling** | ✅ `ceiling.create` + `ceiling.batch.create` | ✅ §P3.2-CL | ✅ `CeilingStore.add()` (line 148) | ✅ `'ceiling'` | ✅ (Rev 4 — FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES) | ✅ | ✅ FULL |
| **Roof** | ✅ `roof.create` | ✅ §P3.2-RF | ✅ `RoofStore.add()` | ✅ `'roof'` | ✅ (Rev 4 — FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES) | ✅ | ✅ FULL |
| **Column** | ✅ `column.create` + `column.batch.create` | ✅ §P3.3-CO (dedup: `store.get(id)`) | ✅ `ColumnStore.add()` (line 137) | ✅ `'column'` | ✅ (Rev 4 — FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES) | ✅ | ✅ FULL |
| **Beam** | ✅ `beam.create` + `beam.batch.create` | ✅ §FT2 | ✅ `BeamStore.add()` (line 63) | ✅ `'beam'` | ✅ (Rev 4 — FIX-PLAN-VDT-BIMMANAGER-ALL-BRIDGES) | ✅ | ✅ FULL |
| **Floor** | ✅ `floor.create` | ✅ §P3.2-FL | ✅ `FloorStore.add()` (line 125) | ✅ `'floor'` | ✅ (Rev 4 — FIX-P4-FLOOR-BIMMANAGER; previously P4 violation) | ✅ | ✅ FULL |
| **Wall Opening (Door/Window)** | ✅ `wall.opening.create` + `wall.createOpening` | ✅ §P2.3 | ✅ `OpeningStore.add()` | ✅ `'opening'`, `'window'`, `'door'` | N/A (openings are indexed under their parent wall's `bimManager` entry) | ✅ | ✅ FULL |
| **Stair** | ❌ No `stair.created` CEB case (not needed — see §11.3) | ❌ No `initTools` bridge (not needed — see §11.3) | ✅ `StairStore.add()` → storeEventBus | ✅ `'stair'` | via `CreateStairCommand.execute()` → `ctx.bimManager.registerElement` (CreateStairCommand.ts:201) — NOT an initTools bridge | ⚠️ bus-entry → `initBusHandlers §E.5.4` → legacy `CreateStairCommand` | ⚠️ PARTIAL — bus-initiated but routed to a legacy command; runtime defect under investigation, see §11.3 |
| **Handrail** | ⚠️ `handrail.create` case emits geometry-free payload (levelId only) | ❌ No bridge | ✅ `HandrailStore.add()` → storeEventBus (line 101) | ✅ `'handrail'` | ❌ (no bridge — N/A) | ❌ | ⚠️ LEGACY-ONLY — handrail populated via legacy path; CEB payload insufficient for bridge |
| **Furniture** | ⚠️ `furniture.create` case emits geometry-free payload (levelId only) | ❌ No bridge | ✅ `FurnitureStore.add()` → storeEventBus | ✅ `'furniture'` | ❌ (no bridge — N/A) | ❌ | ⚠️ LEGACY-ONLY — furniture populated via legacy path; CEB payload insufficient for bridge |
| **Lighting** | ⚠️ `lighting.create` case emits geometry-free payload | ❌ No bridge | ❓ Not audited | ❌ Not in `GEOMETRY_ELEMENT_TYPES` | ❌ (no bridge — N/A) | ❌ | ⚠️ OUT-OF-SCOPE — not a geometry element in current schema |
| **Room** | ✅ `room.create` | N/A (room derived, not tool-created) | Via `RoomStore` | ✅ indirect | N/A (derived, not tool-created) | N/A | ✅ Derived — redetected from walls/slabs |

### §11.1 — Gaps requiring action (Wave A16 / Wave A21)

| Gap | Element(s) | Action required | Sprint |
|---|---|---|---|
| **TODO-CW-STORE-BUS** | Curtain Wall | Fix `CurtainWallStore.add()` to emit `storeEventBus` directly (eliminate bridge workaround) | Wave A16 |
| **STAIR-BUS-MIGRATION** | Stair | Bus entry already exists (`initBusHandlers §E.5.4` → `CreateStairCommand`). Remaining: replace the `_cmExec(new CreateStairCommand)` legacy bridge with a PRYZM3 plugin handler + `stair.created` CEB event, so stair matches the wall/slab pipeline shape. See §11.3. | Wave A21 |
| **HANDRAIL-BUS-MIGRATION** | Handrail | Enrich `handrail.create` CEB payload with geometry fields; add `initTools.ts §FT-HANDRAIL` bridge | Wave A21 |
| **FURNITURE-BUS-MIGRATION** | Furniture | ✅ **DONE** (§7.0 FIX-FURNITURE-BRIDGE, §11.19): `furniture.created` widened, CEB enriched, `initTools §FT-FURNITURE` bridge added → legacy `FurnitureStore` mesh + plan symbol. | Wave A21 |
| **SLAB-BATCH-COORDINATOR** | Slab | Implement `BatchCoordinator.runBatch()` in `CreateSlabBatch.ts` (§7.4) | Wave A21 |
| **HANDLER-OTEL-SPANS** | All 177 handlers | Every handler MUST emit ≥ 1 OTel span (§5.2, C10 §2) | S03 |
| **HANDLER-RUNTIME-EVENTS** | All 177 handlers | Every handler MUST call `runtime.events.emit(eventName, payload)` directly after store mutation (§5.2) — today this is done by CEB, not the handler itself | S03 |

### §11.2 — How to add a new element type (checklist)

When implementing a new element type `xxx`, the following MUST all be completed before the feature is considered done:

```
□ 1. Command handler (plugins/xxx/src/handlers/CreateXxx.ts)
     - Validates all domain invariants
     - Mutates Immer store via produceCommand()
     - Wraps in withHandlerSpan() (C10 §2)
     - Declares affectedStores: ['xxx'] as const

□ 2. CommandEventBridge (packages/runtime-composer/src/CommandEventBridge.ts)
     - case 'xxx.create': with FULL geometry payload (id, levelId, ALL shape coordinates)
     - events.emit('xxx.created', { ...allGeometryFields })
     - case 'xxx.batch.create': emits one 'xxx.created' per element

□ 3. initTools.ts bridge (apps/editor/src/engine/initTools.ts)
     - runtime.events.on('xxx.created', (ev) => { ... })
     - Guards: commandType check, geometry presence check, dedup guard
     - Calls LegacyXxxStore.add({ ...reconstructedFromEv })
     - If LegacyXxxStore.add() does NOT emit storeEventBus: add explicit
       storeEventBus.emit({ elementType: 'xxx', elementId: ev.id, ... })
     - Log: console.log('[initTools] §FT-XXX: xxx mirrored to legacy store', ev.id)

□ 4. Legacy store (packages/core-app-model/src/stores/XxxStore.ts or geometry-xxx/)
     - add() MUST call storeEventBus.emit({ elementType: 'xxx', operation: 'create', ... })
     - elementType string MUST be in GEOMETRY_ELEMENT_TYPES (ViewDependencyTracker.ts:40)

□ 5. ViewDependencyTracker (packages/core-app-model/src/views/ViewDependencyTracker.ts)
     - Add 'xxx' to GEOMETRY_ELEMENT_TYPES Set if it has plan-view geometry

□ 6. Verify §11 matrix — update this table

□ 7. Verify §8.4 runtime gate — test in split-view, confirm element appears in plan ≤ 400ms
```

### §11.3 — Stair creation pipeline (AS-IS, 2026-05-19 Rev 7)

The §11 matrix previously stated stair is "created via `commandManager`, not bus" — **inaccurate**. The real AS-IS pipeline:

```
StairPlanToolHandler._commitStair()   (apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts)
  → runtime.bus.executeCommand('stair.create', { baseLevelId, topLevelId, shape,
       riserHeight, treadDepth, width, startPosition, flights })
  → initBusHandlers.ts §E.5.4 bridge   ({ type: 'stair.create' }, ~line 370)
       validate: baseLevelId required
  → _cmExec(new CreateStairCommand(cmd))          — legacy commandManager.execute()
  → CreateStairCommand.canExecute(ctx)            — BLOCKING validations (below)
  → CreateStairCommand.execute(ctx)
      → ctx.bimManager.registerElement(stairId, baseLevelId)   (CreateStairCommand.ts:201)
      → stairStore.add(stair)                                  (CreateStairCommand.ts:275)
      → (autoCreateOpening) punches an opening on the top-level slab
```

Stair creation **is** bus-initiated. It is the only geometry element whose bus command is bridged directly to a legacy `CreateStairCommand` via `_cmExec` (`initBusHandlers §E.5.4`) rather than to a PRYZM3 plugin handler + CEB event. No `stair.created` CEB event and no `initTools` bridge exist — and none is required for *this* path: `CreateStairCommand` writes the legacy `StairStore` and calls `bimManager.registerElement` itself.

**Stair is a two-level element — binding prerequisite.** A stair spans `baseLevelId` → `topLevelId`. `StairPlanToolHandler._commitStair()` resolves the level *above* the active level; with only one level it **aborts before dispatch** and emits a `pryzm:toast` ("Add a second level before placing a stair"). Stair creation in a single-level project is a no-op **by design** — not a defect.

**Amendment (2026-05-19 — §FIX-STAIR-EVENT-PAYLOAD, §7.0)**: the AS-IS pipeline above stopped at `stairStore.add(stair)` and did **not** document the **store → builder → mesh** stage — the exact gap that hid this defect. The complete stage:

```
stairStore.add(stair)
  → StairStore emits window event 'bim-stair-added' with { id }      (F.events.18)
  → StairMeshBuilder.onAdded  →  resolves StairData from StairStore by id
       →  updateStair()  →  3D mesh + StairPlanRepresentation (plan-view symbol)
CreateStairCommand also creates the railings + landings:
  → StairRailingStore.add() / StairLandingStore.add()  emit { id }
  → StairRailingBuilder / StairLandingBuilder  →  resolve from store by id  →  mesh
```

The three stair stores emit `{ id }` (the authoritative-store / `TASK-10` convention); each builder MUST resolve the full element from its store and MUST NOT expect it inline on the event. Before the fix the builders read `detail.stair` / `detail.railing` / `detail.landing` (never sent) → no stair, railing, or landing mesh was ever built — which is why stair appeared "broken in plan and 3D" even though every store `add()` succeeded. The store→builder event hop is now a tracked part of the §6.1 geometry-build contract for stairs.

**`CreateStairCommand.canExecute()` blocking validations** — any one aborts creation: base level == top level; base or top level missing; riser height outside `STAIR_CONSTRAINTS.MIN/MAX_RISER_HEIGHT`; tread depth below `MIN_TREAD_DEPTH`; width below `MIN_WIDTH` (a small drawn bounding box trips this); accessible width below `MIN_ACCESSIBLE_WIDTH`.

**Open diagnostic gap (Rev 7).** A report of "stair does not create in plan or 3D" could **not** be pinpointed to a single defect by static analysis — the pipeline is structurally intact. Confirming the runtime cause REQUIRES the browser console output of an actual stair attempt: the `[StairPlanToolHandler]` line (dispatched vs aborted-with-toast) and, if dispatched, the `[CreateStairCommand.canExecute] …` lines plus any blocking reason. Until that evidence is captured this is an AS-IS gap, not a fixed defect. When the runtime cause is identified, the fix and root cause MUST be recorded in §7.0 (the critical-bug ledger), as for the wall/slab/curtain-wall defects. Tracked: task #7.

### §11.4 — Slab creation pipeline — Phase 1 audit (2026-05-19)

End-to-end audit of slab creation, stage by stage:

| Stage | Component | State |
|---|---|---|
| 1. Tool entry | `SlabPlanToolHandler` — 4 modes (2-point, region, polyline, hollow) | ✅ pre-generates `createId('slab')`; dispatches `slab.create` |
| 2. Command | `slab.create` registered in `command-bus/src/commands.ts`; handler `plugins/slab/src/handlers/CreateSlab.ts` | ✅ |
| 3. canExecute | `validateSlabBoundary()` → `signedAreaXZ()` (X-Z plane) | ⚠️ → ✅ **was the FIX-SLAB-ZERO-AREA defect** (§7.0); fixed |
| 4. CEB | `slab.create` + `slab.batch.create` cases emit `slab.created` with full geometry | ✅ |
| 5. initTools bridge | `§FT1` — `runtime.events.on('slab.created')` → `slabStore.add()` + `viewDependencyTracker.registerElement` + `bimManager.registerElement` | ✅ |
| 6. 3D mesh | `SlabFragmentBuilder` from legacy `SlabStore` — runtime logs confirm `BUILD_COMPLETE` | ✅ |
| 7. Plan view | `SlabStore.add()` → storeEventBus → `ViewTechnicalDrawingCache` → `EdgeProjectorService` — logs confirm `elemType=Slab` projected | ✅ |

**Phase 1 verdict**: the slab pipeline is structurally complete and (post FIX-SLAB-ZERO-AREA) functional in both plan and 3D views. ID pre-generation, VDT + bimManager registration, and the CEB geometry payload all conform to §10.2 Bridge Invariants 1, 4, 7.

**Open Phase-1 follow-ups** (tracked, not creation-blocking):
1. **SLAB-BOUNDARY-CONVENTION** (§7.4) — slab boundary uses two clashing axis conventions (PRYZM3 handler keys X-Z; legacy `§FT1` bridge keys `{x,y}`). FIX-SLAB-ZERO-AREA papers over it by writing `worldZ` to both `y` and `z`. The clean fix: unify on world-Vec3 `{x, y:0, z}` and translate in the `§FT1` bridge.
2. **Slab plan-view preview** — `SlabPlanToolHandler` region/polyline modes lack the live overlay preview that Wall/Stair tools provide. UI gap, not a pipeline defect.

### §11.5 — Wall creation pipeline — Phase 2 audit (2026-05-19)

End-to-end audit of wall creation, stage by stage:

| Stage | Component | State |
|---|---|---|
| 1. Tool entry | `WallPlanToolHandler._commitWall()` — `createId('wall')`, dispatches `wall.create` (baseLine Vec3, height, thickness, levelId, systemTypeId, curve) | ✅ (FIX-WALL-ID §7.0) |
| 2. Command handler | `CreateWallHandler` (`plugins/wall/src/handlers/CreateWall.ts`) — `canExecute` validates height/thickness/branded-id/systemTypeId; `execute` wrapped in `withHandlerSpan` (C10 §2), `Wall.parse()`, MIN_WALL_LEN check, `produceCommand()` Immer patch pair | ✅ **exemplary** — this handler is the C11 §5.2 reference shape (pure, span-wrapped, patch-producing) |
| 3. CEB | `wall.create` + `wall.batch.create` cases emit `wall.created` with full geometry | ✅ |
| 4. initTools bridge | `§P2.1` — `wall.created` → legacy `WallStore.add()` + `viewDependencyTracker.registerElement` + `bimManager.registerElement` | ✅ (FIX-PLAN-VDT-BIMMANAGER §7.0) |
| 5. 3D mesh | `WallStore.add()` → `WallRebuildCoordinator._scheduleFlush()` → `_flush()` → `WallFragmentBuilder.buildWall()` | ✅ (FIX-NAN-Y, FIX-VIEWSWITCH-DROP §7.0) |
| 6. Plan view | `WallStore.add()` → storeEventBus → `ViewTechnicalDrawingCache` → `EdgeProjectorService` — logs confirm `elemType=wall` projected | ✅ |

**Phase 2 verdict**: wall is the **reference pipeline** — the most battle-tested element. `CreateWallHandler` is the canonical handler shape other element handlers should match. All four historical wall defects (FIX-WALL-ID, FIX-PLAN-VDT-BIMMANAGER, FIX-NAN-Y, FIX-VIEWSWITCH-DROP) are fixed. **No new defect found.**

**Open Phase-2 follow-up** (tracked, not creation-blocking): §7.1 — the legacy 3D `src/engine/subsystems/walls/WallTool.ts` still has 2 `commandManager.execute()` sites (lines 1535, 1605). The bus-wired replacement is `plugins/wall/src/tool.ts`; retiring the legacy `WallTool.ts` is tracked as TODO E.1.

### §11.6 — Curtain Wall creation pipeline — Phase 3 audit (2026-05-19)

| Stage | Component | State |
|---|---|---|
| 1. Tool entry | `CurtainWallPlanToolHandler._commit()` — `createId('curtainwall')` (straight + per-arc-segment), dispatches `curtainwall.create` | ✅ (FIX-CW-ID §7.0) |
| 2. Command handler | `CreateCurtainWallHandler` (`plugins/curtain-wall/src/handlers/CreateCurtainWall.ts`) — `canExecute` validates baseLine finite/non-zero, positive dims, unique panel ids; `execute` `withHandlerSpan` + `CurtainWall.parse()` + `produceCommand()` | ✅ conformant (C11 §5.2) |
| 3. CEB | `curtainwall.create` + `curtain-wall.batch.create` → `curtain-wall.created` with id, baseLine, height, bayWidth, bayHeight, mullionThickness | ✅ (TASK-02 grid-spacing fields) |
| 4. initTools bridge | `§P3.1-CW` — `curtain-wall.created` → `curtainWallStoreInstance.add()` + **explicit** `storeEventBus.emit({elementType:'curtainwall'})` + `viewDependencyTracker.registerElement` + `bimManager.registerElement` + `bim-curtainwall-added` | ✅ (P3.1-CW-PLAN, FIX-PLAN-VDT-BIMMANAGER, P3.1-CW-MULLION-FIX) |
| 5. 3D mesh | `CurtainWallBuilder` — bridge maps bayWidth→gridXSpacing, bayHeight→gridYSpacing, mullionThickness→mullionSize | ✅ |
| 6. Plan view | storeEventBus → `ViewTechnicalDrawingCache` → `EdgeProjectorService` — **runtime logs confirm** `elemType=CurtainWall` groups projected with full `CurtainPanelInstanced`/`CurtainWallPart` mesh sets | ✅ (live-verified) |

**Phase 3 verdict**: curtain-wall pipeline is structurally complete and functional in both views — runtime logs are live proof of plan-view projection. `CreateCurtainWallHandler` conforms to C11 §5.2. **No new defect found.**

**Open Phase-3 follow-up**: **TODO-CW-STORE-BUS** (§11.1) — `CurtainWallStore.add()` does not emit `storeEventBus` itself; the `§P3.1-CW` bridge compensates with an explicit emit. The clean fix is to make `CurtainWallStore.add()` emit directly, matching every other legacy element store.

### §11.7 — Ceiling creation pipeline — Phase 4 audit (2026-05-19)

| Stage | Component | State |
|---|---|---|
| 1. Tool entry | `CeilingPlanToolHandler` — `_commit()` (manual polygon) + room-pick path; `createId('ceiling')`; `boundary` dispatched as proper world-Vec3 `{x, y:0, z:worldZ}` | ✅ — **correct boundary convention** (the one §7.4 SLAB-BOUNDARY-CONVENTION should converge on) |
| 2. Command handler | `CreateCeilingHandler` (`plugins/ceiling/src/handlers/CreateCeiling.ts`) — `canExecute` validates boundary / ceilingHeight>0 / thickness>0 / thickness<ceilingHeight; `execute` `withHandlerSpan` + dup-id guard + `Ceiling.parse()` + `produceCommand()` | ✅ conformant — matches the §11.5 wall reference shape |
| 3. CEB | `ceiling.create` + `ceiling.batch.create` → `ceiling.created` with id, boundary, ceilingHeight, thickness | ✅ |
| 4. initTools bridge | `§P3.2-CL` — `ceiling.created` → Vec3 boundary mapped to `{x,z}` polygon → `ceilingStore.add()` + `viewDependencyTracker.registerElement` + `bimManager.registerElement` | ✅ (FIX-PLAN-VDT-BIMMANAGER) |
| 5. 3D mesh | `CeilingPanelBuilder` from legacy `CeilingStore` | ✅ |
| 6. Plan view | `CeilingStore.add()` → storeEventBus → `EdgeProjectorService` — **runtime logs confirm** `elemType=ceiling` group projected | ✅ (live-verified) |

**Phase 4 verdict**: ceiling pipeline complete and functional in both views (logs confirm). Handler conforms to the wall reference shape. **No new defect found.** Ceiling's `{x, y:0, z}` boundary is the model convention for §7.4.

### §11.8 — Roof creation pipeline — Phase 5 audit (2026-05-19)

| Stage | Component | State |
|---|---|---|
| 1. Tool entry | `RoofPlanToolHandler` — `createId('roof')`; `boundary` dispatched as world-Vec3 `{x, y:0, z}`; has `_drawPreview()` (called on `onMouseMove`) | ✅ |
| 2. Command handler | `CreateRoofHandler` (`plugins/roof/src/handlers/CreateRoof.ts`) — `canExecute` validates boundary≥3 / thickness>0 / pitch∈[0,π/2) / roof type; `execute` `withHandlerSpan` + `Roof.parse()` + `produceCommand()` | ✅ conformant — matches the §11.5 wall reference shape |
| 3. CEB | `roof.create` → `roof.created` with id, boundary, shape, overhang, thickness | ✅ |
| 4. initTools bridge | `§P3.2-RF` — `roof.created` → recomputes centroid + centroid-local polygon → `roofStore.add()` + `viewDependencyTracker.registerElement` + `bimManager.registerElement` | ✅ (FIX-PLAN-VDT-BIMMANAGER; FT6/BUG-6 baseOffset fix) |
| 5. 3D mesh | `RoofFragmentBuilder` from legacy `RoofStore` | ✅ |
| 6. Plan view | `RoofStore.add()` → storeEventBus → `EdgeProjectorService` — **runtime logs confirm** `elemType=roof` (group#26, `RoofPart`) projected + `RoofSlopeSymbolBuilder` slope arrows injected | ✅ (live-verified) |

**Phase 5 verdict**: roof pipeline complete and functional in both views (logs confirm projection + slope symbols). Handler conforms to the wall reference shape. **No new pipeline defect found.**

**Phase-5 note on the reported "missing preview"**: `RoofPlanToolHandler` *does* implement `_drawPreview()` and invokes it from `onMouseMove()`. A roof preview is therefore drawn while points are being placed. If a preview appears absent at runtime, the candidate gap is the **pre-first-click cursor indicator** (Wall/Stair draw a crosshair before the first point; Roof's redraw path is gated on `_pts.length > 0`). This is a minor UX affordance, **not** a pipeline or creation defect — tracked separately from element-creation correctness.

### §11.9 — Column / Beam / Floor / Handrail pipelines — Phases 6–9 audit (2026-05-19)

**Phase 6 — Column** ✅: `ColumnPlanToolHandler` pre-generates `createId('column')`, dispatches `column.create` with `origin` Vec3 + `rotation: 0` (scalar — no furniture-style defect). `CreateColumnHandler` conforms to the §11.5 wall reference shape (`canExecute` validates origin/width/depth/height/circular-constraint; `execute` `withHandlerSpan` + `Column.parse` + `produceCommand`). Bridge `§P3.3-CO` mirrors to legacy `ColumnStore` + VDT + bimManager. Logs confirm `elemType=Column` projected (groups 21–24). **No defect.**

**Phase 7 — Beam** ⚠️→✅: pipeline wired (`§FT2` bridge), `CreateBeamHandler` conforms — **but** a payload field-name mismatch (`startPoint`/`endPoint` from the tool vs `baseLine` in the handler) left the PRYZM3 Immer beam without real geometry. Fixed — see §7.0 **FIX-BEAM-PAYLOAD**. The legacy 3D mesh path was unaffected (logs confirm `elemType=beam`, group 25).

**Phase 8 — Floor** ✅: `FloorPlanToolHandler` pre-generates `createId('floor')`, dispatches `floor.create` with `polygon` + `ifcGuid`. `CreateFloorHandler` conforms (validates polygon≥3 / thickness>0 / finite baseOffset; builds a complete `FloorData`). Bridge `§P3.2-FL` mirrors to legacy `FloorStore` + VDT + bimManager (FIX-P4-FLOOR-BIMMANAGER applied). Logs confirm `elemType=floor` projected (group 20). **No defect.**

**Phase 9 — Handrail** ⚠️ partial: `CreateHandrailHandler` itself conforms to the reference shape. Two defects found:
1. **Payload mismatch** — tool sent `start`/`end`/`thickness`; handler expects `path`/`diameter` → Immer handrail was a default 1 m rail at origin. **Fixed** — §7.0 **FIX-HANDRAIL-PAYLOAD**.
2. **No bus bridge** — **FIXED** (FIX-HANDRAIL-BRIDGE, §7.0). The CEB `handrail.create` case emitted a geometry-free payload and no `initTools` bridge subscribed → a handrail drawn from the plan tool reached the PRYZM3 Immer store but was never mirrored to the legacy `HandrailStore` → no 3D mesh, no plan-view projection. Closed via three coordinated changes: `RuntimeEvents['handrail.created']` widened with geometry fields, the CEB case enriched, and a new `initTools §FT-HANDRAIL` bridge that translates the PRYZM3 `path[]`/`diameter` shape into the legacy `HandrailData` (`baseLine[2]`/`thickness`), calls `handrailStore.add()` (→ storeEventBus + `bim-handrail-added`) and registers VDT + bimManager. Mirrors the §FT2 beam bridge.

**Phases 6–9 verdict**: column + floor fully conformant; beam fixed (FIX-BEAM-PAYLOAD); handrail **fully fixed** — both FIX-HANDRAIL-PAYLOAD and FIX-HANDRAIL-BRIDGE applied; handrail now creates and renders in plan + 3D from the bus path.

### §11.10 — Door / Window pipelines — Phases 10–11 audit (2026-05-19)

Door and window are **wall openings** — they share one pipeline:

| Stage | Component | State |
|---|---|---|
| 1. Tool entry | `DoorPlanToolHandler` / `WindowPlanToolHandler` — dispatch `wall.opening.create` with `{ wallId, openingData }`; opening `id`/`elementId` pre-generated (UUID — openings are not branded-ID elements) | ✅ |
| 2. Command handler | `WallOpeningLegacyAdapterHandler` (`type='wall.opening.create'`) — `canExecute` validates wallId + openingData (type/offset/width/height/sillHeight); `execute` `withHandlerSpan` + `produceCommand` adds the opening to `wall.openings` + `wall.childrenIds` | ✅ conformant |
| 3. CEB | `wall.opening.create` + `wall.createOpening` → `wall.opening.created` | ✅ |
| 4. initTools bridge | `§P2.3` — `wall.opening.created` → `WallStore.addOpening()` + `§P2.3-DOOR`/`§P2.3-WIN` mirror to `DoorStore`/`WindowStore` | ✅ |
| 5. 3D mesh | `WallRebuildCoordinator` rebuilds the host-wall mesh with the opening void | ✅ |
| 6. Plan view | `DoorPlanSymbolBuilder` (swing arcs) / `WindowPlanSymbolBuilder` (frame symbols) — **runtime logs confirm** "Injected 2 door swing arc(s)" + "Injected 2 window symbol(s)" | ✅ (live-verified) |

**Phases 10–11 verdict**: door + window fully functional in both views (logs prove symbol injection). **No defect found.**

### §11.11 — Plumbing / Lighting / Grid / Annotation / Room — Phases 12–14 audit (2026-05-19)

These five do **not** follow the geometry-element bridge pattern uniformly — each is audited individually:

- **Plumbing** ✅ **FIXED** (§7.0 FIX-PLUMBING-FIXTURE-CMD): `PlumbingPlanToolHandler` creates **fixtures** (toilet/shower/bath/sink) but dispatched `plumbing.create` — the **pipe** handler (`CreatePlumbingHandler`; `CreatePlumbingPayload = { kind, origin, diameter, bendRadius, … }`). Every fixture field was silently dropped. **The Phase-12 re-audit originally over-classified this as a "PLUMBING-FIXTURE-MODEL-GAP" requiring a new schema + architecture decision — that classification was wrong and is retracted.** A fixture handler already existed: `CreatePlumbingFixtureHandler` (`type: 'plumbing.createFixture'`, `plugins/plumbing/src/handlers/CreatePlumbingFixture.ts`) — an F-1.3 bridge → legacy `CreatePlumbingFixtureCommand` → fixture `PlumbingStore` → `PlumbingFragmentBuilder`. It is registered by `registerPlumbingHandlers()` (`engineLauncher.ts §P3.5-PL`) and typed in `commands.ts:672`. The plan tool merely dispatched the wrong command name. **Fix**: `_commit()` now dispatches `plumbing.createFixture`; the tool's existing payload already matched `CreatePlumbingFixturePayload` verbatim (including `rotation` as a Vec3, which the fixture handler expects) — **no payload change**. This is the same command the furniture-carousel drag-drop already uses (`FurnitureDragDropHandler.ts:367`). **No `§FT-PLUMBING` bridge is needed** — `CreatePlumbingFixtureHandler.execute()` writes straight to the legacy fixture store, so the 3D mesh and registry wiring are handled by the legacy `CreatePlumbingFixtureCommand`.
- **Lighting** — **(1) Payload mismatch — FIXED** (§7.0 FIX-LIGHTING-PAYLOAD): `LightingPlanToolHandler` dispatched `{ fixtureType, position }` but `CreateLightingPayload` declares `{ kind, origin }`. Verified a **pure rename** — `LightingFixtureType` and the schema `LightingKind` share the value space. The tool now dispatches `kind` + `origin`. **(2) Bus bridge — FIXED** (§7.0 FIX-LIGHTING-BRIDGE): a `§FT-LIGHTING` bridge now mirrors `lighting.created` into the legacy `LightingStore` → `LightingFragmentBuilder` 3D mesh — the tool pre-generates the `id`, the CEB forwards the geometry, and the `initTools §FT-LIGHTING` bridge translates `kind`/`origin` → legacy `fixtureType`/`position`. Lighting now renders in 3D from the bus path. (No plan-view projection — lighting is not in `GEOMETRY_ELEMENT_TYPES`, by design.)
- **Grid** ⚠️: **command-name split** — `GridPlanToolHandler` dispatches `grid.add` (routed by the `initBusHandlers.ts:275` legacy bridge), while the grid plugin's own `tool.ts` dispatches `grid.create` (the PRYZM3 `CreateGridHandler`). Both paths are wired so grid creation is not broken, but the duplication is a transitional inconsistency. **Follow-up — GRID-COMMAND-UNIFY**: converge both tools on `grid.create` and retire the `grid.add` legacy bridge.
- **Annotation** ✅ (separate subsystem): annotations render through `AnnotationManager` + `PlanViewAnnotationRenderer`, not the geometry-element bridge. Runtime logs confirm `[CommandManager] EXECUTE: CREATE_ANNOTATION` and annotation injection into plan views. Functional; outside the geometry-pipeline scope.
- **Room** ✅ (derived): rooms are **redetected** from walls/slabs/columns by `RoomDetectionEngine` (logs: "Detected 1 room(s) on level 'L0'"). `room.create` exists for explicit creation but the dominant path is auto-detection (§6.3). Functional.

**Phases 12–14 verdict**: annotation + room functional (separate subsystems). Grid functional but command-name-split. **Plumbing and lighting bus-path issues are now both fixed** — lighting via the `§FT-LIGHTING` bridge (LIGHTING-BUS-MIGRATION, §7.0 FIX-LIGHTING-BRIDGE); plumbing via the command-name correction (§7.0 FIX-PLUMBING-FIXTURE-CMD — no bridge needed, the fixture handler writes straight to the legacy store). The only remaining transitional item in this group is GRID-COMMAND-UNIFY.

### §11.12 — Batch & AI-triggered creation — Phase 15 audit (2026-05-19)

**Batch handlers present** — `*.batch.create` handlers exist for **wall, slab, curtain-wall, column, beam, ceiling, door, window** (+ stair). Each was audited:

- **Handler shape ✅** — every batch handler follows one pattern: `canExecute` validates **per-element** (mirroring the single-create handler's rules, indexed `[i]` reasons), then `execute` materialises all elements and commits them in **one `produceCommand()` Immer patch** → **one forward + one inverse patch → one undo-stack entry**. Wrapped in `withHandlerSpan` (C10 §2). This conforms to C11 §4.2 (a batch is a single undoable unit) and §4.3.
- **No internal `BatchCoordinator` call — and that is correct.** The PRYZM3 batch handler's job is the atomic Immer mutation. `BatchCoordinator` (the legacy engine's flush-suppressor — it coalesces `storeEventBus` flushes and defers geometry rebuilds) is a *separate* concern, invoked by the **dispatching layer** (the AI workflow coordinator / the `Create*OnAllSlabs` legacy commands) that *wraps* the `*.batch.create` dispatch. Only `CreateStairBatch` references it directly.
- **Downstream fan-out** — the CEB `*.batch.create` cases emit **one `*.created` event per element**; the `initTools` bridges mirror each into its legacy store. Geometry coalescing then happens downstream: `WallRebuildCoordinator._scheduleFlush()` accumulates N wall events into **one** `_flush()` per frame (one `WallJoinResolver` pass), and `RoomTopologyObserver` debounces N adds into one redetect. So N-element geometry build is **not** O(N) passes.

**Phase 15 verdict**: batch creation is structurally sound — atomic single-undo Immer patches; downstream debounce-coalescing prevents O(N) geometry thrash.

**Open Phase-15 item (performance — §4.2 compliance)**: the per-element CEB emit → bridge → legacy `Store.add()` chain is O(N), and each `Store.add()` emits `storeEventBus`. Those emissions are only coalesced into a single flush when the batch is dispatched **inside `BatchCoordinator.runBatch()`**. C11 §4.2 makes that mandatory for AI-initiated multi-element creation. **Verification still required**: confirm the AI workflow coordinator (`packages/ai-host`) wraps every `*.batch.create` dispatch in `BatchCoordinator.runBatch()` — without it, a large AI batch fires N un-coalesced `storeEventBus` flushes. Tracked under Phase 16 (CW-batch perf re-review) and §7.4.

### §11.13 — Curtain-wall-batch-from-slab — Phase 16 performance re-review (2026-05-19)

**Builder optimisation state — confirmed strong.** `CurtainWallBuilder` already carries substantial perf machinery: vertical/horizontal mullions render as **2 `THREE.InstancedMesh` per wall** (was ~10 `Mesh`; draw calls ~10 → 2); a `GeometryWorkerPool` offloads geometry generation off the main thread; an **adaptive per-frame drain** (`_buildsPerFrame` — C11 §6.1 §PERF-ADAPTIVE-DRAIN) scales build count to measured frame time; batch shadow-reactivation is coalesced into one one-shot drain. This matches the "massively reviewed" history — the builder itself does not need re-optimisation.

**Dispatch path — the transitional weak point.** The PRYZM3 `CreateCurtainWallsOnAllSlabsHandler` is a *thin synchronous bridge*: it calls `window.commandManager.execute(new CreateCurtainWallsOnAllSlabsCommand(...))`. The slab×edge iteration that mints N curtain walls runs inside that **legacy synchronous command**. The handler's own `TODO(F-2)` acknowledges it should be decomposed into atomic `curtainwall.create` dispatches. **Perf risk**: if the legacy command's slab-perimeter loop has no frame-scheduler yield, a project with many slabs produces one long synchronous task at dispatch.

**Measured plan-view projection cost (from runtime logs §DIAG-EPS).** Each curtain wall projects as **76–85 edge-geometry meshes** (`CurtainPanelInstanced` + `CurtainWallPart`), with `EdgeProjectorService` per-CW `traverseMs` of **10–17 ms**. A K-curtain-wall batch therefore costs ≈ K × 15 ms of plan-view edge projection — for K ≥ 7 a single re-projection exceeds the C10 100 ms LONGTASK budget. The EdgeProjector already chunks per group (`§PERF-EDGEPROJECTOR-CHUNK`), spreading the cost, but the **per-panel edge-geometry allocation** (24 edge-verts × ~80 panels/CW) is the dominant term.

**Open Phase-16 items (require runtime profiling / implementation to close):**
1. Verify the legacy `CreateCurtainWallsOnAllSlabsCommand` slab loop yields to the frame scheduler between slabs (no single synchronous N-wall task).
2. Verify the batch dispatch is wrapped in `BatchCoordinator.runBatch()` (§4.2 / §11.12 open item) so the N `storeEventBus` emissions coalesce into one flush.
3. Cache/instance the EdgeProjector per-panel edge geometry — ~80 near-identical 24-vert edge meshes per CW is the largest projection cost; identical panel cells should share one cached edge geometry.
4. Complete the `TODO(F-2)` decomposition: replace the legacy-command bridge with atomic `curtainwall.create` dispatches inside one `BatchCoordinator.runBatch()`.

### §11.14 — Geometry / dimension / transform update commands — Phase 17 audit (2026-05-19)

**Coverage — confirmed comprehensive.** A `*.move` handler exists for **every** element family (wall, slab, column, beam, curtain-wall, roof, floor*, ceiling*, door, window, stair, furniture, plumbing, lighting, structural, room, annotation, dimension, section). Dimension/geometry updates also exist: `wall.setDimensions`, `wall.updateBaseline`, `wall.cascadeBaseline`, `slab.updatePolygon`, `curtainwall.resize`, `door.setOffset`, `window.setOffset`, `room.updateBoundary`, `furniture.updateParameters`, `structural.setDimensions`.

**Handler conformance — spot-checked.** `UpdateWallBaseline` and `UpdateSlabPolygon` both carry `canExecute` + `withHandlerSpan` + `produceCommand` — i.e. they follow the §11.5 wall reference shape (validated, span-wrapped, Immer-patch-producing).

**Naming observation.** Two parallel transform vocabularies exist: the `MovePlanToolHandler`/`AlignPlanToolHandler` dispatch `wall.updateBaseline` / `slab.updatePolygon` / `column.update` etc., while a separate `*.move` handler family also exists. Both are wired, but the duplication is a transitional inconsistency — a follow-up (`TRANSFORM-COMMAND-UNIFY`) should converge the plan tools and the `*.move` handlers on one command per element.

**Phase 17 verdict (partial — honest scope note).** The update/transform handler *family* is comprehensive and the spot-checked handlers conform. A full per-command audit of all ~30 update/move/resize handlers — verifying each triggers the correct geometry rebuild + plan/3D refresh + undo patch — is genuine multi-file work and remains the tracked Phase-17 deliverable (task #25). No defect surfaced in the spot-check; the `TRANSFORM-COMMAND-UNIFY` naming reconciliation is the one structural follow-up.

### §11.15 — Appearance commands — Phase 18 audit (2026-05-19)

**Coverage.** Appearance commands exist across the geometry elements: `wall.setColor` / `wall.setLayers` / `wall.setSystemType` / `wall.bulkSetVisuals`; `slab.updateLayers`, `ceiling.updateLayers`, `floor.updateLayers`; `curtainwall.setMullionType` / `setPanelType` / `setTransomType`; `room.setMaterial`, `structural.setMaterial`, `annotation.setColor`.

**Handler conformance — spot-checked.** `SetWallColor`, `SetWallLayers`, `UpdateSlabLayers`, `SetCurtainWallMullionType` all carry `canExecute` + `withHandlerSpan` + `produceCommand` — conforming to the §11.5 wall reference shape.

**Visual-refresh wiring.** Layer-stack changes route correctly: the CEB `slab.updateLayers` / `ceiling.updateLayers` / `floor.updateLayers` cases emit a typed `*.layer-updated` event (TASK-12) that `FragmentBuilder` subscribers consume to trigger a mesh rebuild — a system-type / layer change re-materialises geometry rather than going stale.

**Phase 18 verdict (partial — scope note).** The appearance-command handler family is comprehensive and the spot-checked handlers conform to the reference shape; the layer→rebuild path is wired. A full per-command audit verifying every appearance change (colour, material, each system-type swap) triggers the correct **plan + 3D** visual refresh is the tracked remaining Phase-18 deliverable (task #26). No defect surfaced in the spot-check.

### §11.16 — Transform commands — Phase 19 audit (2026-05-19)

**Coverage.** A `*.move` handler exists for all 16+ element families (wall, slab, column, beam, curtain-wall, roof, door, window, stair, furniture, plumbing, lighting, structural, room, annotation, dimension, section). Rotation: `furniture.rotate`, `stair.rotate`, `curtainwall.rotatePanel`; `wall.transform` for combined transforms. Elements without a dedicated `.rotate` are rotated via `transform` / baseline-update commands (§11.14).

**Handler conformance — spot-checked.** `MoveWall`, `MoveColumn`, `MoveFurniture` carry `canExecute` + `withHandlerSpan` + `produceCommand` — conforming to the §11.5 reference shape.

**Cross-reference.** Transform commands overlap the §11.14 (Phase 17) dimension/geometry-update family — `MovePlanToolHandler` / `AlignPlanToolHandler` dispatch both. The `TRANSFORM-COMMAND-UNIFY` follow-up (§11.14) covers reconciling the parallel `*.move` vs `*.updateBaseline` / `*.updatePolygon` vocabularies.

**Phase 19 verdict (partial — scope note)**: the transform handler family is comprehensive and the spot-checked handlers conform. A full per-command audit (each move/rotate triggers the correct geometry reposition + plan/3D refresh + undo patch) is the tracked Phase-19 deliverable (task #27). No defect surfaced in the spot-check.

### §11.17 — Sub-element / detail commands — Phase 20 audit (2026-05-19)

**Coverage.** Curtain-wall sub-element commands: `curtainwall.addPanel` / `removePanel` / `replacePanel` / `swapPanel` / `rotatePanel`; grid-line add/remove (`AddCurtainGridLine` / `RemoveCurtainGridLine`); mullion/panel/transom type (§11.15). Wall openings: `wall.createOpening` (door/window — §11.10). Stair: `stair.createRailing` (`CreateStairRailing`), landings.

**Handler conformance — spot-checked.** `AddCurtainGridLine`, `AddPanel`, `CreateStairRailing` carry `canExecute` + `withHandlerSpan` + `produceCommand` — conforming to the §11.5 reference shape.

**Phase 20 verdict (partial — scope note)**: the sub-element command family is present and the spot-checked handlers conform. A full per-command audit (each sub-element op rebuilds the parent element's geometry + refreshes plan/3D + records an undo patch) is the tracked Phase-20 deliverable (task #28). No defect surfaced. Cross-ref: §11.6 (curtain wall), §11.10 (openings).

### §11.18 — Delete & lifecycle commands — Phase 21 audit (2026-05-19)

**Coverage — comprehensive.** A `*.delete` handler exists for **every** element type (wall, slab, column, beam, curtain-wall, roof, door, window, ceiling, handrail, lighting, plumbing, furniture, grid, room, structural, annotation, dimension, section, sheet, schedule). Lifecycle / structural ops: `wall.cut`, `wall.join`, `roof.joinRoofs`, `roof.removeSkylight`, `slab.removeHole`, `curtainwall.removePanel`, `sheet.removeViewport` / `removeWidget`.

**Handler conformance — spot-checked.** `DeleteWall`, `DeleteSlab`, `DeleteColumn` carry `canExecute` + `withHandlerSpan` + `produceCommand`; `DeleteWall` additionally performs element `unregister` — confirming delete handlers clean up the registration spine (the inverse of §10.2 Bridge Invariant 7's `registerElement`).

**Phase 21 verdict (partial — scope note)**: the delete/lifecycle command family is comprehensive, the spot-checked handlers conform, and delete cleans up registration. A full per-command audit (each delete removes the legacy-store entry + `bimManager.unregisterElement` + VDT entry + 3D mesh + plan-view refresh, and undo restores all of it) is the tracked Phase-21 deliverable (task #29). No defect surfaced.

### §11.19 — Furniture creation — Phase 22 audit (2026-05-19)

**Rotation fix confirmed.** `CreateFurniturePayload.rotation` is typed `number` and `canExecute` enforces `Number.isFinite(rotation)` (`CreateFurniture.ts:47`) — confirming §7.0 **FIX-FURNITURE-ROTATION** (the plan tool's Vec3 rotation corrected to scalar `0`).

**Deeper finding — payload/model mismatch (FURNITURE-MODEL-GAP).** The PRYZM3 `CreateFurniturePayload` is `{ id, origin, rotation, scale, size, representations }` — a **representation-based** furniture instance. But `FurniturePlanToolHandler._commit()` dispatches `furniture.create` with `{ furnitureType, position, width, length, height, material, kitchenConfig | wardrobeCabinetConfig, baseOffset }` — a **type-enum + fixture** model. `CreateFurnitureHandler` reads only `origin`/`rotation`/`scale`/`size`/`representations`, so the tool's `position` (→ `origin` falls back to default), `furnitureType`, `kitchenConfig`, `wardrobeCabinetConfig`, `material` and dimensions are **all silently dropped**. FIX-FURNITURE-ROTATION removed the `canExecute` *rejection*, but a furniture placed from the plan tool still lands at the default origin with no type/config. Same defect class as **PLUMBING-FIXTURE-MODEL-GAP** (§11.11) and the lighting mismatch (§11.11).

**Required — FURNITURE-MODEL-GAP (architectural decision)**: either (a) extend `CreateFurniturePayload` + the furniture schema to model `furnitureType` + fixture dimensions + kitchen/wardrobe configs, with the handler building `representations` from them; or (b) route the plan tool through the legacy fixture-furniture command with a CEB case + `§FT-FURNITURE` bridge to the legacy `furnitureStore` / `FurnitureFragmentBuilder`. Kitchen/wardrobe **runs** (multi-unit configs) especially cannot survive the current generic handler. Needs a contract/architecture decision — tracked, not a quick fix.

**Phase 22 verdict**: furniture creation no longer *rejects* (rotation fixed), but does not yet create *correctly* — FURNITURE-MODEL-GAP must be resolved for furniture (and kitchen/wardrobe runs) to place at the right position with the right type.

**Amendment (2026-05-19 — §7.0 FIX-FURNITURE-BRIDGE; FURNITURE-MODEL-GAP / FURNITURE-BUS-MIGRATION resolved for rendering)**: runtime logs confirmed the live symptom — `FurniturePlanToolHandler` logged `Furniture created …` but **no mesh, no plan symbol, no `BimManager` registration** followed; furniture was effectively never created. Option (b) above is now implemented. `CreateFurnitureHandler` is left unchanged (the PRYZM3 representation model — ADR-0027 — is not touched), but the **3D mesh + plan symbol now render** via a legacy-store bridge identical to §FT-HANDRAIL / §FT-LIGHTING: (1) `RuntimeEvents['furniture.created']` widened with the plan-tool geometry (`id`, `furnitureType`, `position`, `rotation`, `baseOffset`, dims, `material`, `furnitureCategory`, `kitchenConfig`, `wardrobeCabinetConfig`); (2) the CEB `furniture.create` case forwards that geometry; (3) a new `initTools §FT-FURNITURE` bridge translates it into legacy `FurnitureData` — lifting the scalar plan-tool yaw into the `EulerDTO` `.y` — and calls `furnitureStore.add()` → `bim-furniture-added` (furniture builder 3D mesh) + `storeEventBus` (plan symbol), then `viewDependencyTracker.registerElement` + `bimManager.registerElement`. `window.furnitureStore` is declared in `globals.d.ts`. Furniture, kitchen runs and wardrobe runs placed from the plan tool / carousel drag-drop now render. **Residual (non-blocking)**: the PRYZM3 Immer furniture store still receives the representation-model default (the handler ignores `furnitureType` / dims) — PRYZM3-Immer furniture consumers (not the renderer) see a degenerate record. Closing that is the ADR-0027 representation-model task, tracked separately; it no longer blocks furniture rendering.

### §11.20 — View-element creation — Phase 23 audit (2026-05-19)

**Coverage.** View-type elements have a comprehensive creation surface — distinct from geometry elements (they are `ViewDefinition` / sheet / schedule records, written to `ViewDefinitionStore` etc. and surfaced in the View Browser, not the 3D scene):
- **Plan view**: `CreatePlanViewCommand`, `DuplicateFloorPlanCommand` (`command-registry/levels`).
- **Section**: `section.create` (PRYZM3 plugin handler) + `setDepth` / `setMark` / `setScale` / `moveLine` / `delete`.
- **Elevation**: `elevation.create` → `CreateElevationMarkCommand` (`initBusHandlers` §P3.4-SE bridge).
- **Sheet**: `sheet.create` + `addViewport` / `addWidget` / `setTitleBlock` / `setViewportScale` / … (PRYZM3 plugin handlers).
- **Schedule**: `schedule.create` + `setFilter` / `setGroupBy` / `delete`.
- **View definitions / templates**: `view.createDefinition`, `CreateViewDefinitionCommand`, `CreateDetailViewCommand`, `CreateViewTemplateCommand`.

**Pipeline shape.** Section/sheet/schedule are PRYZM3 plugin handlers; plan-view/elevation/view-definition route via legacy `command-registry` commands bridged through `initBusHandlers`. Created views land in `ViewDefinitionStore` and appear in the View Browser. Runtime logs across this session confirm view definitions restore + re-project correctly (`vd-sys-plan-l0`).

**Phase 23 verdict (partial — scope note)**: the view-creation command surface is comprehensive and structurally wired. A full per-view-type audit (each created view registers in `ViewDefinitionStore`, appears in the View Browser, and projects geometry) is the tracked Phase-23 deliverable (task #31). No defect surfaced; views are non-geometry elements, outside the §10 geometry-bridge pattern.

---

## §12 — Split-View 3D Synchronization & Camera Framing

> **Added**: 2026-05-19 (Comprehensive Audit Rev 6). **Status**: CANONICAL.
> **Scope**: how an element created via a **plan tool while split view is active** reaches the 3D viewport, and how/when the 3D camera frames it. Companion: C04 (rendering), C06 §4 (plan-view 2D pipeline), §6.1 (geometry build), §10 (transitional bridge architecture).
> **Why this section exists**: §6.2 covers the plan-view (Canvas2D) update; §6.1 covers the 3D geometry build. Neither documented the **split-view** case — where the 2D plan pane and the 3D pane are on screen simultaneously — nor the camera-framing behaviour. This gap allowed two regressions (FIX-VIEWSWITCH-DROP, §7.0; and the absent camera framing) to go uncaught.

### §12.1 — Split-view architecture (AS-IS)

Split view renders the 2D plan pane (`SplitViewManager`, Canvas2D) and the 3D pane side by side.

- The 3D pane is **not a second renderer**. `SplitViewManager._render3dMirror()` blits (`drawImage`) the main WebGL/WebGPU canvas into the split pane. There is exactly one THREE scene, one renderer, and one shared camera (P2, C04 §1).
- Therefore: **anything committed to the main 3D scene is visible in the split-view 3D pane on the next frame** — no separate sync step is required for the *mesh*.
- The single shared camera means framing "the 3D camera" and framing the main viewport camera are the same operation.

### §12.2 — First-element camera framing (NORMATIVE)

When split view is active and the user creates geometry from a plan tool, the 3D pane must not stay parked on an empty or stale view.

- **MUST** frame the shared 3D camera **once per project session** — on the **first** geometry-element creation command (`wall|slab|curtainwall|curtain-wall|column|beam|ceiling|roof|floor|stair|handrail` + `.create` / `.batch.create`) that completes **while `splitViewManager.isActive` is true**.
- **MUST NOT** move the camera on any subsequent creation in the same session — the user's framing, pan, and zoom are theirs to keep once established.
- The framing call (`zoomToAll()`) **MUST** be deferred until after the element's geometry builder has committed its mesh into the THREE scene (§6.1). Framing synchronously inside the `command.executed` relay computes bounds over a scene that does not yet contain the new mesh. The reference implementation defers ~300 ms.
- The one-shot flag **MUST** be re-armed on `pryzm-project-loaded` so each opened project frames its own first element.
- Framing failures (`zoomToAll()` throws) **MUST** be caught and logged non-fatally — a camera-fit failure MUST NOT interrupt element creation.

**Reference implementation**: `apps/editor/src/engine/initTools.ts` — the `§13-CAM` block, a `runtime.events.on('command.executed', …)` subscriber. Annotated `§13-CAM`.

### §12.3 — 3D mesh synchronization from plan-pane creation

The 3D mesh for a plan-pane-created element is built by the **same bus→builder path** as a 3D-view creation (§10.1, §6.1): `commandBus.dispatch` → handler → CEB `xxx.created` → `initTools.ts` bridge → `LegacyStore.add()` → fragment builder → mesh.

- This path **MUST NOT** be gated on which view is active. The 3D mesh build runs whether the active view is 3D, plan, or split.
- A deferral mechanism (frame-scheduler queue, view-switch guard, batch pause) **MUST NOT drop** a store mutation — it may only postpone the flush. Dropping a mutation orphans the element (in-store, no mesh). See §7.0 **FIX-VIEWSWITCH-DROP**: `WallRebuildCoordinator` returned early *before* queuing the event during a view switch, permanently losing walls drawn in the plan pane around a view transition.

### §12.4 — Verification gate

With split view active and an empty 3D scene:

```
1. Draw the first wall in the plan pane.
   MUST: wall mesh appears in the 3D pane within ~2 frames of the flush.
   MUST: the 3D camera frames the new wall once (≤ ~350 ms after pointer-up).
   Console: [initTools] §13-CAM: framed 3D camera on first plan-pane element

2. Draw a second wall.
   MUST: wall mesh appears in the 3D pane.
   MUST NOT: the 3D camera move (§12.2 — first-element only).

3. Toggle a view switch (plan ⇄ 3D) mid-draw, then draw a wall.
   MUST: the wall still gets a 3D mesh (§7.0 FIX-VIEWSWITCH-DROP — no dropped mutation).
```

### §12.5 — Known gaps / future work

- The first-element framing is keyed on `command.executed` source-agnostically — it cannot yet distinguish a plan-pane creation from a 3D-pane creation. While split view is active this is benign (a single one-shot fit), but a precise implementation would carry the originating view on the command `meta`. Tracked for a future `HandlerContext` upgrade (see §10.2 Invariant 8 note).
- Per-element-type 3D-sync compliance for split view is covered by the §11 matrix (the bus→builder path is shared). No separate split-view matrix is required.

### §12.6 — Double-click-to-frame from the plan pane (NORMATIVE)

> **Added**: 2026-05-22 (DAILY-USE). **Status**: CANONICAL.
> **Scope**: explicit, user-initiated camera framing — distinct from §12.2's automatic *first-element* framing. Where §12.2 frames once per session without user action, §12.6 frames on demand, as many times as the user double-clicks.

The split-view plan pane is the architect's primary drafting surface, and selection there is already routed to every surface via `selectionBus` (Contracts 27/38, Cross-View Selection Parity). The 3D pane shares the single camera (§12.1), so an architect double-clicking an element in the plan pane to "see it in 3D" is the direct analogue of the main-viewport double-click-zoom (`apps/editor/src/engine/initUI.ts` — `container.addEventListener('dblclick', …)`).

- A **double-click on an element in the split-view PLAN pane MUST** (a) select that element on every surface (via `selectionBus.select(id, 'svp')`) and (b) frame the shared 3D camera on it.
- Framing **MUST** use `frameObject` (Camera-Framing util) with the canonical double-click-focus defaults — `minDist = 2.5 m`, `dimMult = 1.5` — so a door/window/stair fills the viewport with ~40 % padding. These defaults are the **double-click contract**; callers needing a wider frame pass explicit values.
- The handler **MUST** resolve the element's 3D `Object3D` from the authoritative selection (`SelectionManager.selectedObject`, set synchronously by `selectById`), NOT re-raycast — the plan-pane hit-test (`PlanViewCanvas.hitTest`) already identified the element id.
- The handler **MUST** be a no-op in the SVP `'3d'` mirror mode: there, pointer events are forwarded to the main canvas (`_forward3dClickToMain`), where initUI's own dblclick-zoom runs — re-handling here would double-frame.
- A framing failure (`frameObject` throws / no controls / unresolved object) **MUST** be logged non-fatally and **MUST NOT** interrupt selection — selection and framing are independent guarantees.
- Unlike §12.2 (one-shot, re-armed per project), §12.6 framing is **not** rate-limited or one-shot — it is an explicit user gesture and fires every time.

**Reference implementation**: `apps/editor/src/engine/views/SplitViewManager.ts` — `_onDblClick`, bound as a `dblclick` listener on the SVP canvas (registered in `_setupDOM`, removed in `_teardownDOM`). Annotated `§SVP-DBLCLICK-FRAME`. Console signal: `[SplitViewManager] §SVP-DBLCLICK-FRAME framing <id> in 3D view`.

**Verification gate** (split view active, plan pane focused):

```
1. Double-click a wall/door/stair in the plan pane.
   MUST: the element is selected (3D highlight + Properties Panel).
   MUST: the 3D camera animates to frame that element (~fills viewport).
   Console: [SplitViewManager] §SVP-DBLCLICK-FRAME framing <id> in 3D view

2. Double-click empty plan-pane space.
   MUST NOT: the camera move (hit-test returns no element → early return).

3. Switch the SVP to 3D-mirror mode, double-click an element.
   MUST: framing is handled by the main-canvas dblclick-zoom (§12.6 no-ops),
         NOT double-framed.
```
