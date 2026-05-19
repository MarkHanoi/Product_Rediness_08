// StairStore — pure DTO store for the stair element family (S14-T1).
//
// Mirrors `plugins/slab/src/store.ts`: THREE-free, self-contained,
// validation-at-handler-boundary.  Stair changes that propagate to
// handrails (host-pinned rails) are routed through the cross-element
// rule `plugins/cross/stair-handrail.ts` per ADR-0012 — they are NOT
// performed by the stair handlers themselves (K1B-2: each plugin
// owns its store).

import { Store } from '@pryzm/plugin-sdk';
import type { Stair as StairSchemaInfer } from '@pryzm/plugin-sdk';

/** Stair DTO inferred from the canonical Zod schema. */
export type StairData = StairSchemaInfer;

/** Branded stair id — the underlying Map keys are still plain strings. */
export type StairId = StairData['id'];

/** Per-store record view handed to handlers via `ctx.stores.stair`. */
export type StairsState = Record<string, StairData>;

export class StairStore extends Store<StairData> {
  constructor() {
    super('stair');
  }

  /** Convenience read — every stair id currently in the store. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Convenience read — every stair on a given level.  O(N). */
  byLevel(levelId: string): readonly StairData[] {
    const out: StairData[] = [];
    for (const s of this.state.values()) {
      if (s.levelId === levelId) out.push(s);
    }
    return out;
  }

  /** Lookup by id; returns `undefined` when missing. */
  get(id: string): Readonly<StairData> | undefined {
    return this.state.get(id);
  }
}
