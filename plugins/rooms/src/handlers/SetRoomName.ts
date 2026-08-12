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
import { RenameRoomCommand } from './legacyCommands.js';

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
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — an empty patch pair is
        // INDISTINGUISHABLE from "applied, nothing to change". Reporting success
        // for a command that was "ignored" is the Class-A dead verb, one layer
        // over: the user is told the model changed and it did not. Throw so the bus
        // rejects with a reason (C03 §4.6 U-4).
        throw new Error(
          'room.setName: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.setName: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        try {
          cm.execute(new RenameRoomCommand(cmd.roomId, { name: cmd.name }));
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.setName did not happen.
          console.error('[room.setName.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
