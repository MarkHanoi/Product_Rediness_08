// SetRoomNumberHandler — assign / clear a room number (S25).
//
// Pass `number: ''` (or omit) to clear the number; we map the empty
// string to `undefined` on the DTO so the schema's `.optional()` is
// preserved.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoomNotFoundError } from '../errors.js';
import type { RoomsState } from '../store.js';

export interface SetRoomNumberPayload {
  readonly roomId: string;
  /** `undefined` or `''` clears the number. */
  readonly number?: string;
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class SetRoomNumberHandler
  implements CommandHandler<SetRoomNumberPayload, RoomHandlerStores>
{
  readonly type = 'room.setNumber';
  readonly affectedStores = ['room'] as const;

  canExecute(ctx: HandlerContext<RoomHandlerStores>, cmd: SetRoomNumberPayload): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.number !== undefined && typeof cmd.number !== 'string') {
      return { valid: false, reason: 'number must be a string when present' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: SetRoomNumberPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);

    const next = cmd.number === undefined || cmd.number === '' ? undefined : cmd.number;
    const [nextState, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (!r) return;
      if (next === undefined) {
        delete r.number;
      } else {
        r.number = next;
      }
    });
    return { forward, inverse, nextStates: { room: nextState } };
    }); // withHandlerSpan — C10 §2
  }
}
