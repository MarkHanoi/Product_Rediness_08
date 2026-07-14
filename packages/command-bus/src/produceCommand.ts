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
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTI-STORE COMMANDS — THE ROUTING CONVENTION, AND WHY THIS HELPER EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 * (§FEAT-SWIMMING-POOL-ELEMENT, L-292 — see ADR-0124 §5.)
 *
 * A command whose `affectedStores` has MORE THAN ONE key has its patches routed
 * to stores **by `path[0]`**. Both routers say so, in the same words:
 *
 *   CommandBus.ts:327   `forwardPatches: result.forward.filter(p => String(p.path[0]) === storeKey)`
 *   PatchSnapshot.ts    `patches.filter(p => String(p.path[0]) === storeKey)`   (applyRingBufferSide)
 *
 * and the §U-B6 guard (CommandBus.ts:303) hard-errors a multi-store handler whose
 * `path[0]` is not a declared store key.
 *
 * **THEREFORE A MULTI-STORE HANDLER MUST EMIT STORE-KEY-PREFIXED PATHS:**
 *
 *     path = [storeKey, elementId, ...field]        NOT  [elementId, ...field]
 *
 * `produceWithPatchesPerStore()` below does NOT do this — its paths are
 * store-RELATIVE, as its own docstring says. That makes it unusable for a
 * multi-store command: its patches route to nothing, `applyRingBufferSide`
 * applies zero stores, and Ctrl+Z silently falls through to `commandManager`,
 * which has never heard of the command. **Undo does nothing, and says nothing.**
 *
 * That trap was never sprung because, until the pool, NO bus handler had ever
 * declared two stores (every real multi-store command in the tree is a legacy
 * Path-A `Command` with snapshot undo). The multi-store branch was dead code.
 *
 * `produceMultiStoreCommand()` is the ONE chokepoint that gets it right. Use it
 * for every multi-store bus command; do not hand-roll the prefixing.
 */

/** Prefix an Immer patch's path with its owning store key (the routing convention). */
function _prefixWithStore(storeKey: StoreId, p: Patch): Patch {
  return { ...p, path: [storeKey, ...p.path] };
}

/**
 * Run one recipe per store and return a SINGLE flat forward/inverse patch pair
 * whose paths are store-key-prefixed, plus the per-store next states.
 *
 * This is what buys **"one gesture = ONE undo entry"** for a command that spans
 * several element families (C16 §8.6 B-6): one dispatch → one `HandlerResult` →
 * one `PatchPair` → one ring-buffer entry → one Ctrl+Z.
 *
 * The returned `forward`/`inverse` go straight into `HandlerResult`; `nextStates`
 * is already keyed by store id. Declare EVERY key you pass here in the handler's
 * `affectedStores`, in any order — routing is by key, not by position.
 *
 * Example — a pool creates walls, a floor slab and water, and cuts a hole in the
 * host slab, in ONE undoable entry:
 * ```ts
 * const out = produceMultiStoreCommand(
 *   { pool: ctx.stores.pool, wall: ctx.stores.wall, slab: ctx.stores.slab, water: ctx.stores.water },
 *   {
 *     pool:  d => { d[poolId] = poolRecord; },
 *     wall:  d => { for (const w of walls) d[w.id] = w; },
 *     slab:  d => { d[floor.id] = floor; d[hostId]!.holes = [...d[hostId]!.holes, holeLoop]; },
 *     water: d => { d[water.id] = water; },
 *   },
 * );
 * return { forward: out.forward, inverse: out.inverse, nextStates: out.nextStates };
 * ```
 */
export function produceMultiStoreCommand<TStores extends Record<StoreId, unknown>>(
  stores: TStores,
  recipes: { [K in keyof TStores]: (draft: Draft<TStores[K]>) => void },
): {
  readonly nextStates: { [K in keyof TStores]: TStores[K] };
  readonly forward: readonly Patch[];
  readonly inverse: readonly Patch[];
} {
  const nextStates = {} as { [K in keyof TStores]: TStores[K] };
  const forward: Patch[] = [];
  const inverse: Patch[] = [];

  for (const key of Object.keys(stores) as (keyof TStores & StoreId)[]) {
    const [next, fwd, inv] = produceWithPatches(stores[key], (draft) => {
      recipes[key](draft as Draft<TStores[typeof key]>);
    });
    nextStates[key] = next as TStores[typeof key];
    // The prefix IS the routing key. Without it these patches reach no store.
    for (const p of fwd) forward.push(_prefixWithStore(key, p));
    for (const p of inv) inverse.push(_prefixWithStore(key, p));
  }

  return { nextStates, forward, inverse };
}

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
