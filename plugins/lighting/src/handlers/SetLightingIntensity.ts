// SetLightingIntensityHandler — patch intensity / range / color (S26).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { LightingNotFoundError } from '../errors.js';
import type { LightingData, LightingsState } from '../store.js';

export interface SetLightingIntensityPayload {
  readonly lightingId: string;
  readonly intensity?: number;
  readonly range?: number;
  readonly color?: LightingData['color'];
}

type Stores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class SetLightingIntensityHandler
  implements CommandHandler<SetLightingIntensityPayload, Stores>
{
  readonly type = 'lighting.setIntensity';
  readonly affectedStores = ['lighting'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetLightingIntensityPayload): ValidationResult {
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    if (cmd.intensity !== undefined && (!Number.isFinite(cmd.intensity) || cmd.intensity < 0)) {
      return { valid: false, reason: 'intensity must be ≥ 0' };
    }
    if (cmd.range !== undefined && (!Number.isFinite(cmd.range) || cmd.range < 0)) {
      return { valid: false, reason: 'range must be ≥ 0' };
    }
    if (cmd.color !== undefined) {
      if (!Array.isArray(cmd.color) || cmd.color.length !== 3) {
        return { valid: false, reason: 'color must be [r,g,b] tuple' };
      }
      for (const c of cmd.color) if (!Number.isFinite(c) || c < 0 || c > 1) {
        return { valid: false, reason: 'color channels must be in [0,1]' };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetLightingIntensityPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
    const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, (draft) => {
      const l = draft[cmd.lightingId];
      if (!l) return;
      if (cmd.intensity !== undefined) l.intensity = cmd.intensity;
      if (cmd.range !== undefined) l.range = cmd.range;
      if (cmd.color !== undefined) l.color = [...cmd.color] as LightingData['color'];
    });
    return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
