// D-FLE F5 — deterministic placement solver (SPEC-FURNITURE-LAYOUT-ENGINE §5).
//
// Places an archetype's items into one room: anchor → against-wall position + yaw
// → clearance/collision check → slide along the wall → skip non-required on
// failure. Groups (bedside tables beside the bed, coffee table in front of the
// sofa, chairs around the dining table) are placed relative to their leader.
// Pure + deterministic (fixed candidate order; no RNG). Metres, world XZ.

import type {
    FurnitureArchetype, FurnitureItemSpec, FurnishRoomInput, PlacedFurniture, Pt, Rect, RoomWallSeg,
} from './types.js';
import { footprintOf } from './footprints.js';
import { footprintRect, overlapsAny, rectInPolygon } from './collision.js';
import { longestWall, wallOppositeDoor, wallWithWindow, wallHasWindow, wallHasDoor, wallMid, wallDir, yawFromNormal } from './wallAnalysis.js';

const GAP = 0.02;
const SLIDE_STEP = 0.25;

const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const perp = (n: Pt): Pt => ({ x: n.z, z: -n.x });   // wall direction from inward normal

/** Door swing / keep-clear obstacle rects (in front of each door). */
function doorObstacles(input: FurnishRoomInput): Rect[] {
    return input.doors.map(d => {
        const c = add(d.center, d.normal, 0.45);
        return footprintRect(c.x, c.z, d.width, 0.9, yawFromNormal(d.normal));
    });
}

interface Placement { item: PlacedFurniture; rect: Rect }

/** Try to place `kind` against `wall`, sliding along it until it fits. */
function placeAgainstWall(
    kind: PlacedFurniture['kind'], wall: RoomWallSeg,
    input: FurnishRoomInput, obstacles: readonly Rect[],
): Placement | null {
    const fp = footprintOf(kind);
    const yaw = yawFromNormal(wall.inwardNormal);
    const base = add(wallMid(wall), wall.inwardNormal, fp.l / 2 + GAP);
    const dir = wallDir(wall);
    const maxSlide = Math.max(0, wall.length / 2 - fp.w / 2);
    const offsets: number[] = [0];
    for (let s = SLIDE_STEP; s <= maxSlide + 1e-6; s += SLIDE_STEP) { offsets.push(s, -s); }
    for (const off of offsets) {
        const c = add(base, dir, off);
        const rect = footprintRect(c.x, c.z, fp.w, fp.l, yaw);
        if (rectInPolygon(rect, input.polygon) && !overlapsAny(rect, obstacles)) {
            return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, rect };
        }
    }
    return null;
}

/** Place at a free point (center/corner) with a given yaw. */
function placeAtPoint(kind: PlacedFurniture['kind'], c: Pt, yaw: number, input: FurnishRoomInput, obstacles: readonly Rect[]): Placement | null {
    const fp = footprintOf(kind);
    const rect = footprintRect(c.x, c.z, fp.w, fp.l, yaw);
    if (rectInPolygon(rect, input.polygon) && !overlapsAny(rect, obstacles)) {
        return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, rect };
    }
    return null;
}

/** Apply the spec's anchor rule to a candidate wall set. */
function pickByAnchor(
    spec: FurnitureItemSpec, walls: readonly RoomWallSeg[], input: FurnishRoomInput,
): RoomWallSeg | null {
    switch (spec.anchor) {
        case 'wall-opposite-door': return wallOppositeDoor(walls, input.doors);
        case 'wall-window': return wallWithWindow(walls, input.windows);
        case 'wall-longest':
        default: return longestWall(walls);
    }
}

/**
 * Ordered wall candidates for `spec` — the placement loop tries them in order
 * until placeAgainstWall succeeds. §FURNITURE-SPEC `excludeWindowWall` and
 * `excludeDoorSwing` prune the preferred set; cascading fallbacks ensure a
 * required item still finds SOME wall when filters over-constrain (e.g. a
 * bedroom wardrobe that should avoid the window+door walls but only has those
 * two walls free).
 *
 * Priority:
 *   1. Anchor-best of the FILTERED set (no window wall, no door wall).
 *   2. Remaining filtered walls in their input order.
 *   3. Anchor-best of the ANCHOR-only set (only the wall-window exclusion is
 *      kept — door is acceptable, window still not).
 *   4. Remaining anchor-only walls.
 *   5. Anchor-best of the FULL set (final fallback).
 *   6. Remaining full-set walls.
 *
 * Deduplicated. The 'wall-window' anchor ignores `excludeWindowWall` (self-
 * contradictory).
 */
function resolveAnchorWalls(spec: FurnitureItemSpec, input: FurnishRoomInput): RoomWallSeg[] {
    const dropWindow = !!spec.excludeWindowWall && spec.anchor !== 'wall-window';
    const dropDoor = !!spec.excludeDoorSwing;
    const allWalls = input.walls;
    const noWindow = (w: RoomWallSeg): boolean => !dropWindow || !wallHasWindow(w, input.windows);
    const noDoor = (w: RoomWallSeg): boolean => !dropDoor || !wallHasDoor(w, input.doors);
    const tiers: (readonly RoomWallSeg[])[] = [];
    if (dropWindow || dropDoor) tiers.push(allWalls.filter(w => noWindow(w) && noDoor(w)));
    if (dropDoor && dropWindow) tiers.push(allWalls.filter(noWindow));   // relax door
    tiers.push(allWalls);

    const seen = new Set<RoomWallSeg>();
    const ordered: RoomWallSeg[] = [];
    const push = (w: RoomWallSeg | null): void => {
        if (w && !seen.has(w)) { seen.add(w); ordered.push(w); }
    };
    for (const tier of tiers) {
        if (tier.length === 0) continue;
        push(pickByAnchor(spec, tier, input));
        for (const w of tier) push(w);
    }
    return ordered;
}

