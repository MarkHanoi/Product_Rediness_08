// DeleteCeilingHandler — remove a ceiling (S14-T8).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CeilingNotFoundError } from '../errors.js';
import type { CeilingData, CeilingsState } from '../store.js';

export interface DeleteCeilingPayload { readonly ceilingId: string }

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class DeleteCeilingHandler implements CommandHandler<DeleteCeilingPayload, CeilingHandlerStores> {
  readonly type = 'ceiling.delete';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(ctx: HandlerContext<CeilingHandlerStores>, cmd: DeleteCeilingPayload): ValidationResult {
    return (ctx.stores.ceiling as CeilingsState)[cmd.ceilingId]
      ? { valid: true }
      : { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: DeleteCeilingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.ceiling as CeilingsState)[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);
    const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, (draft) => {
      delete (draft as Record<string, CeilingData>)[cmd.ceilingId];
    });
    return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
