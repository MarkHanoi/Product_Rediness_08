// CreateWallBatchHandler — create multiple walls atomically in one command (P2c).
//
// `wall.batch.create` — batch-creates an arbitrary list of walls whose specs
// are fully resolved by the caller.  Designed for AI-generated batches
// (e.g. CreateWallsOnAllSlabsCommand migration) and for any tool that needs
// to commit N walls in one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `walls` — one CreateWallPayload per wall to create.  The same
//     per-wall validation rules as CreateWallHandler apply to each entry.
//   • `levelId` — default levelId applied to any wall whose payload does
//     not supply its own `levelId`.  Optional; walls without a levelId (and
//     no default supplied) store an empty string (S07 allowance).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch for
// the whole set — undoing a "batch create walls" gesture is one stack pop,
// not N pops.
//
// VALIDATION strategy mirrors CreateWallHandler:
//   • Per-wall `height` and `thickness` bounds checked at canExecute time.
//   • Optional systemTypeId validation when the catalogue is wired.
//   • Schema-level parse failures surface as WallSchemaError (thrown outward
//     so the bus does NOT push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Wall, createId } from '@pryzm/plugin-sdk';
import {
  WallDimensionsError,
  WallSchemaError,
  WallSystemTypeNotFoundError,
} from '../errors.js';
import type { WallData, WallsState } from '../store.js';
import type { WallSystemTypeStore } from '../system-type-store.js';
import type { CreateWallPayload } from './CreateWall.js';

export interface CreateWallBatchPayload {
  /** One spec per wall to create.  Must be a non-empty array. */
  readonly walls: readonly CreateWallPayload[];
  /** Default levelId applied to any wall entry that omits its own `levelId`.
   *  Optional — walls with no levelId and no batch-level default store `''`
   *  (S07 allowance; 1C tightens this to a non-empty branded id). */
  readonly levelId?: string;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class CreateWallBatchHandler
  implements CommandHandler<CreateWallBatchPayload, WallHandlerStores>
{
  readonly type = 'wall.batch.create';
  readonly affectedStores = ['wall'] as const;

  /** Optional `WallSystemTypeStore` reference.  When supplied, any
   *  `wall.systemTypeId` in each payload entry is validated against the
   *  catalogue at `canExecute` time.  Omitting it preserves S07 behaviour. */
  constructor(private readonly systemTypeStore?: WallSystemTypeStore) {}

  canExecute(
    _ctx: HandlerContext<WallHandlerStores>,
    cmd: CreateWallBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.walls) || cmd.walls.length === 0) {
      return { valid: false, reason: 'walls must be a non-empty array' };
    }
    for (let i = 0; i < cmd.walls.length; i++) {
      const w = cmd.walls[i]!;
      if (w.height !== undefined && (!Number.isFinite(w.height) || w.height <= 0)) {
        return { valid: false, reason: `walls[${i}].height must be > 0` };
      }
      if (w.thickness !== undefined && (!Number.isFinite(w.thickness) || w.thickness < 0.05)) {
        return { valid: false, reason: `walls[${i}].thickness must be ≥ 0.05 m` };
      }
      if (w.id !== undefined && (typeof w.id !== 'string' || w.id.length === 0)) {
        return { valid: false, reason: `walls[${i}].id must be a non-empty string when provided` };
      }
      if (
        w.systemTypeId !== undefined &&
        this.systemTypeStore !== undefined &&
        !this.systemTypeStore.has(w.systemTypeId)
      ) {
        return {
          valid: false,
          reason: `walls[${i}]: unknown systemTypeId: ${w.systemTypeId}`,
        };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WallHandlerStores>, cmd: CreateWallBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const defaultLevelId = cmd.levelId ?? '';
    const fresh: WallData[] = [];

    for (let i = 0; i < cmd.walls.length; i++) {
      const w = cmd.walls[i]!;

      // Race-defensive systemTypeId re-check (catalogue may have mutated
      // between canExecute and execute in a concurrent session).
      if (
        w.systemTypeId !== undefined &&
        this.systemTypeStore !== undefined &&
        !this.systemTypeStore.has(w.systemTypeId)
      ) {
        throw new WallSystemTypeNotFoundError(w.systemTypeId);
      }

      const id = w.id ?? createId('wall');

      // Materialise the wall via the canonical schema — fills in defaults.
      let wall: WallData;
      try {
        wall = Wall.parse({
          id,
          levelId: w.levelId ?? defaultLevelId,
          ...(w.baseLine !== undefined ? { baseLine: w.baseLine } : {}),
          ...(w.height !== undefined ? { height: w.height } : {}),
          ...(w.thickness !== undefined ? { thickness: w.thickness } : {}),
          ...(w.baseOffset !== undefined ? { baseOffset: w.baseOffset } : {}),
          ...(w.materialColor !== undefined ? { materialColor: w.materialColor } : {}),
          ...(w.materialId !== undefined ? { materialId: w.materialId } : {}),
          ...(w.systemTypeId !== undefined ? { systemTypeId: w.systemTypeId } : {}),
        }) as WallData;
      } catch (cause) {
        throw new WallSchemaError(
          `wall.batch.create rejected — schema validation failed for walls[${i}] (id=${id})`,
          cause,
        );
      }

      // MIN_WALL_LEN invariant — surfaces a typed error for explicit baseLines.
      if (w.baseLine !== undefined) {
        const [a, b] = w.baseLine;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        if (Math.hypot(dx, dz) < 0.05) {
          throw new WallDimensionsError(
            `wall.batch.create rejected — walls[${i}] baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.`,
          );
        }
      }

      fresh.push(wall);
    }

    // One Immer batch for the whole set — single undo-stack entry.
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      for (const w of fresh) draft[w.id] = w;
    });

    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
