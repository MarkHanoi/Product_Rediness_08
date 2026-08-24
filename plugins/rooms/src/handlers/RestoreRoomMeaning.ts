/**
 * room.restoreMeaning — §ROOM-TOMBSTONE (L-10814), C94 §TOBE.6 **RM-3**.
 *
 * The APPLY half of the founder's **DERIVATION + TOMBSTONE** ruling (2026-08-24). The
 * register (`@pryzm/command-registry` `roomTombstoneRegister`) keeps the meaning of an
 * authored room that a re-detection destroyed; the chat asks whether to put it back; and
 * this verb is what "yes" dispatches.
 *
 * ## WHY A VERB AND NOT N VERBS
 *
 * ⭐ Restoring a room's meaning is ONE user gesture and must cost ONE Ctrl+Z. Composing it
 * from `room.setName` + `room.setNumber` + `room.setOccupancy` + `room.setFinish` would
 * cost FOUR undo entries for one answer to one question — the fan-out C94's RAC section
 * already flags as a migration target on `set-room-occupancy`, and the exact shape C81
 * forbids. One `UpdateRoomCommand` carries the whole patch, snapshots the whole
 * pre-edit record and restores it through `RoomStore.restoreSnapshot`, so undo is sound
 * by construction (C94 §1.2).
 *
 * ## ⛔ WHAT THIS VERB MUST NOT BECOME
 *
 * ⛔ **It restores MEANING, never IDENTITY.** The ruling did not grant persistent room
 * ids; the recovered room keeps its fresh `crypto.randomUUID()`. This handler therefore
 * accepts no `id` and writes none. A room tag or schedule row that pointed at the lost
 * room stays pointing at nothing, and the offer copy says so before the user answers.
 *
 * ⛔ **It is never dispatched automatically.** The founder's standing rule is *ASK, never
 * auto-edit*; the only caller is a Confirm the user pressed.
 *
 * Bridge shape, `affectedStores: []` and the `__pryzmInitComplete` / `commandManager`
 * refusals are all copied verbatim from this directory's siblings
 * (§FIX-DEAD-VERB-ROOM-BRIDGE, W3-3): reporting success for a bridge that could not run
 * is the Class-A dead verb, and this file must not re-introduce it.
 */

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateRoomCommand } from './legacyCommands.js';

/** The meaning a tombstone can put back. Deliberately no `id`, no geometry. */
export interface RestoreRoomMeaningPayload {
  readonly roomId: string;
  readonly name?: string;
  readonly roomNumber?: string;
  readonly department?: string;
  readonly occupancyType?: string;
  readonly occupancyLoad?: number;
  readonly programmeArea?: number;
  readonly finishes?: Record<string, unknown>;
  readonly properties?: Record<string, unknown>;
  readonly ifcData?: unknown;
  readonly revitId?: string;
  readonly phase?: string;
}

/** The keys this verb is allowed to write. Anything else in the payload is ignored. */
const RESTORABLE_KEYS = [
  'name', 'roomNumber', 'department', 'occupancyType', 'occupancyLoad',
  'programmeArea', 'finishes', 'properties', 'ifcData', 'revitId', 'phase',
] as const;

export class RestoreRoomMeaningHandler
  implements CommandHandler<RestoreRoomMeaningPayload, Record<string, unknown>>
{
  readonly type = 'room.restoreMeaning';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RestoreRoomMeaningPayload,
  ): ValidationResult {
    if (typeof cmd?.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    // ⛔ An empty patch is a REFUSAL, not a no-op success. "Restored nothing" and
    // "restored everything you asked for" must never return the same value
    // (§CONTEXT-DATA-HONESTY; C16 CA-18).
    if (!RESTORABLE_KEYS.some(k => cmd[k] !== undefined)) {
      return { valid: false, reason: 'nothing to restore — the payload carried no room details' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RestoreRoomMeaningPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        throw new Error(
          'room.restoreMeaning: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      if (!cm) {
        throw new Error(
          'room.restoreMeaning: the legacy command manager is not available, so the details could not be restored.',
        );
      }

      // ⛔ ONLY the declared keys, and only the ones actually supplied. Spreading the
      // payload wholesale would carry `roomId` into the patch and let a future caller
      // smuggle `id` or `boundary` through a verb whose whole contract is that it
      // touches neither.
      const updates: Record<string, unknown> = {};
      for (const k of RESTORABLE_KEYS) {
        if (cmd[k] !== undefined) updates[k] = cmd[k];
      }

      try {
        // ONE command, ONE undo entry — see the header.
        cm.execute(new UpdateRoomCommand(cmd.roomId, updates as never));
      } catch (e) {
        console.error('[room.restoreMeaning.handler] bridge failed:', e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
