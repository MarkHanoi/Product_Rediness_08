// SetRoomOccupancyHandler — change a room's program tag (S25).
//
// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — LEGACY BRIDGE to the
// `SetRoomOccupancyCommand` (via `window.commandManager`), mirroring
// `SetRoomNameHandler` (§FIX-ROOM-SETNAME-STORE / L-75). See that file for the
// full root-cause note: the previous `affectedStores:['room']` mismatched the bus
// storeKey `'rooms'` and threw "required store 'room' is missing" (ADR-002 §3),
// and the mutation targeted the disconnected plugin `RoomsState` that neither the
// renderer nor persistence read.
//
// The legacy `SetRoomOccupancyCommand(roomId, occupancyType)` runs
// `roomStore.update({ occupancyType })` → drives `RoomColourSystem.resolve()` +
// the tag overlay and is saved/loaded. An empty / missing occupancy maps to
// `'unclassified'` (the legacy enum has no "cleared" state). `affectedStores` is
// `[]` (the legacy commandManager owns the undo step). The occupancy string is
// forwarded verbatim (cast) exactly as `RenameRoomHandler` already does.
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
import { SetRoomOccupancyCommand } from '@pryzm/command-registry';

export interface SetRoomOccupancyPayload {
  readonly roomId: string;
  /** `undefined` or `''` clears the occupancy (mapped to `'unclassified'`). */
  readonly occupancy?: string;
}

export class SetRoomOccupancyHandler
  implements CommandHandler<SetRoomOccupancyPayload, Record<string, unknown>>
{
  readonly type = 'room.setOccupancy';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomOccupancyPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.occupancy !== undefined && typeof cmd.occupancy !== 'string') {
      return { valid: false, reason: 'occupancy must be a string when present' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomOccupancyPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        console.error('[room.setOccupancy.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      if (cm) {
        try {
          const occupancy = cmd.occupancy && cmd.occupancy.length > 0 ? cmd.occupancy : 'unclassified';
          cm.execute(new SetRoomOccupancyCommand(cmd.roomId, occupancy as never));
        } catch (e) {
          console.error('[room.setOccupancy.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
