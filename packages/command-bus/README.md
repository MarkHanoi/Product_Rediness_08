# `@pryzm/command-bus`

PRYZM 2 command bus — L2 of the architecture stack (S02).

Owns the **handler registry**, **Immer-patch pipeline**, **PatchEmitter**,
and **UndoStack**.  Every user action dispatches through
`CommandBus.executeCommand()` — no direct store mutations anywhere.

## API surface

```ts
import {
  CommandBus, CommandBusError,
  PatchEmitter,
  UndoStack,
  produceCommand, produceWithPatchesPerStore,
} from '@pryzm/command-bus';
```

### `CommandBus`

```ts
const bus = new CommandBus({
  audit: { actorId: 'user_01', projectId: 'proj_01', clientId: 'client_01' },
  storesProvider: (storeIds) => { /* return store state slices */ },
});

bus.register(myHandler);  // register by handler.type

const result = await bus.executeCommand({
  type: 'cube.move',
  payload: { dx: 1, dy: 0, dz: 0 },
});
```

**Execution order** (ADR-002):
1. `handler.canExecute(ctx, cmd)` → `ValidationResult` (gate)
2. `handler.execute(ctx, cmd)` → `HandlerResult` (forward + inverse patches)
3. `emitter.emit(eventRecord)`
4. `undoStack.push(eventRecord)`

A `CommandBusError` is thrown (without pushing to history) if:
- `canExecute` returns `{ valid: false }`
- A required store key declared in `handler.affectedStores` is absent from the context

### `CommandHandler<TCmd, TStores>`

```ts
interface MyHandler extends CommandHandler<MoveCubeCmd, { cube: CubeStore }> {
  readonly type = 'cube.move';
  readonly affectedStores = ['cube'] as const;

  canExecute(ctx, cmd): ValidationResult { … }
  async execute(ctx, cmd): Promise<HandlerResult> { … }
}
```

`HandlerContext<TStores>` is passed **only** by parameter — no
`(window as any)` fallback is ever accepted (ADR-002, R1A-16).
The bus throws synchronously if any declared store key is missing.

### `UndoStack`

```ts
const undo = new UndoStack(/* cap = 100 */);
undo.push(eventRecord);
const record = undo.pop();           // undo
const record = undo.redo();          // redo
undo.clear();                        // called on LOAD_PROJECT
```

Bounded at 100 entries (matches PRYZM 1's `CommandManager.history` cap).

### Immer patches

```ts
// One-off produce with forward+inverse patches per store.
const { patches, inversePatches } = produceWithPatchesPerStore(
  storeState,
  (draft) => { draft.x += 1; },
);
```

`enablePatches()` is called **once** at module-load time in this package
so every consumer benefits automatically (idempotent per Immer contract).

## Architecture

Mirrors PRYZM 1's `CommandManager.ts` + `PatchSnapshot.ts` but without:
- The 18-field hard-coded `CommandContext.stores` interface
- The three `(window as any)` window-fallback constructor lines
- `structuredClone` snapshotting (replaced by Immer patches)

See `docs/architecture/command-bus.md` for the full design brief.

## Sprint citations

| Sprint | Sub-phase | Deliverable |
|---|---|---|
| S02 | T1 | `CommandHandler<T>` + `HandlerContext` types |
| S02 | T2 | `CommandBus.executeCommand` + handler registry + OTel `pryzm.command.execute` |
| S02 | T3 | Immer `enablePatches` + `produceWithPatchesPerStore` + `MoveCubeCommand` fixture |
| S02 | T4 | `PatchEmitter` (JSON in S02; MessagePack codec swap in S04 via ADR-004) |
| S02 | T5 | `UndoStack` (bounded 100, clear on LOAD_PROJECT) |
