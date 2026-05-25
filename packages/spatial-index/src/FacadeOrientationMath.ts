// @pryzm/spatial-index — FacadeOrientationMath (SL-3 pure core).
//
// ZERO imports by design: this module holds the pure façade-orientation math +
// types so it is testable in a plain Node env without pulling in the
// @pryzm/core-app-model barrel (whose module-load side effects touch `window`).
// The store-backed service (FacadeOrientationService) imports from here.
// See memory [[scc-no-barrel-access-at-module-load]].
//
// North convention (matches the plan north-arrow): with `trueNorth = 0`, North =
// world −Z (plan "up"), East = +X, South = +Z, West = −X. `trueNorth` (radians,
// rotation about world Y from the Project schema) rotates the whole frame.

export type Compass4 = 'N' | 'E' | 'S' | 'W';

export interface FacadeInfo {
    wallId: string;
    levelId: string;
    isExterior: boolean;
    boundingRoomCount: number;
    /** Outward (away-from-interior) unit normal in world X-Z; null when undeterminable. */
    normal: { x: number; z: number } | null;
    /** Compass orientation of the outward normal; null for interior / undeterminable walls. */
    orientation: Compass4 | null;
}

/** Minimal wall shape the classifier needs (world X-Z baseline endpoints). */
export interface FacadeWall {
    id: string;
    levelId: string;
    baseLine: [{ x: number; z: number }, { x: number; z: number }];
}

/** Minimal room shape the classifier needs. */
export interface FacadeRoom {
    id: string;
    boundingWallIds: readonly string[];
    centroid: { x: number; z: number };
}

/** North / East basis vectors (world X-Z) for a given true-north rotation. */
function northBasis(trueNorth: number): { N: { x: number; z: number }; E: { x: number; z: number } } {
    const s = Math.sin(trueNorth);
    const c = Math.cos(trueNorth);
    // Base (trueNorth=0): N = (0,-1) = −Z, E = (1,0) = +X; rotated about world Y.
    return { N: { x: -s, z: -c }, E: { x: c, z: -s } };
}

/** Bucket an outward normal into a 4-point compass orientation. */
export function orientationFromNormal(normal: { x: number; z: number }, trueNorth = 0): Compass4 {
    const { N, E } = northBasis(trueNorth);
    const northComp = normal.x * N.x + normal.z * N.z;
    const eastComp = normal.x * E.x + normal.z * E.z;
    const deg = (Math.atan2(eastComp, northComp) * 180) / Math.PI; // 0=N, +90=E, ±180=S, −90=W
    if (deg > -45 && deg <= 45) return 'N';
    if (deg > 45 && deg <= 135) return 'E';
    if (deg > 135 || deg <= -135) return 'S';
    return 'W';
}

/** Outward (away-from-room-centroid) unit normal of a wall; null for a degenerate wall. */
export function outwardNormal(
    wall: FacadeWall,
    roomCentroid: { x: number; z: number },
): { x: number; z: number } | null {
    const a = wall.baseLine[0];
    const b = wall.baseLine[1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return null;
    let nx = -dz / len;
    let nz = dx / len;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    // Flip so the normal points away from the bounded room's centroid (= outside).
    if (nx * (mx - roomCentroid.x) + nz * (mz - roomCentroid.z) < 0) {
        nx = -nx;
        nz = -nz;
    }
    return { x: nx, z: nz };
}

/**
 * PURE — classify every wall as interior/exterior and (for exterior walls bounded
 * by exactly one room) compute its outward normal + compass orientation.
 *
 * Exterior = referenced by ≤1 room's `boundingWallIds`. Orientation is computed
 * only when exactly one room bounds the wall (gives the outward direction).
 */
export function classifyFacades(
    walls: readonly FacadeWall[],
    rooms: readonly FacadeRoom[],
    trueNorth = 0,
): Map<string, FacadeInfo> {
    const countByWall = new Map<string, number>();
    const roomByWall = new Map<string, FacadeRoom>();
    for (const room of rooms) {
        for (const wid of room.boundingWallIds ?? []) {
            countByWall.set(wid, (countByWall.get(wid) ?? 0) + 1);
            if (!roomByWall.has(wid)) roomByWall.set(wid, room);
        }
    }

    const out = new Map<string, FacadeInfo>();
    for (const wall of walls) {
        const count = countByWall.get(wall.id) ?? 0;
        const isExterior = count <= 1;
        let normal: { x: number; z: number } | null = null;
        let orientation: Compass4 | null = null;
        if (isExterior && count === 1) {
            const room = roomByWall.get(wall.id)!;
            normal = outwardNormal(wall, room.centroid);
            if (normal) orientation = orientationFromNormal(normal, trueNorth);
        }
        out.set(wall.id, {
            wallId: wall.id,
            levelId: wall.levelId,
            isExterior,
            boundingRoomCount: count,
            normal,
            orientation,
        });
    }
    return out;
}

/** Area-weighted centroid of a polygon (world X-Z); vertex-average fallback. */
export function polygonCentroid(polygon: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
    let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const cross = a.x * b.z - b.x * a.z;
        area += cross;
        cx += (a.x + b.x) * cross;
        cz += (a.z + b.z) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-6) {
        const n = polygon.length || 1;
        return {
            x: polygon.reduce((s, p) => s + p.x, 0) / n,
            z: polygon.reduce((s, p) => s + p.z, 0) / n,
        };
    }
    return { x: cx / (6 * area), z: cz / (6 * area) };
}
