// @migration Sprint-AC: promoted from src/engine/subsystems/spatial/RoomQueryService.ts
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Spatial Intelligence — Room Query Engine
 * Phase:             Phase 10 (Room Living System)
 * Files Modified:    src/spatial/RoomQueryService.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/17-ROOM-GRAPH-QUERY-ENGINE-CONTRACT.md §3
 *   docs/01_ELEMENTS/09_Rooms_Contract/11-ROOM-RELATIONSHIP-WORLD-MODEL.md
 *
 * THE SPATIAL API LAYER — everything else depends on this.
 *
 * Provides the full room query API:
 *   getRoom(elementId)           — which room does this element belong to?
 *   getAdjacentRooms(roomId)     — rooms sharing walls
 *   getConnectedRooms(roomId)    — rooms reachable via doors
 *   findPath(start, end)         — BFS door-traversal path
 *   getElementsInRoom(roomId)    — all elements in a room
 *   getBoundaryElements(roomId)  — walls forming the room boundary
 *   getGraph(levelId)            — raw graph access
 *
 * Compliance:
 *   - Read-only: never writes to any store.
 *   - No THREE.js imports.
 *   - All store access via StoreRegistry.getStoreForType() at call time — never at import time.
 *   - Registered on window as window.roomQueryService.
 */

import { roomGraphService, RoomGraph, RoomEdge } from './RoomGraphService';
import { RoomRelationshipService } from '@pryzm/room-topology';
import type { RoomData } from '@pryzm/room-topology';
import { storeRegistry } from '@pryzm/core-app-model';

// ── Public Types ──────────────────────────────────────────────────────────────

export interface ElementRef {
  id: string;
  type: string;
  levelId: string;
}

export interface BoundaryRef {
  id: string;
  type: 'wall' | 'curtain-wall';
  levelId: string;
}

