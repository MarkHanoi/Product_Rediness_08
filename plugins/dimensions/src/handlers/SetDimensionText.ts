// SetDimensionTextHandler — S29 / ADR-0028.
//
// Toggles `overridden` on the dimension and stores `overrideText`
// (or clears both when the override is removed).

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

export interface SetDimensionTextPayload {
  readonly dimensionId: string;
  /** When `null` the override is cleared and the dimension reverts to the formatted measurement. */
  readonly overrideText: string | null;
}

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class SetDimensionTextHandler
  implements CommandHandler<SetDimensionTextPayload, Stores>
{
  readonly type = 'dimension.setText';
  readonly affectedStores = ['dimension'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetDimensionTextPayload): ValidationResult {
    if (typeof cmd.dimensionId !== 'string' || cmd.dimensionId.length === 0) {
      return { valid: false, reason: 'dimensionId must be a non-empty string' };
    }
    if (cmd.overrideText !== null && typeof cmd.overrideText !== 'string') {
      return { valid: false, reason: 'overrideText must be a string or null' };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetDimensionTextPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
    const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
      const d = draft[cmd.dimensionId];
      if (!d) return;
      if (cmd.overrideText === null) {
        d.overridden = false;
        d.overrideText = undefined;
      } else {
        d.overridden = true;
        d.overrideText = cmd.overrideText;
      }
    });
    return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
