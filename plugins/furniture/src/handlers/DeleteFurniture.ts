// DeleteFurnitureHandler — S27 / ADR-0027.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { FurnitureNotFoundError } from '../errors.js';
import type { FurnituresState } from '../store.js';

export interface DeleteFurniturePayload {
  readonly furnitureId: string;
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class DeleteFurnitureHandler
  implements CommandHandler<DeleteFurniturePayload, Stores>
{
  readonly type = 'furniture.delete';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteFurniturePayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteFurniturePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      delete draft[cmd.furnitureId];
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
