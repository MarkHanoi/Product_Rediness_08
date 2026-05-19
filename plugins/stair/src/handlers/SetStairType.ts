// SetStairTypeHandler — swap materialId (S14-T1).

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

export interface SetStairTypePayload {
  readonly stairId: string;
  readonly materialId: string | undefined;
}

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class SetStairTypeHandler implements CommandHandler<SetStairTypePayload, StairHandlerStores> {
  readonly type = 'stair.setType';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: SetStairTypePayload): ValidationResult {
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: SetStairTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, materialId: cmd.materialId };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
