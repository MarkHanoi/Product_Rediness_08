// A.21.D20 (2026-06-06) — wardrobe I / L / U run layout.
// (SPEC-KITCHEN-WARDROBE-APPLIANCES §C)
//
// The bedroom archetype places ONE `wardrobe` (1.2 m module). This planner
// upgrades that to a run of wardrobe modules along the bedroom's FREE wall(s):
//   • I — one wall.
//   • L — two adjacent (perpendicular) walls.
//   • U — three walls.
// It runs AFTER the rest of the bedroom is placed and shares the existing
// placement obstacles, so the wardrobe never collides with the bed / bedsides /
// dresser. Walls carrying a window or door are excluded (privacy + daylight +
// the door swing) and walls already claimed by other furniture are skipped.
//
// PURE + deterministic. Metres, world XZ. Same PlacedFurniture[] output.

import type {
    FurnishRoomInput, PlacedFurniture, Pt, RoomWallSeg, FurnitureKind,
} from './types.js';
import { footprintOf } from './footprints.js';
import { footprintCorners, quadInPolygon, quadOverlapsAny, type Quad } from './collision.js';
import {
    wallDir, wallMid, yawFromNormal, wallHasDoor, wallHasWindow,
} from './wallAnalysis.js';

/** The selectable wardrobe run shape. `auto` lets the planner pick by geometry. */
export type WardrobeLayout = 'auto' | 'I' | 'L' | 'U';

const GAP = 0.02;
const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const WARDROBE: FurnitureKind = 'wardrobe';

/** Side / rear overhang (m) each integrated bed kind extends past its DECK footprint
 *  (mirrors BedEngine wings / nightstands + headboard). 0 for non-bed + plain beds.
 *  Kept in lock-step with §BED-OCCUPIED-FOOTPRINT in placeSolver.ts. */
const BED_SIDE_OVERHANG: Readonly<Record<string, number>> = {
    japanese_platform_bed: 0.50, japanese_float_bed: 0.45, japanese_walnut_bed: 0.40,
};
const BED_REAR_OVERHANG: Readonly<Record<string, number>> = {
    japanese_platform_bed: 0.05, japanese_float_bed: 0.05, japanese_walnut_bed: 0.05,
};
/** §BED-OCCUPIED-FOOTPRINT — obstacle quad for a placed item: the FULL occupied box
 *  (deck + wings + headboard) for an integrated bed, the plain footprint quad for
 *  everything else (plain bed + non-bed → byte-identical, so the wardrobe's available
 *  wall is unchanged when no integrated bed is present — avoids the wardrobe landmine). */
function bedOccupiedObstacle(p: PlacedFurniture): Quad {
    const side = BED_SIDE_OVERHANG[p.kind] ?? 0;
    const rear = BED_REAR_OVERHANG[p.kind] ?? 0;
    if (side === 0 && rear === 0) {
        return footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
    }
    const n: Pt = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };
    return footprintCorners(
        p.position.x - n.x * (rear / 2), p.position.z - n.z * (rear / 2),
        p.footprint.w + 2 * side, p.footprint.l + rear, p.rotationY,
    );
}

/** Normalise an arbitrary brief value to a WardrobeLayout (default 'auto'). */
export function normaliseWardrobeLayout(v: unknown): WardrobeLayout {
    return v === 'I' || v === 'L' || v === 'U' ? v : 'auto';
}

function perpendicular(a: RoomWallSeg, b: RoomWallSeg): boolean {
    const da = wallDir(a), db = wallDir(b);
    return Math.abs(da.x * db.x + da.z * db.z) < 0.2;
}

/** Free wall candidates: exclude door + window walls; longest first; stable. */
function candidateWalls(input: FurnishRoomInput): RoomWallSeg[] {
    const ok = input.walls.filter(
        w => !wallHasDoor(w, input.doors) && !wallHasWindow(w, input.windows),
    );
    return ok.sort((a, b) => {
        if (Math.abs(b.length - a.length) > 1e-9) return b.length - a.length;
        const ma = wallMid(a), mb = wallMid(b);
        return ma.x !== mb.x ? ma.x - mb.x : ma.z - mb.z;
    });
}

