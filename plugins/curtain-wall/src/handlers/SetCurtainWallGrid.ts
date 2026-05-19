// SetCurtainWallGridHandler — change the bay grid (mullion + transom
// spacing) on a curtain wall (S12-T5).

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

export interface SetCurtainWallGridPayload {
  readonly curtainWallId: string;
  readonly bayWidth?: number;
  readonly bayHeight?: number;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SetCurtainWallGridHandler
  implements CommandHandler<SetCurtainWallGridPayload, CWStores>
{
  readonly type = 'curtainwall.setGrid';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallGridPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (cmd.bayWidth !== undefined && (!Number.isFinite(cmd.bayWidth) || cmd.bayWidth <= 0)) {
      return { valid: false, reason: 'bayWidth must be > 0' };
    }
    if (cmd.bayHeight !== undefined && (!Number.isFinite(cmd.bayHeight) || cmd.bayHeight <= 0)) {
      return { valid: false, reason: 'bayHeight must be > 0' };
    }
    if (cmd.bayWidth === undefined && cmd.bayHeight === undefined) {
      return { valid: false, reason: 'must specify at least one of bayWidth or bayHeight' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallGridPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    if ((cmd.bayWidth !== undefined && cmd.bayWidth <= 0) ||
        (cmd.bayHeight !== undefined && cmd.bayHeight <= 0)) {
      throw new CurtainWallGeometryError('bay dimensions must be > 0');
    }
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const cw = draft[cmd.curtainWallId];
      if (!cw) return;
      if (cmd.bayWidth !== undefined) cw.bayWidth = cmd.bayWidth;
      if (cmd.bayHeight !== undefined) cw.bayHeight = cmd.bayHeight;
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
