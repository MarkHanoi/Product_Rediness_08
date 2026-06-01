# `@pryzm/scene-committer`

PRYZM 2 scene committer — L5 of the architecture stack (S04–S05).

The scene committer is the **bridge between stores and THREE.js**.  It
subscribes to store diffs (forwarded as Immer patches) and dispatches
`add/update/remove` lifecycle calls to per-element `PrimitiveCommitter`
implementations.

The committer is the **only** place in PRYZM 2 where THREE is allowed outside
the renderer package (enforced by `pryzm/no-three-outside-committer` lint
rule, hard-error since S05-T10).

## API surface

```ts
import {
  CommitterHost,
  MaterialPool,
  SceneRegistry,
  bindStore,
} from '@pryzm/scene-committer';
```

### `CommitterHost`

```ts
const host = new CommitterHost({ scene, materialPool });

host.register(wallCommitter);     // wire a PrimitiveCommitter
host.register(slabCommitter);
host.start();                     // begin listening for diffs

// Dispatch deltas manually (tests):
host.applyDelta({ added: [wallData], updated: [], removed: [] });
host.stop();
```

### `PrimitiveCommitter<TStore>` interface (ADR-005)

```ts
interface PrimitiveCommitter<TData> {
  readonly elementType: string;
  onAdd(data: TData):    void;
  onUpdate(data: TData): void;
  onRemove(id: string):  void;
  dispose():             void;
}
```

The lifecycle mirrors PRYZM 1's `WallFragmentBuilder` (`add → update →
remove → dispose`) but collapsed from 23 fragment-builder god-classes into
per-plugin `committer.ts` files.  ADR-005 ratifies the interface.

### `MaterialPool`

```ts
const pool = new MaterialPool();

const handle = pool.acquire({ color: '#cc3300', side: 'double' });
const mat: THREE.Material = pool.resolve(handle);
pool.releaseRef(handle);     // ref-counted; terminates when count hits 0
pool.deduplicateAll();       // merge equivalent materials (one material per hash)
```

Deduplication guarantee: a 100-cube scene with identical materials produces
**1** `THREE.Material` instance (S05 exit criterion).  GPU-leak assertion:
memory delta < 5 MB after 1 000 acquire/release cycles (S05-T6).

### `bindStore`

```ts
const handle = bindStore({
  store: wallStore,
  committer: wallCommitter,
  host,
});
handle.dispose();   // unsubscribes
```

Coalesces multiple updates to the same element `id` within one batch.
Ensures `onAdd` runs before `onRemove` for the same material hash within a
batch (S05 blocker mitigation).

## Architecture

Collapses PRYZM 1's 23 `*FragmentBuilder.ts` files (~12 K LOC) into one
`CommitterHost` + per-element `committer.ts` files (each ~100–300 LOC).

The depth-counted batch primitive from `src/core/StoreEventBus.ts` is
reproduced inside `CommitterHost.batch()` — same "no event drops" contract.

See `docs/04-reference/architecture-detail/scene-committer.md` for the full design brief.

## Sprint citations

| Sprint | Sub-phase | Deliverable |
|---|---|---|
| S04 | T4 | `PrimitiveCommitter<T>` interface; `SceneRegistry` |
| S04 | T5 | `MaterialPool` GPU-leak assert (< 5 MB / 1 K cycles) |
| S04 | T6 | `CommitterHost` batch dispatch + depth-counted batch wrapper |
| S05 | T4 | `bindStore<T>` — wires patch application to committer dispatch |
| S05 | T5 | Patch dispatcher with batching + coalescing |
| S05 | T6 | Material-pool dispose paths + GPU-leak assertion |
| S05 | T7 | Visual smoke test: 100 cubes add/transform/remove — no leak |
| S05 | T10 | `pryzm/no-three-outside-committer` switched to error in `pryzm2/` |
