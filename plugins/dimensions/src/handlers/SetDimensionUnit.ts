// SetDimensionUnitHandler — S29 / ADR-0028.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DimensionNotFoundError } from '../errors.js';
import type { DimensionData, DimensionsState } from '../store.js';
import { isDimensionUnit } from '../intent.js';

export interface SetDimensionUnitPayload {
  readonly dimensionId: string;
  readonly units: DimensionData['units'];
}

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class SetDimensionUnitHandler
  implements CommandHandler<SetDimensionUnitPayload, Stores>
{
  readonly type = 'dimension.setUnit';
  readonly affectedStores = ['dimension'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetDimensionUnitPayload): ValidationResult {
    if (typeof cmd.dimensionId !== 'string' || cmd.dimensionId.length === 0) {
      return { valid: false, reason: 'dimensionId must be a non-empty string' };
    }
    if (!isDimensionUnit(cmd.units)) {
      return { valid: false, reason: 'units must be one of mm/cm/m/in/ft' };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetDimensionUnitPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
    const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
      const d = draft[cmd.dimensionId];
      if (!d) return;
      d.units = cmd.units;
    });
    return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
