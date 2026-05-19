// CreatePlumbingHandler — mint a new pipe element (S26 / ADR-0026).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Plumbing, createId } from '@pryzm/plugin-sdk';
import { PlumbingSchemaError } from '../errors.js';
import type { PlumbingData, PlumbingsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface CreatePlumbingPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly kind?: PlumbingData['kind'];
  readonly origin?: PlumbingData['origin'];
  readonly diameter?: number;
  readonly wallThickness?: number;
  readonly length?: number;
  readonly bendRadius?: number;
  readonly rotation?: number;
  readonly baseOffset?: number;
  readonly systemTag?: string;
  readonly materialId?: string;
}

type Stores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

export class CreatePlumbingHandler
  implements CommandHandler<CreatePlumbingPayload, Stores>
{
  readonly type = 'plumbing.create';
  readonly affectedStores = ['plumbing'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreatePlumbingPayload): ValidationResult {
    if (cmd.origin !== undefined && !isFiniteVec3(cmd.origin)) {
      return { valid: false, reason: 'origin must have finite x, y, z' };
    }
    for (const k of ['diameter', 'length', 'bendRadius'] as const) {
      const v = cmd[k];
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    if (cmd.wallThickness !== undefined && (!Number.isFinite(cmd.wallThickness) || cmd.wallThickness < 0)) {
      return { valid: false, reason: 'wallThickness must be ≥ 0' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreatePlumbingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('plumbing')) as PlumbingData['id'];
    const seed: Partial<PlumbingData> = {
      id,
      levelId: cmd.levelId ?? '',
      kind: cmd.kind ?? 'straight',
      origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
      diameter: cmd.diameter ?? 0.05,
      wallThickness: cmd.wallThickness ?? 0.005,
      length: cmd.length ?? 1,
      bendRadius: cmd.bendRadius ?? 0.075,
      rotation: cmd.rotation ?? 0,
      baseOffset: cmd.baseOffset ?? 0,
      systemTag: cmd.systemTag ?? 'cold-water',
      materialId: cmd.materialId,
    };

    let p: PlumbingData;
    try { p = Plumbing.parse(seed); }
    catch (err) { throw new PlumbingSchemaError(err); }

    const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, (draft) => {
      draft[p.id] = p;
    });
    return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
