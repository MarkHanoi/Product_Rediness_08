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
        // §RAC-APARTMENT-IN-ROOM (L-1644, 2026-08-21) — a room-scoped run: the
        // shell comes from the target room's boundary ring, NOT from the wall
        // store. The room's bounding walls already exist (and may extend past
        // the room, bound other rooms, or be interior), so resolving them by id
        // would rebuild the WRONG perimeter; the ring is the exact room shape.
        if (Array.isArray(payload.shellRingWorld) && payload.shellRingWorld.length >= 3) {
            return analyseRoomRing(
                payload.shellRingWorld,
                payload.windowSpansWorld ?? [],
                payload.doorSpansWorld ?? [],
            );
        }
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

// ─── §RAC-APARTMENT-IN-ROOM (L-1644, 2026-08-21) — the room-ring shell ───────
//
// A room-scoped generate has no store walls of its own: the room's boundary
// polygon (wall-centreline ring, closed CCW world-XZ — the RoomData contract)
// IS the shell. Each ring edge becomes a synthetic `room-ring-N` ShellWallInput
// whose baseLine is the edge, so `analyseShell`'s 50 mm chaining walk closes
// trivially (the ring is already chained). PURE — exported so the engine test
// can drive the identical path the workflow drives.
//
// Window/door spans on the room's REAL bounding walls inform the analysis:
//   • each window span's midpoint is credited to its nearest ring edge, so the
//     face light classification (best-light / blind) sees the room's real glass;
//   • the FIRST door span picks the entrance edge (the room's existing door is
//     where circulation arrives), else edge 0 — the same fallback the store
//     reader uses when the entrance door cannot be matched.

/** Distance from a point to a segment (world-XZ metres). Exported for the
 *  room-scope payload builder, so span-to-ring proximity uses the SAME metric
 *  the ring analysis uses. */
export function pointToSegment(
    p: { x: number; z: number },
    a: { x: number; z: number },
    b: { x: number; z: number },
): number {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.z - a.z);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/**
 * The ONE derivation of ring → synthetic shell walls, shared by the analysis
 * below and the payload builder (`roomScopePayload.ts`) so the two can never
 * disagree about which edges exist or how they are named. Drops a trailing
 * duplicate of the first vertex (a closed ring) and sub-50 mm degenerate edges.
 */
export function roomRingEdges(
    ring: ReadonlyArray<{ x: number; z: number }>,
): ShellWallInput[] {
    const pts = ring.slice();
    if (pts.length >= 2) {
        const f = pts[0]!, l = pts[pts.length - 1]!;
        if (Math.hypot(f.x - l.x, f.z - l.z) < 0.05) pts.pop();
    }
    const walls: ShellWallInput[] = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < 0.05) continue;   // degenerate edge
        walls.push({
            id: `room-ring-${i}`,
            baseLine: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }],
        });
    }
    return walls;
}

/** Analyse a room's boundary ring as an apartment shell. Pure + deterministic. */
export function analyseRoomRing(
    ring: ReadonlyArray<{ x: number; z: number }>,
    windowSpansWorld: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
    doorSpansWorld: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
): ShellAnalysis {
    const walls = roomRingEdges(ring);

    const nearestWallId = (p: { x: number; z: number }): string | '' => {
        let best = '';
        let bestD = Number.POSITIVE_INFINITY;
        for (const w of walls) {
            const d = pointToSegment(p, w.baseLine[0], w.baseLine[1]);
            if (d < bestD) { bestD = d; best = w.id; }
        }
        return best;
    };
    const mid = (s: { a: { x: number; z: number }; b: { x: number; z: number } }): { x: number; z: number } =>
        ({ x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 });

    const windowCountByWall: Record<string, number> = {};
    for (const s of windowSpansWorld) {
        const id = nearestWallId(mid(s));
        if (id !== '') windowCountByWall[id] = (windowCountByWall[id] ?? 0) + 1;
    }

    // The room's existing door is where circulation arrives — the entrance side.
    const firstDoor = doorSpansWorld[0];
    const entranceWallId = firstDoor !== undefined
        ? (nearestWallId(mid(firstDoor)) || (walls[0]?.id ?? ''))
        : (walls[0]?.id ?? '');

    const orientationByWall: Record<string, Compass> = {};
    for (const w of walls) orientationByWall[w.id] = null;

    return analyseShell(walls, { entranceWallId, windowCountByWall, orientationByWall });
}
