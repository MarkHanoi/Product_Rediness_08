/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/CreateRoomCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     Yes — creates a new RoomData record
 *   Store Registry Impact: Yes — registers with bimManager, elementRegistry
 *   Undo/Redo Impact:    Yes — remove room on undo
 *   Spatial Impact:      Yes — registers on level
 *   Event Bus Impact:    Yes — RoomStore emits 'add'
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Spatial registration order (§R-3): store → bimManager → elementRegistry
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData } from '@pryzm/room-topology';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { assignUniqueRoomNumber } from './RoomNumbering';

export class CreateRoomCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.CREATE_ROOM;
  timestamp = Date.now();
  targetIds: string[];

  constructor(private roomData: RoomData) {
    this.targetIds = [roomData.id];
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) {
      return { ok: false, reason: 'RoomStore not available in context' };
    }
    if (!ctx.bimManager.getLevelById(this.roomData.levelId)) {
      return { ok: false, reason: `Level '${this.roomData.levelId}' not found` };
    }
    if (!this.roomData.boundary?.polygon || this.roomData.boundary.polygon.length < 3) {
      return { ok: false, reason: 'Room boundary must have at least 3 vertices' };
    }
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) {
      return { success: false, affectedElementIds: [], error: 'RoomStore not available' };
    }

    try {
      const existingRooms = roomStore.getByLevel(this.roomData.levelId);
      this.roomData = assignUniqueRoomNumber(this.roomData, ctx, existingRooms);
      // ① Store first (§R-3)
      roomStore.add(this.roomData);
      // ② Spatial registration second
      ctx.bimManager.registerElement(this.roomData.id, this.roomData.levelId);
      // ③ Type registration third
      elementRegistry.registerSemantic(this.roomData.id, 'room');

      console.log(`[CreateRoomCommand] Room '${this.roomData.id}' created on level '${this.roomData.levelId}'`);
      return { success: true, affectedElementIds: [this.roomData.id] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) {
      return { success: false, affectedElementIds: [], error: 'RoomStore not available' };
    }

    try {
      roomStore.remove(this.roomData.id);
      ctx.bimManager.unregisterElement(this.roomData.id);
      elementRegistry.unregister(this.roomData.id);
      return { success: true, affectedElementIds: [this.roomData.id] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { roomData: this.roomData },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
