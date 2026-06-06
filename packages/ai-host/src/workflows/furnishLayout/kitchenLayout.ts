// A.21.D20 (2026-06-06) — kitchen I / L / U run layout + appliance placement.
// (SPEC-KITCHEN-WARDROBE-APPLIANCES §C)
//
// Replaces the old "two kitchen_straight runs + a standalone fridge" kitchen
// archetype with an explicit run planner that:
//   1. CHOOSES the run shape — I (1 wall), L (2 adjacent walls), U (3 walls) —
//      by the room's free-wall count + aspect (or honours an explicit
//      `kitchenLayout` brief override).
//   2. Composes each run from standard 600 mm MODULES laid end-to-end along the
//      wall (base units + the appliances slotted IN the run).
//   3. Places the APPLIANCES honouring the sink↔hob↔fridge WORK-TRIANGLE: the
//      sink, hob and fridge are spread across the run(s) at the three "points"
//      rather than crammed together; oven sits under/next-to the hob, the
//      dishwasher next to the sink, the extractor mounts above the hob, and the
//      washing machine takes a module when requested (no separate utility room).
//
// PURE + deterministic — no RNG, no geometry/DOM imports. Metres, world XZ.
// Same PlacedFurniture[] output as the rest of D-FLE, so buildFurnishCommands
// projects it unchanged.

import type {
    FurnishRoomInput, PlacedFurniture, Pt, RoomWallSeg, FurnitureKind,
} from './types.js';
import { footprintOf } from './footprints.js';
import { quadInPolygon, quadOverlapsAny, footprintCorners, type Quad } from './collision.js';
import {
    wallDir, wallMid, yawFromNormal, wallHasDoor, wallHasWindow,
} from './wallAnalysis.js';

/** The selectable kitchen run shape. `auto` lets the planner pick by geometry. */
export type KitchenLayout = 'auto' | 'I' | 'L' | 'U';

const MODULE = 0.60;          // standard cabinet/appliance module width (m)
const GAP = 0.02;
const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, z: a.z + b.z * s });

/** Normalise an arbitrary brief value to a KitchenLayout (default 'auto'). */
export function normaliseKitchenLayout(v: unknown): KitchenLayout {
    return v === 'I' || v === 'L' || v === 'U' ? v : 'auto';
}

/** Candidate run walls in priority order: longest first, door walls last,
 *  window walls deprioritised (the sink wants a window but tall units block it —
 *  we keep windowed walls but rank them below clear walls). Deterministic. */
function runWalls(input: FurnishRoomInput): RoomWallSeg[] {
    const walls = [...input.walls];
    const score = (w: RoomWallSeg): number => {
        let s = w.length;                                   // longer = better
        if (wallHasDoor(w, input.doors)) s -= 100;          // door walls last
        if (wallHasWindow(w, input.windows)) s -= 0.5;      // mild window penalty
        return s;
    };
    return walls.sort((a, b) => {
        const d = score(b) - score(a);
        if (Math.abs(d) > 1e-9) return d;
        const ma = wallMid(a), mb = wallMid(b);             // stable tiebreak
        return ma.x !== mb.x ? ma.x - mb.x : ma.z - mb.z;
    });
}

/** Are two walls roughly perpendicular (adjacent run arms of an L / U)? */
function perpendicular(a: RoomWallSeg, b: RoomWallSeg): boolean {
    const da = wallDir(a), db = wallDir(b);
    return Math.abs(da.x * db.x + da.z * db.z) < 0.2;       // |cos θ| ≈ 0
}

/** Choose the run shape. `auto`: U when ≥3 usable walls AND the room is squarish
 *  + roomy; L when ≥2 usable perpendicular walls; else I. */
