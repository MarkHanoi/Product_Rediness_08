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
    KitchenCabinetConfigLike,
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

// §KITCHEN-ISLAND (2026-06-07) — central island placement.
//
// A free-standing island is only worthwhile when the kitchen has a roomy,
// open centre: the founder's wishlist asks for one "where space allows".
// THRESHOLD: the room's shorter span (min bounding dimension) must be
// ≥ ISLAND_MIN_ROOM_DIM so the island + its kitchen-side circulation
// (0.9 m each side) leaves a usable gangway to the perimeter runs. Small
// galley / L kitchens fall below the gate and ship island-free.
const ISLAND_MIN_ROOM_DIM = 3.5;   // m — shorter room span gate (founder's ~3.5 m)
const ISLAND_MIN_AREA = 12;        // m² — below this the runs already fill the floor

/** Axis-aligned bounding box of the room polygon (metres, world XZ). */
function bbox(poly: readonly Pt[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, minZ, maxX, maxZ };
}

/**
 * Try to drop a central kitchen island. Returns the island placement, or null
 * when the kitchen is too small OR the centre can't host the island + its
 * circulation clear of the runs / doors. The island is axis-aligned with the
 * room's longer span (its 2.0 m worktop runs along the long axis) and centred on
 * the room centroid. Its footprint is tested EXPANDED by the circulation
 * clearance so a placed island always keeps a walkable gangway around it.
 *
 * Pure + deterministic — geometry only.
 */
function tryIsland(input: FurnishRoomInput, obstacles: readonly Quad[]): PlacedFurniture | null {
    const bb = bbox(input.polygon);
    const spanX = bb.maxX - bb.minX, spanZ = bb.maxZ - bb.minZ;
    const minDim = Math.min(spanX, spanZ);
    if (minDim < ISLAND_MIN_ROOM_DIM || input.areaM2 < ISLAND_MIN_AREA) return null;

    const fp = footprintOf('kitchen_island');
    // Orient the island so its WIDTH (the 2.0 m worktop) runs along the room's
    // LONGER axis; yaw 0 → width along x, yaw 90° → width along z.
    const yaw = spanX >= spanZ ? 0 : Math.PI / 2;
    const c = input.centroid;
    // The plain footprint (the island block itself) must lie inside the room and
    // not overlap any run / door obstacle.
    const body = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    if (!quadInPolygon(body, input.polygon) || quadOverlapsAny(body, obstacles)) return null;
    // The circulation envelope (body grown by clearFront on the depth ends and
    // clearSides on the width ends) must ALSO stay inside the room AND clear of the
    // runs — guaranteeing a gangway all the way round. (Overlap with the runs is
    // expected to be the binding constraint on tight kitchens → island dropped.)
    const envW = fp.w + 2 * fp.clearSides;
    const envL = fp.l + 2 * fp.clearFront;
    const env = footprintCorners(c.x, c.z, envW, envL, yaw);
    if (!quadInPolygon(env, input.polygon) || quadOverlapsAny(env, obstacles)) return null;

    return {
        kind: 'kitchen_island',
        position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
        rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId,
    };
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

    // §KITCHEN-ISLAND — drop a central island on roomy kitchens (skipped when the
    // centre can't host it + a walkable gangway clear of the runs). The runs + the
    // door obstacles are the obstacle set, so the island never crowds the worktops.
    const island = tryIsland(input, obstacles);
    if (island) out.push(island);

    return out;
}

// ── §KITCHEN-PARAMETRIC-RUN (2026-06-10) ─────────────────────────────────────
//
// The auto-furnish kitchen now emits ONE parametric kitchen RUN that the editor
// renders with the GOOD `@pryzm/geometry-furniture` `KitchenCabinetEngine`
// (swappable cabinet units + integrated appliances + a unified countertop),
// instead of the legacy concatenation of individual appliance box proxies
// (`planKitchen` → separate sink/hob/oven/base_unit/fridge items).
//
// This produces a single `PlacedFurniture` whose `kind` is the matching
// `kitchen_straight | kitchen_l_shape | kitchen_u_shape` and which carries a
// fully-resolved `KitchenCabinetConfigLike`. `buildFurnishCommands` forwards the
// config (+ `furnitureCategory:'kitchen'`) onto the `furniture.create` payload,
// and the user can keep swapping cabinets/appliances afterward via the existing
// KitchenUnitInspector / KitchenRunInspector UI (the placed run IS a real
// kitchen-cabinet furniture element, identical to one dropped from the carousel).
//
// SCOPE (smallest real slice): the run is built along the kitchen's longest
// usable (door-free) wall as the spine. I-shape is the guaranteed minimum; L / U
// are emitted when the auto/forced shape chooses them AND a perpendicular arm
// wall is available, sizing each arm to the chosen wall length. Per-cabinet swap
// + a tighter wall-by-wall fit remain follow-ups (SPEC-KITCHEN-WARDROBE-WALL-DRIVEN).

