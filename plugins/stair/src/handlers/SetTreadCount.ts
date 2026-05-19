// SetTreadCountHandler — change `numRisers` (S14-T1).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StairNotFoundError, StairRiserCountError } from '../errors.js';
import type { StairData, StairsState } from '../store.js';

export interface SetTreadCountPayload { readonly stairId: string; readonly numRisers: number }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class SetTreadCountHandler implements CommandHandler<SetTreadCountPayload, StairHandlerStores> {
  readonly type = 'stair.setTreadCount';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: SetTreadCountPayload): ValidationResult {
    if (!Number.isInteger(cmd.numRisers) || cmd.numRisers < 2) {
      return { valid: false, reason: 'numRisers must be an integer ≥ 2' };
    }
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: SetTreadCountPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    if (cmd.numRisers < 2) throw new StairRiserCountError(cmd.numRisers);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, numRisers: cmd.numRisers };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
