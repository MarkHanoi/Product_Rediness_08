// RenameRoomHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(RenameRoomCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative room-store Immer update (merge into SetRoomName).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RenameRoomCommand, SetRoomOccupancyCommand } from '@pryzm/command-registry';

export interface RenameRoomPayload {
  readonly roomId: string;
  readonly name?: string;
  readonly roomNumber?: string;
  /** Optional RoomOccupancyType — when present, also applied (via the legacy
   *  SetRoomOccupancyCommand on the RoomStore) so the room is coloured/tagged by
   *  use. Additive: existing callers that omit it are unaffected. */
  readonly occupancy?: string;
}

export const RenameRoomHandler: CommandHandler<RenameRoomPayload, Record<string, unknown>> = {
  type: 'room.rename',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RenameRoomPayload,
  ): ValidationResult {
    if (!cmd.roomId) return { valid: false, reason: 'roomId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RenameRoomPayload,
  ): HandlerResult {
    return withHandlerSpan('room.rename.handler', { 'pryzm.command.type': 'room.rename' }, () => {
      if (!(window as any).__pryzmInitComplete) {
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — an empty patch pair is
        // INDISTINGUISHABLE from "applied, nothing to change". Reporting success
        // for a command that was "ignored" is the Class-A dead verb, one layer
        // over: the user is told the model changed and it did not. Throw so the bus
        // rejects with a reason (C03 §4.6 U-4).
        throw new Error(
          'room.rename: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.rename: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        try {
          cm.execute(new RenameRoomCommand(cmd.roomId, { name: cmd.name, roomNumber: cmd.roomNumber }));
          if (cmd.occupancy && cmd.occupancy.length > 0) {
            cm.execute(new SetRoomOccupancyCommand(cmd.roomId, cmd.occupancy as never));
          }
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.rename did not happen.
          console.error('[room.rename.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
