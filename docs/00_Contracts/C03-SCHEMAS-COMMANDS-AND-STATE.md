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

### §4.1 — Scope

The undo stack is managed by `packages/runtime-undo-stack/`. It operates at the command level: undo reverses the last committed command's mutations; redo re-applies them.

### §4.2 — Invariants (PRYZM3 target path)

- Every command dispatched with `source: 'user'` MUST be pushed to the undo ring buffer unless decorated with `{ undoable: false }`.
- Commands with `source: 'remote'` or `source: 'ai'` MUST NOT be pushed to the undo buffer (remote conflicts are resolved via the CRDT mechanism in C08).
- The undo ring buffer size MUST be configurable (default: 200 commands).
- Undo MUST generate a synthetic command with `source: 'undo'` so the command log remains append-only.

### §4.3 — Transitional Dual-Path State (L7.5 — active until Phase E.5.x)

As of 2026-05-16, the codebase operates two concurrent undo stacks during the PRYZM3 migration:

**Path A — Legacy `CommandManager`** (`packages/command-registry/src/CommandManager.ts`)
- Used by: all plan-tool handlers (`MovePlanToolHandler`, `AlignPlanToolHandler`, `CopyPlanToolHandler`), all property inspector panels (`PropertyInspectorApply`, `PropertyPanelTypeSelector`, property-panel widgets), and `registerTransformDragHandler` (3D gizmo drag-end).
- Commands are dispatched as `commandManager.execute(new UpdateXxxCommand(...), { source: 'HUMAN_DIRECT' })`.
- Undo operates via `commandManager.undo()` / `commandManager.redo()` — snapshot-based (pre/post state stored in command objects).
- **Count:** ~143 call sites (as of Sprint OI-039). These are aliased through local `cmdMgr = window.commandManager` variables; the `check-no-commandmanager` gate counts only literal `window.commandManager` references and therefore shows 0 despite active aliased usage. See OI-042.
- **Migration target:** Phase E.5.x — flip all 143 sites to `runtime.commandBus.dispatch()`.

**Path B — PRYZM3 `CommandBus` + `RingBufferUndoStack`** (`packages/command-bus/`, `packages/runtime-undo-stack/`)
- Used by: `runtime.commandBus.dispatch()` calls in the wall/room/slab/curtain-wall/level Immer handlers registered in `engineLauncher.ts`.
- Mutations are Immer-based; forward + inverse JSON-Patch pairs are recorded in the ring buffer.
- `affectedStores` metadata routes undo patches to the correct Immer stores.
- **Count:** ~28 call sites. These are all in L1 handler registration code; no UI command currently uses this path directly.

**OI-034 Ctrl+Z Fallback Bridge (Sprint OI-034, 2026-05-15)**

`initUI.ts` implements a Ctrl+Z handler that checks both paths in order:

```
Ctrl+Z pressed
  → ringBuffer.peek() has affectedStores?
      YES → apply inverse patches via RingBufferUndoStack.undo()          (Path B)
      NO  → affectedStores empty? → commandManager.undo()                 (Path A)
              (covers all 143 cmdMgr.execute() sites during L7.5 phase)
```

This bridge is intentional and temporary. When Phase E.5.x lands and all 143 Path A sites are migrated to `commandBus.dispatch()`, the fallback branch is removed and §4.2 becomes the sole path.

**Store access during undo (both paths):**
- Path A: `CommandManager` calls `command.undo()` on each command object, which restores the pre-drag snapshot by writing back into the store directly. No `affectedStores` metadata is produced.
- Path B: `RingBufferUndoStack` looks up the `affectedStores` list from the ring-buffer entry and applies the inverse JSON-Patch to each named store. The store MUST be registered in `HandlerContext.stores` with a matching key.

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
