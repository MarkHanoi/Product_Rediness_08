/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/DeleteRoomCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     Yes — removes a RoomData record
 *   Undo/Redo Impact:    Yes — recreates room on undo
 *   Store Registry Impact: Yes — unregisters from bimManager
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData, polygonAABB } from '@pryzm/room-topology';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';

export class DeleteRoomCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.DELETE_ROOM;
  timestamp = Date.now();
  targetIds: string[];

  private snapshot: RoomData | undefined;

  constructor(private readonly roomId: string) {
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
      this.snapshot = roomStore.remove(this.roomId);
      if (!this.snapshot) {
        return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      }
      ctx.bimManager.unregisterElement(this.roomId);
      elementRegistry.unregister(this.roomId);

      // §14 / M2 fix: clear SemanticGraph edges referencing this room
      // (boundedBy / adjacentTo / connectedTo / partOf). Without this every
      // delete leaks edges into the graph and leaves stale references queryable.
      try { semanticGraphManager.removeAllRelationshipsForElement(this.roomId); } catch { /* best-effort */ }
      // Spatial index entry must follow the store record out.
      try { roomSpatialIndex.remove(this.roomId); } catch { /* best-effort */ }

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
      roomStore.add(this.snapshot);
      ctx.bimManager.registerElement(this.snapshot.id, this.snapshot.levelId);
      elementRegistry.registerSemantic(this.snapshot.id, 'room');

      // Restore spatial index entry — semantic graph edges are derived state and
      // will be rebuilt by the next ReDetectRoomsCommand run.
      //
      // GE-11, C73 §1/§3: ONE canonical AABB convention — the room's TRUE bounding
      // box. The old fallback re-inserted the room as a centroid ± sqrt(area/PI)
      // circle box, i.e. under a DIFFERENT convention than the one it was removed
      // with, understating the extent of every non-square footprint. When
      // `computed.boundingBox` is absent the box is derived from the SAME
      // definition — the polygon's own extent via polygonAABB.
      try {
        const boundingBox = this.snapshot.computed?.boundingBox
          ?? (this.snapshot.boundary?.polygon?.length ? polygonAABB(this.snapshot.boundary.polygon) : undefined);
        if (boundingBox) {
          roomSpatialIndex.insert(this.snapshot.id, boundingBox);
        }
      } catch { /* best-effort */ }

      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { roomId: this.roomId },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
