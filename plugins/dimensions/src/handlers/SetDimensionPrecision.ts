// SetDimensionPrecisionHandler — S29 / ADR-0028.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DimensionNotFoundError } from '../errors.js';
import type { DimensionsState } from '../store.js';

export interface SetDimensionPrecisionPayload {
  readonly dimensionId: string;
  readonly precision: number;
}

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class SetDimensionPrecisionHandler
  implements CommandHandler<SetDimensionPrecisionPayload, Stores>
{
  readonly type = 'dimension.setPrecision';
  readonly affectedStores = ['dimension'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetDimensionPrecisionPayload): ValidationResult {
    if (typeof cmd.dimensionId !== 'string' || cmd.dimensionId.length === 0) {
      return { valid: false, reason: 'dimensionId must be a non-empty string' };
    }
    if (!Number.isInteger(cmd.precision) || cmd.precision < 0 || cmd.precision > 6) {
      return { valid: false, reason: 'precision must be an integer in [0, 6]' };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetDimensionPrecisionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
    const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
      const d = draft[cmd.dimensionId];
      if (!d) return;
      d.precision = cmd.precision;
    });
    return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
