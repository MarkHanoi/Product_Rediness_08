// SetLightingEmergencyHandler — toggle ISO 50293 emergency override (S26).

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

export interface SetLightingEmergencyPayload {
  readonly lightingId: string;
  readonly isEmergency: boolean;
}

type Stores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class SetLightingEmergencyHandler
  implements CommandHandler<SetLightingEmergencyPayload, Stores>
{
  readonly type = 'lighting.setEmergency';
  readonly affectedStores = ['lighting'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetLightingEmergencyPayload): ValidationResult {
    if (typeof cmd.isEmergency !== 'boolean') return { valid: false, reason: 'isEmergency must be boolean' };
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetLightingEmergencyPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
    const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, (draft) => {
      const l = draft[cmd.lightingId];
      if (l) l.isEmergency = cmd.isEmergency;
    });
    return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
