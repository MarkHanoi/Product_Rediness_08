// CreateLightingHandler — mint a new lighting fixture (S26 / ADR-0023).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Lighting, createId } from '@pryzm/plugin-sdk';
import { LightingSchemaError } from '../errors.js';
import type { LightingData, LightingsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface CreateLightingPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly kind?: LightingData['kind'];
  readonly origin?: LightingData['origin'];
  readonly width?: number;
  readonly depth?: number;
  readonly thickness?: number;
  readonly dropLength?: number;
  readonly range?: number;
  readonly intensity?: number;
  readonly color?: LightingData['color'];
  readonly isEmergency?: boolean;
  readonly rotation?: number;
  readonly materialId?: string;
}

type Stores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class CreateLightingHandler
  implements CommandHandler<CreateLightingPayload, Stores>
{
  readonly type = 'lighting.create';
  readonly affectedStores = ['lighting'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateLightingPayload): ValidationResult {
    if (cmd.origin !== undefined && !isFiniteVec3(cmd.origin)) {
      return { valid: false, reason: 'origin must have finite x, y, z' };
    }
    for (const k of ['width', 'depth', 'thickness'] as const) {
      const v = cmd[k];
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    if (cmd.intensity !== undefined && (!Number.isFinite(cmd.intensity) || cmd.intensity < 0)) {
      return { valid: false, reason: 'intensity must be ≥ 0' };
    }
    if (cmd.range !== undefined && (!Number.isFinite(cmd.range) || cmd.range < 0)) {
      return { valid: false, reason: 'range must be ≥ 0' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateLightingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('lighting')) as LightingData['id'];
    const seed: Partial<LightingData> = {
      id,
      levelId: cmd.levelId ?? '',
      kind: cmd.kind ?? 'downlight',
      origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
      width: cmd.width ?? 0.2,
      depth: cmd.depth ?? 0.2,
      thickness: cmd.thickness ?? 0.05,
      dropLength: cmd.dropLength ?? 0,
      range: cmd.range ?? 6,
      intensity: cmd.intensity ?? 1,
      color: cmd.color ?? [1, 1, 1],
      isEmergency: cmd.isEmergency ?? false,
      rotation: cmd.rotation ?? 0,
      materialId: cmd.materialId,
    };

    let l: LightingData;
    try { l = Lighting.parse(seed); }
    catch (err) { throw new LightingSchemaError(err); }

    const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, (draft) => {
      draft[l.id] = l;
    });
    return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
