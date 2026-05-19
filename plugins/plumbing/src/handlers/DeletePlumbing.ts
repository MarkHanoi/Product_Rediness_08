// DeletePlumbingHandler — S26 / ADR-0026.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { PlumbingNotFoundError } from '../errors.js';
import type { PlumbingsState } from '../store.js';

export interface DeletePlumbingPayload { readonly plumbingId: string }

type Stores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

export class DeletePlumbingHandler
  implements CommandHandler<DeletePlumbingPayload, Stores>
{
  readonly type = 'plumbing.delete';
  readonly affectedStores = ['plumbing'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeletePlumbingPayload): ValidationResult {
    if (typeof cmd.plumbingId !== 'string' || cmd.plumbingId.length === 0) {
      return { valid: false, reason: 'plumbingId must be a non-empty string' };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeletePlumbingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
    const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, (draft) => {
      delete draft[cmd.plumbingId];
    });
    return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
