// SetRoomDepartmentHandler — assign / clear a room's department (§DEPT153, L-12540+).
//
// Mirrors SetRoomNumber.ts EXACTLY (same legacy-bridge shape, same
// §FIX-ROOM-SIBLING-HANDLERS-STORE / §FIX-DEAD-VERB-ROOM-BRIDGE rationale): the
// detected/rendered/persisted rooms live in the legacy room-topology `RoomStore`
// (`window.roomStore`), not this plugin's SDK `RoomsState`, so this forwards a
// `RenameRoomCommand` patch through `window.commandManager` and declares
// `affectedStores: []`.
//
// `RenameRoomCommand` now accepts `{ name?, roomNumber?, occupancyType?, department? }`
// (widened in §DEPT153 — see that file's own note); forwarding `department`
// (empty string CLEARS it) runs `roomStore.update()` → emits `bim-room-updated` →
// the Room Schedule's DEPARTMENT column re-reads it, and the change is
// saved/loaded. `affectedStores` is `[]` (no Immer patch — the legacy
// `commandManager` owns the undo step).
//
// This is the ONE manual entry point for department — the Properties panel's
// Department field (`RoomPropertySection.ts`, beside Occupancy) is its only
// caller today. The bulk autofill (`room.autoClassify.batch`) writes department
// through a DIFFERENT command (`BulkAutoClassifyRoomsCommand`, one undo for the
// whole batch) and never stamps the `departmentAuthored` flag this command
// does — see that command's own note for why not.
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
import { RenameRoomCommand } from './legacyCommands.js';

export interface SetRoomDepartmentPayload {
  readonly roomId: string;
  /** `undefined` or `''` clears the department (and un-authors it — see
   *  RoomMetadata.departmentAuthored). */
  readonly department?: string;
}

export class SetRoomDepartmentHandler
  implements CommandHandler<SetRoomDepartmentPayload, Record<string, unknown>>
{
  readonly type = 'room.setDepartment';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomDepartmentPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.department !== undefined && typeof cmd.department !== 'string') {
      return { valid: false, reason: 'department must be a string when present' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomDepartmentPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — an empty patch pair is
        // INDISTINGUISHABLE from "applied, nothing to change". Reporting success
        // for a command that was "ignored" is the Class-A dead verb, one layer
        // over: the user is told the model changed and it did not. Throw so the bus
        // rejects with a reason (C03 §4.6 U-4).
        throw new Error(
          'room.setDepartment: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.setDepartment: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        try {
          // Empty string clears the department (mirrors roomNumber's own clear).
          cm.execute(new RenameRoomCommand(cmd.roomId, { department: cmd.department ?? '' }));
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.setDepartment did not happen.
          console.error('[room.setDepartment.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
