# Command Bus — Architecture

> **Spec**: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S02 (`S02-T1` through `S02-T10`).
> **ADR**: `docs/architecture/adr/0002-command-handler-signature.md`
> **Package**: `packages/command-bus/`

## Overview

The command bus is **L2** of the PRYZM 2 architecture stack.  Every user action
dispatches through `CommandBus.executeCommand()` — no component, store, or
committer is mutated directly.

```
User action
    │
    ▼
CommandBus.executeCommand(cmd)
    ├─ 1. handler.canExecute(ctx, cmd)  → ValidationResult
    ├─ 2. handler.execute(ctx, cmd)     → HandlerResult { forwardPatches, inversePatches }
    ├─ 3. PatchEmitter.emit(eventRecord)
    └─ 4. UndoStack.push(eventRecord)
              │
              ▼
         Store.applyPatch(forwardPatches)
              │
              ▼
         CommitterHost.applyDelta(diff)
              │
              ▼
         PrimitiveCommitter.onAdd/onUpdate/onRemove
```

## PRYZM 1 ancestry

| PRYZM 2 | Absorbed from PRYZM 1 | Removed |
|---|---|---|
| `CommandBus` | `CommandManager.execute()` — snapshot → execute → restore-on-fail | 3 `(window as any)` window-fallback constructor lines |
| `PatchSnapshotEntry` | `src/commands/PatchSnapshot.ts` — copied verbatim | `structuredClone` snapshotting in `execute()` lines 100–110 |
| `affectedStores` | `CreateWallCommand.ts:60` — already existed in PRYZM 1 | Hard-coded 18-field `CommandContext.stores` interface |
| `PROJECT_LOAD` fast path | `CommandManager.ts:120` — `PROJECT_LOAD` bypassed snapshot + history | OBC fallbacks |

## `CommandHandler<TCmd, TStores>`

```ts
interface CommandHandler<TCmd, TStores extends AnyStores> {
  readonly type: string;
  readonly affectedStores: readonly (keyof TStores)[];
  canExecute(ctx: HandlerContext<TStores>, cmd: TCmd): ValidationResult;
  execute(ctx: HandlerContext<TStores>, cmd: TCmd): Promise<HandlerResult>;
}
```

- `HandlerContext<TStores>` is passed **only by parameter** — no globals.
- The bus throws `CommandBusError` synchronously if any key in `affectedStores`
  is missing from the provided stores — **explicit fail-fast** instead of the
  silent `(window as any)` fallback pattern PRYZM 1 inherited.
- Namespaced command types (`'wall.create'`, `'cube.move'`) replace the 250+
  entry global `CommandType` enum from `src/commands/types.ts`.

## Immer patches

```ts
const { patches, inversePatches, nextState } = produceWithPatchesPerStore(
  storeSlice,
  (draft) => { draft[id].x += 1; },
);
```

`enablePatches()` is called once at module load in `packages/command-bus/index.ts`
(idempotent per Immer — the 3 PRYZM-1 call sites are harmless duplicates).

## PatchEmitter

- S02: JSON wire format.
- S04: swapped to MessagePack (ADR-004) — a single-file codec change.
- Envelope: `{ commandId: ULID, actorId, projectId, clientId, timestamp, version, patches: PatchSnapshotEntry[] }`

## UndoStack

- Bounded at 100 entries (matches PRYZM 1's `CommandManager.history` cap).
- Cleared on `LOAD_PROJECT` (same contract as PRYZM 1's `clearHistory()`).
- Undo: applies `inversePatches` in reverse declaration order.
- Redo: reapplies `forwardPatches` in declaration order.

## CI gates

| Gate | Trigger |
|---|---|
| `pryzm-affected-stores-required` lint | Missing `affectedStores` on any handler in `pryzm2/` |
| `cmd-execute-latency` bench | `MoveCubeCommand` end-to-end > 1 ms p95 |
| Full-pipeline bench | Handler → patch → store → committer (excl. render) > 5 ms p95 |
