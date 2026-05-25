// Apartment Layout Generator — store-backed shell reader (SPEC §5, step A5.2).
//
// Bridges the model stores → the pure `analyseShell` (A3). The store reads are
// INJECTED as accessors so this factory stays pure + unit-testable with no
// stores/THREE/DOM/window; the real accessors (wall store via storeRegistry +
// FacadeOrientationService) are bound at the A5.3 composition root.
//
// Given the generate payload's `shellWallIds` it gathers, per perimeter wall:
//   • baseLine (world XZ, metres) — for the polygon + dimensions,
//   • window count (openings of type 'window') — for face light classification,
//   • SL-3 compass orientation — for the prompt's "best light" reasoning,
// resolves the entrance wall (the shell wall hosting the entrance door), and
// hands it all to `analyseShell`.

import type { ApartmentGenerateLayoutPayload } from './types.js';
import { analyseShell, type ShellAnalysis, type ShellWallInput } from './shellAnalysis.js';

export type Compass = 'N' | 'E' | 'S' | 'W' | null;

/** One perimeter wall as read from the wall store. */
export interface ShellWallRecord {
    readonly id: string;
    readonly levelId: string;
    /** World XZ endpoints, metres. */
    readonly baseLine: readonly [{ x: number; z: number }, { x: number; z: number }];
    /** Openings on this wall — used to count windows + find the entrance door's host. */
    readonly openings: ReadonlyArray<{ type: 'window' | 'door'; elementId?: string }>;
}

export interface ShellReaderDeps {
    /** Resolve a wall record by id (from the wall store). undefined if missing. */
    readonly getWall: (wallId: string) => ShellWallRecord | undefined;
    /** SL-3 compass orientation for a wall on a level (FacadeOrientationService).
     *  Optional — null/undefined → the face is classified by window count only. */
    readonly getOrientation?: (levelId: string, wallId: string) => Compass;
}

/**
 * Build the `shellReader` the apartment-layout workflow consumes. Pure given its
 * injected accessors. Skips missing/degenerate walls (loud-fail-soft); falls
 * back to the first wall as the entrance side when the entrance door can't be
 * matched to a shell wall.
 */
export function createStoreShellReader(
    deps: ShellReaderDeps,
): (payload: ApartmentGenerateLayoutPayload) => ShellAnalysis {
    return function readShell(payload: ApartmentGenerateLayoutPayload): ShellAnalysis {
        const walls: ShellWallInput[] = [];
        const windowCountByWall: Record<string, number> = {};
        const orientationByWall: Record<string, Compass> = {};
        let entranceWallId = '';

        for (const wallId of payload.shellWallIds) {
            const w = deps.getWall(wallId);
            if (!w || !w.baseLine || w.baseLine.length < 2) continue;
            walls.push({
                id: wallId,
                baseLine: [
                    { x: w.baseLine[0].x, z: w.baseLine[0].z },
                    { x: w.baseLine[1].x, z: w.baseLine[1].z },
                ],
            });
            windowCountByWall[wallId] = w.openings.filter(o => o.type === 'window').length;
            orientationByWall[wallId] = deps.getOrientation?.(w.levelId, wallId) ?? null;
            // Entrance wall = the shell wall whose openings host the entrance door.
            if (
                payload.entranceDoorId &&
                w.openings.some(o => o.type === 'door' && o.elementId === payload.entranceDoorId)
            ) {
                entranceWallId = wallId;
            }
        }

        // Fallback: entrance door not matched to a shell wall → use the first wall.
        if (!entranceWallId && walls.length > 0) entranceWallId = walls[0]!.id;

        return analyseShell(walls, { entranceWallId, windowCountByWall, orientationByWall });
    };
}
