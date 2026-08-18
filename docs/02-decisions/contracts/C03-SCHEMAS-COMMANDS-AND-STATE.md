# C03 — Schemas, Commands & State

> **Stamp**: 2026-05-16 · **Revised**: 2026-08-11 (§2.3.1 authoritative-state pointer; §4.6 **U-2b**; §1.2/§2.1 gate paths corrected) · **Status**: CANONICAL  
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

**CI gate**: `tools/ga-gate/check-domain-purity.ts` (hard-fail at the invariant — 0 impurities / 165 files).

> ⚠ **Path corrected 2026-08-11.** This read `scripts/ci-check-domain-purity.ts`, which **does not
> exist and never did** — the L-812 class. The gate is real; only the citation was wrong. Verified
> with `ls tools/ga-gate/check-domain-purity.ts`.

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

No UI component MAY call `stores.X = ...` directly. **CI gate**: `tools/ga-gate/check-no-direct-store-writes.ts`.

> ⚠ **Corrected 2026-08-11 — twice over.** The cited path `scripts/ci-check-no-direct-store-writes.ts`
> **does not exist** (L-812), and *"hard-fail"* was **false**: per CLAUDE.md P6 the real gate
> *"passes at a baseline of 37 tolerated direct writes, not at 0"*. It is a shrink-only ratchet.
> **Exit condition: the baseline reaches 0, then the gate flips to hard-0.** Read the gate for the
> current reading; do not trust a number transcribed here.
>
> **§2.1 states where a mutation must ENTER (the bus). It says nothing about where the mutation must
> ARRIVE** — that is C16 §5.1 / §2.3.1 above. Both defects ship as "P6-compliant".

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

> **§2.3.1 — A handler that reports success MUST have changed AUTHORITATIVE state** (added
> 2026-08-11). This section defines the handler's *shape*; it never said what a successful return
> means, and for years the answer was assumed. It is now stated and owned by **C16 §5.1
> (`CA-DOCTRINE-A`, `CA-17`…`CA-21`)**: the write must reach a reader that renders, persists or
> exports (§4.4's legacy/geometry layer — **not** the L1 store this section's `stores` argument
> hands you), and a handler that cannot reach one MUST refuse with a named reason rather than return
> success. §4.9 already states exactly this for the annotation family; C16 §5.1 generalises it.
> Authoring obligations live in C16 — do not restate them here.

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
> store-unification end-state is ADR-0251 (U-7). Read §4.5 + §4.6 before touching any undo code.

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
- ⚠ **CORRECTED 2026-08-18. This bullet read *"No `affectedStores`/patch metadata."* — the
  `affectedStores` HALF IS FALSE, and has been since the F4.6 audit.**
  `packages/command-registry/src/types.ts:605` declares `affectedStores: ReadonlyArray<string>`
  **non-optionally** on the legacy `Command` interface, and `CommandManagerImpl.createSnapshot()`
  (`:578-638`) scopes its snapshot BY it. Path A does not merely carry `affectedStores` — its
  rollback is *governed* by it.
  **The `patch metadata` half STANDS**: Path A has no forward/inverse pair; its undo is
  snapshot-based, exactly as the bullet above says.

  **Why the correction matters rather than being pedantry — [L-947](../../04-reference/ISSUE-LOG.md)
  IS AN INSTANCE OF THE HALF THIS BULLET DENIED.** `UpdateElementParameterCommand` hard-coded
  `affectedStores = ["wall"]` while its own `resolveStore()` routed to fifteen stores, so undo
  snapshotted one store and the edit wrote another — and it silently corrupted a user's slab. A
  reader who believed this bullet would conclude Path A had no such declaration to get wrong.

  **Two precisions that bear directly on §4.6 U-2b:**
  - The interface carries **no `readonly` modifier** — implementations add their own, so
    nothing structurally prevents mutation after construction.
  - It is typed `ReadonlyArray<string>`, **NOT `ReadonlyArray<StoreKey>`**. A typo'd `'walls'`
    type-checks cleanly and snapshots nothing. Combined with `createSnapshot`'s membership test
    (`:583-587` — no `else`, no warning, no throw), **a misdeclared store fails silent, not
    loud.** *See L-953.*

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
> retired-in-place (the ADR-0251 end-state folds the L1/legacy split away — U-7).

