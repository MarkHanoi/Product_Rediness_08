// RemoveSkylightHandler — remove a skylight from a roof (W-1C-5).

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

export interface RemoveSkylightPayload {
  readonly roofId: string;
  readonly skylightId: string;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class RemoveSkylightHandler
  implements CommandHandler<RemoveSkylightPayload, RoofHandlerStores>
{
  readonly type = 'roof.removeSkylight';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: RemoveSkylightPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (typeof cmd.skylightId !== 'string' || cmd.skylightId.length === 0) {
      return { valid: false, reason: 'skylightId must be a non-empty string' };
    }
    const roof = ctx.stores.roof[cmd.roofId];
    if (!roof) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    if (!roof.skylights.some((s) => s.id === cmd.skylightId)) {
      return { valid: false, reason: `skylight not found on roof: ${cmd.skylightId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: RemoveSkylightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const roof = ctx.stores.roof[cmd.roofId];
    if (!roof) throw new RoofNotFoundError(cmd.roofId);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const d = draft[cmd.roofId];
      if (d) d.skylights = d.skylights.filter((s) => s.id !== cmd.skylightId);
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
