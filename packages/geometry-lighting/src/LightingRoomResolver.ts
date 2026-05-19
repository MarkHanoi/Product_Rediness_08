/**
 * @file LightingRoomResolver.ts
 *
 * Helper that maps a placement (X, Z) on a level → containing room id.
 *
 * Used at command time (CreateLightingCommand / MoveLightingCommand) to
 * record the room a fixture sits inside, so the Project Browser can group
 * fixtures under their room.
 *
 * Contract compliance:
 *  §03 §3   — pure read; no mutations.
 *  §01 §3   — no THREE.js, no DOM.
 */

import { pointInPolygon } from '@pryzm/room-topology';

export class LightingRoomResolver {
    /**
     * Returns the id of the room on `levelId` that contains world XZ point,
     * or null if no room contains it (or if RoomStore is unavailable).
     */
    static findContainingRoom(levelId: string, worldX: number, worldZ: number): string | null {
        const roomStore = window.roomStore; // TODO(TASK-08)
        if (!roomStore || typeof roomStore.getAll !== 'function') return null;

        try {
            const rooms = roomStore.getAll() as Array<{
                id: string;
                levelId?: string;
                level?: string;
                boundary?: { polygon?: Array<{ x: number; z: number }> };
            }>;

            for (const room of rooms) {
                const lvl = room.levelId ?? room.level;
                if (lvl !== levelId) continue;
                const poly = room.boundary?.polygon;
                if (!poly || poly.length < 3) continue;
                if (pointInPolygon(worldX, worldZ, poly as any)) {
                    return room.id;
                }
            }
        } catch (err) {
            console.warn('[LightingRoomResolver] room lookup failed (non-fatal):', err);
        }
        return null;
    }
}
