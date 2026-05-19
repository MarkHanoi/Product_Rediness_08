// DeleteStairHandler — remove a stair (S14-T1).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StairNotFoundError } from '../errors.js';
import type { StairData, StairsState } from '../store.js';

export interface DeleteStairPayload { readonly stairId: string }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class DeleteStairHandler implements CommandHandler<DeleteStairPayload, StairHandlerStores> {
  readonly type = 'stair.delete';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: DeleteStairPayload): ValidationResult {
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: DeleteStairPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      delete (draft as Record<string, StairData>)[cmd.stairId];
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
