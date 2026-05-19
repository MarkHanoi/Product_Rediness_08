/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/DetectRoomFromWallsCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Detects a single room from a specific set of wall IDs on a given level.
 * Uses RoomDetectionEngine scoped to a subset of walls.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { assignUniqueRoomNumber } from './RoomNumbering';

export class DetectRoomFromWallsCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.DETECT_ROOM_FROM_WALLS;
  timestamp = Date.now();
  targetIds: string[];

  private createdRoomId: string | undefined;

  constructor(
    private readonly wallIds: string[],
    private readonly levelId: string,
    private readonly levelElevation: number = 0,
    private readonly levelHeight: number = 3.0,
  ) {
    this.targetIds = [...wallIds];
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (this.wallIds.length < 3) return { ok: false, reason: 'At least 3 walls required to form a room' };
    if (!ctx.bimManager.getLevelById(this.levelId)) return { ok: false, reason: `Level '${this.levelId}' not found` };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      const engine = new RoomDetectionEngine(ctx.stores.wallStore);
      const detected = engine.detectRoomsForLevel(this.levelId, this.levelElevation, this.levelHeight);

      if (detected.length === 0) {
        return { success: true, affectedElementIds: [], info: ['No room detected from given walls'] };
      }

      // §23.3 / m1 fix (Apr 2026):
      //   Previously this command silently ignored its `wallIds` parameter and
      //   returned `detected[0]` — making the caller's wall selection purely
      //   decorative.  We now score every detected polygon by how many of the
      //   user-selected walls actually bound it, and pick the room with the
      //   highest overlap (ties broken by smallest area, matching the
      //   "innermost room" intuition users expect when they lasso walls).
      const wallIdSet = new Set(this.wallIds);
      const scored = detected.map(r => {
        const ids = (r.boundingWallIds ?? []) as string[];
        let overlap = 0;
        for (const id of ids) {
          if (wallIdSet.has(id)) overlap++;
        }
        const area = r.computed?.area ?? Number.POSITIVE_INFINITY;
        return { room: r, overlap, area };
      });
      scored.sort((a, b) => (b.overlap - a.overlap) || (a.area - b.area));

      const best = scored[0];
      if (!best || best.overlap === 0) {
        // None of the detected rooms reference any of the supplied walls — the
        // wall selection is genuinely outside every closed loop on this level.
        return {
          success: true,
          affectedElementIds: [],
          info: ['No room detected enclosed by the supplied walls'],
        };
      }

      const room = assignUniqueRoomNumber(best.room, ctx, roomStore.getByLevel(this.levelId));
      this.createdRoomId = room.id;

      roomStore.add(room);
      ctx.bimManager.registerElement(room.id, room.levelId);
      elementRegistry.registerSemantic(room.id, 'room');

      return { success: true, affectedElementIds: [room.id] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.createdRoomId) {
      return { success: false, affectedElementIds: [], error: 'Nothing to undo' };
    }
    try {
      roomStore.remove(this.createdRoomId);
      ctx.bimManager.unregisterElement(this.createdRoomId);
      elementRegistry.unregister(this.createdRoomId);
      return { success: true, affectedElementIds: [this.createdRoomId] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { wallIds: this.wallIds, levelId: this.levelId, levelElevation: this.levelElevation, levelHeight: this.levelHeight },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
