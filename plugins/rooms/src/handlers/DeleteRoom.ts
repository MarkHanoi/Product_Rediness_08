// DeleteRoomHandler — F-1.x migration bridge (was: plugin-store delete).
//
// The detected / rendered rooms live in the LEGACY RoomStore + bimManager (the
// `RoomDetectionEngine` registers them there, and `room.rename` already bridges
// to that world) — NOT in the plugin SDK `RoomsState`. So a plugin-store-only
// delete silently failed `canExecute('room not found')` / mutated the wrong
// store, and a detected room (e.g. §STAIR-VOID-EXCLUDE's phantom stair cell)
// was never actually removed. Exactly like `RenameRoomHandler`, this handler now
// bridges to the legacy `DeleteRoomCommand` via `window.commandManager`, which
// does the full removal (roomStore.remove + bimManager.unregisterElement +
// elementRegistry.unregister + semantic-graph cleanup) and registers its own
// inverse on the legacy undo stack. Governance: C11 (mutation via the command
// path), ADR-0063 / ADR-0066 (one non-habitable stair void).
// TODO(F-1.4): replace with an authoritative room-store Immer delete once the
// detected-room world is migrated off the legacy RoomStore.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DeleteRoomCommand } from '@pryzm/command-registry';

export interface DeleteRoomPayload {
  readonly roomId: string;
}

export class DeleteRoomHandler implements CommandHandler<DeleteRoomPayload, Record<string, unknown>> {
  readonly type = 'room.delete';
  // Bridges to the legacy command manager — this handler mutates NO plugin store
  // (matches RenameRoomHandler's `affectedStores: []`).
  readonly affectedStores = [] as const;

  canExecute(_ctx: HandlerContext<Record<string, unknown>>, cmd: DeleteRoomPayload): ValidationResult {
    // Existence is validated by the legacy DeleteRoomCommand against the real
    // RoomStore (the plugin store does not hold detected rooms), so only the
    // payload shape is checked here.
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    return { valid: true };
  }

  execute(_ctx: HandlerContext<Record<string, unknown>>, cmd: DeleteRoomPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        console.error('[room.delete.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      if (cm) {
        try {
          cm.execute(new DeleteRoomCommand(cmd.roomId));
        } catch (e) {
          console.error('[room.delete.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
