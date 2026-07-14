// DeletePoolHandler — deleting a pool HEALS the slab.
//
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124 §6 · C16 §3 (delete/lifecycle)
//
// ═══════════════════════════════════════════════════════════════════════════════
// "AN ORPHANED HOLE IN A FLOOR PLATE IS WORSE THAN NO FEATURE." — the ticket.
// ═══════════════════════════════════════════════════════════════════════════════
//
// THE DELETE IS A RECONCILIATION, NOT A FIRE-AND-FORGET. It removes the pool, its N
// walls, its floor slab and its water, **and it closes the hole in the host slab**,
// all in ONE undo entry.
//
// This is not a hypothetical failure mode — it is a bug that is IN THE TREE RIGHT NOW,
// and the pool is not allowed to repeat it:
//
//   `CreateStairCommand` punches an opening in the slab above it
//   (`openingStore.add(...)`, CreateStairCommand.ts:473) and its `undo()` correctly
//   removes it. But `DeleteStairCommand` contains ZERO references to openings — it
//   removes railings, landings and the stair, and **leaves the void punched through
//   the floor plate forever**. Nothing else reaps it: `OpeningCleanupHandler` listens
//   only for `bim-level-removed` / `bim-slab-removed`, never `bim-stair-removed`.
//
//   Delete a stair today and you are left with a hole in your floor. That is exactly
//   the defect this handler exists to not have. (Reported separately — see the L-292
//   report; fixing DeleteStairCommand is not in this ticket's blast radius.)
//
// There is no generic "when X is deleted also delete Y" registry in PRYZM to lean on
// (`plugins/cross` explicitly refuses delete cascades — see stair-handrail.ts:27-30),
// so the cascade is written HERE, explicitly, in the one command that owns it.

import {
  produceMultiStoreCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { PoolNotFoundError } from '../errors.js';
import type { PoolsState, WatersState } from '../store.js';

export interface DeletePoolPayload {
  readonly poolId: string;
}

type PoolHandlerStores = Readonly<
  {
    pool: PoolsState;
    wall: Record<string, unknown>;
    slab: Record<string, { holes?: { x: number; y: number; z: number }[][] }>;
    water: WatersState;
  } & Record<string, unknown>
>;

/** Two hole loops are the same loop if their vertices match to within a tolerance.
 *  Exact float equality would be brittle across a persist/reload round-trip. */
const EPS = 1e-6;
function sameLoop(
  a: readonly { x: number; y: number; z: number }[],
  b: readonly { x: number; y: number; z: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (Math.abs(p.x - q.x) > EPS || Math.abs(p.y - q.y) > EPS || Math.abs(p.z - q.z) > EPS) return false;
  }
  return true;
}

export class DeletePoolHandler implements CommandHandler<DeletePoolPayload, PoolHandlerStores> {
  readonly type = 'pool.delete';

  /** The same four stores the create touched — the delete must be able to undo it. */
  readonly affectedStores = ['pool', 'wall', 'slab', 'water'] as const;

  canExecute(ctx: HandlerContext<PoolHandlerStores>, cmd: DeletePoolPayload): ValidationResult {
    if (!ctx.stores.pool[cmd.poolId]) {
      return { valid: false, reason: `pool not found: ${cmd.poolId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<PoolHandlerStores>, cmd: DeletePoolPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const pool = ctx.stores.pool[cmd.poolId];
      if (!pool) throw new PoolNotFoundError(cmd.poolId);

      // The pool's children are ITS OWN RECORD's `childrenIds` — no O(N) scan of every
      // wall in the project looking for `parentId === poolId`, and no guessing. This is
      // why the assembly link is stored on BOTH ends (ADR-0124 §3).
      const childIds = new Set(pool.childrenIds);
      const hostSlabId = pool.hostSlabId;

      // The hole this pool cut. We match it by GEOMETRY against the pool's own
      // boundary, because that is what `buildPoolAssembly` used to punch it — one
      // polygon, one source of truth. Removing "the last hole" or "hole[i]" would be
      // wrong the moment a slab carries a second pool or a stair void.
      const host = ctx.stores.slab[hostSlabId];
      const holesBefore = host?.holes ?? [];
      const holesAfter = holesBefore.filter((loop) => !sameLoop(loop, pool.boundary));

      const out = produceMultiStoreCommand(
        {
          pool: ctx.stores.pool,
          wall: ctx.stores.wall,
          slab: ctx.stores.slab,
          water: ctx.stores.water,
        },
        {
          pool: (d) => {
            delete (d as Record<string, unknown>)[cmd.poolId];
          },
          wall: (d) => {
            const draft = d as Record<string, unknown>;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          slab: (d) => {
            const draft = d as Record<string, { holes?: unknown[] }>;
            // (a) the pool FLOOR goes with the pool.
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
            // (b) ── HEAL THE HOST SLAB ──────────────────────────────────────────
            // Whole-array replace (same reason as CreatePool — a deep patch does not
            // survive the legacy undo adapter). The floor plate closes up.
            const h = draft[hostSlabId];
            if (h) h.holes = holesAfter as unknown[];
          },
          water: (d) => {
            const draft = d as Record<string, unknown>;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
        },
      );

      return {
        forward: out.forward,
        inverse: out.inverse,
        nextStates: out.nextStates,
      };
    }); // withHandlerSpan — CA-14 / C10 §2
  }
}
