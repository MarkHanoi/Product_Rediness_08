// SetColumnTypeHandler — change a column's structural section (S12-T3).
//
// No `@pryzm/types-builtin/column` catalogue exists yet (planned for
// 1C); for now this handler accepts an explicit shape + section
// dimensions so the editor can switch between rectangular / circular
// / I-section directly.  When the catalogue lands the handler will
// be extended to look up defaults from `systemTypeId`.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ColumnDimensionsError, ColumnNotFoundError } from '../errors.js';
import type { ColumnData, ColumnsState } from '../store.js';

export interface SetColumnTypePayload {
  readonly columnId: string;
  readonly shape?: ColumnData['shape'];
  readonly width?: number;
  readonly depth?: number;
  readonly materialId?: string;
  readonly systemTypeId?: string;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class SetColumnTypeHandler
  implements CommandHandler<SetColumnTypePayload, ColumnHandlerStores>
{
  readonly type = 'column.setType';
  readonly affectedStores = ['column'] as const;

  canExecute(ctx: HandlerContext<ColumnHandlerStores>, cmd: SetColumnTypePayload): ValidationResult {
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    const col = ctx.stores.column[cmd.columnId];
    if (!col) return { valid: false, reason: `column not found: ${cmd.columnId}` };
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.depth !== undefined && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: 'depth must be > 0' };
    }
    const nextShape = cmd.shape ?? col.shape;
    // When setting `shape: 'circular'` the caller must supply BOTH
    // width AND depth explicitly — falling back to the existing
    // rectangular dims would let asymmetric values silently pass.
    if (nextShape === 'circular' && cmd.shape === 'circular') {
      if (cmd.width === undefined || cmd.depth === undefined) {
        return { valid: false, reason: 'setType[circular] requires explicit width AND depth' };
      }
    }
    const nextW = cmd.width ?? col.width;
    const nextD = cmd.depth ?? col.depth;
    if (nextShape === 'circular' && nextW !== nextD) {
      return { valid: false, reason: 'circular column requires width === depth' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: SetColumnTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const col = ctx.stores.column[cmd.columnId];
    if (!col) throw new ColumnNotFoundError(cmd.columnId);
    const nextShape = cmd.shape ?? col.shape;
    if (nextShape === 'circular' && cmd.shape === 'circular') {
      if (cmd.width === undefined || cmd.depth === undefined) {
        throw new ColumnDimensionsError('setType[circular] requires explicit width AND depth');
      }
    }
    const nextW = cmd.width ?? col.width;
    const nextD = cmd.depth ?? col.depth;
    if (nextShape === 'circular' && nextW !== nextD) {
      throw new ColumnDimensionsError('circular column requires width === depth');
    }

    const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, (draft) => {
      const c = draft[cmd.columnId];
      if (!c) return;
      if (cmd.shape !== undefined) c.shape = cmd.shape;
      if (cmd.width !== undefined) c.width = cmd.width;
      if (cmd.depth !== undefined) c.depth = cmd.depth;
      if (cmd.materialId !== undefined) c.materialId = cmd.materialId;
      else if (cmd.systemTypeId !== undefined) c.materialId = cmd.systemTypeId;
    });
    return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
