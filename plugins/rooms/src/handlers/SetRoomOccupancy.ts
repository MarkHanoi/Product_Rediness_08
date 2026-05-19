// SetRoomOccupancyHandler — change a room's program tag (S25).

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

export interface SetRoomOccupancyPayload {
  readonly roomId: string;
  /** `undefined` or `''` clears the occupancy. */
  readonly occupancy?: string;
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class SetRoomOccupancyHandler
  implements CommandHandler<SetRoomOccupancyPayload, RoomHandlerStores>
{
  readonly type = 'room.setOccupancy';
  readonly affectedStores = ['room'] as const;

  canExecute(
    ctx: HandlerContext<RoomHandlerStores>,
    cmd: SetRoomOccupancyPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.occupancy !== undefined && typeof cmd.occupancy !== 'string') {
      return { valid: false, reason: 'occupancy must be a string when present' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: SetRoomOccupancyPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);

    const next = cmd.occupancy === undefined || cmd.occupancy === '' ? undefined : cmd.occupancy;
    const [nextState, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (!r) return;
      if (next === undefined) {
        delete r.occupancy;
      } else {
        r.occupancy = next;
      }
    });
    return { forward, inverse, nextStates: { room: nextState } };
    }); // withHandlerSpan — C10 §2
  }
}
