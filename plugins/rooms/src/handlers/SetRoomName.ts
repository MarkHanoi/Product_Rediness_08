// SetRoomNameHandler — rename a room (S25).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoomNameError, RoomNotFoundError } from '../errors.js';
import type { RoomsState } from '../store.js';

export interface SetRoomNamePayload {
  readonly roomId: string;
  readonly name: string;
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class SetRoomNameHandler
  implements CommandHandler<SetRoomNamePayload, RoomHandlerStores>
{
  readonly type = 'room.setName';
  readonly affectedStores = ['room'] as const;

  canExecute(ctx: HandlerContext<RoomHandlerStores>, cmd: SetRoomNamePayload): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (typeof cmd.name !== 'string' || cmd.name.length === 0) {
      return { valid: false, reason: 'name must be a non-empty string' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: SetRoomNamePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);
    if (cmd.name.length === 0) throw new RoomNameError(cmd.name);

    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (r) r.name = cmd.name;
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
