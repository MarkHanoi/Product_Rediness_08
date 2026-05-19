// FloorImmerStore — Immer-backed state slice for the floor finish element family (§P3.2-FL).
//
// `FloorsState` is the canonical Immer state type used by CreateFloorHandler
// and other typed bus handlers for the floor family.
//
// The LEGACY FloorStore (packages/core-app-model/src/stores/FloorStore.ts) is kept
// in service during Phase 3 so that FloorFragmentBuilder (which reads from it) continues
// to build meshes.  The initTools.ts §P3.2-FL bridge mirrors Immer mutations to the
// legacy store until FloorFragmentBuilder is migrated to read the Immer state directly.
//
// §P3.2-FL-STORE: FloorStore extends the L1 Store<T> base class so the command bus
// can materialise ctx.stores.floor in HandlerContext.  Previously only FloorsState
// (a plain Immer Record type) was exported; the bus's storesProvider requires a
// Store<T> instance with getState() → ReadonlyMap<string, FloorData>.

import { Store } from '@pryzm/plugin-sdk';
import type { FloorData } from '@pryzm/core-app-model';

export type FloorId = string;
export type FloorsState = Record<FloorId, FloorData>;

export const INITIAL_FLOORS_STATE: FloorsState = {};

/**
 * L1 bus-compatible store for the floor finish element family.
 *
 * Used by `bootstrapWithEverything` (via `ALL_PLUGINS`) to materialise
 * `ctx.stores.floor` in `HandlerContext` for `CreateFloorHandler` and
 * `UpdateFloorLayersHandler`.  The `storesProvider` in `bootstrap.ts`
 * calls `store.getState()` and passes `Object.fromEntries(map)` to handlers
 * as the `FloorsState` record.
 *
 * Patch routing: `attachStores(emitter, stores)` routes forward Immer patches
 * from `CreateFloorHandler.execute()` back into this store via `applyPatch()`.
 * The `initTools.ts §P3.2-FL` bridge then mirrors those mutations to the
 * legacy `FloorStore` (core-app-model) so `FloorFragmentBuilder` can render.
 */
export class FloorStore extends Store<FloorData> {
  constructor() {
    super('floor');
  }

  byLevel(levelId: string): readonly FloorData[] {
    const out: FloorData[] = [];
    for (const f of this.state.values()) {
      if (f.levelId === levelId) out.push(f);
    }
    return out;
  }

  get(id: string): Readonly<FloorData> | undefined {
    return this.state.get(id);
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }
}