const KITCHEN_DEPTH = 0.60;        // base cabinet depth (m) — matches KITCHEN_DEFAULTS.depth
const KITCHEN_HEIGHT = 0.90;       // worktop height (m)    — matches KITCHEN_DEFAULTS.height
const KITCHEN_UNIT_W = 0.60;       // 600 mm standard module — matches KITCHEN_DEFAULTS.unitWidth
const KITCHEN_MIN_RUN = 1.20;      // a run shorter than this can't host the triangle → bail

type KUnit = NonNullable<KitchenCabinetConfigLike['units']>[number];

/** Whole number of 600 mm units that fit along a usable arm length, clamped to
 *  ≥1; the arm depth (0.60 m) is reserved at the corner for L/U so secondary
 *  arms don't double-count the corner cell. */
function unitsForArm(armLength: number): number {
    return Math.max(1, Math.floor((armLength + 1e-6) / KITCHEN_UNIT_W));
}

/**
 * Build the parametric kitchen RUN as a single PlacedFurniture carrying a
 * resolved KitchenCabinetConfigLike. Mirrors `planKitchen`'s shape choice + the
 * sink↔hob↔fridge work-triangle (mapped onto cabinet-unit appliance slots), but
 * emits the run as ONE element the GOOD KitchenCabinetEngine renders.
 *
 * Pure + deterministic. Returns [] for degenerate rooms (caller falls back).
 */
