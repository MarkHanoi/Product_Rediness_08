// DeleteGridHandler — remove a structural grid (S12-T4).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { GridNotFoundError } from '../errors.js';
import type { GridsState } from '../store.js';

export interface DeleteGridPayload { readonly gridId: string }

type GridHandlerStores = Readonly<{ grid: GridsState } & Record<string, unknown>>;

export class DeleteGridHandler implements CommandHandler<DeleteGridPayload, GridHandlerStores> {
  readonly type = 'grid.delete';
  readonly affectedStores = ['grid'] as const;

  canExecute(ctx: HandlerContext<GridHandlerStores>, cmd: DeleteGridPayload): ValidationResult {
    if (typeof cmd.gridId !== 'string' || cmd.gridId.length === 0) {
      return { valid: false, reason: 'gridId must be a non-empty string' };
    }
    if (!ctx.stores.grid[cmd.gridId]) return { valid: false, reason: `grid not found: ${cmd.gridId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<GridHandlerStores>, cmd: DeleteGridPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.grid[cmd.gridId]) throw new GridNotFoundError(cmd.gridId);
    const [next, forward, inverse] = produceCommand<GridsState>(ctx.stores.grid, (draft) => {
      delete draft[cmd.gridId];
    });
    return { forward, inverse, nextStates: { grid: next } };
    }); // withHandlerSpan — C10 §2
  }
}