function chooseShape(input: FurnishRoomInput, walls: RoomWallSeg[], pref: KitchenLayout): 'I' | 'L' | 'U' {
    const usable = walls.filter(w => !wallHasDoor(w, input.doors));
    if (pref !== 'auto') {
        // Respect the brief but degrade gracefully if the geometry can't host it.
        if (pref === 'U' && usable.length >= 3) return 'U';
        if (pref === 'L' && usable.length >= 2) return 'L';
        if (pref === 'I') return 'I';
        // requested shape doesn't fit → fall through to auto
    }
    // AUTO doctrine: the L-shape is the most reliable work-triangle (sink+hob on
    // one wall, fridge on the perpendicular wall — both legs short). A U is only
    // chosen when the room is COMPACT enough that the back wall stays short
    // (≤ ~3.3 m) so the cross-U fridge↔hob leg stays workable; otherwise a wide
    // U spreads the triangle past the NKBA cap. Long thin galleys → I.
    const backWallMax = 3.3;
    const longest = usable.reduce((m, w) => Math.max(m, w.length), 0);
    if (usable.length >= 3 && input.areaM2 >= 6 && input.areaM2 <= 11 && longest <= backWallMax) {
        return 'U';
    }
    if (usable.length >= 2) return 'L';
    return 'I';
}

/** Build a chain of `want` walls where each consecutive pair is perpendicular
 *  (so the runs wrap corners: L = end→back, U = end→back→other-end). Tries each
 *  wall as the chain start and keeps the first chain that reaches `want`,
 *  preferring chains seeded by longer walls (walls are pre-sorted longest-first).
 *  Falls back to the longest partial chain. */
