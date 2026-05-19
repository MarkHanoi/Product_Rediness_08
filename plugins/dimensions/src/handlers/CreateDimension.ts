// CreateDimensionHandler — mint a new dimension annotation (S29 / ADR-0028).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Dimension, createId } from '@pryzm/plugin-sdk';
import { DimensionSchemaError } from '../errors.js';
import type { DimensionData, DimensionsState } from '../store.js';
import { isFiniteVec3Array } from '../intent.js';

export interface CreateDimensionPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly viewId?: string;
  readonly kind?: DimensionData['kind'];
  readonly points?: DimensionData['points'];
  readonly offsetMm?: number;
  readonly units?: DimensionData['units'];
  readonly precision?: number;
  readonly style?: DimensionData['style'];
  readonly overridden?: boolean;
  readonly overrideText?: string;
}

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class CreateDimensionHandler
  implements CommandHandler<CreateDimensionPayload, Stores>
{
  readonly type = 'dimension.create';
  readonly affectedStores = ['dimension'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateDimensionPayload): ValidationResult {
    if (cmd.points !== undefined && !isFiniteVec3Array(cmd.points)) {
      return { valid: false, reason: 'points must be a non-empty array of finite Vec3' };
    }
    if (cmd.offsetMm !== undefined && !Number.isFinite(cmd.offsetMm)) {
      return { valid: false, reason: 'offsetMm must be finite' };
    }
    if (cmd.precision !== undefined && (!Number.isInteger(cmd.precision) || cmd.precision < 0 || cmd.precision > 6)) {
      return { valid: false, reason: 'precision must be an integer in [0, 6]' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateDimensionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('dimension')) as DimensionData['id'];
    const seed: Partial<DimensionData> = {
      id,
      levelId: cmd.levelId ?? '',
      viewId: cmd.viewId ?? '',
      kind: cmd.kind ?? 'linear',
      points: cmd.points ?? [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      offsetMm: cmd.offsetMm ?? 8,
      units: cmd.units ?? 'mm',
      precision: cmd.precision ?? 0,
      style: cmd.style ?? 'architectural',
      overridden: cmd.overridden ?? false,
      overrideText: cmd.overrideText,
    };

    let d: DimensionData;
    try { d = Dimension.parse(seed); }
    catch (err) { throw new DimensionSchemaError(err); }

    const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
      draft[d.id] = d;
    });
    return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
