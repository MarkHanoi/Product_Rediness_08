// SetRoomMaterialHandler — change the floor-fill colour / material (S25).

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

export interface SetRoomMaterialPayload {
  readonly roomId: string;
  readonly materialId?: string;
  readonly materialColor?: string;
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class SetRoomMaterialHandler
  implements CommandHandler<SetRoomMaterialPayload, RoomHandlerStores>
{
  readonly type = 'room.setMaterial';
  readonly affectedStores = ['room'] as const;

  canExecute(
    ctx: HandlerContext<RoomHandlerStores>,
    cmd: SetRoomMaterialPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    if (!ctx.stores.room[cmd.roomId]) {
      return { valid: false, reason: `room not found: ${cmd.roomId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: SetRoomMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.room[cmd.roomId]) throw new RoomNotFoundError(cmd.roomId);

    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      const r = draft[cmd.roomId];
      if (!r) return;
      if (cmd.materialId !== undefined) r.materialId = cmd.materialId;
      if (cmd.materialColor !== undefined) r.materialColor = cmd.materialColor;
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
