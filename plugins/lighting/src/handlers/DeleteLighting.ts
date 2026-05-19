// DeleteLightingHandler — S26 / ADR-0023.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { LightingNotFoundError } from '../errors.js';
import type { LightingsState } from '../store.js';

export interface DeleteLightingPayload { readonly lightingId: string }

type Stores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class DeleteLightingHandler
  implements CommandHandler<DeleteLightingPayload, Stores>
{
  readonly type = 'lighting.delete';
  readonly affectedStores = ['lighting'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteLightingPayload): ValidationResult {
    if (typeof cmd.lightingId !== 'string' || cmd.lightingId.length === 0) {
      return { valid: false, reason: 'lightingId must be a non-empty string' };
    }
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteLightingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
    const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, (draft) => {
      delete draft[cmd.lightingId];
    });
    return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
