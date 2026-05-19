// ResizeCurtainWallHandler — scale the baseLine length and/or
// height of a curtain wall while keeping its start point and
// direction fixed (S12-T5).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallGeometryError, CurtainWallNotFoundError } from '../errors.js';
import type { CurtainWallsState } from '../store.js';
import { baseLineLength } from '../intent.js';

export interface ResizeCurtainWallPayload {
  readonly curtainWallId: string;
  /** New length (metres) of the baseLine. */
  readonly length?: number;
  readonly height?: number;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class ResizeCurtainWallHandler
  implements CommandHandler<ResizeCurtainWallPayload, CWStores>
{
  readonly type = 'curtainwall.resize';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: ResizeCurtainWallPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (cmd.length !== undefined && (!Number.isFinite(cmd.length) || cmd.length <= 0)) {
      return { valid: false, reason: 'length must be > 0' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.length === undefined && cmd.height === undefined) {
      return { valid: false, reason: 'must specify at least one of length or height' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: ResizeCurtainWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    if ((cmd.length !== undefined && cmd.length <= 0) ||
        (cmd.height !== undefined && cmd.height <= 0)) {
      throw new CurtainWallGeometryError('dimensions must be > 0');
    }

    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const c = draft[cmd.curtainWallId];
      if (!c) return;
      if (cmd.length !== undefined) {
        const [a, b] = c.baseLine;
        const cur = baseLineLength(a, b);
        if (cur > 0) {
          const k = cmd.length / cur;
          c.baseLine[1] = {
            x: a.x + (b.x - a.x) * k,
            y: a.y + (b.y - a.y) * k,
            z: a.z + (b.z - a.z) * k,
          };
        }
      }
      if (cmd.height !== undefined) c.height = cmd.height;
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
