// RotateStairHandler — set absolute rotation (radians, about world Y) (S14-T1).

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

export interface RotateStairPayload { readonly stairId: string; readonly rotation: number }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class RotateStairHandler implements CommandHandler<RotateStairPayload, StairHandlerStores> {
  readonly type = 'stair.rotate';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: RotateStairPayload): ValidationResult {
    if (!Number.isFinite(cmd.rotation)) return { valid: false, reason: 'rotation must be finite' };
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: RotateStairPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, rotation: cmd.rotation };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