function chooseShape(walls: RoomWallSeg[], pref: WardrobeLayout): 'I' | 'L' | 'U' {
    if (pref !== 'auto') {
        if (pref === 'U' && walls.length >= 3) return 'U';
        if (pref === 'L' && walls.length >= 2) return 'L';
        if (pref === 'I') return 'I';
    }
    if (walls.length >= 3) return 'U';
    if (walls.length >= 2) return 'L';
    return 'I';
}

/** Build a chain of `want` perpendicular-chained walls (L = end→back, U =
 *  end→back→other-end). Mirrors kitchenLayout.buildChain. */
function buildChain(walls: RoomWallSeg[], want: number): RoomWallSeg[] {
    if (want <= 1) return walls.length > 0 ? [walls[0]!] : [];
    let best: RoomWallSeg[] = [];
    for (const start of walls) {
        const chain: RoomWallSeg[] = [start];
        const used = new Set<RoomWallSeg>([start]);
        let extended = true;
        while (chain.length < want && extended) {
            extended = false;
            for (const w of walls) {
                if (used.has(w)) continue;
                if (perpendicular(chain[chain.length - 1]!, w)) {
                    chain.push(w); used.add(w); extended = true; break;
                }
            }
        }
        if (chain.length > best.length) best = chain;
        if (best.length >= want) break;
    }
    return best;
}

function pickArms(walls: RoomWallSeg[], shape: 'I' | 'L' | 'U'): RoomWallSeg[] {
    const want = shape === 'U' ? 3 : shape === 'L' ? 2 : 1;
    return buildChain(walls, want);
}

/** Lay wardrobe modules end-to-end along one wall, skipping blocked slots. */
function layAlongWall(
    wall: RoomWallSeg, input: FurnishRoomInput, obstacles: Quad[],
): PlacedFurniture[] {
    const fp = footprintOf(WARDROBE);
    const dir = wallDir(wall);
    const yaw = yawFromNormal(wall.inwardNormal);
    const out: PlacedFurniture[] = [];
    let cursor = GAP;
    while (cursor + fp.w <= wall.length - GAP) {
        const alongCtr = cursor + fp.w / 2;
        const onWall = add(wall.a, dir, alongCtr);
        const c = add(onWall, wall.inwardNormal, fp.l / 2 + GAP);
        const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
        if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
            out.push({
                kind: WARDROBE,
                position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
                rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId,
            });
            obstacles.push(quad);
        }
        cursor += fp.w + GAP;
    }
    return out;
}

/**
 * Plan a wardrobe I/L/U run along the bedroom's free walls. `existing` are the
 * already-placed bedroom items (bed, bedsides, dresser, …) whose footprints
 * become obstacles so the wardrobe never overlaps them. Returns the wardrobe
 * module placements (possibly several for L/U); [] if no module fits (caller
 * keeps the archetype's single wardrobe).
 *
 * Pure + deterministic.
 */
export function planWardrobe(
    input: FurnishRoomInput,
    existing: readonly PlacedFurniture[],
    layout: WardrobeLayout = 'auto',
): PlacedFurniture[] {
    if (input.walls.length === 0) return [];
    const walls = candidateWalls(input);
    if (walls.length === 0) return [];
    const shape = chooseShape(walls, layout);
    const arms = pickArms(walls, shape);
    if (arms.length === 0) return [];

    // Seed obstacles with every existing item EXCEPT the wardrobe we're replacing.
    const obstacles: Quad[] = existing
        .filter(p => p.kind !== WARDROBE)
        .map(bedOccupiedObstacle);   // §BED-OCCUPIED-FOOTPRINT — avoid the integrated bed's wings, not just its deck
    // Door swing — §DOOR-SWING-DEPTH (mirrors placeSolver.doorObstacles): depth =
    // max(width, 0.9) so a wide door's full leaf swing is kept clear; width unchanged.
    for (const d of input.doors) {
        const swingR = Math.max(d.width, 0.9);
        obstacles.push(footprintCorners(
            d.center.x + d.normal.x * (swingR / 2), d.center.z + d.normal.z * (swingR / 2),
            d.width, swingR, yawFromNormal(d.normal),
        ));
    }

    const out: PlacedFurniture[] = [];
    for (const arm of arms) {
        out.push(...layAlongWall(arm, input, obstacles));
    }
    return out;
}
