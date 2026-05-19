/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/SetRoomOccupancyCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Changes the occupancyType; RoomColourSystem and tag overlay update via 'update' event.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData, RoomOccupancyType } from '@pryzm/room-topology';

export class SetRoomOccupancyCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.SET_ROOM_OCCUPANCY;
  timestamp = Date.now();
  targetIds: string[];

  // §07 / M5 fix: full pre-update snapshot.  Occupancy changes also drive
  // RoomColourSystem.resolve() and finishes defaults, so partial restores
  // can leave the room with mismatched colour/finishes after undo.
  private snapshot?: RoomData;

  constructor(
    private readonly roomId: string,
    private readonly occupancyType: RoomOccupancyType,
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
      const patch: Partial<RoomData> = { occupancyType: this.occupancyType };
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
      payload: { roomId: this.roomId, occupancyType: this.occupancyType },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
