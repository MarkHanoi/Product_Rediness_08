# `@pryzm/stores`

PRYZM 2 stores layer — L1 of the architecture stack (S05).

Provides the `Store<T>` base class, concrete element stores, and the
`attachStores` bus-wiring helper.  Stores are **DTO-only** — no THREE
imports, no render state (enforced by `pryzm/no-three-in-kernel`).

## API surface

```ts
import {
  Store,
  CubeStore,
  SelectionStore,
  ActiveViewStore,
  attachStores,
  type DirtyDiff, type DirtyListener, type Disposer,
} from '@pryzm/stores';
```

### `Store<T>`

```ts
class WallStore extends Store<WallData> {}

const store = new WallStore();
store.applyPatch(immerPatches);          // mutate via Immer patch
const diff: DirtyDiff<WallData> = ...;
const dispose = store.subscribeDirty(diff => {
  // react to added / updated / removed IDs
});
dispose();                               // unsubscribe
const all: Record<string, WallData> = store.getAll();
```

`Store<T>` uses Immer `produce` for all mutations — frozen inputs are
handled natively.  `clone-on-read` pattern mirrors `WallStore.ts:75–80`
from PRYZM 1.

### `CubeStore`

The Hello Cube state (S05-T2).  Minimal example of `Store<T>` used by the
`?pryzm2=1` demo cube.

### `SelectionStore`

Tracks the current editor selection (set of element IDs + kind).  Used by
the `CubeCommitter` highlight pass and the property panel.

### `ActiveViewStore`

Tracks which view is currently active (3D orbit, plan, section, …).
Subscribed by the renderer to switch render-pass configuration.

### `attachStores`

```ts
const handle = attachStores(bus, patchEmitter, undoStack, {
  wall: wallStore,
  slab: slabStore,
  // …
});
handle.dispose();  // unsubscribes all
```

Convenience helper that:
1. Subscribes `bus.onResult` → `store.applyPatch(forwardPatches)` per affected store
2. On undo: applies `inversePatches` in reverse order
3. On redo: reapplies `forwardPatches`

## Architecture

Mirrors PRYZM 1's 65 `*Store.ts` files (25 K LOC) but unified under one
`Store<T>` base with a discriminated-union `DirtyDiff` contract instead of
per-store ad-hoc listener APIs.

See `docs/04-reference/architecture-detail/stores.md` for the full design brief.

## Sprint citations

| Sprint | Sub-phase | Deliverable |
|---|---|---|
| S05 | T1 | `Store<T>` base class (`applyPatch` + `subscribeDirty` + `getState`) |
| S05 | T2 | `CubeStore` (Hello Cube state) |
| S05 | T3 | Stores ↔ command-bus integration tests |
| S05 | T8 | `attachStores` bus-wiring helper (bootstrap data half) |
