// CreateCeilingBatchHandler — create multiple ceilings atomically in one command (§A28).
//
// `ceiling.batch.create` — batch-creates an arbitrary list of ceilings whose
// specs are fully resolved by the caller.  Designed for AI floor-plan batches
// (e.g. ceiling auto-generation per room) and for any tool that needs to
// commit N ceilings as one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `ceilings` — one CreateCeilingPayload per ceiling.  Same per-entry
//     validation rules as CreateCeilingHandler apply to each entry.
//   • `levelId` — default levelId applied to any entry that omits its own.
//     Optional; entries without a levelId store `''` (S07 allowance).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch —
// undoing a "batch create ceilings" gesture is one stack pop, not N.
//
// VALIDATION strategy mirrors CreateCeilingHandler:
//   • Per-entry `thickness`, `ceilingHeight`, and `boundary` bounds checked
//     at `canExecute` time.
//   • Schema failures surface as CeilingSchemaError (thrown so the bus does
//     NOT push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Ceiling, createId } from '@pryzm/plugin-sdk';
import {
  CeilingGeometryError,
  CeilingSchemaError,
} from '../errors.js';
import type { CeilingData, CeilingsState } from '../store.js';
import { validateCeilingBoundary } from '../intent.js';
import type { CreateCeilingPayload } from './CreateCeiling.js';

export interface CreateCeilingBatchPayload {
  /** One spec per ceiling to create.  Must be a non-empty array. */
  readonly ceilings: readonly CreateCeilingPayload[];
  /** Default levelId applied to any entry that omits its own `levelId`.
   *  Optional — entries with no levelId and no batch-level default store `''`
   *  (S07 allowance). */
  readonly levelId?: string;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class CreateCeilingBatchHandler
  implements CommandHandler<CreateCeilingBatchPayload, CeilingHandlerStores>
{
  readonly type = 'ceiling.batch.create';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(
    _ctx: HandlerContext<CeilingHandlerStores>,
    cmd: CreateCeilingBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.ceilings) || cmd.ceilings.length === 0) {
      return { valid: false, reason: 'ceilings must be a non-empty array' };
    }
    for (let i = 0; i < cmd.ceilings.length; i++) {
      const c = cmd.ceilings[i]!;
      if (c.id !== undefined && (typeof c.id !== 'string' || c.id.length === 0)) {
        return { valid: false, reason: `ceilings[${i}].id must be a non-empty string when provided` };
      }
      if (c.ceilingHeight !== undefined && (!Number.isFinite(c.ceilingHeight) || c.ceilingHeight <= 0)) {
        return { valid: false, reason: `ceilings[${i}].ceilingHeight must be > 0` };
      }
      if (c.thickness !== undefined && (!Number.isFinite(c.thickness) || c.thickness <= 0)) {
        return { valid: false, reason: `ceilings[${i}].thickness must be > 0` };
      }
      if (
        c.thickness !== undefined &&
        c.ceilingHeight !== undefined &&
        c.thickness >= c.ceilingHeight
      ) {
        return { valid: false, reason: `ceilings[${i}].thickness must be < ceilingHeight` };
      }
      if (c.boundary !== undefined) {
        const v = validateCeilingBoundary(c.boundary);
        if (!v.ok) return { valid: false, reason: `ceilings[${i}].boundary: ${v.reason ?? 'invalid'}` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: CreateCeilingBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const defaultLevelId = cmd.levelId ?? '';
      const fresh: CeilingData[] = [];

      for (let i = 0; i < cmd.ceilings.length; i++) {
        const c = cmd.ceilings[i]!;
        const id = (c.id ?? createId('ceiling')) as unknown as CeilingData['id'];

        const ceilingHeight = c.ceilingHeight ?? 2.7;
        const thickness = c.thickness ?? 0.05;

        // Race-defensive re-checks.
        if (thickness >= ceilingHeight) {
          throw new CeilingGeometryError(`ceilings[${i}]: thickness must be < ceilingHeight`);
        }
        if (c.boundary !== undefined) {
          const v = validateCeilingBoundary(c.boundary);
          if (!v.ok) throw new CeilingGeometryError(`ceilings[${i}].boundary: ${v.reason ?? 'invalid'}`);
        }

        const seed: Partial<CeilingData> = {
          id,
          levelId: c.levelId ?? defaultLevelId,
          ceilingHeight,
          thickness,
          materialId: c.materialId,
          materialColor: c.materialColor,
        };
        if (c.boundary) seed.boundary = c.boundary;

        let ceiling: CeilingData;
        try {
          ceiling = Ceiling.parse(seed) as CeilingData;
        } catch (parseErr) {
          throw new CeilingSchemaError(
            new Error(`ceiling.batch.create — ceilings[${i}] (id=${id})`, { cause: parseErr as Error }),
          );
        }

        fresh.push(ceiling);
      }

      // One Immer batch for the whole set — single undo-stack entry.
      const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, draft => {
        for (const c of fresh) (draft as Record<string, CeilingData>)[c.id] = c;
      });

      return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