export interface PathResult {
  found: boolean;
  path: string[];          // Room IDs in order
  hopCount: number;        // Number of doors to traverse
  roomNames: string[];     // Human-readable names for display
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RoomQueryService {

  // ── Element → Room ────────────────────────────────────────────────────────

  /**
   * Find which room an element belongs to, given its ID.
   *
   * Strategy (in order):
   *   1. If it's a door → use getDoorRelationships → roomFrom
   *   2. If it's a wall → probe both sides → return first room found
   *   3. If it's a furniture/plumbing/column → probe centroid via point-in-polygon
   *   4. Fallback → null
   */
  getRoom(elementId: string): RoomData | null {
    const roomStore  = storeRegistry.getStoreForType('room') as any;
    const wallStore  = storeRegistry.getStoreForType('wall') as any;
    const doorStore  = storeRegistry.getStoreForType('door') as any;

    if (!roomStore) return null;

    // Check if it's a door
    if (doorStore) {
      const door = doorStore.getById(elementId);
      if (door && wallStore) {
        const wall = wallStore.getById(door.wallId);
        if (wall) {
          const rel = RoomRelationshipService.getDoorRelationships(door, wall);
          const ref = rel.roomFrom ?? rel.roomTo;
          if (ref) return roomStore.getById(ref.id) ?? null;
        }
      }
    }

    // Check if it's a wall
    if (wallStore) {
      const wall = wallStore.getById(elementId);
      if (wall) {
        const refs = RoomRelationshipService.getWallAdjacentRooms(wall);
        if (refs.length > 0) return roomStore.getById(refs[0].id) ?? null;
      }
    }

    // Check furniture / plumbing / column stores
    const furnitureStore  = storeRegistry.getStoreForType('furniture') as any;
    const plumbingStore   = storeRegistry.getStoreForType('plumbing') as any;
    const columnStore     = storeRegistry.getStoreForType('column') as any;

    for (const store of [furnitureStore, plumbingStore, columnStore]) {
      if (!store) continue;
      const element = (typeof store.getById === 'function') ? store.getById(elementId) : null;
      if (!element) continue;

      // Try to get XZ position from the element
      const pos = this._getElementPosition(element);
      if (!pos) continue;

      const levelId: string = element.levelId ?? element.level ?? '';
      if (!levelId) continue;

      const ref = RoomRelationshipService.getContainingRoom(pos.x, pos.z, levelId);
      if (ref) return roomStore.getById(ref.id) ?? null;
    }

    return null;
  }

  // ── Room → Adjacent Rooms ─────────────────────────────────────────────────

  /**
   * Returns all rooms sharing a boundary wall with the given room.
   * Does NOT require a door — shared geometry is sufficient.
   */
  getAdjacentRooms(roomId: string): RoomData[] {
    const adjacentIds = roomGraphService.getAdjacentRooms(roomId);
    return this._resolveRooms(adjacentIds);
  }

  // ── Room → Connected Rooms ────────────────────────────────────────────────

  /**
   * Returns all rooms directly reachable via one door from the given room.
   */
  getConnectedRooms(roomId: string): RoomData[] {
    const connectedIds = roomGraphService.getConnectedRooms(roomId);
    return this._resolveRooms(connectedIds);
  }

  // ── Pathfinding ───────────────────────────────────────────────────────────

  /**
   * BFS shortest path from startRoomId to endRoomId via door edges.
   * Returns a PathResult with the ordered room ID list and human-readable names.
   */
  findPath(startRoomId: string, endRoomId: string): PathResult {
    const path = roomGraphService.findPath(startRoomId, endRoomId);
    const roomStore = storeRegistry.getStoreForType('room') as any;

    const roomNames = path.map((id: string) => {
      if (!roomStore) return id.substring(0, 8);
      const room: RoomData | undefined = roomStore.getById(id);
      return room?.name || `Room ${id.substring(0, 8)}`;
    });

    return {
      found: path.length > 0,
      path,
      hopCount: Math.max(0, path.length - 1),
      roomNames,
    };
  }

  // ── Accessible Pathfinding (Phase C — Feature 9) ─────────────────────────

  /**
   * BFS shortest path using only accessible door edges (doorWidth >= 0.775 m).
   * Returns a PathResult extended with `inaccessibleCount` — the number of
   * door edges on this level that are narrower than the accessible threshold.
   *
   * Contract: 18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.9
   */
  findAccessiblePath(startRoomId: string, endRoomId: string): PathResult & { inaccessibleCount: number } {
    const empty = {
      found: false, path: [] as string[], hopCount: 0,
      roomNames: [] as string[], inaccessibleCount: 0,
    };

    const roomStore = storeRegistry.getStoreForType('room') as any;
    if (!roomStore) return empty;

    const startRoom = roomStore.getById(startRoomId);
    if (!startRoom) return empty;

    const levelId: string = startRoom.levelId;

    // Get the full graph for this level (triggers lazy build if dirty)
    let graph: ReturnType<typeof roomGraphService.getGraph>;
    try { graph = roomGraphService.getGraph(levelId); } catch { return empty; }

    // Count inaccessible edges for the warning message
    let inaccessibleCount = 0;
    // Build accessible adjacency map from edges
    const accessibleNeighbours = new Map<string, string[]>();

    for (const edge of graph.edges.values()) {
      if (!edge.isAccessible) { inaccessibleCount++; continue; }
      // Bidirectional
      if (!accessibleNeighbours.has(edge.fromRoomId)) accessibleNeighbours.set(edge.fromRoomId, []);
      if (!accessibleNeighbours.has(edge.toRoomId))   accessibleNeighbours.set(edge.toRoomId,   []);
      accessibleNeighbours.get(edge.fromRoomId)!.push(edge.toRoomId);
      accessibleNeighbours.get(edge.toRoomId)!.push(edge.fromRoomId);
    }

    if (startRoomId === endRoomId) {
      const name = startRoom.name ?? `Room ${startRoomId.substring(0, 8)}`;
      return { found: true, path: [startRoomId], hopCount: 0, roomNames: [name], inaccessibleCount };
    }

    // BFS over accessible neighbours only
    const visited = new Set<string>();
    const queue: Array<{ roomId: string; path: string[] }> = [
      { roomId: startRoomId, path: [startRoomId] },
    ];

    while (queue.length > 0) {
      const item = queue.shift()!;
      const { roomId, path } = item;
      if (visited.has(roomId)) continue;
      visited.add(roomId);

      for (const neighbourId of accessibleNeighbours.get(roomId) ?? []) {
        const newPath = [...path, neighbourId];
        if (neighbourId === endRoomId) {
          const roomNames = newPath.map(id => {
            const r = roomStore.getById(id);
            return r?.name ?? `Room ${id.substring(0, 8)}`;
          });
          return {
            found: true,
            path: newPath,
            hopCount: newPath.length - 1,
            roomNames,
            inaccessibleCount,
          };
        }
        if (!visited.has(neighbourId)) {
          queue.push({ roomId: neighbourId, path: newPath });
        }
      }
    }

    return { ...empty, inaccessibleCount };
  }

  // ── Room Contents ─────────────────────────────────────────────────────────

  /**
   * Returns all elements (furniture, doors, windows, columns, plumbing) that
   * belong to the given room. Uses point-in-polygon for contained elements
   * and wall-boundary probing for boundary elements.
   */
  getElementsInRoom(roomId: string): ElementRef[] {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    if (!roomStore) return [];

    const room: RoomData | undefined = roomStore.getById(roomId);
    if (!room) return [];

    const results: ElementRef[] = [];

    // Doors — check all doors whose wall is a bounding wall
    const doorStore = storeRegistry.getStoreForType('door') as any;
    const wallStore = storeRegistry.getStoreForType('wall') as any;
    if (doorStore && wallStore) {
      for (const door of doorStore.getAll()) {
        if (room.boundingWallIds.includes(door.wallId)) {
          const wall = wallStore.getById(door.wallId);
          if (wall) {
            const rel = RoomRelationshipService.getDoorRelationships(door, wall);
            if (rel.roomFrom?.id === roomId || rel.roomTo?.id === roomId) {
              results.push({ id: door.id, type: 'door', levelId: room.levelId });
            }
          }
        }
      }
    }

    // Furniture
    const furnitureStore = storeRegistry.getStoreForType('furniture') as any;
    if (furnitureStore && typeof furnitureStore.getByLevel === 'function') {
      for (const item of furnitureStore.getByLevel(room.levelId)) {
        const pos = this._getElementPosition(item);
        if (!pos) continue;
        const ref = RoomRelationshipService.getContainingRoom(pos.x, pos.z, room.levelId);
        if (ref?.id === roomId) {
          results.push({ id: item.id, type: 'furniture', levelId: room.levelId });
        }
      }
    }

    // Plumbing
    const plumbingStore = storeRegistry.getStoreForType('plumbing') as any;
    if (plumbingStore && typeof plumbingStore.getAll === 'function') {
      for (const item of plumbingStore.getAll()) {
        if (item.levelId !== room.levelId) continue;
        const pos = this._getElementPosition(item);
        if (!pos) continue;
        const ref = RoomRelationshipService.getContainingRoom(pos.x, pos.z, room.levelId);
        if (ref?.id === roomId) {
          results.push({ id: item.id, type: 'plumbing', levelId: room.levelId });
        }
      }
    }

    return results;
  }

  /**
   * Returns the walls and curtain walls forming the boundary of a room.
   */
  getBoundaryElements(roomId: string): BoundaryRef[] {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    const wallStore = storeRegistry.getStoreForType('wall') as any;
    if (!roomStore || !wallStore) return [];

    const room: RoomData | undefined = roomStore.getById(roomId);
    if (!room) return [];

    const results: BoundaryRef[] = [];

    for (const wallId of room.boundingWallIds) {
      const wall = wallStore.getById(wallId);
      if (!wall) continue;
      results.push({
        id: wallId,
        type: 'wall',
        levelId: room.levelId,
      });
    }

    return results;
  }

  // ── Graph Access ──────────────────────────────────────────────────────────

  /**
   * Returns the raw room graph for a level (built lazily).
   */
  getGraph(levelId: string): RoomGraph {
    return roomGraphService.getGraph(levelId);
  }

  /**
   * Returns all door edges for a room.
   */
  getEdgesForRoom(roomId: string): RoomEdge[] {
    return roomGraphService.getEdgesForRoom(roomId);
  }

  /**
   * Returns all rooms reachable from roomId via any number of door hops.
   */
  getConnectedComponent(roomId: string): RoomData[] {
    const ids = roomGraphService.getConnectedComponent(roomId);
    return this._resolveRooms(ids.filter((id: string) => id !== roomId));
  }

  // ── Diagnostic Helpers ────────────────────────────────────────────────────

  /**
   * Returns a human-readable summary of the room graph for a level.
   * Useful for AI context payloads and debug logging.
   */
  describeGraph(levelId: string): string {
    const graph = this.getGraph(levelId);
    const roomStore = storeRegistry.getStoreForType('room') as any;

    const lines: string[] = [
      `Room Graph — Level: ${levelId}`,
      `  ${graph.nodes.size} rooms, ${graph.edges.size} door connections`,
      '',
    ];

    for (const node of graph.nodes.values()) {
      const room: RoomData | undefined = roomStore?.getById(node.roomId);
      const name = room?.name || `Room ${node.roomId.substring(0, 8)}`;
      const connected = node.connectedRooms.map((id: string) => {
        const r: RoomData | undefined = roomStore?.getById(id);
        return r?.name || id.substring(0, 8);
      }).join(', ') || '(none)';
      const adjacent = node.adjacentRooms.length;
      lines.push(`  [${name}] → door-connected: [${connected}] | wall-adjacent: ${adjacent}`);
    }

    return lines.join('\n');
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private _resolveRooms(ids: string[]): RoomData[] {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    if (!roomStore) return [];
    return ids
      .map((id: string) => roomStore.getById(id))
      .filter((r: RoomData | undefined): r is RoomData => r !== undefined);
  }

  /**
   * Attempts to extract an XZ position from an element data object.
   * Handles multiple common position formats used across PRYZM stores.
   */
  private _getElementPosition(element: any): { x: number; z: number } | null {
    if (!element) return null;

    // Format 1: { position: { x, z } }
    if (typeof element.position?.x === 'number' && typeof element.position?.z === 'number') {
      return { x: element.position.x, z: element.position.z };
    }

    // Format 2: { position: { x, y, z } } — THREE-style
    if (typeof element.position?.x === 'number' && typeof element.position?.y === 'number') {
      return { x: element.position.x, z: element.position.z ?? 0 };
    }

    // Format 3: { x, z } flat
    if (typeof element.x === 'number' && typeof element.z === 'number') {
      return { x: element.x, z: element.z };
    }

    // Format 4: { centroid: { x, z } }
    if (typeof element.centroid?.x === 'number') {
      return { x: element.centroid.x, z: element.centroid.z };
    }

    return null;
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const roomQueryService = new RoomQueryService();
