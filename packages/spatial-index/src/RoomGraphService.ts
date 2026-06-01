// @migration Sprint-AC: promoted from src/engine/subsystems/spatial/RoomGraphService.ts
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Spatial Intelligence — Room Graph
 * Phase:             Phase 10 (Room Living System)
 * Files Modified:    src/spatial/RoomGraphService.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/17-ROOM-GRAPH-QUERY-ENGINE-CONTRACT.md
 *   docs/01_ELEMENTS/09_Rooms_Contract/11-ROOM-RELATIONSHIP-WORLD-MODEL.md
 *   docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md
 *
 * ROOMS AS NODES. DOORS AS EDGES. THE BUILDING IS A GRAPH.
 *
 * Builds and maintains a bidirectional room connectivity graph from live
 * DoorStore + RoomStore + WallStore data. Uses RoomRelationshipService to
 * resolve which rooms a door connects.
 *
 * Compliance:
 *   - Read-only: never writes to any store.
 *   - No THREE.js imports.
 *   - No EventBus emissions.
 *   - Lazy rebuild: graph is only rebuilt when dirty + queried.
 *   - Registered on window as window.roomGraphService.
 */

import { RoomRelationshipService } from '@pryzm/room-topology';
import { storeRegistry, projectScopeRegistry } from '@pryzm/core-app-model';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomNode {
  roomId: string;
  /** Room IDs reachable via a door (one hop, bidirectional). */
  connectedRooms: string[];
  /** Room IDs sharing a boundary wall (no door required). */
  adjacentRooms: string[];
}

export interface RoomEdge {
  /** Lexically sorted: `${lowerRoomId}|${higherRoomId}` */
  id: string;
  fromRoomId: string;
  toRoomId: string;
  doorId: string;
  wallId: string;
  doorWidth: number;
  /** true if doorWidth >= 0.775 m (Part M / ADA minimum). */
  isAccessible: boolean;
}

