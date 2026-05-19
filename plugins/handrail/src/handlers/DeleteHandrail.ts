// DeleteHandrailHandler — remove a handrail (S14-T4).

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

export interface DeleteHandrailPayload { readonly handrailId: string }

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class DeleteHandrailHandler implements CommandHandler<DeleteHandrailPayload, HandrailHandlerStores> {
  readonly type = 'handrail.delete';
  readonly affectedStores = ['handrail'] as const;

  canExecute(ctx: HandlerContext<HandrailHandlerStores>, cmd: DeleteHandrailPayload): ValidationResult {
    return (ctx.stores.handrail as HandrailsState)[cmd.handrailId]
      ? { valid: true }
      : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }

  execute(ctx: HandlerContext<HandrailHandlerStores>, cmd: DeleteHandrailPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.handrail as HandrailsState)[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
    const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, (draft) => {
      delete (draft as Record<string, HandrailData>)[cmd.handrailId];
    });
    return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
