import { WallData } from '@pryzm/geometry-wall';

/**
 * Serializes a WallData snapshot as a plain §2.2-compliant pre-mutation state
 * suitable for structuredClone, JSON, and Immer.
 *
 * Phase B DTO migration: WallData.baseLine is now [Point3D, Point3D] — plain
 * serializable objects — so no conversion is needed here. The function still
 * normalises openings and childrenIds arrays for deep-isolation safety.
 *
 * Used by: UpdateWallVisualPropertiesCommand, SetWallWidthCommand,
 *          SetAllWallsWidthCommand, UpdateWallBaselineCommand
 */
export function serializeWallSnapshot(wall: WallData): any {
    return {
        ...wall,
        baseLine: [
            { ...wall.baseLine[0] },
            { ...wall.baseLine[1] },
        ],
        openings: wall.openings ? wall.openings.map(o => ({ ...o })) : [],
        childrenIds: wall.childrenIds ? [...wall.childrenIds] : []
    };
}

/**
 * Returns a wall snapshot from serializeWallSnapshot ready to be passed back
 * to WallStore.add() or WallStore.restoreSnapshot().
 *
 * Phase B DTO migration: baseLine is already [Point3D, Point3D] — no THREE.Vector3
 * reconstruction is required. This function is kept for call-site symmetry and
 * future extension.
 *
 * Used by: DeleteElementCommand.undo
 */
export function deserializeWallSnapshot(snapshot: any): any {
    // baseLine is already plain {x,y,z} — pass through as-is.
    return { ...snapshot };
}
