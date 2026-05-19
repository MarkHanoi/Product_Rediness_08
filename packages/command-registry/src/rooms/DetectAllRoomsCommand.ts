/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/DetectAllRoomsCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Detects all rooms on all levels. Each level is detected independently.
 * Preserves semantic data from existing rooms via centroid matching (§R-9).
 *
 * §07 / C4 fix (Apr 2026):
 *   Diff-based churn ‒ ported from ReDetectRoomsCommand. The previous
 *   "remove all + re-add all" pattern caused dozens of redundant
 *   register/unregister cycles on every detect call (each one logs to
 *   console, fires events, and touches SemanticGraph + SpatialIndex).
 *
 *   We now compute the delta between existing rooms and the merged detection
 *   set and only mutate rooms that actually changed:
 *     - removed → roomStore.remove + unregister + clear graph + clear spatial
 *     - new     → roomStore.add    + register   + add graph    + add spatial
 *     - kept    → roomStore.update + rebuild graph (boundingWalls may change)
 *                                  + refresh spatial index entry
 *
 *   Undo restores the exact pre-state via captured snapshots.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData } from '@pryzm/room-topology';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { assignUniqueRoomNumbers, resolveRoomLevelPrefix } from './RoomNumbering';

interface UndoStep {
  /** Rooms removed during execute — restore on undo. */
  removed:   RoomData[];
  /** New room IDs added during execute — remove on undo. */
  added:     string[];
  /** Pre-execute snapshots of preserved rooms whose data was rewritten. */
  preserved: RoomData[];
}

export class DetectAllRoomsCommand implements Command {
  readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.DETECT_ALL_ROOMS;
  timestamp = Date.now();
  targetIds: string[] = [];

  private undoSteps: UndoStep = { removed: [], added: [], preserved: [] };

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    const levels = ctx.bimManager.getLevels?.() ?? [];
    if (levels.length === 0) return { ok: true, warnings: ['No levels — detection will produce no rooms'] };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      const engine = new RoomDetectionEngine(ctx.stores.wallStore);
      const levels = ctx.bimManager.getLevels?.() ?? [];

      this.undoSteps = { removed: [], added: [], preserved: [] };
      const finalIds = new Set<string>();
      const allCreated: RoomData[] = []; // for cross-level adjacency edges

