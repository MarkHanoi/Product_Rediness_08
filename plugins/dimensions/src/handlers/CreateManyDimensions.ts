// CreateManyDimensionsHandler — mint N dimensions in ONE command / ONE undo.
//
// §FEAT-AUTODIMENSION-P1 (L-138) — the AutoDimension executor emits a whole
// architect-grade dimension SET; dispatching N `dimension.create` verbs would
// produce N undo units (and N span round-trips). This batch verb creates every
// string in a single `produceCommand`, so the entire auto-dimension set is one
// undo (C24.1 §1.2), matching how batch element creation collapses to one undo.
//
// Additive + minimal: reuses the SAME `Dimension.parse` seed shape as
// CreateDimensionHandler; no new schema, no store change.

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
import type { CreateDimensionPayload } from './CreateDimension.js';

export interface CreateManyDimensionsPayload {
  readonly dimensions: readonly CreateDimensionPayload[];
}

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class CreateManyDimensionsHandler
  implements CommandHandler<CreateManyDimensionsPayload, Stores>
{
  readonly type = 'dimension.createMany';
  readonly affectedStores = ['dimension'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateManyDimensionsPayload): ValidationResult {
    if (!Array.isArray(cmd.dimensions) || cmd.dimensions.length === 0) {
      return { valid: false, reason: 'dimensions must be a non-empty array' };
    }
    for (const d of cmd.dimensions) {
      if (d.points !== undefined && !isFiniteVec3Array(d.points)) {
        return { valid: false, reason: 'each points must be a non-empty array of finite Vec3' };
      }
      if (d.offsetMm !== undefined && !Number.isFinite(d.offsetMm)) {
        return { valid: false, reason: 'each offsetMm must be finite' };
      }
      if (d.precision !== undefined && (!Number.isInteger(d.precision) || d.precision < 0 || d.precision > 6)) {
        return { valid: false, reason: 'each precision must be an integer in [0, 6]' };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateManyDimensionsPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type, 'pryzm.dimension.count': cmd.dimensions.length }, () => {
      const built: DimensionData[] = cmd.dimensions.map((c) => {
        const id = (c.id ?? createId('dimension')) as DimensionData['id'];
        const seed: Partial<DimensionData> = {
          id,
          levelId: c.levelId ?? '',
          viewId: c.viewId ?? '',
          kind: c.kind ?? 'linear',
          points: c.points ?? [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
          ],
          offsetMm: c.offsetMm ?? 8,
          units: c.units ?? 'mm',
          precision: c.precision ?? 0,
          style: c.style ?? 'architectural',
          overridden: c.overridden ?? false,
          overrideText: c.overrideText,
        };
        try { return Dimension.parse(seed); }
        catch (err) { throw new DimensionSchemaError(err); }
      });

      const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
        for (const d of built) draft[d.id] = d;
      });
      return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
