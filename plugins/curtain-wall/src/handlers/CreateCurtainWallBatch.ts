// CreateCurtainWallBatchHandler — create multiple curtain walls atomically (P2e).
//
// `curtain-wall.batch.create` — batch-creates an arbitrary list of curtain walls
// whose specs are fully resolved by the caller.  Designed for AI-generated batches
// (e.g. CreateCurtainWallsOnAllSlabsCommand migration) and for any tool that needs
// to commit N curtain walls in one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `curtainWalls` — one CreateCurtainWallPayload per wall to create.  The same
//     per-wall validation rules as CreateCurtainWallHandler apply to each entry.
//   • `height` — optional default height applied to any entry that omits its own.
//   • `slabId`, `levelId` — routing hints for future slab-aware handler variants;
//     currently unused by this handler (resolved by caller before dispatch).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch for
// the whole set — undoing a "batch create curtain walls" gesture is one stack pop.
//
// VALIDATION strategy mirrors CreateCurtainWallHandler:
//   • Per-wall dimension fields checked at canExecute time.
//   • Schema-level parse failures surface as CurtainWallSchemaError (thrown outward
//     so the bus does NOT push a partial batch to the undo stack).
//
// REFERENCE: mirrors CreateWallBatchHandler in plugins/wall/src/handlers/CreateWallBatch.ts

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWall, createId } from '@pryzm/plugin-sdk';
import { CurtainWallGeometryError, CurtainWallSchemaError } from '../errors.js';
import type { CurtainWallData, CurtainWallsState } from '../store.js';
import { isFiniteVec3, isNonZeroBaseLine } from '../intent.js';
import type { CreateCurtainWallPayload } from './CreateCurtainWall.js';

export interface CreateCurtainWallBatchPayload {
  /** One spec per curtain wall to create.  Must be a non-empty array when provided. */
  readonly curtainWalls?: readonly CreateCurtainWallPayload[];
  /** Optional default height applied to any entry that omits its own `height`. */
  readonly height?: number;
  /** Routing hint — slab from which specs were derived (informational; not used here). */
  readonly slabId?: string;
  /** Routing hint — level scope (informational; not used here). */
  readonly levelId?: string;
}

type CWBatchStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class CreateCurtainWallBatchHandler
  implements CommandHandler<CreateCurtainWallBatchPayload, CWBatchStores>
{
  readonly type = 'curtain-wall.batch.create';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(
    _ctx: HandlerContext<CWBatchStores>,
    cmd: CreateCurtainWallBatchPayload,
  ): ValidationResult {
    const walls = cmd.curtainWalls;
    if (walls === undefined || walls.length === 0) {
      // Empty or absent curtainWalls is a no-op, not an error — callers may
      // dispatch before slabs are resolved (e.g. during migration warm-up).
      return { valid: true };
    }
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i]!;
      if (w.baseLine !== undefined) {
        const [a, b] = w.baseLine;
        if (!isFiniteVec3(a) || !isFiniteVec3(b)) {
          return { valid: false, reason: `curtainWalls[${i}].baseLine endpoints must be finite Vec3` };
        }
        if (!isNonZeroBaseLine(a, b)) {
          return { valid: false, reason: `curtainWalls[${i}].baseLine endpoints must differ` };
        }
      }
      for (const k of ['height', 'mullionThickness', 'bayWidth', 'bayHeight'] as const) {
        const v = w[k];
        if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
          return { valid: false, reason: `curtainWalls[${i}].${k} must be > 0` };
        }
      }
      if (w.id !== undefined && (typeof w.id !== 'string' || w.id.length === 0)) {
        return { valid: false, reason: `curtainWalls[${i}].id must be a non-empty string when provided` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWBatchStores>, cmd: CreateCurtainWallBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const walls = cmd.curtainWalls;
    const defaultHeight = cmd.height ?? 3;

    // No-op: empty or absent curtainWalls — return identity patches.
    if (!walls || walls.length === 0) {
      const [next, forward, inverse] = produceCommand<CurtainWallsState>(
        ctx.stores.curtainwall,
        () => { /* no mutation */ },
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    }

    const fresh: CurtainWallData[] = [];

    for (let i = 0; i < walls.length; i++) {
      const w = walls[i]!;
      const id = (w.id ?? createId('curtainwall')) as CurtainWallData['id'];

      const seed: Partial<CurtainWallData> = {
        id,
        levelId: w.levelId ?? '',
        height: w.height ?? defaultHeight,
        mullionThickness: w.mullionThickness ?? 0.05,
        bayWidth: w.bayWidth ?? 1.2,
        bayHeight: w.bayHeight ?? 1.5,
        panels: w.panels ?? [],
        materialId: w.materialId ?? w.systemTypeId,
      };
      if (w.baseLine) seed.baseLine = w.baseLine;

      if (seed.baseLine && !isNonZeroBaseLine(seed.baseLine[0], seed.baseLine[1])) {
        throw new CurtainWallGeometryError(
          `curtain-wall.batch.create rejected — curtainWalls[${i}] baseLine endpoints must differ.`,
        );
      }

      let cw: CurtainWallData;
      try {
        cw = CurtainWall.parse(seed);
      } catch (cause) {
        throw new CurtainWallSchemaError(
          `curtain-wall.batch.create rejected — schema validation failed for curtainWalls[${i}] (id=${id})`,
        );
      }

      fresh.push(cw);
    }

    // One Immer batch for the whole set — single undo-stack entry.
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => {
      for (const cw of fresh) draft[cw.id] = cw;
    });

    console.log(`[CommandBus] DISPATCH: curtain-wall.batch.create — ${fresh.length} curtain wall(s) committed to plugin store`);
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