### §4.6 — Binding invariants (robust undo)

- **U-1** Every `source: 'user'` dispatch MUST push a `PatchPair` to the ring buffer unless
  `{ undoable: false }`. `source: 'remote' | 'ai'` (i.e. `suppressUndo`) MUST NOT push (CRDT
  resolves remote — C08). `'PROJECT_LOAD'` MUST NOT push.
- **U-2** A command MUST declare in `affectedStores` **every** store it mutates. A patch whose
  `path[0]` is an undeclared store key is dropped from undo routing → an incomplete inverse
  (the §U-B6 guard in `CommandBus.ts:296` surfaces this loudly at dev time).
- **U-2b (store IDENTITY, not just store NAME — added 2026-08-11).** A declared `affectedStores`
  key MUST resolve, in `buildUndoStoreMap()`, to **the same store the handler wrote**. U-2 is a
  *completeness* rule and is **satisfied by the corrupting case**: the plugin `wall.move` /
  `wall.transform` / `door.move` / `window.move` / `slab.move` handlers declare `['wall']` and do
  write `ctx.stores.wall`. But the key is **overloaded across time** — at write time `'wall'` is the
  L1 Immer store (§4.4 row 1); at undo time `buildUndoStoreMap()`
  (`apps/editor/src/engine/undo/performUndoRedo.ts:271`) resolves `'wall'` to `window.wallStore`,
  the GEOMETRY store (§4.4 row 2). The entry therefore passes the §4.5 step-2 coverage pre-check,
  the ring-buffer path runs, and **an inverse patch is applied to a store that never received the
  forward.** That is not a failed undo; it is a mutation of authoritative state derived from a
  different store's history.
  A command whose write target and whose `buildUndoStoreMap` target differ MUST take one of two
  exits, never a third: **(a)** route the write to the mapped store (C16 **CA-17**), or **(b)**
  declare `affectedStores: [] as const` so the coverage pre-check declines the entry and undo falls
  to the legacy stack — the bridge signature C68 §5.a accepts as LIVE. The undo obligation belongs
  to whichever store actually holds the element; a key is a claim about identity, not a label.
  *Not gated today* — `performUndoRedo.test.ts`'s coverage test proves a key **resolves**, not that
  it resolves to the store that was written. Exit condition **G-CA-A3**, C16 §11.1.
- **U-3** Empty-patch records (`forward.length === 0 && inverse.length === 0`) MUST NOT push to
  the ring buffer (they would poison the cursor) — `CommandBus.ts:354`. **This refuses to PUSH such
  a pair; it does not refuse to REPORT it as done.** A handler returning an empty pair as the whole
  outcome of a mutation the user asked for MUST refuse with a named reason — C16 **CA-18**.
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
  inverse patch reverts both data and mesh in one apply (ADR-0251 / TASK-08). Until then, the
  adapter bridges L1-shaped patches onto the mesh-driving legacy store.
- **U-8 (dual-dispatch shadow-drop)** The 8 legacy 3D tools that DUAL-DISPATCH (WallTool, Slab,
  Roof, Furniture, Plumbing, Stair, Handrail, Beam — `bus.executeCommand` AND
  `commandManager.execute(CreateXCommand)`) put one element in BOTH stacks. After a successful
  ring-buffer undo, `performUndo` MUST drop the twin commandManager entry
  (`commandManager.dropEntriesForTargets(ids)`) so the user gets exactly ONE undo per action — no
  phantom no-op keypress. Dropping is by **subset** match on `targetIds` so unrelated multi-target
  commands are preserved.
