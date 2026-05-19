// SetPlumbingSystemHandler — change the fluid system tag (S26).

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

export interface SetPlumbingSystemPayload {
  readonly plumbingId: string;
  readonly systemTag: string;
}

type Stores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

export class SetPlumbingSystemHandler
  implements CommandHandler<SetPlumbingSystemPayload, Stores>
{
  readonly type = 'plumbing.setSystem';
  readonly affectedStores = ['plumbing'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetPlumbingSystemPayload): ValidationResult {
    if (typeof cmd.systemTag !== 'string' || cmd.systemTag.length === 0) {
      return { valid: false, reason: 'systemTag must be a non-empty string' };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetPlumbingSystemPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
    const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, (draft) => {
      const p = draft[cmd.plumbingId];
      if (p) p.systemTag = cmd.systemTag;
    });
    return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