/** Place the 'beside' items of a group relative to its already-placed leader. */
function placeBeside(spec: FurnitureItemSpec, leader: Placement, input: FurnishRoomInput, obstacles: Rect[]): Placement[] {
    const out: Placement[] = [];
    const L = leader.item;
    const n: Pt = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };   // leader inward normal
    const d = perp(n);                                                       // along the wall
    const fp = footprintOf(spec.kind);
    const count = spec.count ?? 1;
    const tryPush = (c: Pt, yaw: number): void => {
        const p = placeAtPoint(spec.kind, c, yaw, input, obstacles);
        if (p) { out.push(p); obstacles.push(p.rect); }
    };

    if (L.kind === 'bed') {
        // flank the bed head (at the wall) with up to `count` bedside tables
        const wallPt = add({ x: L.position.x, z: L.position.z }, n, -L.footprint.l / 2);
        const headCtr = add(wallPt, n, fp.l / 2 + GAP);
        const side = L.footprint.w / 2 + fp.w / 2 + GAP;
        const slots = [side, -side].slice(0, count);
        for (const s of slots) tryPush(add(headCtr, d, s), L.rotationY);
    } else if (L.kind === 'sofa') {
        // coffee table in front of the sofa, toward the room
        const c = add({ x: L.position.x, z: L.position.z }, n, L.footprint.l / 2 + 0.35 + fp.l / 2);
        tryPush(c, L.rotationY);
    } else if (L.kind === 'dining_table') {
        // chairs around the table (front/back/left/right), facing it
        const tc: Pt = { x: L.position.x, z: L.position.z };
        const half = { fwd: L.footprint.l / 2 + fp.l / 2 + GAP, side: L.footprint.w / 2 + fp.l / 2 + GAP };
        const slots: Array<{ c: Pt; yaw: number }> = [
            { c: add(tc, n, half.fwd), yaw: L.rotationY + Math.PI },
            { c: add(tc, n, -half.fwd), yaw: L.rotationY },
            { c: add(tc, d, half.side), yaw: L.rotationY + Math.PI / 2 },
            { c: add(tc, d, -half.side), yaw: L.rotationY - Math.PI / 2 },
        ];
        for (const s of slots.slice(0, count)) tryPush(s.c, s.yaw);
    } else {
        // generic: one item in front of the leader (e.g. desk chair)
        tryPush(add({ x: L.position.x, z: L.position.z }, n, L.footprint.l / 2 + 0.1 + fp.l / 2), L.rotationY + Math.PI);
    }
    return out;
}

/** Corner candidates (room bbox corners inset by half the footprint). The
 *  primary door, if any, is used to sort the corners by distance DESCENDING
 *  — §FURNITURE-SPEC: corner-anchored items (shower, lamp) prefer the corner
 *  farthest from the door. Falls back to the bbox order when there's no door
 *  (deterministic: ties broken by lower x then z). */
function cornerPoints(input: FurnishRoomInput, inset: number): Pt[] {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of input.polygon) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const corners: Pt[] = [
        { x: x0 + inset, z: z0 + inset }, { x: x1 - inset, z: z0 + inset },
        { x: x1 - inset, z: z1 - inset }, { x: x0 + inset, z: z1 - inset },
    ];
    const door = input.doors[0];
    if (!door) return corners;
    const dx = door.center.x, dz = door.center.z;
    const dist2 = (c: Pt): number => (c.x - dx) * (c.x - dx) + (c.z - dz) * (c.z - dz);
    return [...corners].sort((a, b) => {
        const da = dist2(a), db = dist2(b);
        if (db !== da) return db - da;                // farthest first
        if (a.x !== b.x) return a.x - b.x;            // stable tiebreak: lower x
        return a.z - b.z;                              // then lower z
    });
}

/**
 * Place an archetype's items into a room. Returns the placed furniture (best-effort:
 * items that can't fit are skipped; a required item that can't be placed downgrades
 * the rest of its group). Deterministic.
 */
export function placeRoom(input: FurnishRoomInput, archetype: FurnitureArchetype): PlacedFurniture[] {
    if (input.areaM2 < archetype.minAreaM2 || input.walls.length === 0) return [];
    const obstacles: Rect[] = doorObstacles(input);
    const placed: Placement[] = [];
    const leaders = new Map<string, Placement>();

    // Pass 1 — anchored (non-beside) items, in order.
    for (const spec of archetype.items) {
        if (spec.anchor === 'beside') continue;
        let p: Placement | null = null;
        if (spec.anchor === 'center') {
            p = placeAtPoint(spec.kind, input.centroid, 0, input, obstacles);
        } else if (spec.anchor === 'corner') {
            const fp = footprintOf(spec.kind);
            for (const c of cornerPoints(input, Math.max(fp.w, fp.l) / 2 + GAP)) {
                p = placeAtPoint(spec.kind, c, 0, input, obstacles); if (p) break;
            }
        } else {
            for (const wall of resolveAnchorWalls(spec, input)) {
                p = placeAgainstWall(spec.kind, wall, input, obstacles);
                if (p) break;
            }
        }
        if (p) { placed.push(p); obstacles.push(p.rect); if (spec.group) leaders.set(spec.group, p); }
    }

    // Pass 2 — beside items, relative to their group leader.
    for (const spec of archetype.items) {
        if (spec.anchor !== 'beside' || !spec.group) continue;
        const leader = leaders.get(spec.group);
        if (!leader) continue;
        for (const p of placeBeside(spec, leader, input, obstacles)) placed.push(p);
    }

    return placed.map(p => p.item);
}
