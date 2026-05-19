// SlabStore — pure DTO store for the slab element family (S12-T2).
//
// Mirrors `plugins/roof/src/store.ts`: THREE-free, self-contained,
// validation-at-handler-boundary.  Slab boundary changes that affect
// walls (edge-pinned walls along the slab perimeter) are routed
// through the cross-element rule `plugins/cross/slab-wall.ts` — they
// are NOT performed by the slab handlers themselves (K1B-2: each
// plugin owns its store).

import { Store } from '@pryzm/plugin-sdk';
import type { Slab as SlabSchemaInfer } from '@pryzm/plugin-sdk';

/** Slab DTO inferred from the canonical Zod schema. */
export type SlabData = SlabSchemaInfer;

/** Branded slab id — the underlying Map keys are still plain strings. */
export type SlabId = SlabData['id'];

/** Per-store record view handed to handlers via `ctx.stores.slab`. */
export type SlabsState = Record<string, SlabData>;

export class SlabStore extends Store<SlabData> {
  constructor() {
    super('slab');
  }

  /** Convenience read — every slab id currently in the store. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Convenience read — every slab on a given level.  O(N). */
  byLevel(levelId: string): readonly SlabData[] {
    const out: SlabData[] = [];
    for (const s of this.state.values()) {
      if (s.levelId === levelId) out.push(s);
    }
    return out;
  }

  /** Lookup by id; returns `undefined` when missing. */
  get(id: string): Readonly<SlabData> | undefined {
    return this.state.get(id);
  }
}
