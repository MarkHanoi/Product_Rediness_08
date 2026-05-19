// SetGridExtentHandler — change the length of every linear grid line
// (S12-T4).
//
// Each linear line keeps its `start`; the `end` is recomputed as
// `start + dir * extent` where `dir` is the unit vector from start →
// end.  Arc lines are left untouched (their extent is intrinsic to
// the radius / sweep already encoded in the start/end pair).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { GridConfigError, GridNotFoundError } from '../errors.js';
import type { GridsState } from '../store.js';

export interface SetGridExtentPayload {
  readonly gridId: string;
  readonly extent: number;
}

type GridHandlerStores = Readonly<{ grid: GridsState } & Record<string, unknown>>;

export class SetGridExtentHandler
  implements CommandHandler<SetGridExtentPayload, GridHandlerStores>
{
  readonly type = 'grid.setExtent';
  readonly affectedStores = ['grid'] as const;

  canExecute(ctx: HandlerContext<GridHandlerStores>, cmd: SetGridExtentPayload): ValidationResult {
    if (typeof cmd.gridId !== 'string' || cmd.gridId.length === 0) {
      return { valid: false, reason: 'gridId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.extent) || cmd.extent <= 0) {
      return { valid: false, reason: 'extent must be > 0' };
    }
    if (!ctx.stores.grid[cmd.gridId]) {
      return { valid: false, reason: `grid not found: ${cmd.gridId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<GridHandlerStores>, cmd: SetGridExtentPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.grid[cmd.gridId]) throw new GridNotFoundError(cmd.gridId);
    if (cmd.extent <= 0) throw new GridConfigError('extent must be > 0');

    const [next, forward, inverse] = produceCommand<GridsState>(ctx.stores.grid, (draft) => {
      const g = draft[cmd.gridId];
      if (!g) return;
      for (const ln of g.lines) {
        if (ln.kind !== 'linear') continue;
        const dx = ln.end.x - ln.start.x;
        const dy = ln.end.y - ln.start.y;
        const dz = ln.end.z - ln.start.z;
        const len = Math.hypot(dx, dy, dz);
        if (len === 0) continue;
        const inv = cmd.extent / len;
        ln.end = {
          x: ln.start.x + dx * inv,
          y: ln.start.y + dy * inv,
          z: ln.start.z + dz * inv,
        };
      }
    });
    return { forward, inverse, nextStates: { grid: next } };
    }); // withHandlerSpan — C10 §2
  }
}
