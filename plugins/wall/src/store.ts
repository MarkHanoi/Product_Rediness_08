// WallStore — pure DTO store for the wall element family (S07-T2).
//
// Mirrors `src/elements/walls/WallStore.ts` (1,227 LOC) — but ONE channel
// only (the `subscribeDirty` fan-out from `Store<T>`), no THREE imports,
// no `EventBus` shim, no `Map<id, WindowData>` / `Map<id, DoorData>`
// fields (windows + doors live in their own plugins per §1.2 — door /
// window plugins land in S11 and own their own state).
//
// Validation lives at the HANDLER boundary, not here — handlers call
// `Wall.parse(input)` from `@pryzm/schemas` before producing patches.
// The store applies patches verbatim; downstream consumers get a
// frozen, snapshot-immutable read view via `Store<T>.getState()`.

import { Store } from '@pryzm/plugin-sdk';
import type { Wall as WallSchemaInfer } from '@pryzm/plugin-sdk';

/** Wall DTO inferred from the canonical Zod schema. */
export type WallData = WallSchemaInfer;

/** Branded wall id — narrowed string for ergonomics at the handler
 *  boundary; the underlying Map keys are still plain strings. */
export type WallId = WallData['id'];

/** Per-store record view handed to handlers via `ctx.stores.wall`. */
export type WallsState = Record<string, WallData>;

export class WallStore extends Store<WallData> {
  constructor() {
    super('wall');
  }

  /** Convenience read — every wall id currently in the store, in
   *  insertion order. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Convenience read — every wall on a given level.  O(N) — fine for
   *  S07; an L1 secondary index lands when the LevelStore arrives. */
  byLevel(levelId: string): readonly WallData[] {
    const out: WallData[] = [];
    for (const w of this.state.values()) {
      if (w.levelId === levelId) out.push(w);
    }
    return out;
  }

  /** Lookup by id; returns `undefined` when missing.  Mirrors
   *  PRYZM 1's `WallStore.getById()`. */
  get(id: string): Readonly<WallData> | undefined {
    return this.state.get(id);
  }
}
