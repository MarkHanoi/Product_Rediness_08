// SetWidthHandler — change stair width (S14-T1).

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

export interface SetWidthPayload { readonly stairId: string; readonly width: number }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class SetWidthHandler implements CommandHandler<SetWidthPayload, StairHandlerStores> {
  readonly type = 'stair.setWidth';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: SetWidthPayload): ValidationResult {
    if (!Number.isFinite(cmd.width) || cmd.width <= 0) {
      return { valid: false, reason: 'width must be > 0' };
    }
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: SetWidthPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    if (cmd.width <= 0) throw new StairGeometryError('width must be > 0');
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, width: cmd.width };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
