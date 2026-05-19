// DeleteDimensionHandler — S29 / ADR-0028.

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

export interface DeleteDimensionPayload { readonly dimensionId: string }

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class DeleteDimensionHandler
  implements CommandHandler<DeleteDimensionPayload, Stores>
{
  readonly type = 'dimension.delete';
  readonly affectedStores = ['dimension'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteDimensionPayload): ValidationResult {
    if (typeof cmd.dimensionId !== 'string' || cmd.dimensionId.length === 0) {
      return { valid: false, reason: 'dimensionId must be a non-empty string' };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteDimensionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
    const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
      delete draft[cmd.dimensionId];
    });
    return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
