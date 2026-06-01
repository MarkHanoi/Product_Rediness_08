/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI / World Model
 * Phase:             Phase 9
 * Files Modified:    src/ai/rooms/RoomWorldModelAdapter.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/07-ROOM-AI-WORLDMODEL-CONTRACT.md
 *   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §9.2
 *   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Read-only projection of RoomStore for World Model queries.
 * Never writes to any store. No THREE.js imports.
 * Used by AI prompt builders and context generators.
 */

import { RoomData, RoomOccupancyType, RoomVertex } from '@pryzm/room-topology';
import { roomGraphService } from '@pryzm/spatial-index';
import type { RoomGraph } from '@pryzm/spatial-index';

// ── World Model Types ──────────────────────────────────────────────────────────

export interface WorldModelRoom {
    id: string;
    name: string;
    number: string;
    levelId: string;
    occupancyType: RoomOccupancyType;
    grossAreaM2: number;
    perimeterM: number;
    volumeM3: number;
    centroid: RoomVertex;
    adjacentRoomIds: string[];
    boundingWallIds: string[];
    phase?: string;
    department?: string;
    aiGenerated: boolean;
}

export interface RoomAdjacencyEdge {
    roomAId: string;
    roomBId: string;
    sharedWallIds: string[];
}

export interface RoomAdjacencyGraph {
    levelId: string;
    nodes: WorldModelRoom[];
    edges: RoomAdjacencyEdge[];
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class RoomWorldModelAdapter {
    constructor(
        private readonly roomStore: any,
        _wallStore?: any,
    ) {}

    /**
     * All rooms — used as AI context for spatial reasoning.
     */
    getAll(): WorldModelRoom[] {
        const rooms: RoomData[] = this.roomStore.getAll();
        return rooms.map(r => this._toWorldModel(r, this._findAdjacentRooms(r, rooms)));
    }

    /**
     * Rooms by level — primary context for single-floor AI operations.
     */
    getByLevel(levelId: string): WorldModelRoom[] {
        const allOnLevel: RoomData[] = this.roomStore.getByLevel(levelId);
        return allOnLevel.map(r => this._toWorldModel(r, this._findAdjacentRooms(r, allOnLevel)));
    }

    /**
     * Adjacency graph for a level — used by energy zone agent and programme checker.
     * Two rooms are adjacent if they share at least one bounding wall ID.
     */
    getAdjacencyGraph(levelId: string): RoomAdjacencyGraph {
        const rooms: RoomData[] = this.roomStore.getByLevel(levelId);
        const worldRooms = rooms.map(r => this._toWorldModel(r, this._findAdjacentRooms(r, rooms)));

        const edges: RoomAdjacencyEdge[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const a = rooms[i]!;
                const b = rooms[j]!;
                const shared = a.boundingWallIds.filter(wid => b.boundingWallIds.includes(wid));
                if (shared.length > 0) {
                    const key = [a.id, b.id].sort().join('|');
                    if (!seen.has(key)) {
                        seen.add(key);
                        edges.push({ roomAId: a.id, roomBId: b.id, sharedWallIds: shared });
                    }
                }
            }
        }

        return { levelId, nodes: worldRooms, edges };
    }

    /**
     * Rooms directly reachable via a door from roomId (one hop).
     * Uses RoomGraphService for door-edge traversal.
     */
    getConnectedRooms(roomId: string): WorldModelRoom[] {
        const connectedIds = roomGraphService.getConnectedRooms(roomId);
        const roomStore = this.roomStore;
        return connectedIds
            .map((id: string) => roomStore.getById(id))
            .filter((r: RoomData | undefined): r is RoomData => !!r)
            .map((r: RoomData) => {
                const allOnLevel: RoomData[] = roomStore.getByLevel(r.levelId);
                return this._toWorldModel(r, this._findAdjacentRooms(r, allOnLevel));
            });
    }

    /**
     * BFS shortest path from startRoomId to endRoomId via door edges.
     * Returns ordered array of WorldModelRoom (start inclusive, end inclusive).
     * Returns [] if no path exists.
     */
    findPath(startRoomId: string, endRoomId: string): WorldModelRoom[] {
        const path = roomGraphService.findPath(startRoomId, endRoomId);
        const roomStore = this.roomStore;
        return path
            .map((id: string) => roomStore.getById(id))
            .filter((r: RoomData | undefined): r is RoomData => !!r)
            .map((r: RoomData) => {
                const allOnLevel: RoomData[] = roomStore.getByLevel(r.levelId);
                return this._toWorldModel(r, this._findAdjacentRooms(r, allOnLevel));
            });
    }

    /**
     * Returns the raw room graph for a level (door edges + wall adjacencies).
     */
    getRoomGraph(levelId: string): RoomGraph {
        return roomGraphService.getGraph(levelId);
    }

    /**
     * Serialise the world model context as a compact JSON string for AI prompts.
     * Strips verbose geometry; keeps semantic data only.
     */
    toPromptContext(levelId: string): string {
        const graph = this.getAdjacencyGraph(levelId);
        const summary = {
            levelId,
            roomCount: graph.nodes.length,
            rooms: graph.nodes.map(r => ({
                id:         r.id.substring(0, 8),
                name:       r.name,
                occupancy:  r.occupancyType,
                areaMtSq:   r.grossAreaM2.toFixed(1),
                adjacentTo: r.adjacentRoomIds.map(aid => aid.substring(0, 8)),
            })),
            adjacencyCount: graph.edges.length,
        };
        return JSON.stringify(summary, null, 2);
    }

    /**
     * Get a single room for AI property suggestion context.
     */
    getRoomContext(roomId: string): WorldModelRoom | undefined {
        const room: RoomData | undefined = this.roomStore.getById(roomId);
        if (!room) return undefined;
        const allOnLevel: RoomData[] = this.roomStore.getByLevel(room.levelId);
        return this._toWorldModel(room, this._findAdjacentRooms(room, allOnLevel));
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private _toWorldModel(room: RoomData, adjacentRoomIds: string[]): WorldModelRoom {
        return {
            id:             room.id,
            name:           room.name,
            number:         room.roomNumber ?? '',
            levelId:        room.levelId,
            occupancyType:  room.occupancyType,
            grossAreaM2:    room.computed.area,
            perimeterM:     room.computed.perimeter,
            volumeM3:       room.computed.volume,
            centroid:       room.computed.centroid,
            adjacentRoomIds,
            boundingWallIds: room.boundingWallIds,
            ...(room.phase      !== undefined ? { phase:      room.phase }      : {}),
            ...(room.department !== undefined ? { department: room.department } : {}),
            aiGenerated:    room.metadata.aiGenerated ?? false,
        };
    }

    private _findAdjacentRooms(room: RoomData, peers: RoomData[]): string[] {
        return peers
            .filter(p => p.id !== room.id && p.boundingWallIds.some(wid => room.boundingWallIds.includes(wid)))
            .map(p => p.id);
    }
}
