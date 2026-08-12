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
import { SetRoomOccupancyCommand } from './legacyCommands.js';

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
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — an empty patch pair is
        // INDISTINGUISHABLE from "applied, nothing to change". Reporting success
        // for a command that was "ignored" is the Class-A dead verb, one layer
        // over: the user is told the model changed and it did not. Throw so the bus
        // rejects with a reason (C03 §4.6 U-4).
        throw new Error(
          'room.setOccupancy: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.setOccupancy: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        try {
          const occupancy = cmd.occupancy && cmd.occupancy.length > 0 ? cmd.occupancy : 'unclassified';
          cm.execute(new SetRoomOccupancyCommand(cmd.roomId, occupancy as never));
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.setOccupancy did not happen.
          console.error('[room.setOccupancy.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
