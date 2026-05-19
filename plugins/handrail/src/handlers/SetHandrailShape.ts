// SetHandrailShapeHandler — swap profile shape (S14-T4).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { HandrailNotFoundError } from '../errors.js';
import type { HandrailData, HandrailsState } from '../store.js';

const VALID_SHAPES: readonly HandrailData['shape'][] = ['round', 'square', 'flat'];

export interface SetHandrailShapePayload {
  readonly handrailId: string;
  readonly shape: HandrailData['shape'];
}

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class SetHandrailShapeHandler implements CommandHandler<SetHandrailShapePayload, HandrailHandlerStores> {
  readonly type = 'handrail.setShape';
  readonly affectedStores = ['handrail'] as const;

  canExecute(ctx: HandlerContext<HandrailHandlerStores>, cmd: SetHandrailShapePayload): ValidationResult {
    if (!VALID_SHAPES.includes(cmd.shape)) {
      return { valid: false, reason: `unknown handrail shape: ${cmd.shape}` };
    }
    return (ctx.stores.handrail as HandrailsState)[cmd.handrailId]
      ? { valid: true }
      : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }

  execute(ctx: HandlerContext<HandrailHandlerStores>, cmd: SetHandrailShapePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.handrail as HandrailsState)[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
    const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, (draft) => {
      const dto = (draft as Record<string, HandrailData>)[cmd.handrailId];
      if (!dto) return;
      (draft as Record<string, HandrailData>)[cmd.handrailId] = { ...dto, shape: cmd.shape };
    });
    return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
