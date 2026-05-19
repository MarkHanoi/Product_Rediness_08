// DeleteRoomHandler — remove a room (S25).

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

export interface DeleteRoomPayload {
  readonly roomId: string;
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class DeleteRoomHandler implements CommandHandler<DeleteRoomPayload, RoomHandlerStores> {
  readonly type = 'room.delete';
  readonly affectedStores = ['room'] as const;

  canExecute(ctx: HandlerContext<RoomHandlerStores>, cmd: DeleteRoomPayload): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: DeleteRoomPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);

    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      delete draft[cmd.roomId];
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
