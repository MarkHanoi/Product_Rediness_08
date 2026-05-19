/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/UpdateRoomFinishesCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData, RoomFinishes } from '@pryzm/room-topology';

export class UpdateRoomFinishesCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.UPDATE_ROOM_FINISHES;
  timestamp = Date.now();
  targetIds: string[];

  // §07 / M5 fix: full pre-update snapshot.  RoomFinishes is nested and a
  // partial restore using `{ finishes: ... }` cannot reproduce derived
  // metadata fields (modifiedAt / version) bumped by the original update.
  private snapshot?: RoomData;

  constructor(
    private readonly roomId: string,
    private readonly finishes: RoomFinishes,
  ) {
    this.targetIds = [roomId];
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (!roomStore.getById(this.roomId)) return { ok: false, reason: `Room '${this.roomId}' not found` };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      const current = roomStore.getById(this.roomId);
      if (!current) return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      this.snapshot = current;
      const patch: Partial<RoomData> = { finishes: this.finishes };
      roomStore.update(this.roomId, patch);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.snapshot) {
      return { success: false, affectedElementIds: [], error: 'Cannot undo — snapshot missing' };
    }
    try {
      roomStore.restoreSnapshot(this.snapshot);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { roomId: this.roomId, finishes: this.finishes },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
