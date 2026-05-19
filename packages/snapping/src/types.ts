/**
 * Snapping type contracts.
 *
 * Wave 11 migration: promoted from packages/picking/src/snapping/types.ts.
 * ISpatialIndex is now canonical in @pryzm/spatial-index; re-exported here
 * for backwards-compat surface.
 */
import * as THREE from '@pryzm/renderer-three/three';

export type { ISpatialIndex } from '@pryzm/spatial-index';

export enum SnapType {
    GRID = 'grid',
    ENDPOINT = 'endpoint',
    MIDPOINT = 'midpoint',
    INTERSECTION = 'intersection',
    PERPENDICULAR = 'perpendicular',
    FACE = 'face',
    EDGE = 'edge',
    CENTER = 'center',
    NEAREST = 'nearest',
    /**
     * Semantic snap to the wall centreline (location line).
     * Higher priority than EDGE — Revit-style centreline reference.
     */
    CENTERLINE = 'centerline',
    /**
     * Direction-aware face snap: snaps to the face of a wall
     * that lies along the current drawing direction.
     * Fires only when a start point is active (drawing mode).
     */
    WALL_JOIN = 'wall_join',
    /**
     * §40 §7 — Snap to a single BIM structural grid line (datum).
     * Distinct from `GRID` (uniform math grid) so structural grids
     * can be ranked above geometry snaps without lifting the
     * background math grid that just helps with typed offsets.
     */
    GRID_LINE = 'grid_line',
    /**
     * §40 §7 — Snap to the intersection of two BIM structural grid
     * lines. Top of the snap hierarchy: a grid×grid intersection is
     * the most authoritative reference point in the model.
     */
    GRID_INTERSECTION = 'grid_intersection'
}

export interface SnapCandidate {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    distance: number;
    sourceId?: string;
    sourceType?: string;
    metadata?: Record<string, unknown>;
}

export interface SnapSettings {
    enabled: boolean;
    snapRadius: number;
    enabledTypes: Set<SnapType>;
    gridSize: number;
    priorityOverrides?: Map<SnapType, number>;
}

export interface SnapResult {
    snapped: boolean;
    point: THREE.Vector3;
    candidate: SnapCandidate | null;
    allCandidates: SnapCandidate[];
}

export interface ISnapProvider {
    readonly providerType: string;
    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[];
    /**
     * Optional: called by SnapManager when the drawing context changes.
     * Providers that are direction-aware (e.g. WallJoinSnapProvider) implement this
     * to receive the active start point.
     */
    onContextChange?(startPoint: THREE.Vector3 | null): void;
    update?(): void;
    dispose?(): void;
}

/**
 * §40 §7 — Snap-strength hierarchy.
 */
export const DEFAULT_SNAP_PRIORITIES: Record<SnapType, number> = {
    [SnapType.GRID_INTERSECTION]: 200,
    [SnapType.GRID_LINE]:         150,
    [SnapType.ENDPOINT]:          100,
    [SnapType.INTERSECTION]:       90,
    [SnapType.MIDPOINT]:           80,
    [SnapType.WALL_JOIN]:          78,
    [SnapType.CENTERLINE]:         75,
    [SnapType.PERPENDICULAR]:      70,
    [SnapType.CENTER]:             60,
    [SnapType.EDGE]:               50,
    [SnapType.FACE]:               45,
    [SnapType.NEAREST]:            30,
    [SnapType.GRID]:               10
};

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
    enabled: true,
    snapRadius: 0.5,
    gridSize: 0.5,
    enabledTypes: new Set([
        SnapType.GRID_INTERSECTION,
        SnapType.GRID_LINE,
        SnapType.ENDPOINT,
        SnapType.MIDPOINT,
        SnapType.INTERSECTION,
        SnapType.PERPENDICULAR,
        SnapType.CENTERLINE,
        SnapType.FACE,
        SnapType.WALL_JOIN,
        SnapType.GRID
    ])
};
