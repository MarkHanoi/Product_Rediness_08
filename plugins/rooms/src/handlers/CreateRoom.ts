// CreateRoomHandler — mint a new room (S25).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S25.
// Decision: ADR-0022.
//
// Rooms are self-contained: handler declares only `affectedStores:
// ['room']`.  The wall→room cascade is the cross-rule's responsibility
// (`plugins/cross/wall-room.ts`, S26).  At create time we do NOT run
// the producer — the room is born "stale" and the committer's first
// `onAdd` will compute the boundary from the live wall context.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Room, createId } from '@pryzm/plugin-sdk';
import {
  RoomBoundaryError,
  RoomHeightError,
  RoomNameError,
  RoomSchemaError,
  RoomSeedError,
} from '../errors.js';
import type { RoomData, RoomsState } from '../store.js';
import { validateRoomSeed } from '../intent.js';

export interface CreateRoomPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly name?: string;
  readonly number?: string;
  readonly boundaryMode?: RoomData['boundaryMode'];
  readonly seedPoint?: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly heightOffset?: number;
  readonly occupancy?: string;
  readonly materialId?: string;
  readonly materialColor?: string;
  /** Sketched-mode boundary fallback.  Ignored when `boundaryMode === 'wallBound'`. */
  readonly boundary?: RoomData['boundary'];
}

type RoomHandlerStores = Readonly<{ room: RoomsState } & Record<string, unknown>>;

export class CreateRoomHandler implements CommandHandler<CreateRoomPayload, RoomHandlerStores> {
  readonly type = 'room.create';
  readonly affectedStores = ['room'] as const;

  canExecute(_ctx: HandlerContext<RoomHandlerStores>, cmd: CreateRoomPayload): ValidationResult {
    const mode = cmd.boundaryMode ?? 'sketched';
    if (mode === 'wallBound') {
      const v = validateRoomSeed(cmd.seedPoint);
      if (!v.ok) return { valid: false, reason: v.reason };
    }
    if (cmd.heightOffset !== undefined) {
      if (!Number.isFinite(cmd.heightOffset)) {
        return { valid: false, reason: 'heightOffset must be finite' };
      }
      if (cmd.heightOffset < -10 || cmd.heightOffset > 10) {
        return { valid: false, reason: 'heightOffset must be in [-10, 10]' };
      }
    }
    if (cmd.name !== undefined && cmd.name.length === 0) {
      return { valid: false, reason: 'name must be non-empty' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoomHandlerStores>, cmd: CreateRoomPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('room')) as RoomData['id'];
    const mode = cmd.boundaryMode ?? 'sketched';

    if (mode === 'wallBound') {
      const v = validateRoomSeed(cmd.seedPoint);
      if (!v.ok) throw new RoomSeedError(v.reason);
    }
    if (cmd.heightOffset !== undefined && (cmd.heightOffset < -10 || cmd.heightOffset > 10)) {
      throw new RoomHeightError(cmd.heightOffset);
    }
    if (cmd.name !== undefined && cmd.name.length === 0) {
      throw new RoomNameError(cmd.name);
    }

    const seed: Partial<RoomData> = {
      id,
      levelId: cmd.levelId ?? '',
      name: cmd.name ?? 'Room',
      number: cmd.number,
      boundaryMode: mode,
      seedPoint: cmd.seedPoint ?? null,
      heightOffset: cmd.heightOffset ?? 0,
      occupancy: cmd.occupancy,
      materialId: cmd.materialId,
      materialColor: cmd.materialColor,
    };
    if (cmd.boundary) {
      if (cmd.boundary.length < 3) {
        throw new RoomBoundaryError('boundary must have ≥3 vertices');
      }
      seed.boundary = cmd.boundary;
    }

    let room: RoomData;
    try {
      room = Room.parse(seed);
    } catch (err) {
      throw new RoomSchemaError(err);
    }

    const [next, forward, inverse] = produceCommand<RoomsState>(ctx.stores.room, (draft) => {
      draft[room.id] = room;
    });
    return { forward, inverse, nextStates: { room: next } };
    }); // withHandlerSpan — C10 §2
  }
}
