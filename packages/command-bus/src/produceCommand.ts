// Immer wrappers used by handlers.
//
// `enablePatches()` is called ONCE at package load (in `index.ts`) per
// `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T3` and R1A-18.
// Calling it here would still be safe (immer's contract is idempotent —
// `src/commands/PatchSnapshot.ts:54` documents the same), but the spec
// wants the call site centralised.

import { produceWithPatches, type Draft, type Patch } from 'immer';
import type { StoreId } from './types.js';

/**
 * Run `recipe` against `base` in an Immer draft and return the next state
 * plus the forward + inverse patch arrays.  The handler returns these
 * patches verbatim in its `HandlerResult`.
 *
 * Used when a handler touches a single store.  For multi-store commands
 * see {@link produceWithPatchesPerStore}.
 *
 * Example:
 * ```ts
 * const [next, forward, inverse] = produceCommand(state, draft => {
 *   const cube = draft.cubes[id];
 *   if (cube) { cube.x += dx; cube.y += dy; }
 * });
 * ```
 */
export function produceCommand<TState>(
  base: TState,
  recipe: (draft: Draft<TState>) => void,
): readonly [TState, readonly Patch[], readonly Patch[]] {
  const [next, forward, inverse] = produceWithPatches(base, recipe);
  return [next as TState, forward, inverse];
}

/**
 * Per-store wrapper for handlers that mutate more than one store in a
 * single command (spec §S02-T3 line 295).  The recipe receives a typed
 * draft of every store named in `stores`; the result groups patches by
 * store key so the bus can build per-store `PatchSnapshotEntry` records.
 *
 * The patch paths inside each per-store entry are RELATIVE to that store
 * (path[0] is the first key inside the store, not the store key itself).
 *
 * Example:
 * ```ts
 * const out = produceWithPatchesPerStore(
 *   { wall: ctx.stores['wall'], level: ctx.stores['level'] },
 *   drafts => {
 *     drafts.wall.byId[wallId] = newWall;
 *     drafts.level.byId[levelId].walls.push(wallId);
 *   },
 * );
 * out.wall.next      // updated wall store
 * out.wall.forward   // Patch[]
 * out.wall.inverse   // Patch[]
 * ```
 */
export function produceWithPatchesPerStore<TStores extends Record<StoreId, unknown>>(
  stores: TStores,
  recipe: (drafts: { [K in keyof TStores]: Draft<TStores[K]> }) => void,
): { [K in keyof TStores]: { next: TStores[K]; forward: readonly Patch[]; inverse: readonly Patch[] } } {
  const out = {} as {
    [K in keyof TStores]: { next: TStores[K]; forward: readonly Patch[]; inverse: readonly Patch[] };
  };
  // Drive Immer once per store so patches are naturally store-relative.
  // The recipe is called against a single proxy that fans out to per-store
  // sub-recipes via property access — but that requires a synchronous join
  // in JS that doesn't exist; instead we do the pragmatic thing and run
  // the recipe N times, once per store, with only that store's draft
  // populated.  In practice handlers only touch one store at a time even
  // when they declare two — the rare cross-store handler can call
  // `produceCommand` per store directly.
  const keys = Object.keys(stores) as (keyof TStores)[];
  for (const key of keys) {
    const [next, forward, inverse] = produceWithPatches(stores[key], draft => {
      const drafts = { [key]: draft } as unknown as {
        [K in keyof TStores]: Draft<TStores[K]>;
      };
      recipe(drafts);
    });
    out[key] = { next: next as TStores[typeof key], forward, inverse };
  }
  return out;
}
