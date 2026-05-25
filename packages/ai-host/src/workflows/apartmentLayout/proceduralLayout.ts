// Apartment Layout — procedural (non-AI) fallback generator (SPEC §10 fallback).
//
// When the live AI relay is unavailable (offline / 401 / over quota), the
// generator must still produce a REAL, shell-fitted layout — not a fixed stub.
// This subdivides the shell's bounding box into program-sized rooms with straight
// partition walls + a door per partition, in the shell's WORLD frame (so it lands
// where the apartment actually is). Pure + deterministic. The real AI handles the
// exact polygon (incl. concave/L shapes) + smarter planning; this is the offline
// demo that proves the build pipeline end-to-end.

import type {
    ScoredLayoutOption,
    LayoutOption,
    LayoutWall,
    LayoutDoor,
    LayoutRoom,
    RoomType,
    ApartmentProgram,
    ApartmentConstraints,
    ScoringWeights,
} from './types.js';
import type { ShellAnalysis } from './shellAnalysis.js';
import { scoreLayout } from './score.js';

const M = 1000; // metres → mm (LayoutWall coords are mm; buildLayoutPlan maps /1000 back)
const DOOR_W_MM = 900;

/** Ordered room program → the room types to lay out, longest-lived first. */
function roomProgram(p: ApartmentProgram): RoomType[] {
    const types: RoomType[] = [];
    if (p.entranceHall) types.push('hall');
    if (p.livingRoom) types.push('living');
    types.push('kitchen');
    if (p.openPlanKitchenDining) types.push('dining');
    const beds = Math.max(0, Math.floor(p.bedrooms));
    for (let i = 0; i < beds; i++) types.push(i === 0 && p.masterEnSuite ? 'master' : 'bedroom');
    const baths = Math.max(0, Math.floor(p.bathrooms));
    for (let i = 0; i < baths; i++) types.push('bathroom');
    return types.length >= 2 ? types : ['living', 'bedroom'];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Generate up to `count` procedural layouts that fit the shell's bounding box.
 * Each is a set of parallel partition walls (sliced along the longer axis) with a
 * centred door per partition + program-typed rooms. Already valid by construction
 * (no validateLayout needed). Returns [] only if the shell has no size.
 */
export function generateProceduralLayout(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    count: number,
): ScoredLayoutOption[] {
    const xs = shell.perimeter.map(p => p.x);
    const zs = shell.perimeter.map(p => p.z);
    const minX = xs.length ? Math.min(...xs) : 0;
    const minZ = zs.length ? Math.min(...zs) : 0;
    const w = shell.widthM;
    const d = shell.depthM;
    // Need a real, sizeable shell — a zero/degenerate shell yields no layout.
    if (!(w >= 1) || !(d >= 1)) return [];

    const sliceAlongX = w >= d;       // slice across the LONGER axis
    const span = sliceAlongX ? w : d; // length we divide into rooms
    const cross = sliceAlongX ? d : w; // partition wall length

    const types = roomProgram(program);
    const n = Math.max(2, types.length);
    const cellM = span / n;
    const variants = Math.max(1, Math.min(count, 2));
    const out: ScoredLayoutOption[] = [];

    for (let v = 0; v < variants; v++) {
        const order = v === 0 ? types : [...types].reverse();
        const walls: LayoutWall[] = [];
        const doors: LayoutDoor[] = [];
        const rooms: LayoutRoom[] = [];

        for (let i = 0; i < n; i++) {
            if (i < n - 1) {
                const posM = (i + 1) * cellM; // distance along span from the min corner
                const wall: LayoutWall = sliceAlongX
                    ? { start: { x: (minX + posM) * M, y: minZ * M }, end: { x: (minX + posM) * M, y: (minZ + cross) * M } }
                    : { start: { x: minX * M, y: (minZ + posM) * M }, end: { x: (minX + cross) * M, y: (minZ + posM) * M } };
                walls.push(wall);
                // Door centred on the partition (offset measured from the wall start).
                doors.push({ wallRef: walls.length - 1, offset: Math.max(0, (cross * M) / 2 - DOOR_W_MM / 2), width: DOOR_W_MM });
            }
            const type = order[i % order.length]!;
            rooms.push({
                name: `${cap(type)} ${i + 1}`,
                type,
                area: cellM * cross,
                windowCount: 1,
                hasDirectAccess: true,
                adjacentTo: [],
            });
        }

        const opt: LayoutOption = {
            summary: `Procedural ${v === 0 ? 'A' : 'B'} — ${n} rooms (offline demo)`,
            rooms,
            walls,
            doors,
            corridorWidthMin: constraints.minCorridorWidth,
        };
        out.push({ ...opt, score: scoreLayout(opt, weights) });
    }
    return out.slice(0, count);
}
