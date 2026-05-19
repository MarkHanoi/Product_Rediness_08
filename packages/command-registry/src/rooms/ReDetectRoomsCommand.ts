/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/ReDetectRoomsCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Re-detects rooms for a specific level after wall changes.
 * Fired by RoomTopologyObserver after debounce.
 * Preserves semantic data from existing rooms via centroid matching (§R-9).
 * Non-undoable — automatic background operation.
 *
 * Room numbering: [LevelIdx]-[Sequence] e.g. "00-001".
 *   Level index is 0-based (sorted by elevation).
 *   Sequence is 1-based within the level.
 *   Duplicate or non-matching room numbers are normalised to this format.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';
import { assignUniqueRoomNumbers, resolveRoomLevelPrefix } from './RoomNumbering';

// ── Command ───────────────────────────────────────────────────────────────────

export class ReDetectRoomsCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.REDETECT_ROOMS;
  timestamp = Date.now();
  targetIds: string[] = [];

  /**
   * Room re-detection is a derived/background operation — a side-effect of wall
   * changes, not a direct user action.  Setting nonUndoable = true tells
   * CommandManager to execute the command (with rollback protection) but skip
   * pushing it onto the undo history stack.  This prevents phantom undo entries
   * that would force the user to press Ctrl+Z multiple times to undo a single
   * wall operation.  The undo() method remains a no-op for consistency.
   */
  readonly nonUndoable = true;

  private createdIds: string[] = [];

  constructor(
    private readonly levelId: string,
    private readonly levelElevation: number = 0,
    private readonly levelHeight: number = 3.0,
  ) {}

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      const engine = new RoomDetectionEngine(ctx.stores.wallStore);
      const detected = engine.detectRoomsForLevel(this.levelId, this.levelElevation, this.levelHeight);
      const existing = roomStore.getByLevel(this.levelId);
      const merged   = engine.mergeWithExisting(detected, existing);

      // Assign sequential room numbers and names to newly detected rooms
      const levelPrefix  = resolveRoomLevelPrefix(this.levelId, ctx);
      const withNumbers  = assignUniqueRoomNumbers(merged, levelPrefix);

      // PERF-FIX (Apr 2026): Diff-based churn. mergeWithExisting() preserves
      // room IDs for matched rooms, so the previous "remove all + re-add all"
      // pattern was performing dozens of redundant unregister/register cycles
      // on every wall edit (each one logs to console, fires events, and
      // touches the SemanticGraph + SpatialIndex). We now only mutate the
      // rooms that actually changed.
      const newIds = new Set(withNumbers.map(r => r.id));
      const existingIds = new Set(existing.map(r => r.id));

      // 1. Drop rooms that no longer exist in the new detection set.
      for (const r of existing) {
        if (newIds.has(r.id)) continue;          // preserved — leave registrations in place
        try { roomStore.remove(r.id); } catch (_) {}
        try { ctx.bimManager.unregisterElement(r.id); } catch (_) {}
        try { elementRegistry.unregister(r.id); } catch (_) {}
        try { semanticGraphManager.removeAllRelationshipsForElement(r.id); } catch (_) {}
        try { roomSpatialIndex.remove(r.id); } catch (_) {}
      }

      // 2. Add or update rooms.
      // ROBUSTNESS-FIX (Apr 2026): Per-room try/catch.  Previously a single
      // schema-validation failure (e.g. self-intersecting boundary polygon
      // produced by an unusual wall topology) would throw out of this loop
      // into the outer catch, aborting the whole batch and leaving the user
      // with NO rooms even though the other 8/9 polygons were valid.  Now we
      // log and skip the bad room so the rest of the batch still appears.
      this.createdIds = [];
      const skipped: Array<{ id: string; reason: string }> = [];
      for (const room of withNumbers) {
        try {
          const isNew = !existingIds.has(room.id);
          if (isNew) {
            roomStore.add(room);
            try { ctx.bimManager.registerElement(room.id, room.levelId); } catch (_) {}
            try { elementRegistry.registerSemantic(room.id, 'room'); } catch (_) {}
          } else {
            // Preserved room: data may have changed (boundingWalls, area,
            // centroid). Update the store entry but leave registry/bimManager
            // alone — IDs and types are unchanged.
            roomStore.update(room.id, room);
            // Stale graph relationships need clearing because boundingWallIds
            // may have changed; they're rebuilt below.
            semanticGraphManager.removeAllRelationshipsForElement(room.id);
            roomSpatialIndex.remove(room.id);
          }
          this.createdIds.push(room.id);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          skipped.push({ id: room.id, reason });
          console.warn(
            `[ReDetectRoomsCommand] Skipping room ${room.id} due to validation/store failure: ${reason}`,
          );
          continue;
        }

        // Phase D — D-1: SemanticGraph — room boundedBy each bounding wall.
        try {
          for (const wallId of room.boundingWallIds ?? []) {
            semanticGraphManager.addRelationship({
              type: 'boundedBy', sourceId: room.id, targetId: wallId, createdBy: 'system',
            });
          }
        } catch (err) {
          console.warn('[ReDetectRoomsCommand] SemanticGraph boundedBy write failed:', err);
        }

        // Phase D — D-5: SpatialIndex — insert room AABB derived from polygon centroid + area.
        // boundingWallIds exist but no polygon is stored on RoomData; use the convex hull of
        // the polygon vertices when available, otherwise fall back to centroid ± √(area/π).
        try {
          const { centroid, area } = room.computed ?? {};
          if (centroid) {
            const r2 = Math.sqrt((area ?? 10) / Math.PI);
            roomSpatialIndex.insert(room.id, {
              minX: centroid.x - r2,
              minZ: centroid.z - r2,
              maxX: centroid.x + r2,
              maxZ: centroid.z + r2,
            });
          }
        } catch (err) {
          console.warn('[ReDetectRoomsCommand] SpatialIndex insert failed:', err);
        }
      }

      // Phase D — D-1: SemanticGraph — adjacentTo and connectedTo after all rooms are created.
      try {
        const wallStore = ctx.stores.wallStore;
        const created = withNumbers;

        // Build a set of wall IDs that carry at least one door opening (for connectedTo).
        const doorWallIds = new Set<string>();
        for (const room of created) {
          for (const wallId of room.boundingWallIds ?? []) {
            const wall = wallStore.getById(wallId);
            if (wall?.openings?.some((o: any) => o.type === 'door')) {
              doorWallIds.add(wallId);
            }
          }
        }

        // Compare all room pairs to find shared walls.
        for (let i = 0; i < created.length; i++) {
          const wallsA = new Set(created[i].boundingWallIds ?? []);
          for (let j = i + 1; j < created.length; j++) {
            const shared = (created[j].boundingWallIds ?? []).filter(w => wallsA.has(w));
            if (shared.length === 0) continue;

            const hasDoor = shared.some(w => doorWallIds.has(w));

            // adjacentTo — both directions (bidirectional)
            semanticGraphManager.addRelationship({
              type: 'adjacentTo', sourceId: created[i].id, targetId: created[j].id, createdBy: 'system',
            });
            semanticGraphManager.addRelationship({
              type: 'adjacentTo', sourceId: created[j].id, targetId: created[i].id, createdBy: 'system',
            });

            // connectedTo — both directions when a shared wall has a door
            if (hasDoor) {
              semanticGraphManager.addRelationship({
                type: 'connectedTo', sourceId: created[i].id, targetId: created[j].id, createdBy: 'system',
              });
              semanticGraphManager.addRelationship({
                type: 'connectedTo', sourceId: created[j].id, targetId: created[i].id, createdBy: 'system',
              });
            }
          }
        }
      } catch (err) {
        console.warn('[ReDetectRoomsCommand] SemanticGraph adjacency write failed:', err);
      }

      this.targetIds = [...this.createdIds];
      console.debug(`[ReDetectRoomsCommand] Level '${this.levelId}' (prefix ${levelPrefix}): ${this.createdIds.length} room(s) detected`);
      return { success: true, affectedElementIds: [...this.createdIds] };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ReDetectRoomsCommand] Error:', msg, err);
      return { success: false, affectedElementIds: [], error: msg };
    }
  }

  /**
   * Undo is a no-op for automatic re-detection.
   * Manual room edits use their own commands which are undoable.
   */
  undo(_ctx: CommandContext): CommandResult {
    return { success: true, affectedElementIds: [] };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { levelId: this.levelId, levelElevation: this.levelElevation, levelHeight: this.levelHeight },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
