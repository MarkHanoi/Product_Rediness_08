// @pryzm/spatial-index — FacadeOrientationService (SL-3, SPEC-SEMANTIC-DESIGN-ASSISTANT §3).
//
// Derives, per exterior wall on a level, its compass orientation (N/E/S/W) from
// the wall's outward normal and the project's true-north. Sibling of the existing
// room-semantic services (RoomTypeInferenceEngine SL-1, RoomGraphService SL-2);
// same package, same window-wiring + barrel-export pattern, same read-only
// store-access-at-call-time discipline (no THREE, no DOM, no store writes).
//
// The orientation MATH + types live in `FacadeOrientationMath` (zero imports, so
// they unit-test in plain Node without pulling the @pryzm/core-app-model barrel —
// memory [[scc-no-barrel-access-at-module-load]]). This file only gathers walls +
// rooms from the stores and delegates.

import { storeRegistry } from '@pryzm/core-app-model';
import {
    classifyFacades,
    polygonCentroid,
    type Compass4,
    type FacadeInfo,
    type FacadeWall,
    type FacadeRoom,
} from './FacadeOrientationMath.js';

export class FacadeOrientationService {
    /**
     * Per-wall façade info for a level. `trueNorth` (radians) defaults to 0 — the
     * caller (proposal builder / command) passes the project's `trueNorth`.
     */
    getFacades(levelId: string, trueNorth = 0): Map<string, FacadeInfo> {
        return classifyFacades(this._walls(levelId), this._rooms(levelId), trueNorth);
    }

    /** All exterior walls on the level. */
    exteriorWalls(levelId: string, trueNorth = 0): FacadeInfo[] {
        return [...this.getFacades(levelId, trueNorth).values()].filter(f => f.isExterior);
    }

    /** Exterior walls whose outward normal faces a given compass direction. */
    facadesByOrientation(levelId: string, orientation: Compass4, trueNorth = 0): FacadeInfo[] {
        return [...this.getFacades(levelId, trueNorth).values()]
            .filter(f => f.isExterior && f.orientation === orientation);
    }

    private _walls(levelId: string): FacadeWall[] {
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as {
            getAll?: () => Array<{ id: string; levelId: string; baseLine: Array<{ x: number; z: number }> }>;
        } | undefined;
        if (!wallStore?.getAll) return [];
        return wallStore.getAll()
            .filter(w => w.levelId === levelId && Array.isArray(w.baseLine) && w.baseLine.length >= 2)
            .map(w => ({
                id: w.id,
                levelId: w.levelId,
                baseLine: [
                    { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z },
                    { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z },
                ] as [{ x: number; z: number }, { x: number; z: number }],
            }));
    }

    private _rooms(levelId: string): FacadeRoom[] {
        const roomStore = storeRegistry.getStoreForType('room') as unknown as {
            getByLevel?: (id: string) => Array<RoomRecord>;
            getAll?: () => Array<RoomRecord>;
        } | undefined;
        if (!roomStore) return [];
        const rooms = typeof roomStore.getByLevel === 'function'
            ? roomStore.getByLevel(levelId)
            : (roomStore.getAll?.() ?? []).filter(r => r.levelId === levelId);
        return rooms.map(r => ({
            id: r.id,
            boundingWallIds: r.boundingWallIds ?? [],
            centroid: r.computed?.centroid ?? polygonCentroid(r.boundary?.polygon ?? []),
        }));
    }
}

interface RoomRecord {
    id: string;
    levelId: string;
    boundingWallIds?: string[];
    boundary?: { polygon?: Array<{ x: number; z: number }> };
    computed?: { centroid?: { x: number; z: number } };
}

/** Module-level singleton — wired to `window.facadeOrientationService` in initTools. */
export const facadeOrientationService = new FacadeOrientationService();
