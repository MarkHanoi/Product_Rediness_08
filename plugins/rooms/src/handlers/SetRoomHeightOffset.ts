// SetRoomHeightOffsetHandler — change the room's vertical lift (S25).
//
// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — LEGACY BRIDGE to the general
// `UpdateRoomCommand` (via `window.commandManager`), mirroring `SetRoomNameHandler`
// (§FIX-ROOM-SETNAME-STORE / L-75). See that file for the full root-cause note:
// the previous `affectedStores:['room']` mismatched the bus storeKey `'rooms'` and
// threw "required store 'room' is missing" (ADR-002 §3), and the mutation targeted
// the disconnected plugin `RoomsState`.
//
// The room's vertical lift in the legacy model is `boundary.baseOffset`. The legacy
// `RoomBoundarySchema` validates the FULL boundary at `RoomStore.update()`, so a
// partial `{ boundary: { baseOffset } }` would be rejected — we read the room's
// current boundary from `window.roomStore` and forward a complete boundary with the
// new `baseOffset`. The value is still range-guarded in `canExecute` ([-10, 10] m,
// matching the schema's defensive refine). `affectedStores` is `[]` (the legacy
// commandManager owns the undo step).
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
import { UpdateRoomCommand } from '@pryzm/command-registry';

export interface SetRoomHeightOffsetPayload {
  readonly roomId: string;
  readonly heightOffset: number;
}

/** Loose read view of the legacy room record — avoids importing room-topology. */
interface LegacyRoomLike {
  readonly boundary?: { readonly baseOffset?: number; [k: string]: unknown };
}
interface LegacyRoomStoreLike {
  getById(roomId: string): LegacyRoomLike | undefined;
}

export class SetRoomHeightOffsetHandler
  implements CommandHandler<SetRoomHeightOffsetPayload, Record<string, unknown>>
{
  readonly type = 'room.setHeightOffset';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomHeightOffsetPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.heightOffset)) {
      return { valid: false, reason: 'heightOffset must be a finite number' };
    }
    if (cmd.heightOffset < -10 || cmd.heightOffset > 10) {
      return { valid: false, reason: 'heightOffset must be in [-10, 10]' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomHeightOffsetPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — an empty patch pair is
        // INDISTINGUISHABLE from "applied, nothing to change". Reporting success
        // for a command that was "ignored" is the Class-A dead verb, one layer
        // over: the user is told the model changed and it did not. Throw so the bus
        // rejects with a reason (C03 §4.6 U-4).
        throw new Error(
          'room.setHeightOffset: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const w = window as unknown as {
        commandManager?: { execute(cmd: unknown, options?: unknown): void };
        roomStore?: LegacyRoomStoreLike;
      };
      const room = w.roomStore?.getById(cmd.roomId);
      // The full boundary is required by the legacy update-gate schema; without
      // the current record we cannot build a valid patch (no plugin store here).
      if (!room?.boundary) {
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — a missing room is a FAILURE, not an
        // empty change. Reported, never swallowed.
        throw new Error(
          `room.setHeightOffset: room ${cmd.roomId} has no boundary in the room store, so it could not be updated.`,
        );
      }
      const cm = w.commandManager;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.setHeightOffset: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        try {
          const boundary = { ...room.boundary, baseOffset: cmd.heightOffset };
          cm.execute(new UpdateRoomCommand(cmd.roomId, { boundary } as never));
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.setHeightOffset did not happen.
          console.error('[room.setHeightOffset.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