export function planKitchenRun(
    input: FurnishRoomInput,
    layout: KitchenLayout = 'auto',
    opts: { washingMachine?: boolean } = {},
): PlacedFurniture[] {
    if (input.walls.length === 0 || input.areaM2 <= 0) return [];

    const usableWalls = runWalls(input).filter(w => !wallHasDoor(w, input.doors));
    const walls = usableWalls.length > 0 ? usableWalls : runWalls(input);
    const shape = chooseShape(input, walls, layout);
    const arms = pickArms(walls, shape);
    if (arms.length === 0) return [];

    // The SPINE arm carries the worktop run + sink/hob. For an L/U it's the arm
    // every other arm shares a corner with (chosen as arm[1]/back for U, arm[0]
    // for L by buildChain ordering — same convention as planKitchen).
    const spineIdx = arms.length >= 3 ? 1 : 0;
    const spine = arms[spineIdx]!;

    // Main-arm geometry: the engine builds the main run centred on the spine
    // midpoint, units facing local +Z, then offsets the group by -length/2 in X.
    // So we anchor the placement at the spine MIDPOINT, push it the cabinet half
    // depth INTO the room (along the wall's inward normal), and yaw so the run's
    // local +Z points into the room.
    const mainLen = Math.min(spine.length, KITCHEN_UNIT_W * 12);   // cap absurdly long walls
    if (mainLen < KITCHEN_MIN_RUN) return [];
    const numMain = unitsForArm(mainLen);

    // Secondary arm lengths (L/U) — left arm for L+U, right arm for U.
    const secondaries = arms.filter((_, i) => i !== spineIdx);
    const hasLeft = (shape === 'L' || shape === 'U') && secondaries.length >= 1;
    const hasRight = shape === 'U' && secondaries.length >= 2;
    const leftLen = hasLeft
        ? Math.max(0, Math.min(secondaries[0]!.length, KITCHEN_UNIT_W * 8) - KITCHEN_DEPTH)
        : 0;
    const rightLen = hasRight
        ? Math.max(0, Math.min(secondaries[1]!.length, KITCHEN_UNIT_W * 8) - KITCHEN_DEPTH)
        : 0;
    const numLeft = leftLen >= KITCHEN_UNIT_W ? unitsForArm(leftLen) : 0;
    const numRight = rightLen >= KITCHEN_UNIT_W ? unitsForArm(rightLen) : 0;

    const layoutType: KitchenCabinetConfigLike['layoutType'] =
        numRight > 0 ? 'kitchen_u_shape' : numLeft > 0 ? 'kitchen_l_shape' : 'kitchen_straight';

    // ── Work-triangle → unit appliance slots ────────────────────────────────
    // Spine (main) arm: sink near one end, hob spread one+ cell along, washing
    // machine when requested. Fridge goes on the FIRST secondary arm (L/U) one
    // cell off the corner, or on the main run's far end for an I kitchen — the
    // same triangle doctrine `planKitchen` uses, expressed as appliance slots.
    const units: KUnit[] = [];
    const main: KUnit[] = [];
    for (let i = 0; i < numMain; i++) main.push({ index: i, arm: 'main', front: 'door' });

    const setAppliance = (arr: KUnit[], idx: number, appliance: string): void => {
        if (idx >= 0 && idx < arr.length) arr[idx]!.appliance = appliance;
    };
    // Sink at the start cell; hob two cells along (≈1.2 m → NKBA leg).
    setAppliance(main, 0, 'sink_inox');
    if (numMain >= 3) setAppliance(main, 2, 'hob');
    else if (numMain >= 2) setAppliance(main, numMain - 1, 'hob');
    if (opts.washingMachine && numMain >= 4) setAppliance(main, 3, 'washing_machine_white');

    const left: KUnit[] = [];
    for (let i = 0; i < numLeft; i++) left.push({ index: i, arm: 'left', front: 'door' });
    const right: KUnit[] = [];
    for (let i = 0; i < numRight; i++) right.push({ index: i, arm: 'right', front: 'door' });

    // Fridge: prefer the first secondary arm one cell off the corner; else the
    // far end of the main run. Combi fridge replaces the carcass at that slot.
    if (numLeft >= 1) {
        setAppliance(left, Math.min(1, numLeft - 1), 'fridge_combi_silver');
    } else {
        setAppliance(main, numMain - 1, 'fridge_combi_silver');
    }

    units.push(...main, ...left, ...right);

    const config: KitchenCabinetConfigLike = {
        layoutType,
        depth: KITCHEN_DEPTH,
        length: round6(mainLen),
        height: KITCHEN_HEIGHT,
        numUnits: numMain,
        // L/U arm fields are omitted (not set to undefined) so the config is
        // clean under exactOptionalPropertyTypes.
        ...(numLeft > 0 ? { lengthLeft: round6(leftLen), numUnitsLeft: numLeft } : {}),
        ...(numRight > 0 ? { lengthRight: round6(rightLen), numUnitsRight: numRight } : {}),
        // Default materials — oak doors + marble worktop, matching the carousel
        // default (buildDefaultKitchenConfig); the user can re-finish via the UI.
        frontMaterialId: 'wood-oak',
        countertopMaterialId: 'stone-marble-white',
        units,
    };

    // ── Placement (position + yaw) ────────────────────────────────────────────
    // Engine convention: main arm along local +X (centred → group offset
    // -length/2 in X), units front at local +Z. So:
    //   yaw   = yawFromNormal(inwardNormal)  → local +Z maps to the room interior
    //   origin = spine MIDPOINT pushed depth/2 into the room (the run's centre of
    //            mass sits half-a-cabinet off the wall).
    const yaw = yawFromNormal(spine.inwardNormal);
    const mid = wallMid(spine);
    const cx = mid.x + spine.inwardNormal.x * (KITCHEN_DEPTH / 2);
    const cz = mid.z + spine.inwardNormal.z * (KITCHEN_DEPTH / 2);

    const footprint = {
        w: round6(mainLen),
        l: KITCHEN_DEPTH,
        h: KITCHEN_HEIGHT,
        baseOffset: 0,
        clearFront: 1.0,
        clearSides: 0,
    };

    return [{
        kind: layoutType as FurnitureKind,
        position: { x: round6(cx), y: input.levelElevation, z: round6(cz) },
        rotationY: yaw,
        footprint,
        hostedSpaceId: input.roomId,
        kitchenConfig: config,
    }];
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

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
