// DeleteColumnHandler — remove a column (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ColumnNotFoundError } from '../errors.js';
import type { ColumnsState } from '../store.js';

export interface DeleteColumnPayload {
  readonly columnId: string;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class DeleteColumnHandler
  implements CommandHandler<DeleteColumnPayload, ColumnHandlerStores>
{
  readonly type = 'column.delete';
  readonly affectedStores = ['column'] as const;

  canExecute(ctx: HandlerContext<ColumnHandlerStores>, cmd: DeleteColumnPayload): ValidationResult {
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: DeleteColumnPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
    const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, (draft) => {
      delete draft[cmd.columnId];
    });
    return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
