# Stores — Architecture

> **Spec**: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05 (`S05-T1` through `S05-T3`, `S05-T8`).
> **Package**: `packages/stores/`

## Overview

The stores layer is **L1** of the PRYZM 2 architecture stack.  It holds every
element's state as a `Map<id, T>` of DTO objects.  Stores are:

- **DTO-only** — no THREE imports, no render state (`pryzm/no-three-in-kernel` lint rule)
- **Immer-patch-driven** — all mutations go through `applyPatch(Patch[])`
- **Clone-on-read** — `getAll()` returns a frozen snapshot (pattern from `WallStore.ts:75–80`)

```
CommandBus.executeCommand(cmd)
    │  forwardPatches
    ▼
Store<T>.applyPatch(patches)
    │  DirtyDiff { added, updated, removed }
    ▼
subscribeDirty(diff → ...)
    │  via CommitterHost / SceneRegistry
    ▼
PrimitiveCommitter.onAdd / onUpdate / onRemove
```

## `Store<T>` base class

```ts
class Store<T extends { id: string }> {
  applyPatch(patches: Patch[]): DirtyDiff<T>;
  subscribeDirty(listener: DirtyListener<T>): Disposer;
  getAll(): Readonly<Record<string, T>>;
}
```

Immer handles frozen targets natively — the PRYZM-1 `Object.freeze` cloning
pattern is preserved without collision (`produceWithPatches` on frozen state
works correctly).

## PRYZM 1 ancestry

| PRYZM 2 | Absorbed from PRYZM 1 |
|---|---|
| `Store<T>` structural pattern | `WallStore.ts:23–80` — `Map<id,T>`, clone-on-read, `notify(listener)` |
| Shared base class | PRYZM 1 had 65 independent `*Store.ts` files with ad-hoc listener APIs |
| `DirtyDiff` | Unifies `onWallChange` / `subscribeFloor` / … into one discriminated-union shape |

## Concrete stores in Phase 1A

| Store | Sprint | Purpose |
|---|---|---|
| `CubeStore` | S05-T2 | Hello Cube demo state — minimal example of `Store<T>` |
| `SelectionStore` | S05 | Editor selection (element IDs + kind) |
| `ActiveViewStore` | S05 | Active view (3D orbit / plan / section) |

All element stores (`WallStore`, `SlabStore`, …) live in the relevant plugin
packages and follow the same `Store<T>` contract.

## `attachStores` bus wiring

```ts
const handle = attachStores(bus, emitter, undoStack, {
  wall: wallStore,
  slab: slabStore,
});
handle.dispose();
```

`attachStores` is the single wiring point between `CommandBus` and the stores
layer.  It subscribes `bus.onResult` → `store.applyPatch()` per affected store
and wires undo/redo patch application.

## CI gates

| Gate | Trigger |
|---|---|
| `pryzm/no-three-in-kernel` lint | Any THREE import in `packages/stores/` |
| Full-pipeline bench | < 5 ms p95 (handler → patch → store → committer; excl. render) |
| `CubeStore` + `CubeCommitter` integration | store update → patch → THREE mesh |
