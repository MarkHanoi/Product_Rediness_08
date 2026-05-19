// CreateColumnBatchHandler — create multiple columns atomically in one command (§A28).
//
// `column.batch.create` — batch-creates an arbitrary list of columns whose
// specs are fully resolved by the caller.  Designed for AI structural-layout
// batches (e.g. grid-based column placement) and any tool that needs to
// commit N columns as one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `columns` — one CreateColumnPayload per column.  Same per-entry
//     validation rules as CreateColumnHandler apply.
//   • `levelId` — default levelId applied to any entry that omits its own.
//     Optional; entries without a levelId store `''` (S07 allowance).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch —
// undoing a "batch create columns" gesture is one stack pop, not N pops.
//
// VALIDATION strategy mirrors CreateColumnHandler:
//   • Per-entry origin, width, depth, height bounds + circular constraint
//     checked at canExecute time.
//   • Schema failures surface as ColumnSchemaError (thrown so the bus does
//     NOT push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Column, createId } from '@pryzm/plugin-sdk';
import { ColumnDimensionsError, ColumnSchemaError } from '../errors.js';
import type { ColumnData, ColumnsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';
import type { CreateColumnPayload } from './CreateColumn.js';

export interface CreateColumnBatchPayload {
  /** One spec per column to create.  Must be a non-empty array. */
  readonly columns: readonly CreateColumnPayload[];
  /** Default levelId applied to any entry that omits its own `levelId`.
   *  Optional — entries with no levelId and no batch-level default store `''`
   *  (S07 allowance). */
  readonly levelId?: string;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class CreateColumnBatchHandler
  implements CommandHandler<CreateColumnBatchPayload, ColumnHandlerStores>
{
  readonly type = 'column.batch.create';
  readonly affectedStores = ['column'] as const;

  canExecute(
    _ctx: HandlerContext<ColumnHandlerStores>,
    cmd: CreateColumnBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.columns) || cmd.columns.length === 0) {
      return { valid: false, reason: 'columns must be a non-empty array' };
    }
    for (let i = 0; i < cmd.columns.length; i++) {
      const c = cmd.columns[i]!;
      if (c.id !== undefined && (typeof c.id !== 'string' || c.id.length === 0)) {
        return { valid: false, reason: `columns[${i}].id must be a non-empty string when provided` };
      }
      if (c.origin !== undefined && !isFiniteVec3(c.origin)) {
        return { valid: false, reason: `columns[${i}].origin must have finite x, y, z` };
      }
      if (c.width !== undefined && (!Number.isFinite(c.width) || c.width <= 0)) {
        return { valid: false, reason: `columns[${i}].width must be > 0` };
      }
      if (c.depth !== undefined && (!Number.isFinite(c.depth) || c.depth <= 0)) {
        return { valid: false, reason: `columns[${i}].depth must be > 0` };
      }
      if (c.height !== undefined && (!Number.isFinite(c.height) || c.height <= 0)) {
        return { valid: false, reason: `columns[${i}].height must be > 0` };
      }
      if (
        c.shape === 'circular' &&
        c.width !== undefined &&
        c.depth !== undefined &&
        c.width !== c.depth
      ) {
        return {
          valid: false,
          reason: `columns[${i}]: circular column requires width === depth`,
        };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: CreateColumnBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const defaultLevelId = cmd.levelId ?? '';
      const fresh: ColumnData[] = [];

      for (let i = 0; i < cmd.columns.length; i++) {
        const c = cmd.columns[i]!;
        const id = (c.id ?? createId('column')) as ColumnData['id'];

        const shape = c.shape ?? 'rectangular';
        const width = c.width ?? 0.4;
        const depth = c.depth ?? 0.4;

        // Race-defensive circular constraint re-check.
        if (shape === 'circular' && width !== depth) {
          throw new ColumnDimensionsError('circular column requires width === depth');
        }

        const seed: Partial<ColumnData> = {
          id,
          levelId: c.levelId ?? defaultLevelId,
          topLevelId: c.topLevelId,
          origin: c.origin ?? { x: 0, y: 0, z: 0 },
          shape,
          width,
          depth,
          height: c.height ?? 3,
          baseOffset: c.baseOffset ?? 0,
          rotation: c.rotation ?? 0,
          materialId: c.materialId ?? c.systemTypeId,
        };

        let column: ColumnData;
        try {
          column = Column.parse(seed) as ColumnData;
        } catch (parseErr) {
          throw new ColumnSchemaError(
            new Error(`column.batch.create — columns[${i}] (id=${id})`, { cause: parseErr as Error }),
          );
        }

        fresh.push(column);
      }

      // One Immer batch for the whole set — single undo-stack entry.
      const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, draft => {
        for (const c of fresh) draft[c.id] = c;
      });

      return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
