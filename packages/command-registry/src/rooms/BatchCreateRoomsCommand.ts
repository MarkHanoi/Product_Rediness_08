/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/BatchCreateRoomsCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Creates multiple rooms atomically. All-or-nothing: if any room fails, undo all.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData } from '@pryzm/room-topology';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';
import { assignUniqueRoomNumbers, resolveRoomLevelPrefix } from './RoomNumbering';

export class BatchCreateRoomsCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.BATCH_CREATE_ROOMS;
  timestamp = Date.now();
  targetIds: string[];

  private createdIds: string[] = [];

  constructor(private readonly rooms: RoomData[]) {
    this.targetIds = rooms.map(r => r.id);
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (this.rooms.length === 0) return { ok: false, reason: 'No rooms to create' };
    for (const room of this.rooms) {
      if (!ctx.bimManager.getLevelById(room.levelId)) {
        return { ok: false, reason: `Level '${room.levelId}' not found for room '${room.id}'` };
      }
    }
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    this.createdIds = [];

    try {
      const roomsByLevel = new Map<string, RoomData[]>();
      for (const room of this.rooms) {
        const list = roomsByLevel.get(room.levelId) ?? [];
        list.push(room);
        roomsByLevel.set(room.levelId, list);
      }

      const roomsToCreate: RoomData[] = [];
      for (const [levelId, levelRooms] of roomsByLevel) {
        const existing = roomStore.getByLevel(levelId).map(room => room.roomNumber);
        const levelPrefix = resolveRoomLevelPrefix(levelId, ctx);
        roomsToCreate.push(...assignUniqueRoomNumbers(levelRooms, levelPrefix, existing));
      }

      for (const room of roomsToCreate) {
        roomStore.add(room);
        ctx.bimManager.registerElement(room.id, room.levelId);
        elementRegistry.registerSemantic(room.id, 'room');
        this.createdIds.push(room.id);
      }
      console.log(`[BatchCreateRoomsCommand] Created ${this.createdIds.length} room(s)`);
      return { success: true, affectedElementIds: [...this.createdIds] };
    } catch (err: any) {
      // Rollback any that succeeded
      for (const id of this.createdIds) {
        try { roomStore.remove(id); } catch { /* best-effort */ }
        try { ctx.bimManager.unregisterElement(id); } catch { /* best-effort */ }
        try { elementRegistry.unregister(id); } catch { /* best-effort */ }
      }
      this.createdIds = [];
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || this.createdIds.length === 0) {
      return { success: false, affectedElementIds: [], error: 'Nothing to undo' };
    }
    try {
      for (const id of this.createdIds) {
        roomStore.remove(id);
        ctx.bimManager.unregisterElement(id);
        elementRegistry.unregister(id);
        // §14 / M2 fix: clear graph edges and spatial index entries for every
        // room being rolled back, mirroring DeleteRoomCommand semantics.
        try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* best-effort */ }
        try { roomSpatialIndex.remove(id); } catch { /* best-effort */ }
      }
      const undone = [...this.createdIds];
      this.createdIds = [];
      return { success: true, affectedElementIds: undone };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { rooms: this.rooms },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
