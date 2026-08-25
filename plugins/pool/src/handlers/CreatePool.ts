// CreatePoolHandler — ONE gesture, ONE undo entry, FOUR kinds of part.
//
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124 · C16 §8.6 · C11 §11.2
//
// ═══════════════════════════════════════════════════════════════════════════════
// THIS IS THE WHOLE TICKET. READ THE UNDO ARGUMENT BEFORE CHANGING ANYTHING.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Creating a pool touches FOUR stores:
//
//     pool   ← the assembly parent (new)
//     wall   ← N pool walls, NEGATIVE baseOffset               (new)
//     slab   ← the pool floor (new)  **AND the HOST slab's `holes` (MUTATED)**
//     water  ← the water body (new)
//
// C16 §8.6 B-6 is unambiguous and was measured, not assumed:
//
//   > "One gesture = one undo entry" is bought by dispatching ONE command (one
//   >  produceCommand → one Immer patch pair → one ring entry). It is NEVER bought
//   >  by holding a batch open. `runBatch()` is UNDO-NEUTRAL.
//
// So this is ONE command — not four, and not four wrapped in a `runBatch`, which
// would still cost the user four Ctrl+Zs.
//
// ── AND HERE IS THE PART THE TICKET GOT WRONG, WHICH IS WORTH SPELLING OUT ─────
// The brief said to use the `*.batch.create` chokepoint. That chokepoint works for
// `wall.batch.create` because it is SINGLE-STORE — every wall lands in the wall
// store, so `produceCommand(ctx.stores.wall, …)` covers the whole gesture.
//
// A pool spans FOUR stores, and a multi-store command routes its patches by
// `path[0] === storeKey` (CommandBus.ts:327 + `applyRingBufferSide`; the §U-B6 guard
// hard-errors otherwise). `produceCommand` / `produceWithPatchesPerStore` emit
// store-RELATIVE paths, so their patches route to NOTHING and Ctrl+Z silently does
// nothing at all.
//
// `produceMultiStoreCommand()` (@pryzm/command-bus) is the chokepoint that gets this
// right. It is the ONLY correct way to author this handler. See the routing-convention
// header in command-bus/src/produceCommand.ts.
//
// ── WHY THE HOST HOLE IS A WHOLE-ARRAY REPLACE, NOT A `push` ───────────────────
// `s.holes.push(loop)` produces a DEEP patch (`path: [slabId,'holes',N]`). The legacy
// undo adapter (`elementUndoStoreAdapter`) collapses deep sub-paths to the top field
// and would call `slabStore.update(slabId, { holes: undefined })` on undo — wiping
// EVERY hole on that slab, not just the pool's. (That is a live latent defect in
// `slab.addHole`, which does `push`. Reported, not fixed here — it is not my file.)
//
// Assigning the WHOLE array (`s.holes = [...s.holes, loop]`) produces
// `{op:'replace', path:[slabId,'holes'], value:<newArray>}` forward and the SAME path
// with `<oldArray>` inverse. The adapter's field branch then restores the host slab's
// holes EXACTLY. **That is what makes "Ctrl-Z heals the slab" true rather than hopeful.**

