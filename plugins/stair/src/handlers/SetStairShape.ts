// SetStairShapeHandler — swap stair run shape (S14-T1).

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

const VALID_SHAPES: readonly StairData['shape'][] = ['straight', 'l-shape', 'u-shape', 'spiral'];

export interface SetStairShapePayload { readonly stairId: string; readonly shape: StairData['shape'] }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class SetStairShapeHandler implements CommandHandler<SetStairShapePayload, StairHandlerStores> {
  readonly type = 'stair.setShape';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: SetStairShapePayload): ValidationResult {
    if (!VALID_SHAPES.includes(cmd.shape)) {
      return { valid: false, reason: `unknown stair shape: ${cmd.shape}` };
    }
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: SetStairShapePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, shape: cmd.shape };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
