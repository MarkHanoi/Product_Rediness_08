// SetColumnHeightHandler — change a column's height (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ColumnDimensionsError, ColumnNotFoundError } from '../errors.js';
import type { ColumnsState } from '../store.js';

export interface SetColumnHeightPayload {
  readonly columnId: string;
  readonly height: number;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class SetColumnHeightHandler
  implements CommandHandler<SetColumnHeightPayload, ColumnHandlerStores>
{
  readonly type = 'column.setHeight';
  readonly affectedStores = ['column'] as const;

  canExecute(ctx: HandlerContext<ColumnHandlerStores>, cmd: SetColumnHeightPayload): ValidationResult {
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.height) || cmd.height <= 0) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: SetColumnHeightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
    if (cmd.height <= 0) throw new ColumnDimensionsError('height must be > 0');
    const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, (draft) => {
      const c = draft[cmd.columnId];
      if (c) c.height = cmd.height;
    });
    return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
