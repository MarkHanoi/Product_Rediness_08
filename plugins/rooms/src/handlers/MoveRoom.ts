// MoveRoomHandler — translate a room (S25).
//
// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — LEGACY BRIDGE to the
// `UpdateRoomBoundaryCommand` (via `window.commandManager`), mirroring
// `SetRoomNameHandler` (§FIX-ROOM-SETNAME-STORE / L-75). See that file for the full
// root-cause note: the previous `affectedStores:['room']` mismatched the bus
// storeKey `'rooms'` and threw "required store 'room' is missing" (ADR-002 §3), and
// the mutation targeted the disconnected plugin `RoomsState`.
//
// "Moving" a room translates its boundary. In the legacy model the boundary is a
// polygon of `{ x, z }` vertices plus a vertical `baseOffset`. We read the room's
// current boundary from `window.roomStore`, translate every vertex by the
// horizontal delta (`x += delta.x`, `z += delta.z`) and lift by `delta.y`
// (`baseOffset += delta.y`), then forward the complete new boundary — the legacy
// `RoomBoundarySchema` validates the whole boundary at `update()`, so a partial
// patch is rejected. `affectedStores` is `[]` (the legacy commandManager owns the
// undo step).
//
// TODO(F-1.4): replace with an authoritative plugin-store Immer update once the
// detected-room world is migrated off the legacy RoomStore.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateRoomBoundaryCommand } from '@pryzm/command-registry';

export interface MoveRoomPayload {
  readonly roomId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

/** Loose read view of the legacy room record — avoids importing room-topology. */
interface LegacyBoundaryLike {
  readonly polygon: ReadonlyArray<{ readonly x: number; readonly z: number }>;
  readonly baseOffset?: number;
  [k: string]: unknown;
}
interface LegacyRoomLike {
  readonly boundary?: LegacyBoundaryLike;
}
interface LegacyRoomStoreLike {
  getById(roomId: string): LegacyRoomLike | undefined;
}

export class MoveRoomHandler implements CommandHandler<MoveRoomPayload, Record<string, unknown>> {
  readonly type = 'room.move';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: MoveRoomPayload,
  ): ValidationResult {
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
    return { valid: true };
  }

  execute(_ctx: HandlerContext<Record<string, unknown>>, cmd: MoveRoomPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        console.error('[room.move.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      const w = window as unknown as {
        commandManager?: { execute(cmd: unknown, options?: unknown): void };
        roomStore?: LegacyRoomStoreLike;
      };
      const room = w.roomStore?.getById(cmd.roomId);
      if (!room?.boundary) {
        console.error('[room.move.handler] room / boundary not found — command ignored');
        return { forward: [], inverse: [] };
      }
      const cm = w.commandManager;
      if (cm) {
        try {
          const { x: dx, y: dy, z: dz } = cmd.delta;
          const polygon = room.boundary.polygon.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));
          const boundary = {
            ...room.boundary,
            polygon,
            baseOffset: (room.boundary.baseOffset ?? 0) + dy,
          };
          cm.execute(new UpdateRoomBoundaryCommand(cmd.roomId, boundary as never));
        } catch (e) {
          console.error('[room.move.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