import {
  produceMultiStoreCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { buildPoolAssembly, type PoolSystemType } from '@pryzm/geometry-pool';
import { Pool } from '@pryzm/plugin-sdk';
import { PoolNotFoundError, PoolHostSlabError, PoolBoundaryError } from '../errors.js';
import type { PoolData, PoolsState, WatersState } from '../store.js';

/**
 * The payload. Every id is PRE-MINTED by the caller (the tool), never generated in
 * here — CA-2: ids MUST be identical across redo, and `execute()` runs again on redo.
 * Minting inside would give a DIFFERENT pool on redo, silently.
 */
export interface CreatePoolPayload {
  readonly poolId: string;
  readonly levelId: string;
  readonly hostSlabId: string;
  /** Plan outline, WORLD coords, OPEN loop. */
  readonly boundary: readonly { x: number; y: number; z: number }[];
  /** Pre-minted, one per boundary EDGE. */
  readonly wallIds: readonly string[];
  readonly floorSlabId: string;
  readonly waterId: string;
  /** Optional parametric overrides — unset resolves via systemType → default. */
  readonly depth?: number;
  readonly wallThickness?: number;
  readonly floorThickness?: number;
  readonly freeboard?: number;
  readonly systemTypeId?: string;
  readonly materialId?: string;
  /**
   * §POOL95 — the WATER's authored render intent (tier 1). Distinct from
   * `materialId`, which is the BASIN's construction finish: see the field
   * docstrings on `Pool`. Carried here so an authored appearance survives the
   * dispatch — without it tier 1 is reachable in the model and unreachable
   * through the bus, which is a dead tier with extra steps.
   */
  readonly waterColor?: string;
  readonly waterOpacity?: number;
  /** Resolved system type (tier 2 of the dimension chain). */
  readonly systemType?: PoolSystemType;
}

/** The stores a pool touches. All four MUST be declared — see the header. */
type PoolHandlerStores = Readonly<
  {
    pool: PoolsState;
    wall: Record<string, unknown>;
    slab: Record<string, { holes: { x: number; y: number; z: number }[] }>;
    water: WatersState;
  } & Record<string, unknown>
>;

// eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: this command
// REALLY writes four stores; declaring fewer drops the undeclared stores' patches
// from undo routing (Ctrl+Z would remove the pool but leave the hole in the floor).
// The rule has no multi-store option; the declaration below is the truth.
export class CreatePoolHandler implements CommandHandler<CreatePoolPayload, PoolHandlerStores> {
  readonly type = 'pool.create';

  /**
   * CA-6 / §U-B6. FOUR stores, because the command really does write four. Declaring
   * fewer would silently DROP the undeclared store's patches from undo routing —
   * Ctrl+Z would then remove the pool but LEAVE THE HOLE IN THE FLOOR, which the
   * ticket names as "worse than no feature".
   */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: this command
  // REALLY writes four stores; declaring fewer drops the undeclared stores' patches
  // from undo routing (Ctrl+Z would remove the pool but leave the hole in the
  // floor). The rule has no multi-store option; the declaration is the truth.
  readonly affectedStores = ['pool', 'wall', 'slab', 'water'] as const;

  canExecute(ctx: HandlerContext<PoolHandlerStores>, cmd: CreatePoolPayload): ValidationResult {
    if (typeof cmd.poolId !== 'string' || cmd.poolId.length === 0) {
      return { valid: false, reason: 'poolId must be a non-empty string' };
    }
    if (ctx.stores.pool[cmd.poolId]) {
      return { valid: false, reason: `duplicate pool id: ${cmd.poolId}` };
    }
    // CA-3 — the HOST must exist. A pool with no slab to cut into is not a pool; it
    // is a hole in the air. Fail BEFORE any mutation.
    if (!ctx.stores.slab[cmd.hostSlabId]) {
      return { valid: false, reason: `host slab not found: ${cmd.hostSlabId}` };
    }
    if (!Array.isArray(cmd.boundary) || cmd.boundary.length < 3) {
      return { valid: false, reason: 'pool boundary needs ≥ 3 vertices' };
    }
    if (cmd.wallIds.length !== cmd.boundary.length) {
      return {
        valid: false,
        reason: `expected ${cmd.boundary.length} pre-minted wall ids (one per boundary edge), got ${cmd.wallIds.length}`,
      };
    }
    // CA-3 — geometry non-degenerate. The Pool schema refines this too, but failing
    // here means we fail with a `reason` instead of throwing mid-mutation.
    const parsed = Pool.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? 'invalid pool' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<PoolHandlerStores>, cmd: CreatePoolPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const host = ctx.stores.slab[cmd.hostSlabId];
      if (!host) throw new PoolHostSlabError(`host slab not found: ${cmd.hostSlabId}`);

      const parsed = Pool.safeParse(this._recordOf(cmd));
      if (!parsed.success) throw new PoolBoundaryError(parsed.error.issues[0]?.message ?? 'invalid pool');
      const pool: PoolData = parsed.data;

      // The PURE assembly (@pryzm/geometry-pool). Every dimension it uses resolves
      // through `resolvePoolDimensions()` — record → systemType → documented default.
      // There is not a single dimensional literal below, and the no-literals guard
      // in geometry-pool enforces that at source level.
      const asm = buildPoolAssembly(
        pool,
        { wallIds: cmd.wallIds, floorSlabId: cmd.floorSlabId, waterId: cmd.waterId },
        cmd.systemType,
      );

      // The pool OWNS its parts (ADR-0124 §3): childrenIds on the parent, parentId on
      // each child (the assembly stamps the latter). One thing to select, edit, delete.
      const poolRecord: PoolData = {
        ...pool,
        childrenIds: [...cmd.wallIds, cmd.floorSlabId, cmd.waterId],
      };

      // ── THE ONE PATCH PAIR ────────────────────────────────────────────────────
      const out = produceMultiStoreCommand(
        {
          pool: ctx.stores.pool,
          wall: ctx.stores.wall,
          slab: ctx.stores.slab,
          water: ctx.stores.water,
        },
        {
          pool: (d) => {
            (d as Record<string, unknown>)[cmd.poolId] = poolRecord;
          },
          wall: (d) => {
            for (const w of asm.walls) (d as Record<string, unknown>)[w.id] = w;
          },
          slab: (d) => {
            const draft = d as Record<string, { holes: unknown[] }>;
            // (a) the pool FLOOR — a real slab.
            draft[cmd.floorSlabId] = asm.floorSlab as unknown as { holes: unknown[] };
            // (b) the HOLE in the HOST slab. WHOLE-ARRAY REPLACE, never `push` —
            //     see the header. This single line is what makes the pool a void in
            //     the floor plate rather than a box sitting on top of it, and its
            //     INVERSE patch is what heals the slab on Ctrl+Z.
            const h = draft[cmd.hostSlabId];
            if (h) h.holes = [...(h.holes ?? []), asm.hostHole];
          },
          water: (d) => {
            (d as Record<string, unknown>)[cmd.waterId] = asm.water;
          },
        },
      );

      return {
        forward: out.forward,
        inverse: out.inverse,
        nextStates: out.nextStates,
      };
    }); // withHandlerSpan — CA-14 / C10 §2, merge-blocking
  }

  /** The pool record as the schema sees it (used by both canExecute and execute so
   *  they cannot disagree about what a valid pool is). */
  private _recordOf(cmd: CreatePoolPayload): unknown {
    return {
      id: cmd.poolId,
      type: 'pool',
      levelId: cmd.levelId,
      hostSlabId: cmd.hostSlabId,
      boundary: cmd.boundary,
      ...(cmd.depth !== undefined ? { depth: cmd.depth } : {}),
      ...(cmd.wallThickness !== undefined ? { wallThickness: cmd.wallThickness } : {}),
      ...(cmd.floorThickness !== undefined ? { floorThickness: cmd.floorThickness } : {}),
      ...(cmd.freeboard !== undefined ? { freeboard: cmd.freeboard } : {}),
      ...(cmd.systemTypeId ? { systemTypeId: cmd.systemTypeId } : {}),
      ...(cmd.materialId ? { materialId: cmd.materialId } : {}),
      // §POOL95 — `!== undefined`, not truthiness: `waterOpacity: 0` is an authored,
      // deliberately invisible water and a truthy test would drop it on the floor
      // here exactly as `||` would drop it in the resolver (WR-4).
      ...(cmd.waterColor !== undefined ? { waterColor: cmd.waterColor } : {}),
      ...(cmd.waterOpacity !== undefined ? { waterOpacity: cmd.waterOpacity } : {}),
    };
  }
}

export { PoolNotFoundError };
