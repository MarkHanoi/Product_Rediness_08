/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/UpdateRoomCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     Yes — updates RoomData fields
 *   Undo/Redo Impact:    Yes — stores previous state snapshot
 *   Store Registry Impact: No
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData } from '@pryzm/room-topology';

export class UpdateRoomCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.UPDATE_ROOM;
  timestamp = Date.now();
  targetIds: string[];

  private snapshot: RoomData | undefined;

  constructor(
    private readonly roomId: string,
    private readonly updates: Partial<RoomData>,
  ) {
    this.targetIds = [roomId];
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (!roomStore.getById(this.roomId)) {
      return { ok: false, reason: `Room '${this.roomId}' not found` };
    }
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      this.snapshot = roomStore.getById(this.roomId);
      if (!this.snapshot) {
        return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      }
      roomStore.update(this.roomId, this.updates);
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
      payload: { roomId: this.roomId, updates: this.updates },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