function buildChain(walls: RoomWallSeg[], want: number): RoomWallSeg[] {
    if (want <= 1) return walls.length > 0 ? [walls[0]!] : [];
    let best: RoomWallSeg[] = [];
    for (const start of walls) {
        const chain: RoomWallSeg[] = [start];
        const used = new Set<RoomWallSeg>([start]);
        // greedily extend: next must be ⊥ to the last AND unused
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

/** Pick the arms for the chosen shape: 1/2/3 perpendicular-chained walls. */
function pickArms(walls: RoomWallSeg[], shape: 'I' | 'L' | 'U'): RoomWallSeg[] {
    const want = shape === 'U' ? 3 : shape === 'L' ? 2 : 1;
    return buildChain(walls, want);
}

/** The per-arm module plan.
 *
 *  WORK-TRIANGLE DOCTRINE: the three primary stations (sink → hob → fridge) are
 *  kept COMPACT on the PRIMARY (first / longest) arm, separated by ONE base unit
 *  each (≈1.2 m centre-to-centre → each triangle leg lands inside the NKBA
 *  1.2–2.7 m window). The dishwasher sits by the sink; the oven by the hob; the
 *  extractor mounts over the hob. The SECONDARY arms (L / U) carry the *extra*
 *  cabinetry (base units, the washing machine when there's no utility room) so
 *  the kitchen wraps the corner WITHOUT stretching the triangle across the room.
 *
 *  This makes the shape (I / L / U) about how far the cabinetry RUNS wrap the
 *  walls, while the appliance triangle stays workable in every shape.
 *  Returns one ordered FurnitureKind[] PER ARM (length === armCount). */
function moduleSequencesByArm(armCount: number, opts: { washingMachine: boolean }): FurnitureKind[][] {
    const wm: FurnitureKind[] = opts.washingMachine ? ['washing_machine'] : [];
    if (armCount >= 3) {
        // U — the SPINE (back) arm carries sink + hob compactly near corner A.
        // Arm-1 (left, from corner A) carries the dishwasher + storage; arm-3
        // (right, from corner B) carries the FRIDGE one cell off the corner so
        // it sits a short walk from the hob → a tight three-wall triangle.
        return [
            ['dishwasher', 'base_unit'],                       // arm-1 (left, from corner A, inset)
            ['sink', 'base_unit', 'hob', 'oven', ...wm],       // arm-2 SPINE (back wall, from corner A)
            ['base_unit', 'fridge', 'base_unit'],              // arm-3 (right, from corner B, inset)
        ];
    }
    if (armCount === 2) {
        // L — SPINE (primary) arm carries sink + hob compact near the corner;
        // the secondary arm carries the FRIDGE ~1.5 m off the corner (a base
        // unit leads so the fridge is a short walk — not crammed — from the sink).
        return [
            ['sink', 'dishwasher', 'hob', 'oven', ...wm],      // primary SPINE, from shared corner
            ['base_unit', 'fridge', 'base_unit'],              // secondary, from shared corner (inset)
        ];
    }
    // I — single linear run. An I kitchen is inherently linear; its triangle is
    // the best a single wall allows — the validator soft/hard-flags it for the UI.
    return [['sink', 'base_unit', 'hob', 'oven', 'base_unit', 'fridge', 'dishwasher', ...wm]];
}

/** Place a sequence of modules along one wall arm. When `fromEnd` is true the run
 *  starts from the wall's `b` endpoint and advances back toward `a` (so the first
 *  module sits at the `b` corner) — used to seat a secondary arm's first module
 *  at the corner it shares with the primary arm. Stops when the next module would
 *  overrun the wall. Returns the placements + how many kinds were consumed. */
function layAlongWall(
    wall: RoomWallSeg, kinds: readonly FurnitureKind[],
    input: FurnishRoomInput, obstacles: Quad[], startOffset: number,
    fromEnd = false,
): { placed: PlacedFurniture[]; consumed: number; placedKinds: FurnitureKind[] } {
    const baseDir = wallDir(wall);
    const dir = fromEnd ? { x: -baseDir.x, z: -baseDir.z } : baseDir;
    const origin = fromEnd ? wall.b : wall.a;
    const yaw = yawFromNormal(wall.inwardNormal);
    const placed: PlacedFurniture[] = [];
    const placedKinds: FurnitureKind[] = [];
    let cursor = startOffset;
    let consumed = 0;
    for (const kind of kinds) {
        const fp = footprintOf(kind);
        const w = fp.w;
        if (cursor + w > wall.length - GAP) break;          // would overrun the wall
        const alongCtr = cursor + w / 2;
        const onWall = add(origin, dir, alongCtr);
        const c = add(onWall, wall.inwardNormal, fp.l / 2 + GAP);
        const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
        consumed++;
        if (!quadInPolygon(quad, input.polygon) || quadOverlapsAny(quad, obstacles)) {
            cursor += w + GAP;
            continue;
        }
        placed.push({
            kind,
            position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
            rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId,
        });
        placedKinds.push(kind);
        obstacles.push(quad);
        cursor += w + GAP;
    }
    return { placed, consumed, placedKinds };
}

/** Which endpoint of `wall` is closest to either endpoint of `ref`? Returns
 *  'b' if the shared/closest corner is at wall.b (→ lay fromEnd), else 'a'. */
function sharedCornerIsB(wall: RoomWallSeg, ref: RoomWallSeg): boolean {
    const d = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.z - q.z);
    const aMin = Math.min(d(wall.a, ref.a), d(wall.a, ref.b));
    const bMin = Math.min(d(wall.b, ref.a), d(wall.b, ref.b));
    return bMin < aMin;
}

/** Door swing / keep-clear obstacle quads (mirrors placeSolver.doorObstacles). */
function doorObstacles(input: FurnishRoomInput): Quad[] {
    return input.doors.map(d => {
        const c = add(d.center, d.normal, 0.45);
        return footprintCorners(c.x, c.z, d.width, 0.9, yawFromNormal(d.normal));
    });
}

/**
 * Plan a kitchen's I / L / U run with appliances laid IN the run, honouring the
 * work-triangle. Returns PlacedFurniture[] (base units + sink + hob + oven +
 * dishwasher + fridge [+ washing machine] + an extractor over the hob).
 *
 * Pure + deterministic. `layout` overrides the auto shape choice; `washingMachine`
 * adds a kitchen-mounted washer when there is no separate utility room.
 */
export function planKitchen(
    input: FurnishRoomInput,
    layout: KitchenLayout = 'auto',
    opts: { washingMachine?: boolean } = {},
): PlacedFurniture[] {
    if (input.walls.length === 0 || input.areaM2 <= 0) return [];
    const obstacles: Quad[] = doorObstacles(input);
    // Arms are drawn ONLY from usable (door-free) walls, ranked by runWalls.
    // Door walls are excluded outright — a counter run sliding past the door is
    // unusable and the door swing fouls the working zone.
    const usableWalls = runWalls(input).filter(w => !wallHasDoor(w, input.doors));
    const walls = usableWalls.length > 0 ? usableWalls : runWalls(input);
    const shape = chooseShape(input, walls, layout);
    const arms = pickArms(walls, shape);
    if (arms.length === 0) return [];

    // Per-arm module sequences: the work-triangle stations sit COMPACT around the
    // arms' shared corner(s). Each arm lays its run STARTING FROM the corner it
    // shares with the "spine" arm (arm-0 for L; arm-1/back for U) so the leading
    // appliance of each arm clusters at the corner → a tight, NKBA-sane triangle.
    const perArm = moduleSequencesByArm(arms.length, { washingMachine: !!opts.washingMachine });
    const out: PlacedFurniture[] = [];

    // The spine arm is the one every other arm shares a corner with (the back
    // wall in a U; arm-0 in an L). The spine carries the sink+hob; the spine lays
    // from its corner with arm-0. Non-spine arms lay from their shared corner with
    // the spine, INSET by one module so they clear the spine's corner cell (no
    // appliance-on-appliance collision at the corner).
    const spineIdx = arms.length >= 3 ? 1 : 0;
    const spine = arms[spineIdx]!;
    // Lay the spine FIRST so its corner cell is an obstacle the others avoid.
    const order = [spineIdx, ...arms.map((_, i) => i).filter(i => i !== spineIdx)];
    for (const i of order) {
        const arm = arms[i]!;
        const kinds = perArm[i] ?? [];
        const ref = i === spineIdx ? (arms[i === 0 ? 1 : 0] ?? arm) : spine;
        const fromEnd = sharedCornerIsB(arm, ref);
        const inset = i === spineIdx ? GAP : MODULE + GAP;   // clear the corner cell
        const { placed } = layAlongWall(arm, kinds, input, obstacles, inset, fromEnd);
        out.push(...placed);
    }

    // If NOTHING placed (degenerate room), bail.
    if (out.length === 0) return [];

    // Extractor hood mounted directly above the hob (if a hob landed).
    const hob = out.find(p => p.kind === 'hob');
    if (hob) {
        const fp = footprintOf('extractor');
        // same XZ as the hob, lifted to the extractor's baseOffset
        out.push({
            kind: 'extractor',
            position: { x: hob.position.x, y: input.levelElevation + fp.baseOffset, z: hob.position.z },
            rotationY: hob.rotationY, footprint: fp, hostedSpaceId: input.roomId,
        });
    }

    return out;
}

/** Extract the explicit work-triangle points (sink / hob / fridge) from a planned
 *  kitchen, for the dimensional validator. Returns null if any point is missing. */
export function kitchenTrianglePoints(placed: readonly PlacedFurniture[]):
    { sink: Pt; hob: Pt; fridge: Pt } | null {
    const find = (k: FurnitureKind): Pt | null => {
        const p = placed.find(x => x.kind === k);
        return p ? { x: p.position.x, z: p.position.z } : null;
    };
    const sink = find('sink'), hob = find('hob'), fridge = find('fridge');
    if (!sink || !hob || !fridge) return null;
    return { sink, hob, fridge };
}
