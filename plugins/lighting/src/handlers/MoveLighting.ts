// MoveLightingHandler — S26 / ADR-0023.

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

export interface MoveLightingPayload {
  readonly lightingId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class MoveLightingHandler
  implements CommandHandler<MoveLightingPayload, Stores>
{
  readonly type = 'lighting.move';
  readonly affectedStores = ['lighting'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveLightingPayload): ValidationResult {
    if (typeof cmd.lightingId !== 'string' || cmd.lightingId.length === 0) {
      return { valid: false, reason: 'lightingId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveLightingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
    const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, (draft) => {
      const l = draft[cmd.lightingId];
      if (!l) return;
      l.origin.x += cmd.delta.x;
      l.origin.y += cmd.delta.y;
      l.origin.z += cmd.delta.z;
    });
    return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
