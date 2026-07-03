// SetRoomNameHandler — rename a room (S25).
//
// §FIX-ROOM-SETNAME-STORE (L-75) — `room.setName` is now a LEGACY BRIDGE to the
// `RenameRoomCommand` (via `window.commandManager`), mirroring `RenameRoomHandler`
// (`room.rename`) and `DeleteRoomHandler` (`room.delete`) in this directory.
//
// Root cause of L-75: the DETECTED / RENDERED / PERSISTED rooms live in the
// legacy room-topology `RoomStore` (`window.roomStore`, constructed in
// `apps/editor/src/engine/initBuilders.ts`), NOT in this plugin's SDK
// `RoomsState`. The previous implementation mutated the plugin `RoomsState`, a
// store that neither `RoomLabelRenderer` nor the project persistence path ever
// reads. Worse, the bus never even ran it: the plugin RoomStore is contributed
// to the bus `storesProvider` under storeKey `'rooms'` (PluginRegistry.ts) while
// this handler declared `affectedStores: ['room']`, so `buildContext` threw
//   "required store 'room' is missing from HandlerContext.stores" (ADR-002 §3 /
//   R1A-16)
// before the mutation. Even with the store present the rename would have updated
// a disconnected store → no re-render, no persistence.
//
// Bridging to `RenameRoomCommand` runs `roomStore.update()` on the legacy store,
// which emits `bim-room-updated` → `RoomLabelRenderer` re-draws the plan room
// tag, and the change is saved/loaded by the project persistence path. As with
// its sibling bridges, `affectedStores` is `[]` (no Immer patch is produced here;
// the legacy `commandManager` owns the undo step).
//
// TODO(F-1.4): replace with an authoritative plugin-store Immer update once the
// detected-room world is migrated off the legacy RoomStore (merge with
// `room.rename`).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RenameRoomCommand } from '@pryzm/command-registry';

export interface SetRoomNamePayload {
  readonly roomId: string;
  readonly name: string;
}

export class SetRoomNameHandler
  implements CommandHandler<SetRoomNamePayload, Record<string, unknown>>
{
  readonly type = 'room.setName';
  // Bridges to the legacy command manager — this handler mutates NO plugin store
  // (matches RenameRoomHandler / DeleteRoomHandler's `affectedStores: []`).
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomNamePayload,
  ): ValidationResult {
    // Existence is validated by the legacy RenameRoomCommand against the real
    // RoomStore (the plugin store does not hold detected rooms), so only the
    // payload shape is checked here. An empty name is rejected (rename invariant).
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (typeof cmd.name !== 'string' || cmd.name.length === 0) {
      return { valid: false, reason: 'name must be a non-empty string' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomNamePayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        console.error('[room.setName.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      if (cm) {
        try {
          cm.execute(new RenameRoomCommand(cmd.roomId, { name: cmd.name }));
        } catch (e) {
          console.error('[room.setName.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
