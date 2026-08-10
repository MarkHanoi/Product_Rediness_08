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
     * §FIX-FACADE-TRUE-NORTH (ADR-0315 U2.1) — the project's true-north θ,
     * INJECTED as a provider rather than imported: this service sits below the
     * stores that own `SiteLocation.trueNorth`, and every caller was passing
     * the default 0, so "south-facing" meant project-south on rotated sites.
     * The editor wires the provider from `siteModelStore` in initTools; when
     * unset (headless/tests) the default stays 0. An EXPLICIT `trueNorth`
     * argument always wins — the solar pipeline passes its own θ.
     */
    private _trueNorthProvider: () => number = () => 0;

    setTrueNorthProvider(provider: () => number): void {
        this._trueNorthProvider = provider;
    }

    private _theta(explicit?: number): number {
        if (explicit !== undefined) return explicit;
        try {
            const t = this._trueNorthProvider();
            return Number.isFinite(t) ? t : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Per-wall façade info for a level. `trueNorth` (radians) defaults to the
     * injected project true-north (0 when no provider is wired).
     */
    getFacades(levelId: string, trueNorth?: number): Map<string, FacadeInfo> {
        return classifyFacades(this._walls(levelId), this._rooms(levelId), this._theta(trueNorth));
    }

    /**
     * §ADR-0315 U2.1 — ALL-LEVELS roll-up: per-wall façade info for the whole
     * project in one call (levels partition the wall store; the classifier's
     * footprint fallback is computed per level). This is what a project-wide
     * "all south-facing walls" scope reads.
     */
    getFacadesAllLevels(trueNorth?: number): Map<string, FacadeInfo> {
        const theta = this._theta(trueNorth);
        return classifyFacades(this._walls(), this._rooms(), theta);
    }

    /** All exterior walls on the level (or project-wide when levelId omitted). */
    exteriorWalls(levelId?: string, trueNorth?: number): FacadeInfo[] {
        const facades = levelId === undefined
            ? this.getFacadesAllLevels(trueNorth)
            : this.getFacades(levelId, trueNorth);
        return [...facades.values()].filter(f => f.isExterior);
    }

    /** Exterior walls whose outward normal faces a given compass direction
     *  (project-wide when levelId omitted/undefined). */
    facadesByOrientation(levelId: string | undefined, orientation: Compass4, trueNorth?: number): FacadeInfo[] {
        const facades = levelId === undefined
            ? this.getFacadesAllLevels(trueNorth)
            : this.getFacades(levelId, trueNorth);
        return [...facades.values()]
            .filter(f => f.isExterior && f.orientation === orientation);
    }

    private _walls(levelId?: string): FacadeWall[] {
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as {
            getAll?: () => Array<{ id: string; levelId: string; baseLine: Array<{ x: number; z: number }> }>;
        } | undefined;
        if (!wallStore?.getAll) return [];
        return wallStore.getAll()
            .filter(w => (levelId === undefined || w.levelId === levelId) && Array.isArray(w.baseLine) && w.baseLine.length >= 2)
            .map(w => ({
                id: w.id,
                levelId: w.levelId,
                baseLine: [
                    { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z },
                    { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z },
                ] as [{ x: number; z: number }, { x: number; z: number }],
            }));
    }

    private _rooms(levelId?: string): FacadeRoom[] {
        const roomStore = storeRegistry.getStoreForType('room') as unknown as {
            getByLevel?: (id: string) => Array<RoomRecord>;
            getAll?: () => Array<RoomRecord>;
        } | undefined;
        if (!roomStore) return [];
        const rooms = levelId === undefined
            ? (roomStore.getAll?.() ?? [])
            : typeof roomStore.getByLevel === 'function'
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
