// MoveRoomHandler — translate a room (S25).
//
// "Moving" a room means moving its seed point.  The boundary itself
// is derived by the producer from the surrounding walls — in
// wallBound mode the polygon will simply re-flood-fill from the new
// seed.  In sketched mode the polygon vertices translate too.

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

export interface MoveRoomPayload {
  readonly roomId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class MoveRoomHandler implements CommandHandler<MoveRoomPayload, RoomHandlerStores> {
  readonly type = 'room.move';
  readonly affectedStores = ['room'] as const;

  canExecute(ctx: HandlerContext<RoomHandlerStores>, cmd: MoveRoomPayload): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (
      !cmd.delta ||
      !Number.isFinite(cmd.delta.x) ||
      !Number.isFinite(cmd.delta.y) ||
      !Number.isFinite(cmd.delta.z)
    ) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: MoveRoomPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);

    const dx = cmd.delta.x, dy = cmd.delta.y, dz = cmd.delta.z;
    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (!r) return;
      if (r.seedPoint) {
        r.seedPoint.x += dx;
        r.seedPoint.y += dy;
        r.seedPoint.z += dz;
      }
      if (r.boundaryMode === 'sketched') {
        for (const p of r.boundary) {
          p.x += dx;
          p.y += dy;
          p.z += dz;
        }
      }
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