      for (const level of levels) {
        const detected = engine.detectRoomsForLevel(
          level.id,
          level.elevation ?? 0,
          level.height   ?? 3.0,
        );
        const existing = roomStore.getByLevel(level.id);
        const merged = engine.mergeWithExisting(detected, existing);
        const levelPrefix = resolveRoomLevelPrefix(level.id, ctx);
        const withNumbers = assignUniqueRoomNumbers(merged, levelPrefix);

        const newIds      = new Set(withNumbers.map(r => r.id));
        const existingIds = new Set(existing.map(r => r.id));

        // ① Drop rooms that no longer exist in the new detection set.
        for (const r of existing) {
          if (newIds.has(r.id)) {
            // preserved — capture pre-update snapshot for undo
            this.undoSteps.preserved.push(r);
            continue;
          }
          this.undoSteps.removed.push(r);
          try { roomStore.remove(r.id); } catch (_) {}
          try { ctx.bimManager.unregisterElement(r.id); } catch (_) {}
          try { elementRegistry.unregister(r.id); } catch (_) {}
          try { semanticGraphManager.removeAllRelationshipsForElement(r.id); } catch (_) {}
          try { roomSpatialIndex.remove(r.id); } catch (_) {}
        }

        // ② Add or update rooms.
        for (const room of withNumbers) {
          const isNew = !existingIds.has(room.id);
          try {
            if (isNew) {
              roomStore.add(room);
              try { ctx.bimManager.registerElement(room.id, room.levelId); } catch (_) {}
              try { elementRegistry.registerSemantic(room.id, 'room'); } catch (_) {}
              this.undoSteps.added.push(room.id);
            } else {
              roomStore.update(room.id, room);
              // Stale graph relationships need clearing because boundingWallIds
              // may have changed; they're rebuilt below.
              try { semanticGraphManager.removeAllRelationshipsForElement(room.id); } catch (_) {}
              try { roomSpatialIndex.remove(room.id); } catch (_) {}
            }
            finalIds.add(room.id);
            allCreated.push(room);
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`[DetectAllRoomsCommand] Skipping room ${room.id} due to validation/store failure: ${reason}`);
            continue;
          }

          // boundedBy edges — rebuilt every cycle since boundingWallIds change
          try {
            for (const wallId of room.boundingWallIds ?? []) {
              semanticGraphManager.addRelationship({
                type: 'boundedBy', sourceId: room.id, targetId: wallId, createdBy: 'system',
              });
            }
          } catch (err) {
            console.warn('[DetectAllRoomsCommand] SemanticGraph boundedBy write failed:', err);
          }

          // Spatial index — refresh the AABB
          try {
            const { centroid, area, boundingBox } = room.computed ?? {};
            if (boundingBox) {
              roomSpatialIndex.insert(room.id, boundingBox);
            } else if (centroid) {
              const r2 = Math.sqrt((area ?? 10) / Math.PI);
              roomSpatialIndex.insert(room.id, {
                minX: centroid.x - r2, minZ: centroid.z - r2,
                maxX: centroid.x + r2, maxZ: centroid.z + r2,
              });
            }
          } catch (err) {
            console.warn('[DetectAllRoomsCommand] SpatialIndex insert failed:', err);
          }
        }
      }

      // adjacentTo / connectedTo edges — computed across the entire detected set
      // (rooms only ever share walls with rooms on the same level, so no global
      // explosion).  Mirrors ReDetectRoomsCommand pairwise scan.
      try {
        const wallStore = ctx.stores.wallStore;

        // Group by level so we never compare rooms across floors.
        const byLevel = new Map<string, RoomData[]>();
        for (const r of allCreated) {
          const arr = byLevel.get(r.levelId) ?? [];
          arr.push(r);
          byLevel.set(r.levelId, arr);
        }

        for (const created of byLevel.values()) {
          const doorWallIds = new Set<string>();
          for (const room of created) {
            for (const wallId of room.boundingWallIds ?? []) {
              const wall = wallStore.getById(wallId);
              if (wall?.openings?.some((o: any) => o.type === 'door')) {
                doorWallIds.add(wallId);
              }
            }
          }
          for (let i = 0; i < created.length; i++) {
            const wallsA = new Set(created[i].boundingWallIds ?? []);
            for (let j = i + 1; j < created.length; j++) {
              const shared = (created[j].boundingWallIds ?? []).filter(w => wallsA.has(w));
              if (shared.length === 0) continue;
              const hasDoor = shared.some(w => doorWallIds.has(w));

              semanticGraphManager.addRelationship({
                type: 'adjacentTo', sourceId: created[i].id, targetId: created[j].id, createdBy: 'system',
              });
              semanticGraphManager.addRelationship({
                type: 'adjacentTo', sourceId: created[j].id, targetId: created[i].id, createdBy: 'system',
              });

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
        }
      } catch (err) {
        console.warn('[DetectAllRoomsCommand] SemanticGraph adjacency write failed:', err);
      }

      this.targetIds = Array.from(finalIds);
      console.log(
        `[DetectAllRoomsCommand] Detected ${this.targetIds.length} room(s) ` +
        `(+${this.undoSteps.added.length} new, -${this.undoSteps.removed.length} removed, ` +
        `${this.undoSteps.preserved.length} preserved) across all levels`,
      );
      return { success: true, affectedElementIds: [...this.targetIds] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      // ① Roll back newly added rooms.
      for (const id of this.undoSteps.added) {
        try { roomStore.remove(id); } catch (_) {}
        try { ctx.bimManager.unregisterElement(id); } catch (_) {}
        try { elementRegistry.unregister(id); } catch (_) {}
        try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
        try { roomSpatialIndex.remove(id); } catch (_) {}
      }

      // ② Restore preserved rooms to their pre-execute data (in case detection
      //    rewrote area / centroid / boundingWallIds).
      for (const snap of this.undoSteps.preserved) {
        try {
          if (roomStore.getById?.(snap.id)) {
            roomStore.update(snap.id, snap);
          } else {
            roomStore.add(snap);
            ctx.bimManager.registerElement(snap.id, snap.levelId);
            elementRegistry.registerSemantic(snap.id, 'room');
          }
        } catch (_) { /* best-effort */ }
      }

      // ③ Restore removed rooms.
      for (const room of this.undoSteps.removed) {
        try {
          roomStore.add(room);
          ctx.bimManager.registerElement(room.id, room.levelId);
          elementRegistry.registerSemantic(room.id, 'room');
        } catch (_) { /* best-effort */ }
      }

      const restored = [
        ...this.undoSteps.removed.map(r => r.id),
        ...this.undoSteps.preserved.map(r => r.id),
      ];
      this.undoSteps = { removed: [], added: [], preserved: [] };

      return { success: true, affectedElementIds: restored };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: {},
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
