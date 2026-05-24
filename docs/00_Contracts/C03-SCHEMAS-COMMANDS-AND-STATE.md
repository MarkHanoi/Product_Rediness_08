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

> **Deep-audit revision 2026-05-24** — this section was rewritten against the actual source
> (`CommandBus.ts`, `RingBufferUndoStack.ts`, `composeRuntime.ts`, `PatchSnapshot.ts`,
> `apps/editor/src/engine/{initUI,BimService}.ts`) to document precisely how undo works today,
> the **three-store reality** that makes it fragile, and the binding invariants for a robust
> undo. Known gaps are in §4.7 (tracked as OI-054 / U-B cluster / TASK-08).

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

### §4.5 — The canonical patch-apply path (`runtime.undoStack`)

`composeRuntime` builds the **correct** apply slot — `buildPhaseDUndoStackSlot()`
(`composeRuntime.ts:627`), exposed as `runtime.undoStack.undo()/redo()`:

```ts
undo() {
  const pair = ringBuffer.current();
  const side = ringBuffer.undoPatch();                 // atomic: cursor-- + return inverse PatchSide
  if (side && pair?.affectedStores?.length) {
    const storeMap = bus.fetchStores(pair.affectedStores);   // SAME L1 objects the handler wrote
    applyRingBufferSide(side, pair.affectedStores, storeMap); // store.applyPatch(patches)
  }
}
```

This is correct **for the L1 data layer**: `bus.fetchStores` and `buildContext` both call the same
`storesProvider` (`CommandBus.ts:204/219`), so the patch shape matches and `applyPatch` exists.
**Any Ctrl+Z / redo entry point MUST route through `runtime.undoStack`** — it MUST NOT re-derive
its own store map (see §4.7 anti-pattern).

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
  this) — **but a swallowed failure MUST be reported to the caller, never logged as success**
  (§4.7 bug B3).
- **U-5** There is exactly **one** patch-apply path: `runtime.undoStack`. UI handlers MUST call it,
  not re-implement `undoPatch()` + `applyRingBufferSide()` with a hand-built store map.
- **U-6** The ring buffer + the legacy undo stack MUST be cleared on project switch/load
  (`bus.clearUndoHistory()` per C13) so cross-project Ctrl+Z is a no-op.
- **U-7 (target)** The store a patch targets MUST be the store that renders the element, so an
  inverse patch reverts both data and mesh in one apply (TASK-08).

### §4.7 — Known gaps (AS-IS — tracked as OI-054 / U-B cluster / TASK-08)

Three layered bugs make plan-view-create undo a silent no-op today:

- **B1 — wrong store map (immediate crash).** **Four** UI sites **bypass `runtime.undoStack`**
  and hand-roll `applyRingBufferSide(side, stores, map)` with `map` pointing every key at the
  **legacy `window.*` store** (`wall → window.wallStore`): `initUI.ts` Ctrl+Z + redo handlers
  (`_buildRingBufferStoreMap()`, ~line 2785), `BimService.undo/redo()` (`_buildStoreMap()`, line 197),
  `NavigationAreaLayout.ts` (~line 106), and `DockingLayout.ts` (~line 59). The legacy `WallStore`
  has no `applyPatch` → `TypeError: store.applyPatch is not a function`. Violates **U-5**.
  **Interim fix (2026-05-24):** `applyRingBufferSide` now returns an `ApplyRingBufferOutcome`
  ({applied, failed}) and logs the missing-`applyPatch` store loudly instead of swallowing it;
  `initUI`/`BimService` stop logging false "undo applied" and fall back to `commandManager.undo()`
  on total failure (B3 closed). **Per-type rollout shipped 2026-05-24 (ADR-051):** all four sites
  now wrap their element entries via `adaptElementStoreMap()` → `elementUndoStoreAdapter` — a
  duck-typed `applyPatch` surface over each live legacy store's `add`/`remove`(or `delete`)/`update`,
  which DRIVE the mesh — so undo+redo revert both data and geometry for **wall, slab, room,
  curtain-wall, furniture, column, beam, stair, handrail, roof, floor, ceiling, plumbing**
  (B1+B2 closed for these; unit-gated 7/7, live-verify pending). `door`/`window` (hosted — two-part
  wall-opening undo) and `level` (Path-A) are left RAW → B3 fallback. **Real end-state:** route all
  four through `runtime.undoStack` (U-5) once each type's mesh derives from its L1 store (U-7).
- **B2 — mesh not reverted (deeper).** Even via `runtime.undoStack` the inverse patch applies to the
  **L1** store, which does not drive the mesh (§4.4). So data reverts but the wall mesh remains.
  **Fix:** TASK-08 store-unification (U-7) — make the mesh-driving store the L1 store (or have it
  subscribe to L1 dirty diffs), OR have the create-inverse drive the existing delete bridge.
- **B3 — silent-success lie.** `applyRingBufferSide` catches the `TypeError` and returns `void`
  (U-4 "MUST NOT throw"), so the caller logs `[Undo] ring-buffer undo applied` though nothing
  happened, and never falls back. Violates U-4's reporting clause. **Fix:** return an outcome;
  callers log honestly + fall back to `commandManager.undo()` on total failure.

**Per-type unevenness:** patch-based undo currently succeeds only for element types whose
`window.<x>Store` already *is* an `applyPatch`-capable plugin store (e.g. `plan-view/LevelStore`,
`view/store`); it is broken for every type still on a legacy `Map` store (wall confirmed; likely
slab/room/curtain-wall/door/window/furniture). This unevenness disappears when U-5 (single apply
path) + U-7 (store unification) land.

**Resolution — ADR-051** (`reference/adrs/ADR-051-undo-single-source-of-truth.md`): adopt the
pascalorg-aligned model — one source-of-truth store, the mesh + plan **derived** from it via a
dirty-diff subscription, and patch-inverse undo through the **single** `runtime.undoStack` apply
path (Path A retired). Migration is **incremental per element type, live-gated** — undo is an
interactive behaviour and MUST be verified in the running app per type. The B3 honesty/fallback
fix above is the behaviour-preserving interim until ADR-051 lands.

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