export interface RoomGraph {
  levelId: string;
  nodes: Map<string, RoomNode>;
  edges: Map<string, RoomEdge>;
  builtAt: number;
  dirty: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RoomGraphService {
  /** One graph per level. Built lazily, invalidated reactively. */
  private graphs: Map<string, RoomGraph> = new Map();

  // ── Graph Access ──────────────────────────────────────────────────────────

  /**
   * Returns the room graph for a level. Builds it lazily if dirty or missing.
   */
  getGraph(levelId: string): RoomGraph {
    const cached = this.graphs.get(levelId);
    if (cached && !cached.dirty) return cached;
    return this._buildGraph(levelId);
  }

  /**
   * Returns the level ID for a given room (looks it up in RoomStore).
   */
  getLevelForRoom(roomId: string): string | null {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    if (!roomStore) return null;
    const room = roomStore.getById(roomId);
    return room?.levelId ?? null;
  }

  // ── Query Methods ─────────────────────────────────────────────────────────

  /**
   * Returns rooms reachable via one door hop from roomId.
   * These are the rooms that share a door with roomId.
   */
  getConnectedRooms(roomId: string): string[] {
    const levelId = this.getLevelForRoom(roomId);
    if (!levelId) return [];
    const graph = this.getGraph(levelId);
    return graph.nodes.get(roomId)?.connectedRooms ?? [];
  }

  /**
   * Returns rooms sharing a boundary wall with roomId (no door required).
   */
  getAdjacentRooms(roomId: string): string[] {
    const levelId = this.getLevelForRoom(roomId);
    if (!levelId) return [];
    const graph = this.getGraph(levelId);
    return graph.nodes.get(roomId)?.adjacentRooms ?? [];
  }

  /**
   * BFS shortest path from startRoomId to endRoomId via door edges.
   * Returns ordered array of room IDs (start inclusive, end inclusive).
   * Returns [] if no path exists.
   */
  findPath(startRoomId: string, endRoomId: string): string[] {
    if (startRoomId === endRoomId) return [startRoomId];

    const levelId = this.getLevelForRoom(startRoomId);
    if (!levelId) return [];

    // Verify end room exists on same level
    const endLevelId = this.getLevelForRoom(endRoomId);
    if (endLevelId !== levelId) return [];

    const graph = this.getGraph(levelId);

    const visited = new Set<string>();
    const queue: Array<{ roomId: string; path: string[] }> = [
      { roomId: startRoomId, path: [startRoomId] },
    ];

    while (queue.length > 0) {
      const item = queue.shift()!;
      const { roomId, path } = item;

      if (visited.has(roomId)) continue;
      visited.add(roomId);

      const node = graph.nodes.get(roomId);
      if (!node) continue;

      for (const neighborId of node.connectedRooms) {
        if (neighborId === endRoomId) return [...path, neighborId];
        if (!visited.has(neighborId)) {
          queue.push({ roomId: neighborId, path: [...path, neighborId] });
        }
      }
    }

    return []; // no path via doors
  }

  /**
   * Returns all rooms reachable from roomId via any number of door hops
   * (the connected component containing roomId).
   */
  getConnectedComponent(roomId: string): string[] {
    const levelId = this.getLevelForRoom(roomId);
    if (!levelId) return [];
    const graph = this.getGraph(levelId);

    const visited = new Set<string>();
    const queue = [roomId];

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const node = graph.nodes.get(current);
      if (!node) continue;
      for (const neighbor of node.connectedRooms) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    return Array.from(visited);
  }

  /**
   * Returns all door edges for a room.
   */
  getEdgesForRoom(roomId: string): RoomEdge[] {
    const levelId = this.getLevelForRoom(roomId);
    if (!levelId) return [];
    const graph = this.getGraph(levelId);
    const result: RoomEdge[] = [];
    for (const edge of graph.edges.values()) {
      if (edge.fromRoomId === roomId || edge.toRoomId === roomId) {
        result.push(edge);
      }
    }
    return result;
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  /**
   * Mark the graph for a specific level as dirty (needs rebuild on next query).
   * Called by EngineBootstrap event listeners.
   */
  invalidate(levelId: string): void {
    const existing = this.graphs.get(levelId);
    if (existing) {
      existing.dirty = true;
    } else {
      // Pre-create an empty dirty graph so the levelId is tracked
      this.graphs.set(levelId, {
        levelId,
        nodes: new Map(),
        edges: new Map(),
        builtAt: 0,
        dirty: true,
      });
    }
  }

  /**
   * Mark ALL level graphs as dirty. Called after project load, undo/redo
   * across multiple levels, or full model replacement.
   */
  invalidateAll(): void {
    for (const graph of this.graphs.values()) {
      graph.dirty = true;
    }
    // Also clear entirely so rebuilt graphs on a future query start fresh
    this.graphs.clear();
    console.log('[RoomGraphService] All graphs invalidated');
  }

  /**
   * Called when a door changes — resolve its wall's level and invalidate.
   */
  invalidateForDoor(doorId: string): void {
    const wallStore = storeRegistry.getStoreForType('wall') as any;
    const doorStore = storeRegistry.getStoreForType('door') as any;
    if (!doorStore || !wallStore) return;
    const door = doorStore.getById(doorId);
    if (!door?.wallId) return;
    const wall = wallStore.getById(door.wallId);
    if (!wall?.levelId) return;
    this.invalidate(wall.levelId);
  }

  // ── Internal Build ────────────────────────────────────────────────────────

  private _buildGraph(levelId: string): RoomGraph {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    const wallStore = storeRegistry.getStoreForType('wall') as any;
    const doorStore = storeRegistry.getStoreForType('door') as any;

    if (!roomStore || !wallStore) {
      // Stores not ready — return empty graph
      const empty: RoomGraph = { levelId, nodes: new Map(), edges: new Map(), builtAt: Date.now(), dirty: false };
      this.graphs.set(levelId, empty);
      return empty;
    }

    const rooms = roomStore.getByLevel(levelId);
    const nodes = new Map<string, RoomNode>();
    const edges = new Map<string, RoomEdge>();

    // Step 1: Create a node for every room on this level
    for (const room of rooms) {
      nodes.set(room.id, {
        roomId: room.id,
        connectedRooms: [],
        adjacentRooms: [],
      });
    }

    // Step 2: Build door edges (rooms connected via doors)
    if (doorStore) {
      const allDoors = doorStore.getAll();
      for (const door of allDoors) {
        const wall = wallStore.getById(door.wallId);
        if (!wall || wall.levelId !== levelId) continue;

        let roomFrom: { id: string } | null = null;
        let roomTo: { id: string } | null = null;

        try {
          const rel = RoomRelationshipService.getDoorRelationships(door, wall);
          roomFrom = rel.roomFrom;
          roomTo = rel.roomTo;
        } catch {
          continue;
        }

        if (!roomFrom || !roomTo) continue;
        if (roomFrom.id === roomTo.id) continue;
        if (!nodes.has(roomFrom.id) || !nodes.has(roomTo.id)) continue;

        // Lexically sorted edge ID to deduplicate
        const [idA, idB] = [roomFrom.id, roomTo.id].sort();
        const edgeId = `${idA}|${idB}`;

        if (!edges.has(edgeId)) {
          const doorWidth = typeof door.width === 'number' ? door.width : 0.9;
          edges.set(edgeId, {
            id: edgeId,
            fromRoomId: roomFrom.id,
            toRoomId: roomTo.id,
            doorId: door.id,
            wallId: door.wallId,
            doorWidth,
            isAccessible: doorWidth >= 0.775,
          });

          // Bidirectional connectivity
          nodes.get(roomFrom.id)!.connectedRooms.push(roomTo.id);
          nodes.get(roomTo.id)!.connectedRooms.push(roomFrom.id);
        }
      }
    }

    // Step 3: Wall adjacency pass (rooms sharing a bounding wall, no door required)
    const roomList = rooms;
    for (let i = 0; i < roomList.length; i++) {
      for (let j = i + 1; j < roomList.length; j++) {
        const a = roomList[i];
        const b = roomList[j];
        const hasSharedWall = a.boundingWallIds.some((wid: string) =>
          b.boundingWallIds.includes(wid)
        );
        if (hasSharedWall) {
          nodes.get(a.id)!.adjacentRooms.push(b.id);
          nodes.get(b.id)!.adjacentRooms.push(a.id);
        }
      }
    }

    const graph: RoomGraph = {
      levelId,
      nodes,
      edges,
      builtAt: Date.now(),
      dirty: false,
    };

    this.graphs.set(levelId, graph);

    console.log(
      `[RoomGraphService] Built graph for level '${levelId}': ` +
      `${nodes.size} nodes, ${edges.size} door edges`
    );

    return graph;
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const roomGraphService = new RoomGraphService();

// ── Contract 45 §6 — Phase 5: project-scope registration ──────────────────────
// Cached level-room graphs are keyed by levelId; clearing on project switch
// guarantees the next query rebuilds from the new project's geometry.
projectScopeRegistry.register({
    scopeName: 'roomGraphService',
    clear: () => roomGraphService.invalidateAll(),
});
