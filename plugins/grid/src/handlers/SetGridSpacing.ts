// SetGridSpacingHandler — regenerate a grid's `lines[]` from a
// rectangular {spacingX, spacingZ, countX, countZ, extent, origin}
// specification (S12-T4).
//
// The Grid schema models `lines[]` explicitly (each axis is named).
// PRYZM 1's UX edits "spacing + count + extent" rather than raw line
// arrays, so this handler accepts the legacy parameters and rewrites
// the entire array deterministically.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { GridConfigError, GridNotFoundError } from '../errors.js';
import { generateRectGridLines, validateRectGridSpec } from '../intent.js';
import type { GridsState } from '../store.js';

export interface SetGridSpacingPayload {
  readonly gridId: string;
  readonly spacingX: number;
  readonly spacingZ: number;
  readonly countX: number;
  readonly countZ: number;
  readonly extent: number;
  readonly origin?: { readonly x: number; readonly y: number; readonly z: number };
}

type GridHandlerStores = Readonly<{ grid: GridsState } & Record<string, unknown>>;

export class SetGridSpacingHandler
  implements CommandHandler<SetGridSpacingPayload, GridHandlerStores>
{
  readonly type = 'grid.setSpacing';
  readonly affectedStores = ['grid'] as const;

  canExecute(ctx: HandlerContext<GridHandlerStores>, cmd: SetGridSpacingPayload): ValidationResult {
    if (typeof cmd.gridId !== 'string' || cmd.gridId.length === 0) {
      return { valid: false, reason: 'gridId must be a non-empty string' };
    }
    if (!ctx.stores.grid[cmd.gridId]) {
      return { valid: false, reason: `grid not found: ${cmd.gridId}` };
    }
    const v = validateRectGridSpec(cmd);
    if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid grid spec' };
    return { valid: true };
  }

  execute(ctx: HandlerContext<GridHandlerStores>, cmd: SetGridSpacingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.grid[cmd.gridId]) throw new GridNotFoundError(cmd.gridId);
    const v = validateRectGridSpec(cmd);
    if (!v.ok) throw new GridConfigError(v.reason ?? 'invalid spec');

    const lines = generateRectGridLines(cmd);
    const [next, forward, inverse] = produceCommand<GridsState>(ctx.stores.grid, (draft) => {
      const g = draft[cmd.gridId];
      if (g) g.lines = lines;
    });
    return { forward, inverse, nextStates: { grid: next } };
    }); // withHandlerSpan — C10 §2
  }
}