- **U-9 (target identity)** A command's `targetIds` MUST name **every element it creates**, not
  only its host or parent. U-8 is an element-IDENTITY predicate, so a create that names only its
  host is indistinguishable from that host's own dual-dispatch twin: undoing the host silently
  deletes the child's entry from BOTH `history` and `redoStack`, and the child's creation becomes
  invisible to undo AND redo. This was the live "Ctrl+Z jumps over the door/window I just placed"
  bug (`CreateWallOpeningCommand` declared `targetIds = [wallId]`), and it is a property a whole
  FAMILY of commands can have — audited host-only creators also included
  `CreateWallOpeningsBatchCommand`, `CreateStairRailingCommand` (host = stair),
  `DetectRoomFromWallsCommand` (host = walls) and `CreatePlanViewCommand` (host = level).
  **Enforced at a chokepoint, not per command:** `CommandManagerImpl.execute()` unions
  `CommandResult.affectedElementIds` into `command.targetIds` after every successful execute
  (`_unionTargetIds`, §UNDO-TARGET-IDENTITY), so the invariant holds for the whole registry and
  cannot be forgotten by a future command author. Widening `targetIds` only ever makes the
  shadow-drop stricter, so it can never delete an entry it did not delete before. Gated by
  `packages/command-registry/__tests__/createCommandTargetIdentity.test.ts`, which walks every
  create command and fails if an executed command's `targetIds` omits an id it created.
- **U-10 (cross-stack order)** While two undo stacks exist, both MUST carry a commit timestamp
  (`PatchPair.timestamp` stamped by `CommandBus` at push; `Command.timestamp` at construction) and
  `performUndo`/`performRedo` MUST order across them chronologically — undo reverts the NEWEST
  pending entry, redo replays the OLDEST. A commandManager-ONLY tool path (3D door, window,
  lighting, column, floor, ceiling, curtain-wall, lift, slab-opening, level) otherwise gets jumped
  over by an older ring-buffer entry beneath it.
  > ⚠ **AMENDED 2026-08-12 (§UNDO-GESTURE-ID landed).** This rule's last sentence used to infer a
  > dual-dispatch twin from an **id overlap** between the two top entries — wall-clock-adjacent
  > membership wearing an id costume, and the mechanism behind the 250 ms gesture race (three
  > `it.fails` pins, now all green). The binding rule is now: **a dual-dispatch twin is identified
  > by a shared `gestureId`** (minted synchronously by `CommandBus.executeCommand`, carried on
  > `PatchPair.gestureId` and `CommandMetadata.gestureId`) **together with a
  > `targetIds ⊆ ringIds` subset match. An entry carrying no gesture id is NEVER a twin** —
  > absence-as-membership is the original bug renamed, and it is the direction that silently
  > deletes elements. **Wall-clock proximity MUST NOT be used to infer gesture membership.**
  > `_SAME_GESTURE_WINDOW_MS` is deleted; a reintroduced clock is a regression against the
  > BOUNDARY pin in `undoGestureOrdering.test.ts`.

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
- **B5 (HOSTED two-part) — CLOSED 2026-05-24.** A door/window placement (`wall.opening.create`,
  affectedStores=`['wall']`) writes the opening into the host wall's `openings` (the ring-buffer
  patch) while the §P2.3 bridge SEPARATELY adds a `doorStore`/`windowStore` record (the leaf/frame
  mesh + plan swing-arc) as an event side-effect that is NOT in the patch — so a naive
  `wallStore.update(wallId, {openings})` on undo closed the hole but left the door. **Fix:** the
  adapter detects a field patch on a host wall's `openings` and routes it to a hosted-aware
  reconciler (`_reconcileWallOpenings`) that diffs current vs target openings and drives the
  canonical APIs — `wallStore.removeOpening` + `doorStore/windowStore.remove` on undo (closes the
  hole AND removes the door mesh + swing arc), `wallStore.addOpening` + restore-from-snapshot on
  redo (so the exact door/window record returns without re-resolving systemType finishes). The
  derived `childrenIds` field patch is skipped (managed by removeOpening/addOpening). Unit-gated
  (`elementUndoStoreAdapter.test.ts` — "hosted door undo/redo…"). Remaining hosted gap:
  undoing a WALL that still hosts doors does not yet cascade-remove the global door/window records
  (you'd normally undo the opening first) — tracked as a follow-up.

**Scoped follow-ups (do NOT regress §4.5/§4.6):**
1. **Wall-delete cascade for hosted children.** Undoing a *wall* (whole-element remove) that still
   has door/window openings reverts the wall but does not yet remove the global door/window records
   for its children (the §P2.3 bridge only mirrors on create). The opening-level undo (B5) is done.
2. **Cross-stack ordering — CLOSED for the timestamped case (U-10).** Both stacks now carry a
   commit timestamp (`PatchPair.timestamp` stamped by `CommandBus` at push; `Command.timestamp` at
   construction — the same `Date.now()` clock), and `performUndo`/`performRedo` order across them
   chronologically: undo reverts the newest pending entry, redo replays the oldest, with the
   same-gesture (id-overlap) guard that keeps dual-dispatch twins on the U-8 path. `_lastSource`
   remains ONLY as the fallback for the untimestamped case (pre-existing fixtures / entries pushed
   before this shipped), where behaviour is unchanged: ring-buffer first, redo mirrors the last
   undo's stack. Root cause it closed: a commandManager-ONLY 3D tool (door, window, lighting,
   column, floor, ceiling, curtain-wall, lift, slab-opening) placed an element on top of a
   ring-buffer entry, and ring-buffer-first undid the OLDER element beneath it. Single-timeline
   ordering (one stack, no reconciliation at all) remains the ADR-0251 end-state.
