// SetDoorFireRatingHandler — update a door's fire-rating classification (F-1.1).
//
// Fire rating is an optional string (e.g. "FD30", "FD60", "FD90").
// No format constraint is enforced — BIM classification codes vary
// by locale and project standard.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DoorNotFoundError } from '../errors.js';
import type { DoorsState } from '../store.js';

export interface SetDoorFireRatingPayload {
  readonly doorId: string;
  readonly fireRating: string;
}

type Stores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class SetDoorFireRatingHandler
  implements CommandHandler<SetDoorFireRatingPayload, Stores>
{
  readonly type = 'door.setFireRating';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetDoorFireRatingPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (typeof cmd.fireRating !== 'string') {
      return { valid: false, reason: 'fireRating must be a string' };
    }
    const door = ctx.stores.door[cmd.doorId];
    if (!door) return { valid: false, reason: `door not found: ${cmd.doorId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetDoorFireRatingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const door = ctx.stores.door[cmd.doorId];
      if (!door) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (d) d.fireRating = cmd.fireRating || undefined;
      });
      return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
