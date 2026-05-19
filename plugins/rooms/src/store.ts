// RoomStore — pure DTO store for the room element family (S25).
//
// Mirrors `plugins/slab/src/store.ts`: THREE-free, self-contained,
// validation-at-handler-boundary.  Wall→room cascades flow through
// `plugins/cross/wall-room.ts` (S26); this store does NOT subscribe
// to the wall store directly.

import { Store } from '@pryzm/plugin-sdk';
import type { Room as RoomSchemaInfer } from '@pryzm/plugin-sdk';

/** Room DTO inferred from the canonical Zod schema. */
export type RoomData = RoomSchemaInfer;

/** Branded room id — the underlying Map keys are still plain strings. */
export type RoomId = RoomData['id'];

/** Per-store record view handed to handlers via `ctx.stores.room`. */
export type RoomsState = Record<string, RoomData>;

export class RoomStore extends Store<RoomData> {
  constructor() {
    super('room');
  }

  /** Convenience read — every room id currently in the store. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Convenience read — every room on a given level.  O(N). */
  byLevel(levelId: string): readonly RoomData[] {
    const out: RoomData[] = [];
    for (const r of this.state.values()) {
      if (r.levelId === levelId) out.push(r);
    }
    return out;
  }

  /** Lookup by id; returns `undefined` when missing. */
  get(id: string): Readonly<RoomData> | undefined {
    return this.state.get(id);
  }
}
