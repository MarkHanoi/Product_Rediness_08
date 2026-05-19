// SetCeilingHeightHandler — set ceilingHeight (offset above level) (S14-T8).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CeilingGeometryError, CeilingNotFoundError } from '../errors.js';
import type { CeilingData, CeilingsState } from '../store.js';

export interface SetCeilingHeightPayload {
  readonly ceilingId: string;
  readonly ceilingHeight: number;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class SetCeilingHeightHandler implements CommandHandler<SetCeilingHeightPayload, CeilingHandlerStores> {
  readonly type = 'ceiling.setHeight';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingHeightPayload): ValidationResult {
    if (!Number.isFinite(cmd.ceilingHeight) || cmd.ceilingHeight <= 0) {
      return { valid: false, reason: 'ceilingHeight must be > 0' };
    }
    const dto = (ctx.stores.ceiling as CeilingsState)[cmd.ceilingId];
    if (!dto) return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    if (cmd.ceilingHeight <= dto.thickness) {
      return { valid: false, reason: 'ceilingHeight must exceed thickness' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingHeightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const dto = (ctx.stores.ceiling as CeilingsState)[cmd.ceilingId];
    if (!dto) throw new CeilingNotFoundError(cmd.ceilingId);
    if (cmd.ceilingHeight <= dto.thickness) {
      throw new CeilingGeometryError('ceilingHeight must exceed thickness');
    }
    const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, (draft) => {
      const cur = (draft as Record<string, CeilingData>)[cmd.ceilingId];
      if (!cur) return;
      (draft as Record<string, CeilingData>)[cmd.ceilingId] = { ...cur, ceilingHeight: cmd.ceilingHeight };
    });
    return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
