// SetRiserHeightHandler — change riser height (S14-T1).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StairNotFoundError, StairGeometryError } from '../errors.js';
import type { StairData, StairsState } from '../store.js';

export interface SetRiserHeightPayload { readonly stairId: string; readonly riserHeight: number }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class SetRiserHeightHandler implements CommandHandler<SetRiserHeightPayload, StairHandlerStores> {
  readonly type = 'stair.setRiserHeight';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: SetRiserHeightPayload): ValidationResult {
    if (!Number.isFinite(cmd.riserHeight) || cmd.riserHeight <= 0) {
      return { valid: false, reason: 'riserHeight must be > 0' };
    }
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: SetRiserHeightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    if (cmd.riserHeight <= 0) throw new StairGeometryError('riserHeight must be > 0');
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, riserHeight: cmd.riserHeight };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
