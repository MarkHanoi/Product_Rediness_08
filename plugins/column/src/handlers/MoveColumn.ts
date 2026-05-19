// MoveColumnHandler — translate a column by a world-space delta (S12-T3).

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

export interface MoveColumnPayload {
  readonly columnId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class MoveColumnHandler
  implements CommandHandler<MoveColumnPayload, ColumnHandlerStores>
{
  readonly type = 'column.move';
  readonly affectedStores = ['column'] as const;

  canExecute(ctx: HandlerContext<ColumnHandlerStores>, cmd: MoveColumnPayload): ValidationResult {
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: MoveColumnPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
    const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, (draft) => {
      const c = draft[cmd.columnId];
      if (!c) return;
      c.origin.x += cmd.delta.x;
      c.origin.y += cmd.delta.y;
      c.origin.z += cmd.delta.z;
    });
    return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
