// DoorStore — pure DTO store for the door element family (S11-T1).
//
// Mirrors `src/elements/doors/DoorStore.ts` (PRYZM 1) but THREE-free
// and de-coupled from the wall family — door state is *self-contained*.
// Cross-store mutation of `Wall.openings[]` lives in the door HANDLERS,
// which declare `affectedStores: ['door', 'wall']` per
// `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` §3.D.
//
// Validation is at the handler boundary — handlers call `Door.parse(input)`
// from `@pryzm/schemas` before producing patches.  The store applies
// patches verbatim.

import { Store } from '@pryzm/plugin-sdk';
import type { Door as DoorSchemaInfer } from '@pryzm/plugin-sdk';

/** Door DTO inferred from the canonical Zod schema. */
export type DoorData = DoorSchemaInfer;

/** Branded door id — the underlying Map keys are still plain strings. */
export type DoorId = DoorData['id'];

/** Per-store record view handed to handlers via `ctx.stores.door`. */
export type DoorsState = Record<string, DoorData>;

export class DoorStore extends Store<DoorData> {
  constructor() {
    super('door');
  }

  /** Convenience read — every door id currently in the store. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Convenience read — every door hosted by a given wall.  O(N). */
  byWall(wallId: string): readonly DoorData[] {
    const out: DoorData[] = [];
    for (const d of this.state.values()) {
      if (d.wallId === wallId) out.push(d);
    }
    return out;
  }

  /** Lookup by id; returns `undefined` when missing. */
  get(id: string): Readonly<DoorData> | undefined {
    return this.state.get(id);
  }
}
