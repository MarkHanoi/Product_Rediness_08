# C03 — Schemas, Commands & State

> **Stamp**: 2026-05-16 · **Status**: CANONICAL  
> **Scope**: `packages/schemas/` (L0), `packages/command-bus/` (L1), `packages/stores/` (L3), the CQRS command flow, and the undo/redo stack.  
> **Key principles**: P5 (schemas pure), P6 (commands are the only mutation path).

---

## §1 — Schemas Layer (L0)

### §1.1 — Ownership

`packages/schemas/` is the **only** place where canonical Zod schemas for PRYZM entities are defined. No other package MAY define a competing schema for the same entity.

### §1.2 — Purity invariants (P5)

`packages/schemas/` MUST have:
- Zero imports of `three`, `@thatopen/*`, or any renderer package.
- Zero DOM API usage (`document`, `window`, `navigator`).
- Zero I/O (`fs`, `fetch`, `pg`, `supabase-js`).
- Only `zod` and standard ECMAScript library imports.

**CI gate**: `scripts/ci-check-domain-purity.ts` (hard-fail).

### §1.3 — Schema evolution

- Schemas are versioned with a `v` prefix field (e.g. `{ _v: 2 }`).
- Breaking schema changes MUST be paired with a migration function in `packages/file-format/`.
- Schema additions (new optional fields) are non-breaking and require no migration.
- Every schema MUST export both a Zod schema and the inferred TypeScript type.

---

## §2 — Command Bus (L1)

### §2.1 — The CQRS contract

**All state mutations in PRYZM flow through commands.** There is exactly one path:

```
UI action
  → commandBus.dispatch(command)
    → handler(command, stores)
      → stores.mutate(immer-draft)
        → subscribers notified
```

No UI component MAY call `stores.X = ...` directly. **CI gate**: `scripts/ci-check-no-direct-store-writes.ts` (hard-fail).

### §2.2 — Command interface

```ts
interface Command<T extends string = string, P = unknown> {
  readonly type: T;
  readonly payload: P;
  readonly id: string;          // nanoid — used for dedup + log correlation
  readonly source: 'user' | 'remote' | 'ai' | 'undo';
  readonly timestamp: number;   // ms since epoch
}
```

All fields are immutable after creation. Commands MUST be serialisable (no class instances, no functions in payload).

### §2.3 — Handler contract

- A handler MUST be a pure function: `(command: Command, stores: Stores) => void | Promise<void>`.
- A handler MUST NOT dispatch other commands (no cascading dispatch). Side-effects (HTTP calls, sync writes) MUST be scheduled as microtasks on a dedicated effect queue.
- A handler MUST complete within 16 ms for synchronous mutations (frame budget, NFT 4).
- Async handlers MAY exceed 16 ms; they MUST update a loading store slot to signal pending state.

### §2.4 — Remote commands

Commands arriving via the sync layer (`source: 'remote'`) MUST be replayed through the same handler pipeline. There MUST NOT be a separate remote-command handler path.

---

## §3 — Stores (L3)

### §3.1 — Technology

Stores are Zustand slices composed in `packages/stores/`. They use Immer for draft-based mutations.

### §3.2 — Ownership rules

- Every piece of mutable application state MUST live in a store slice.
- A store slice MUST be owned by exactly one package; two packages MUST NOT write to the same slice.
- React components MAY read from stores via hooks. They MUST NOT write directly (P6).
- Server code MUST NOT import stores (stores are browser-only).

### §3.3 — Store slices (top-level)

| Slice | Owner package | What it holds |
|---|---|---|
| `ElementStore` | `packages/stores/` | All BIM element trees (walls, doors, slabs, etc.) |
| `ProjectStore` | `packages/stores/` | Project metadata, open/closed state |
| `ViewStore` | `packages/view-state/` | Active views, view parameters |
| `SelectionStore` | `plugins/selection/` | Current element selection |
| `VisibilityStore` | `packages/visibility/` | Per-intent override overrides |
| `AIStore` | `packages/ai-host/` | AI workflow state, cost totals |
| `SyncStore` | `packages/sync-client/` | Collaboration presence, conflict queue |
| `UndoStore` | `packages/runtime-undo-stack/` | Undo/redo ring buffer |

### §3.4 — Subscriptions

