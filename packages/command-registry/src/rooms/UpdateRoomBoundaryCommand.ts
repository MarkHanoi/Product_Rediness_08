/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/UpdateRoomBoundaryCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Updates the boundary polygon. Increments detectionVersion in metadata.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData, RoomBoundary } from '@pryzm/room-topology';

export class UpdateRoomBoundaryCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.UPDATE_ROOM_BOUNDARY;
  timestamp = Date.now();
  targetIds: string[];

  private snapshot: RoomData | undefined;

  constructor(
    private readonly roomId: string,
    private readonly newBoundary: RoomBoundary,
    private readonly newBoundingWallIds?: string[],
  ) {
    this.targetIds = [roomId];
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (!roomStore.getById(this.roomId)) return { ok: false, reason: `Room '${this.roomId}' not found` };
    if (this.newBoundary.polygon.length < 3) return { ok: false, reason: 'New boundary must have at least 3 vertices' };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      this.snapshot = roomStore.getById(this.roomId);
      if (!this.snapshot) return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };

      const patch: Partial<RoomData> = {
        boundary: this.newBoundary,
        metadata: {
          ...this.snapshot.metadata,
          detectionVersion: (this.snapshot.metadata.detectionVersion ?? 0) + 1,
        },
      };

      if (this.newBoundingWallIds !== undefined) {
        patch.boundingWallIds = this.newBoundingWallIds;
      }

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
      payload: { roomId: this.roomId, newBoundary: this.newBoundary, newBoundingWallIds: this.newBoundingWallIds },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
