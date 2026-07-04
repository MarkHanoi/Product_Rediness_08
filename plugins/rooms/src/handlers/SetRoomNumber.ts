// SetRoomNumberHandler — assign / clear a room number (S25).
//
// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — `room.setNumber` is now a LEGACY
// BRIDGE to the `RenameRoomCommand` (via `window.commandManager`), mirroring
// `SetRoomNameHandler` (`room.setName`, §FIX-ROOM-SETNAME-STORE / L-75) and its
// sibling bridges `room.rename` / `room.delete`.
//
// Root cause (identical to L-75): the DETECTED / RENDERED / PERSISTED rooms live
// in the legacy room-topology `RoomStore` (`window.roomStore`), NOT this plugin's
// SDK `RoomsState`. The previous implementation declared `affectedStores:['room']`
// while the bus contributes the plugin RoomStore under storeKey `'rooms'`, so
// `buildContext` threw "required store 'room' is missing" (ADR-002 §3 / R1A-16)
// before it ever ran; even had it run it mutated a disconnected store that neither
// `RoomLabelRenderer` (`bim-room-updated`) nor the persistence path reads.
//
// `RenameRoomCommand` accepts `{ name?, roomNumber? }`; forwarding `roomNumber`
// (empty string CLEARS the number, matching the legacy `roomNumber` field) runs
// `roomStore.update()` → emits `bim-room-updated` → the plan room tag re-draws and
// the change is saved/loaded. `affectedStores` is `[]` (no Immer patch — the
// legacy `commandManager` owns the undo step).
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
import { RenameRoomCommand } from '@pryzm/command-registry';

export interface SetRoomNumberPayload {
  readonly roomId: string;
  /** `undefined` or `''` clears the number. */
  readonly number?: string;
}

export class SetRoomNumberHandler
  implements CommandHandler<SetRoomNumberPayload, Record<string, unknown>>
{
  readonly type = 'room.setNumber';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomNumberPayload,
  ): ValidationResult {
    // Existence is validated by the legacy RenameRoomCommand against the real
    // RoomStore; only the payload shape is checked here.
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.number !== undefined && typeof cmd.number !== 'string') {
      return { valid: false, reason: 'number must be a string when present' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomNumberPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        console.error('[room.setNumber.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      if (cm) {
        try {
          // Empty string clears the number (legacy `roomNumber` field).
          cm.execute(new RenameRoomCommand(cmd.roomId, { roomNumber: cmd.number ?? '' }));
        } catch (e) {
          console.error('[room.setNumber.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