Store subscribers (React hooks or `useEffect` watchers) MUST:
- Subscribe to the minimum slice needed.
- Unsubscribe when their component or service is torn down.
- Not perform synchronous DOM layout writes inside a subscriber (schedule via `requestAnimationFrame` through the frame scheduler).

---

## §4 — Undo / Redo (L1)

> **Unification revision 2026-05-24 (OI-054)** — undo/redo now have a SINGLE entry point,
> `apps/editor/src/engine/undo/performUndoRedo.ts` (§4.5), called by every trigger. The live bug
> (undo button no-op'd plan-view elements) was a **trigger divergence**, not a broken applicator:
> the button consulted only `commandManager` while plan elements live only in the ring buffer
> (§4.7 root cause). §4.4's three-store reality still holds and the adapter bridges it; the
> store-unification end-state is ADR-051 (U-7). Read §4.5 + §4.6 before touching any undo code.

### §4.1 — Scope

Undo/redo operates at the **command** level: an undo reverses the last committed command's
mutations; a redo re-applies them. There are two coexisting undo backends during the PRYZM3
migration (§4.3). The PRYZM3 backend (`packages/runtime-undo-stack/`) is **patch-based**:
each command commit records a forward/inverse JSON-Patch pair plus the `affectedStores` that
the patches target.

### §4.2 — The data-flow of one command (NORMATIVE — the precise mechanism)

A user gesture in plan view (e.g. drawing a wall) flows through the bus exactly as follows.
Understanding this is mandatory before touching undo, because the **store a patch is produced
against is not the store that renders the mesh** (§4.4).

```
WallPlanToolHandler._commitWall()
  └─ runtime.commandBus.dispatch('wall.create', payload)         (composeRuntime.ts:~1116)
        └─ CommandBus.executeCommand(type, payload)              (CommandBus.ts:251)
              1. ctx = buildContext(handler)                     ← ctx.stores = storesProvider(affectedStores)
              2. result = await handler.execute(ctx, payload)    ← writes the L1 store via
                                                                   produceWithPatchesPerStore →
                                                                   returns { forward, inverse } Immer patches
              3. patches routed per store by path[0] === storeKey (CommandBus.ts:318-332)
              4. emitter.emit(record)                            → PatchEmitter → CommandEventBridge
                                                                   → fires the `wall.created` EVENT
              5. undoStack.push(record)                          (legacy EventRecord stack)
              6. ringBuffer.push({ forward, inverse, affectedStores })  (RingBufferUndoStack)
  └─ (parallel) §P2.1 bridge listens for `wall.created`          (initTools.ts:~868)
        └─ window.wallStore.add(...)                             ← LEGACY store → WallFragmentBuilder builds the MESH
```

**Key consequence:** the `wall.create` handler writes the **L1 store** (`storesProvider`'s
`'wall'`, an Immer `Store<WallData>` with `applyPatch`); the **mesh** is built by the **separate
legacy `window.wallStore`** (`packages/geometry-wall`, `Map`-based, **no `applyPatch`**), populated
by the `§P2.1` event bridge. The ring-buffer inverse patch therefore targets the *L1* store shape,
not the legacy/mesh store. This split is the root of every undo bug below.

### §4.3 — The two undo backends (transitional, L7.5)

**Path A — Legacy `CommandManager`** (`packages/command-registry/src/CommandManagerImpl.ts`)
- Used by plan-tool/property/gizmo sites that call `commandManager.execute(new UpdateXxxCommand(...))`.
- Snapshot-based: each command object stores pre/post state and its `undo()` writes back **into
  the legacy store directly** (which drives the mesh) — so Path A undo *does* revert the mesh.
- No `affectedStores`/patch metadata.

**Path B — `CommandBus` + `RingBufferUndoStack`** (`packages/command-bus/`, `packages/runtime-undo-stack/`)
- Used by every `runtime.commandBus.dispatch()` (the wall/room/slab/curtain-wall/level/… Immer
  handlers). This is the PRYZM3 target path.
- Patch-based: `RingBufferUndoStack` holds `PatchPair { forward, inverse, affectedStores }`
  (default cap 200, ring-discard oldest, never throws — `RingBufferUndoStack.ts`).
- **`affectedStores` routes inverse patches to stores at undo time.** This is where it breaks
  today (§4.7): the patches are L1-shaped but the UI undo handlers point them at legacy stores.

> A given user action records to **whichever backend its dispatch used**. A plan-view
> `wall.create` records to **Path B only** (the ring buffer) — `commandManager.history` is empty
> for it. Therefore a Path-A fallback **cannot** reverse a Path-B-only action.

### §4.4 — The three store layers (why undo is fragile — CRITICAL)

| Layer | Example | Has `applyPatch`? | Drives the 3D mesh? | Role |
|---|---|---|---|---|
| **L1 bus store** | `storesProvider('wall')` → `Store<WallData>` (`packages/stores`) | **Yes** | **No** | What the handler writes; what ring-buffer patches target; what `bus.fetchStores()` returns. |
| **Legacy store** | `window.wallStore` → `WallStore` (`packages/geometry-wall`) | **No** | **Yes** (via `WallFragmentBuilder`) | Populated by the `§P2.1` event bridge; the source of truth for rendering + snapshot serialization. |
| **Command-object snapshot** | `CreateWallCommand` in `commandManager.history` | n/a | reverts legacy store | Path-A undo only; empty for Path-B-only dispatches. |

A robust undo requires these to collapse to **one** store that has `applyPatch` AND drives the
mesh (the TASK-08 store-unification end-state, §4.7). Until then, patch-based undo can revert L1
data but not the mesh.

### §4.5 — The single unified apply path (`performUndoRedo`) — SHIPPED 2026-05-24 (OI-054)

There is exactly **one** undo entry point and one redo entry point:
`apps/editor/src/engine/undo/performUndoRedo.ts` → `performUndo()` / `performRedo()`. **Every**
trigger calls them and nothing else: the `SaveUndoRedoHUD` Save/Undo/Redo buttons, the `initUI`
Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keydown handlers, `BimService.undo()/redo()` (← `ContextualEditBar`
toolbar + its own Ctrl+Z). This is the realisation of **U-5**.

The algorithm (`performUndo`; redo is the mirror):

```
1. RING-BUFFER FIRST. rb = runtime.bus.ringBuffer.
   if rb.canUndo() and the top entry's affectedStores are ALL "covered"
   (have a working applyPatch adapter in buildUndoStoreMap()):
     ids        = element ids touched by the entry (path[0] of each op)
     inverse    = rb.undoPatch()                 // atomic: cursor-- + return inverse PatchSide
     outcome    = applyRingBufferSide(inverse, affectedStores, buildUndoStoreMap())
                  // each adapter applies the inverse via the live legacy window.<x>Store's
                  // add/remove/update — WHICH DRIVE THE MESH + plan projection (§4.4)
     if outcome.applied > 0:
        commandManager.dropEntriesForTargets(ids)  // SHADOW-DROP — see U-8
        return
2. COVERAGE PRE-CHECK. If the top entry's stores are NOT all covered (e.g. a hosted
   door/window or a `level`), the cursor is NOT stepped (no desync) → fall through.
3. COMMANDMANAGER FALLBACK. commandManager.undo() — the legacy snapshot path for
   level / hosted-opening / auto room-tag-annotation commands.
```

`buildUndoStoreMap()` is the **single** source of the store map (initUI and BimService no longer
build their own). It wraps every live legacy element store with `elementUndoStoreAdapter`
(`adaptElementStoreMap`) so the inverse/forward patch drives the mesh; on a whole-element
remove/add the adapter ALSO unregisters/re-registers the element in `bimManager`
(`level.childrenIds`) + `elementRegistry` (semantic id→type), replacing the cleanup that the
shadow-dropped legacy command used to do.

> **Why not `runtime.undoStack`?** `composeRuntime.buildPhaseDUndoStackSlot()` feeds
> `applyRingBufferSide` the result of `bus.fetchStores` = `storesProvider` =
> `storesAsRecordView(stores)` = `Object.fromEntries(store.getState())` — plain **snapshot
> Records with no `applyPatch`**, and even if they had one they are the **L1** store, not the
> mesh-driving legacy store (§4.4). `runtime.undoStack` is therefore non-functional for patch
> apply and is **not** an undo trigger. `performUndoRedo` is the path; `runtime.undoStack` is
> retired-in-place (the ADR-051 end-state folds the L1/legacy split away — U-7).

### §4.6 — Binding invariants (robust undo)

- **U-1** Every `source: 'user'` dispatch MUST push a `PatchPair` to the ring buffer unless
  `{ undoable: false }`. `source: 'remote' | 'ai'` (i.e. `suppressUndo`) MUST NOT push (CRDT
  resolves remote — C08). `'PROJECT_LOAD'` MUST NOT push.
- **U-2** A command MUST declare in `affectedStores` **every** store it mutates. A patch whose
  `path[0]` is an undeclared store key is dropped from undo routing → an incomplete inverse
  (the §U-B6 guard in `CommandBus.ts:296` surfaces this loudly at dev time).
- **U-3** Empty-patch records (`forward.length === 0 && inverse.length === 0`) MUST NOT push to
  the ring buffer (they would poison the cursor) — `CommandBus.ts:354`.
- **U-4** Undo/redo apply MUST NOT throw (`RingBufferUndoStack` + `applyRingBufferSide` honour
  this) — **and a swallowed failure MUST be reported to the caller, never logged as success**
  (`applyRingBufferSide` returns `ApplyRingBufferOutcome {applied, failed}`; `performUndo` only
  shadow-drops + returns when `applied.length > 0`, else falls back).
- **U-5** There is exactly **one** undo path and one redo path:
  `performUndoRedo.performUndo()` / `performRedo()`. Every trigger MUST call them; no trigger may
  re-implement `undoPatch()` + `applyRingBufferSide()` or call `commandManager.undo()` directly.
- **U-6** The ring buffer + the legacy undo stack MUST be cleared on project switch/load
  (`bus.clearUndoStacks()` + `commandManager.clearHistory()` per C13) so cross-project Ctrl+Z is
  a no-op.
- **U-7 (target)** The store a patch targets MUST be the store that renders the element, so an
  inverse patch reverts both data and mesh in one apply (ADR-051 / TASK-08). Until then, the
  adapter bridges L1-shaped patches onto the mesh-driving legacy store.
- **U-8 (dual-dispatch shadow-drop)** The 8 legacy 3D tools that DUAL-DISPATCH (WallTool, Slab,
  Roof, Furniture, Plumbing, Stair, Handrail, Beam — `bus.executeCommand` AND
  `commandManager.execute(CreateXCommand)`) put one element in BOTH stacks. After a successful
  ring-buffer undo, `performUndo` MUST drop the twin commandManager entry
  (`commandManager.dropEntriesForTargets(ids)`) so the user gets exactly ONE undo per action — no
  phantom no-op keypress. Dropping is by **subset** match on `targetIds` so unrelated multi-target
  commands are preserved.

### §4.7 — Status (OI-054) — RESOLVED, with scoped follow-ups

**Root cause (live trace 2026-05-24, two screenshots).** Undo of a plan-view-created wall was a
no-op because the undo **triggers diverged on which stack they consulted**, NOT because the
ring-buffer apply was broken:

- The undo **BUTTON** (`SaveUndoRedoHUD`) had `runtime === null`, so it called
  `commandManager.undo()` **only** — it never touched the ring buffer. Plan-view creation is
  **bus-only** (every `PlanToolHandler` dispatches `runtime.bus.executeCommand`), so a plan wall
  lives ONLY in the ring buffer → `commandManager.undo()` reported `UNDO: history empty`.
- 3D creation goes through dual-dispatching tools (WallTool also runs
  `commandManager.execute(CreateWallCommand)`), so a 3D wall WAS in `commandManager.history` →
  the same button undid 3D walls fine. That asymmetry was the tell.
- The keyboard handler already did ring-buffer-first and would have worked, but the user was
  clicking the button.

The earlier B1/B2/B3 analysis (wrong store map / mesh not reverted / silent-success) was real but
secondary; all three are now closed by the unification:

- **B1 (store map) — CLOSED.** All triggers route through `performUndoRedo`, which uses the single
  `buildUndoStoreMap()` (adapter-wrapped, mesh-driving). The four hand-rolled maps are deleted.
- **B2 (mesh not reverted) — CLOSED for adapted types.** The adapter applies the inverse via the
  legacy `window.<x>Store` mutators, which build/teardown the mesh + plan projection. Confirmed
  paths for wall, slab, room, curtain-wall, furniture, column, beam, stair, handrail, roof, floor,
  ceiling, plumbing, lighting, grid, annotation.
- **B3 (silent-success) — CLOSED.** `applyRingBufferSide` returns `{applied, failed}`; `performUndo`
  shadow-drops + returns only on `applied > 0`, otherwise falls back to `commandManager.undo()`.
- **B4 (REDO-SHAPE) — CLOSED 2026-05-24.** Redo re-adds the element to the legacy store. The ring
  buffer's forward patch carries the **L1 (Immer) shape**, but complex elements are built in the
  legacy store by a §P*.x bridge that **renames** L1 fields to legacy fields (curtain wall:
  `bayWidth→gridXSpacing`, `bayHeight→gridYSpacing`, `mullionThickness→mullionSize` — `initTools.ts`
  §P3.1-CW). Re-adding the raw L1 value skipped the rename → `migrateToGridSystem` read `undefined`
  → **0 panels** → "redo did nothing" (walls were unaffected — their L1/legacy shapes align). **Fix:**
  `elementUndoStoreAdapter` now **snapshots the exact legacy object on undo-remove and restores IT
  on redo-add** (`_undoRestoreSnapshots`), so redo regenerates downstream geometry (panels) faithfully
  for **every** element type. Unit-gated (`elementUndoStoreAdapter.test.ts` — "redo restores the
  LEGACY object…").

**Scoped follow-ups (do NOT regress §4.5/§4.6):**
1. **Hosted door/window** (`door`/`window` are intentionally absent from `buildUndoStoreMap` →
   they route to `commandManager.undo()`). True patch-based undo must remove the host wall's
   opening too — the two-part hosted undo (C15) is the next adapter slice.
2. **Cross-stack ordering.** The two stacks have independent cursors; `performRedo` mirrors the
   last undo's stack (`_lastSource`) which covers "undo N then redo N (same stack)" but a
   *mixed* undo sequence can mis-route. Single-timeline ordering is the ADR-051 end-state.
3. **L1 / Immer store divergence.** Adapter undo reverts the legacy (mesh + serialization) store
   but not the L1 Immer store. Harmless today (serialization reads the legacy store — same as the
   pre-existing 3D `CreateWallCommand.undo` behaviour), removed by U-7 store unification.

**Resolution — ADR-051** (`reference/adrs/ADR-051-undo-single-source-of-truth.md`): adopt the
pascalorg-aligned model — one source-of-truth store, the mesh + plan **derived** from it via a
dirty-diff subscription, and patch-inverse undo through the single `performUndoRedo` apply path
(Path A retired, dual-dispatch removed). Migration is **incremental per element type, live-gated**
— undo is an interactive behaviour and MUST be verified in the running app per type.

### §4.8 — Per-element undo coverage (OI-054 all-elements audit, 2026-05-24)

The unified path (§4.5) is element-agnostic. Whether a given element's undo works reduces to ONE
rule: **its bus create handler's `affectedStores` key MUST resolve to an `applyPatch` adapter in
`buildUndoStoreMap()`** (a covered key → ring-buffer undo drives the mesh; an uncovered key → the
coverage pre-check skips the ring buffer and the legacy `commandManager.undo()` fallback runs). A
regression test (`apps/editor/__tests__/performUndoRedo.test.ts` → "coverage of every
create-handler affectedStores key") enforces the table below so a future key drift fails CI.

| Element | bus create cmd | handler `affectedStores` | window store | undo route |
|---|---|---|---|---|
| wall | `wall.create` | `['wall']` | `wallStore` | ring-buffer adapter |
| slab | `slab.create` | `['slab']` | `slabStore` | ring-buffer adapter |
| room | `room.create` | `['room']` | `roomStore` | ring-buffer adapter |
| **curtain-wall** | `curtainwall.create` | `['curtainwall']` | `curtainWallStore` | ring-buffer adapter — **key `curtainwall` (one word) was MISSING from the map → fixed 2026-05-24** (was the same "history empty" bug as walls) |
| column | `column.create` | `['column']` | `columnStore` | ring-buffer adapter |
| beam | `beam.create` | `['beam']` | `beamStore` | ring-buffer adapter |
| furniture | `furniture.create` | `['furniture']` | `furnitureStore` | ring-buffer adapter |
| ceiling | `ceiling.create` | `['ceiling']` | `ceilingStore` | ring-buffer adapter |
| floor | `floor.create` | `['floor']` | `floorStore` | ring-buffer adapter |
| roof | `roof.create` | `['roof']` | `roofStore` | ring-buffer adapter |
| stair | `stair.create` | `['stair']` | `stairStore` | ring-buffer adapter |
| handrail | `handrail.create` | `['handrail']` | `handrailStore` | ring-buffer adapter |
| lighting | `lighting.create` | `['lighting']` | `lightingStore` | ring-buffer adapter |
| annotation/dimension | `annotation.create` | `['annotation']` | `annotationStore` | ring-buffer adapter (plan dimensions dispatch `annotation.create`) |
| door / window (in plan) | `wall.opening.create` | `['wall']` | `wallStore` | ring-buffer adapter via the **host wall** (the opening is a field of the wall) |
| grid | `grid.add` | `[]` (cm bridge: `_cmExec(new AddGridCommand)`) | — | `commandManager.undo()` fallback (the entry is empty by design) |
| plumbing | `plumbing.createFixture` | `[]` (cm bridge: `cm.execute(CreatePlumbingFixtureCommand)`) | — | `commandManager.undo()` fallback |
| view / sheet / schedule / vg | `view.*`, `sheet.*` … | `[]` (cm bridges) | — | `commandManager.undo()` fallback |

**Not yet patch-undoable (route to `commandManager` / open follow-ups):** standalone `door`/`window`
property edits (hosted two-part undo — §4.7 follow-up 1); `section.create` (`['section']`) and
`structural.create` (`['structural']`) have no `window.<x>Store`, so they rely on the legacy
fallback; `level` is Path-A by design. These do not regress the covered set above.

---

## §6 — `level.add` Command Bus Type Contract

> **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R7. See also C02 §3.4.

### §6.1 — Type definition

`packages/command-bus/src/commands.ts`, type `MiscMutationCommands`:

```ts
'level.add': {
    levelId:     string;           // required — must be a UUID; used as AddLevelCommand.payload.levelId
    name?:       string;           // default: "Level N"
    elevation?:  number;           // metres; default: 0
    height?:     number;           // storey height in metres; default: 3.0
    _skipBridge?: boolean;         // see C02 §3.4 — prevents double commandManager.execute()
};
```

### §6.2 — Completeness invariant

Every field required by `AddLevelCommand`'s `AddLevelPayload` interface (`packages/command-registry/src/levels/AddLevelCommand.ts`) MUST be present in this type. A field absent from the type is typed as `never` in TypeScript — `cmd.fieldName` evaluates to `undefined` at runtime, producing a broken level entity (e.g. `id: undefined`).

**Violation consequence**: `AddLevelCommand.execute()` stores `{ id: undefined, ... }` in bimManager and wallStore. The level appears in `getLevels()` with `id: undefined`, breaks level-sorting and stair prerequisite checks, and cannot be referenced by any element.

### §6.3 — Handler implementations

Two separate bus handler implementations handle `level.add`:

| File | Registration path | _skipBridge support |
|---|---|---|
| `apps/editor/src/engine/initBusHandlers.ts` | Direct `__bridges` array in `initBusHandlers()` | Yes (`if ((cmd as any)._skipBridge) return`) |
| `plugins/stair/src/handlers/AddLevel.ts` (`AddLevelHandler`) | `PluginRegistry` via `plugins/stair/src/handlers/index.ts` | Yes (`if (cmd._skipBridge) return { ... }`) |

Both handlers call `getCommandManagerBridge()` → `commandManager.execute(new AddLevelCommand(...))`. If `getCommandManagerBridge()` returns null at call time, the level is **silently not created** — this is why direct `commandManager.execute()` as the primary write (C02 §3.4 dual-write) is mandatory for synchronous call sites.

---

## §5 — Protocol Wire Types (L1½)

`packages/protocol/` defines the wire protocol types used between client and sync server. These types MUST:
- Import only from `packages/schemas/`.
- Be serialisable to MessagePack binary frames.
- Be versioned (breaking changes require a new protocol version field).

`packages/drawing-primitives/` defines 2D geometry primitives used by the drawing engine. These MUST:
- Import only from `packages/schemas/`.
- Be pure value objects (no methods, no DOM, no THREE).
