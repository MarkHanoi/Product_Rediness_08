// DeleteRoofHandler — remove a roof (S11-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoofNotFoundError } from '../errors.js';
import type { RoofsState } from '../store.js';

export interface DeleteRoofPayload {
  readonly roofId: string;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class DeleteRoofHandler implements CommandHandler<DeleteRoofPayload, RoofHandlerStores> {
  readonly type = 'roof.delete';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: DeleteRoofPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: DeleteRoofPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      delete draft[cmd.roofId];
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
