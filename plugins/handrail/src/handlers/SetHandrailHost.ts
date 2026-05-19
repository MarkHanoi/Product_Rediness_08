// SetHandrailHostHandler — re-host a handrail to a different stair / slab / ramp (S14-T4).

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

export interface SetHandrailHostPayload {
  readonly handrailId: string;
  readonly hostId: string | undefined;
}

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class SetHandrailHostHandler implements CommandHandler<SetHandrailHostPayload, HandrailHandlerStores> {
  readonly type = 'handrail.setHost';
  readonly affectedStores = ['handrail'] as const;

  canExecute(ctx: HandlerContext<HandrailHandlerStores>, cmd: SetHandrailHostPayload): ValidationResult {
    return (ctx.stores.handrail as HandrailsState)[cmd.handrailId]
      ? { valid: true }
      : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }

  execute(ctx: HandlerContext<HandrailHandlerStores>, cmd: SetHandrailHostPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.handrail as HandrailsState)[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
    const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, (draft) => {
      const dto = (draft as Record<string, HandrailData>)[cmd.handrailId];
      if (!dto) return;
      (draft as Record<string, HandrailData>)[cmd.handrailId] = { ...dto, hostId: cmd.hostId };
    });
    return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