3. **L1 / Immer store divergence.** Adapter undo reverts the legacy (mesh + serialization) store
   but not the L1 Immer store. Harmless today (serialization reads the legacy store — same as the
   pre-existing 3D `CreateWallCommand.undo` behaviour), removed by U-7 store unification.

**Resolution — ADR-0251** (`reference/adrs/ADR-0251-undo-single-source-of-truth.md`): adopt the
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

**Adapter call-arity is part of the contract (§ANN-UNDO-ARITY, 2026-08-07, `352edcfe`).**
`elementUndoStoreAdapter` drives field-level inverse patches through
`store.update(id, { [field]: value })` — **two arguments**. A store bound into
`buildUndoStoreMap()` MUST accept that call shape. The annotation store took a single
merged object, so the adapter's id landed in `partial`, the guard logged "id not found"
and returned: **undo silently did nothing while the ring-buffer cursor still advanced**
(the keypress was consumed). Whole-element ops (`add`/`remove`) happened to match, so
create-undo worked and field-undo did not — which is why an audit that read the (correct)
mapping in `performUndoRedo.ts` cleared undo: *reading a mapping is not exercising a
call*. A store that cannot resolve an id MUST refuse (log, no mutation), never
half-write; a redo handed a flat ledger record MUST lift it to a canonical element
loudly, never store it verbatim (an element with no `geometry2D`/`type` renders nothing,
which to the user is "redo did nothing").

### §4.9 — Annotations have ONE element store (2026-08-07, `73b9d474`)

Annotations have ONE element store: the subsystem `annotationStore`. The schema-level
`ctx.stores.annotation` (`AnnotationsState`) is a DERIVED PATCH LEDGER that exists only
to give the ring buffer an immutable before/after pair; it is never an element source.
Reading it to render, persist, export, tag, schedule or select is a defect. Every
`annotation.*` handler decides existence against the canonical store and projects its
mutation there through `canonicalAnnotationSink`.

Supporting rules (same commit family):

- The `annotation.*` bus verbs remain the public mutation API (P6) but terminate in the
  canonical store; the ledger is back-filled (`mirrorRecordFor`) so patch pairs describe
  a real before/after. `assertNotARead()` states the boundary in code.
- Every annotation element carries a `systemTypeId`, stamped by `makeAnnotationElement` —
  the single chokepoint all 27+ families are born through (`§ANN-TYPE`,
  `AnnotationSystemTypeStore`, shaped identically to Door/Wall/FloorSystemTypeStore).
- `annotation.update` is the general merge-semantic update verb (`§ANN-UPDATE-VERB`); an
  update carrying no field to change is REFUSED rather than reported done (ADR-0299).

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
