// RecomputeRoomBoundaryHandler — re-run the room's analytic from the
// current wall snapshot (S26, wall→room cross-rule).
//
// Synthesised by `plugins/cross/src/wall-room.ts` whenever a wall
// changes shape, level, or lifecycle.  Reads the wall store via
// `ctx.stores.wall`; writes only `area`, `perimeter`,
// `boundingElementIds`, `boundingWallIds` back onto the room DTO.
// All other room fields are left untouched so user-edited name /
// number / occupancy survive the cascade.
//
// `recomputeRoomAnalytic` returns `undefined` when the room is in an
// in-progress / un-enclosed state; in that case we keep the cached
// analytic values per the rooms intent contract.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { Wall } from '@pryzm/plugin-sdk';
import { recomputeRoomAnalytic } from '../intent.js';
import { RoomNotFoundError } from '../errors.js';
import type { RoomsState } from '../store.js';

export interface RecomputeRoomBoundaryPayload {
  readonly roomId: string;
  /** Optional source attribution recorded by the cross-rule for tracing. */
  readonly cascadedFrom?: string;
  readonly wallId?: string;
}

type Stores = Readonly<
  { room: RoomsState; wall: Record<string, Wall> } & Record<string, unknown>
>;

export class RecomputeRoomBoundaryHandler
  implements CommandHandler<RecomputeRoomBoundaryPayload, Stores>
{
  readonly type = 'room.recomputeBoundary';
  readonly affectedStores = ['room'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: RecomputeRoomBoundaryPayload): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: RecomputeRoomBoundaryPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const room = ctx.stores.room[cmd.roomId];
    if (!room) throw new RoomNotFoundError(cmd.roomId);

    const wallStore = ctx.stores.wall ?? {};
    const walls: Wall[] = [];
    for (const w of Object.values(wallStore)) {
      if (w && (w as Wall).levelId === room.levelId) walls.push(w as Wall);
    }

    const update = recomputeRoomAnalytic(room, walls);

    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (!r || !update) return;
      r.area = update.area;
      r.perimeter = update.perimeter;
      r.boundingElementIds = [...update.boundingElementIds];
      r.boundingWallIds = [...update.boundingWallIds];
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
