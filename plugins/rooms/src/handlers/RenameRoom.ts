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
import { RenameRoomCommand } from './legacyCommands.js';

export interface RenameRoomPayload {
  readonly roomId: string;
  readonly name?: string;
  readonly roomNumber?: string;
  /** Optional RoomOccupancyType — when present, applied in the SAME legacy
   *  RenameRoomCommand patch (§L-905 / C78 §12: one gesture = one undo entry;
   *  it used to ride a second SetRoomOccupancyCommand, which made one user
   *  sentence cost two Ctrl+Z). The room is coloured/tagged by use via the same
   *  store update event. Additive: existing callers that omit it are unaffected. */
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
      const cm = window.commandManager as {
        execute(cmd: unknown, options?: unknown):
          { success?: boolean; info?: string[]; error?: string } | void;
      } | undefined;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.rename: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        let result: { success?: boolean; info?: string[]; error?: string } | void;
        try {
          // §L-905 (C78 §12) — name + occupancy in ONE legacy command, so the
          // chat's "make room 003 a bedroom" (occupancy + auto-label rename) is
          // ONE history entry and one Ctrl+Z reverts both. This used to be two
          // sibling commands (RenameRoomCommand then SetRoomOccupancyCommand):
          // same net state, two undo steps for one gesture.
          result = cm.execute(new RenameRoomCommand(cmd.roomId, {
            name: cmd.name,
            roomNumber: cmd.roomNumber,
            ...(cmd.occupancy && cmd.occupancy.length > 0
              ? { occupancyType: cmd.occupancy as never }
              : {}),
          }));
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.rename did not happen.
          console.error('[room.rename.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
        // §FIX-S4-VOICE-ABSENT-TARGET, mirrored from SetRoomName.ts — a
        // canExecute refusal ("Room '<id>' not found") comes back as
        // `{success:false, info:[reason]}` without throwing; discarding it would
        // report ok=true for a rename that never happened. Only an explicit
        // `success === false` is a refusal — `undefined`/void stays success.
        if (result && result.success === false) {
          const reason = result.info?.[0] ?? result.error ?? 'no reason given';
          console.warn(`[room.rename.handler] RenameRoomCommand refused: ${reason}`);
          throw new Error(`room.rename: RenameRoomCommand refused — ${reason}`);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
