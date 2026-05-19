// DeleteDoorHandler — remove a door (S11-T1).

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

export interface DeleteDoorPayload {
  readonly doorId: string;
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class DeleteDoorHandler
  implements CommandHandler<DeleteDoorPayload, DoorHandlerStores>
{
  readonly type = 'door.delete';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<DoorHandlerStores>, cmd: DeleteDoorPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: DeleteDoorPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.door[cmd.doorId]) throw new DoorNotFoundError(cmd.doorId);

    const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
      delete draft[cmd.doorId];
    });

    return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
