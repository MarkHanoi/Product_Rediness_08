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
        .map(p => footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY));
    // Door swing.
    for (const d of input.doors) {
        obstacles.push(footprintCorners(
            d.center.x + d.normal.x * 0.45, d.center.z + d.normal.z * 0.45,
            d.width, 0.9, yawFromNormal(d.normal),
        ));
    }

    const out: PlacedFurniture[] = [];
    for (const arm of arms) {
        out.push(...layAlongWall(arm, input, obstacles));
    }
    return out;
}
