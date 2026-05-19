// SetRoomHeightOffsetHandler — change the room's vertical lift (S25).
//
// Bounded to [-10, 10] m to match the schema's defensive refine.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoomHeightError, RoomNotFoundError } from '../errors.js';
import type { RoomsState } from '../store.js';

export interface SetRoomHeightOffsetPayload {
  readonly roomId: string;
  readonly heightOffset: number;
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class SetRoomHeightOffsetHandler
  implements CommandHandler<SetRoomHeightOffsetPayload, RoomHandlerStores>
{
  readonly type = 'room.setHeightOffset';
  readonly affectedStores = ['room'] as const;

  canExecute(
    ctx: HandlerContext<RoomHandlerStores>,
    cmd: SetRoomHeightOffsetPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.heightOffset)) {
      return { valid: false, reason: 'heightOffset must be a finite number' };
    }
    if (cmd.heightOffset < -10 || cmd.heightOffset > 10) {
      return { valid: false, reason: 'heightOffset must be in [-10, 10]' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<RoomHandlerStores>,
    cmd: SetRoomHeightOffsetPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);
    if (cmd.heightOffset < -10 || cmd.heightOffset > 10) {
      throw new RoomHeightError(cmd.heightOffset);
    }

    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (r) r.heightOffset = cmd.heightOffset;
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
