// PoolStore / WaterStore — pure DTO stores for the pool assembly.
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124
//
// Mirrors `plugins/slab/src/store.ts`: THREE-free, self-contained, validation at the
// handler boundary.
//
// NOTE ON STORE OWNERSHIP (C03 §3.2 — one owner per slice): the pool's WALLS live in
// the WALL store and its FLOOR lives in the SLAB store. They are not copied in here.
// That is the whole point of the ticket — a pool wall IS a wall, so it must be in the
// wall store, where the schedule, the IFC exporter, the material dispatcher and the
// wall-join resolver will all find it. The pool record owns them by `childrenIds`,
// not by containment.

import { Store } from '@pryzm/plugin-sdk';
import type { Pool as PoolSchemaInfer, Water as WaterSchemaInfer } from '@pryzm/plugin-sdk';

/** Pool DTO inferred from the canonical Zod schema. */
export type PoolData = PoolSchemaInfer;
/** Water DTO inferred from the canonical Zod schema. */
export type WaterData = WaterSchemaInfer;

export type PoolId = PoolData['id'];
export type WaterId = WaterData['id'];

/** Per-store record views handed to handlers via `ctx.stores.pool` / `.water`. */
export type PoolsState = Record<string, PoolData>;
export type WatersState = Record<string, WaterData>;

export class PoolStore extends Store<PoolData> {
  constructor() {
    super('pool');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Every pool on a given level. O(N). */
  byLevel(levelId: string): readonly PoolData[] {
    const out: PoolData[] = [];
    for (const p of this.state.values()) if (p.levelId === levelId) out.push(p);
    return out;
  }

  /** Every pool cut into a given host slab — the reverse index the slab needs when
   *  it is deleted (a slab cannot vanish under a pool and leave it floating). */
  byHostSlab(slabId: string): readonly PoolData[] {
    const out: PoolData[] = [];
    for (const p of this.state.values()) if (p.hostSlabId === slabId) out.push(p);
    return out;
  }

  get(id: string): Readonly<PoolData> | undefined {
    return this.state.get(id);
  }
}

export class WaterStore extends Store<WaterData> {
  constructor() {
    super('water');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** The water held by a given pool. */
  byPool(poolId: string): readonly WaterData[] {
    const out: WaterData[] = [];
    for (const w of this.state.values()) if (w.poolId === poolId) out.push(w);
    return out;
  }

  get(id: string): Readonly<WaterData> | undefined {
    return this.state.get(id);
  }
}
