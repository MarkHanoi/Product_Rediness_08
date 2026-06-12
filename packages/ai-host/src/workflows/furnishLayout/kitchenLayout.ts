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
import { validateKitchenLayout, formatKitchenViolations } from './rules/kitchenValidation.js';

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

/** Two usable walls form a workable L corner only when BOTH arms are long enough
 *  to host cabinetry past the shared corner cell: the secondary arm reserves one
 *  module (0.60 m) for the corner, so it needs ≥ ~1.2 m to seat even a single
 *  off-corner unit. We test the perpendicular-chained arms (not just any 2 walls)
 *  so "two usable walls" that are PARALLEL (a galley) don't masquerade as an L. */
const L_MIN_PRIMARY = 1.6;     // m — spine must host sink+hob (≈ 2 modules + clearance)
const L_MIN_SECONDARY = 1.2;   // m — secondary must clear the corner + 1 off-corner unit
// U back-wall cap: an elongated room (one long wall) is still better as an L
// (sink+hob on the long wall, fridge perpendicular) than an over-wide U whose
// fridge↔hob cross-leg blows the NKBA window. We keep that principle but the
// rest of the U gate is RELAXED (§KITCHEN-LU-PREFER): the upper area limit (was
// 11 m²) is dropped so larger squarish kitchens still U, and the cap is nudged
// 3.3 → 3.6 m so a typical squarish kitchen back wall qualifies.
const U_BACK_WALL_MAX = 3.6;   // m — U back-wall (spine) cap
const U_MIN_THIRD = 1.2;       // m — each side arm must host a cell off the corner

/** Can the longest-first, perpendicular-chained walls actually host an L? */
function canHostL(walls: RoomWallSeg[]): boolean {
    const chain = buildChain(walls, 2);
    return chain.length >= 2 &&
        chain[0]!.length >= L_MIN_PRIMARY && chain[1]!.length >= L_MIN_SECONDARY;
}

/** Can three perpendicular-chained walls actually host a U (compact back wall)? */
function canHostU(walls: RoomWallSeg[]): boolean {
    const chain = buildChain(walls, 3);
    if (chain.length < 3) return false;
    // chain = [arm0, back(spine), arm2] after buildChain's perpendicular weave; the
    // SPINE (the wall both side arms share a corner with) is the middle element.
    const back = chain[1]!;
    return back.length <= U_BACK_WALL_MAX &&
        chain[0]!.length >= U_MIN_THIRD && chain[2]!.length >= U_MIN_THIRD;
}

/**
 * §KITCHEN-LU-PREFER (2026-06-10) — bias the AUTO shape choice toward L and U.
 *
 * Founder doctrine: real kitchens almost always wrap a corner, so the planner
 * should PREFER L (two adjacent usable walls) and U (three) and only fall back to
 * a straight I run when the geometry genuinely can't host a corner — a narrow
 * single-wall galley, a too-small room, or two usable walls that are parallel
 * rather than perpendicular.
 *
 * Selection (AUTO):
 *   • U  — three perpendicular-chained usable walls, back wall ≤ U_BACK_WALL_MAX,
 *          both side arms long enough to host the fridge a cell off the corner,
 *          AND the room is roomy enough (areaM2 ≥ 6) to walk a three-wall run.
 *   • L  — two perpendicular usable walls, both arms long enough past the corner.
 *   • I  — everything else (single usable wall, parallel-only pair, or arms too
 *          short for a corner cell).
 *
 * The explicit-brief path still wins (degrading gracefully when the geometry
 * can't host the requested shape). The result is reported on a §DIAG-KITCHEN line.
 */
function chooseShape(input: FurnishRoomInput, walls: RoomWallSeg[], pref: KitchenLayout): 'I' | 'L' | 'U' {
    const usable = walls.filter(w => !wallHasDoor(w, input.doors));
    const longest = usable.reduce((m, w) => Math.max(m, w.length), 0);

    const decide = (): { shape: 'I' | 'L' | 'U'; why: string } => {
        if (pref !== 'auto') {
            // Respect the brief but degrade gracefully if the geometry can't host it.
            if (pref === 'U' && usable.length >= 3) return { shape: 'U', why: 'brief=U' };
            if (pref === 'L' && usable.length >= 2) return { shape: 'L', why: 'brief=L' };
            if (pref === 'I') return { shape: 'I', why: 'brief=I' };
            // requested shape doesn't fit the wall count → fall through to auto
        }
        // AUTO — prefer the corner shapes. U first (three workable walls), then L
        // (two perpendicular workable walls), then I as the genuine fallback.
        if (usable.length >= 3 && input.areaM2 >= 6 && canHostU(usable)) {
            return { shape: 'U', why: `3+ walls, back≤${U_BACK_WALL_MAX}m, area=${input.areaM2.toFixed(1)}m²` };
        }
        if (usable.length >= 2 && canHostL(usable)) {
            return { shape: 'L', why: '2 perpendicular usable walls (corner fits)' };
        }
        if (usable.length >= 2 && !canHostL(usable)) {
            return { shape: 'I', why: 'two usable walls but parallel/too-short → no corner' };
        }
        return { shape: 'I', why: `single-wall galley (usable=${usable.length})` };
    };

    const { shape, why } = decide();
    // §DIAG-KITCHEN — always-on rule-compliance log of the chosen run shape.
    // eslint-disable-next-line no-console
    console.log(
        `§DIAG-KITCHEN room=${input.roomId} shape=${shape} pref=${pref} ` +
        `usableWalls=${usable.length} longest=${longest.toFixed(2)}m area=${input.areaM2.toFixed(1)}m² — ${why}`,
    );
    return shape;
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

// ── §KITCHEN-WINDOW-SINK (2026-06-12) — window-over-the-sink ──────────────────
//
// Founder doctrine + classic ergonomic: "always plan a window in one section of
// the L-shape kitchen" → the worktop/SINK run must hug an EXTERIOR wall that has a
// WINDOW, with the sink centred under that window. So when one of the chosen arms
// is an exterior window wall, we make THAT arm the SPINE (it carries the sink+hob),
// and the sink module is shifted to sit beneath the window aperture.
//
// `runWalls` mildly DE-prioritises window walls (tall units block daylight), which
// is right for ranking the candidate set — but once the shape's arms are chosen we
// WANT the sink's spine on the window wall. This reorders the arms so the spine is
// a window-bearing exterior wall when available; otherwise the existing convention
// (arm[0] for L, arm[1] for U) is preserved. Deterministic.

/** Does the wall carry a window AND front the exterior (the window-over-sink wall)?
 *  Exterior is preferred but an interior window still qualifies (the founder's ask
 *  is "a window over the sink" — any window wall hosting the sink satisfies it). */
function isWindowSpineCandidate(w: RoomWallSeg, windows: readonly { center: Pt; normal: Pt; width: number; type: string }[]): boolean {
    return wallHasWindow(w, windows as never);
}

/**
 * The window over which to centre the sink on `spine`, or null. Returns the window
 * whose centre projects onto the spine span; prefers the window nearest the spine
 * midpoint so the sink lands on a usable central stretch (not jammed at a corner).
 * Deterministic.
 */
function windowOnWall(spine: RoomWallSeg, input: FurnishRoomInput): FurnishRoomInput['windows'][number] | null {
    const d = wallDir(spine);
    const mid = wallMid(spine);
    let best: FurnishRoomInput['windows'][number] | null = null;
    let bestScore = Infinity;
    for (const win of input.windows) {
        const t = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
        if (t < -0.05 || t > spine.length + 0.05) continue;
        const px = spine.a.x + d.x * t, pz = spine.a.z + d.z * t;
        if (Math.hypot(win.center.x - px, win.center.z - pz) > 0.3) continue;
        const score = Math.hypot(win.center.x - mid.x, win.center.z - mid.z);
        if (score < bestScore - 1e-9) { bestScore = score; best = win; }
    }
    return best;
}

/**
 * Reorder the shape's arms so the SPINE (sink-carrying arm) is an exterior window
 * wall when one of the arms qualifies. Returns the (possibly reordered) arms +
 * the spine index within them. When no arm has a window, the default convention is
 * kept (spineIdx = 1 for U / 0 otherwise). Pure + deterministic.
 */
function orderArmsForWindowSink(
    arms: RoomWallSeg[], shape: 'I' | 'L' | 'U', input: FurnishRoomInput,
): { arms: RoomWallSeg[]; spineIdx: number } {
    const defaultSpine = arms.length >= 3 ? 1 : 0;
    if (arms.length < 2) return { arms, spineIdx: defaultSpine };

    // Candidate spine = an arm carrying a window, exterior preferred, longest first.
    const candidates = arms
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => isWindowSpineCandidate(w, input.windows))
        .sort((a, b) => {
            const ext = (b.w.isExterior ? 1 : 0) - (a.w.isExterior ? 1 : 0);
            if (ext !== 0) return ext;
            const len = b.w.length - a.w.length;
            if (Math.abs(len) > 1e-9) return len;
            return a.i - b.i;   // stable
        });
    if (candidates.length === 0) return { arms, spineIdx: defaultSpine };

    const chosen = candidates[0]!.i;
    if (chosen === defaultSpine) return { arms, spineIdx: defaultSpine };

    // For an L the spine convention is arm[0]; swap the window arm into slot 0.
    // For a U the spine is the MIDDLE (back) arm — moving a side arm into the back
    // slot would break the perpendicular weave, so for U we only adopt the window
    // arm as spine when it is already the back arm (chosen === 1). Here chosen ≠
    // defaultSpine, so for U we keep the default and rely on planKitchen's sink-
    // under-window offset only when the back arm itself carries the window.
    if (shape === 'L') {
        const reordered = [...arms];
        const tmp = reordered[0]!;
        reordered[0] = reordered[chosen]!;
        reordered[chosen] = tmp;
        return { arms: reordered, spineIdx: 0 };
    }
    return { arms, spineIdx: defaultSpine };
}

/** The along-spine offset (from the spine's lay ORIGIN) that centres the sink under
 *  the window. `fromEnd` mirrors the lay direction. Returns null when there is no
 *  window on the spine (caller keeps the corner-clustered triangle). The returned
 *  offset is the cursor value so that sink centre = window centre projection.
 *  The sink width is `MODULE` (0.60); we clamp to keep the sink fully on the wall. */
function sinkOffsetUnderWindow(
    spine: RoomWallSeg, input: FurnishRoomInput, fromEnd: boolean, sinkW: number,
): number | null {
    const win = windowOnWall(spine, input);
    if (!win) return null;
    const d = wallDir(spine);
    const t = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
    // cursor measures from `origin` along `dir`. For fromEnd the origin is `b` and
    // dir is reversed, so the along-wall distance from origin is (length - t).
    const along = fromEnd ? spine.length - t : t;
    // cursor + sinkW/2 = along  ⇒  cursor = along - sinkW/2. Clamp on-wall.
    const cursor = along - sinkW / 2;
    return Math.max(GAP, Math.min(cursor, spine.length - sinkW - GAP));
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
    const rawArms = pickArms(walls, shape);
    if (rawArms.length === 0) return [];

    // §KITCHEN-WINDOW-SINK — reorder the arms so the SPINE (the sink-carrying arm)
    // hugs an exterior WINDOW wall when one of the arms qualifies, so the sink lands
    // under the window ("window over the sink"). When no arm has a window, the
    // default convention (arm[0] for L / arm[1] back for U) is kept.
    const { arms, spineIdx } = orderArmsForWindowSink(rawArms, shape, input);
    const spine = arms[spineIdx]!;

    // Per-arm module sequences: the work-triangle stations sit COMPACT around the
    // arms' shared corner(s). Each arm lays its run STARTING FROM the corner it
    // shares with the "spine" arm (arm-0 for L; arm-1/back for U) so the leading
    // appliance of each arm clusters at the corner → a tight, NKBA-sane triangle.
    const perArm = moduleSequencesByArm(arms.length, { washingMachine: !!opts.washingMachine });
    const out: PlacedFurniture[] = [];

    // The spine carries the sink+hob. When the spine is a window wall we lay the
    // sink module CENTRED under the window (rather than corner-clustered), then the
    // hob/oven extend along the wall from there. The sink-under-window offset is
    // computed against the spine's lay direction below.
    const spineRef = arms[spineIdx === 0 ? 1 : 0] ?? spine;
    const spineFromEnd = sharedCornerIsB(spine, spineRef);
    const sinkOffset = sinkOffsetUnderWindow(spine, input, spineFromEnd, footprintOf('sink').w);

    // Lay the spine FIRST so its corner cell is an obstacle the others avoid.
    const order = [spineIdx, ...arms.map((_, i) => i).filter(i => i !== spineIdx)];
    for (const i of order) {
        const arm = arms[i]!;
        const kinds = perArm[i] ?? [];
        const ref = i === spineIdx ? spineRef : spine;
        const fromEnd = i === spineIdx ? spineFromEnd : sharedCornerIsB(arm, ref);
        // Spine: when a window is present, start the sink under it; else the usual
        // corner-clustered inset. Non-spine arms inset by a module past the corner.
        const inset = i === spineIdx
            ? (sinkOffset !== null ? sinkOffset : GAP)
            : MODULE + GAP;
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

    // §59 P2 — HARD-rule VALIDATION pass over the planned modules. We REPORT the
    // result on a §DIAG-KITCHEN-RULES line (the FIRST real use of the §59 corpus);
    // the layout is preferred-valid by construction (sink under the window, runs
    // off the corners), and any residual HARD violation surfaces for the UI rather
    // than crashing the placement. Pure — no side-effect on `out`.
    reportKitchenRules(input.roomId, out, input);

    return out;
}

/** Run the §59 P2 validation pass + emit the §DIAG-KITCHEN-RULES line. Pure apart
 *  from the always-on diagnostic log (mirrors §DIAG-KITCHEN). Returns the result so
 *  callers/tests can assert on it. */
function reportKitchenRules(
    roomId: string, placed: readonly PlacedFurniture[], input: FurnishRoomInput,
): ReturnType<typeof validateKitchenLayout> {
    const res = validateKitchenLayout(placed, input);
    // eslint-disable-next-line no-console
    console.log(formatKitchenViolations(roomId, res));
    return res;
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

/** Clamp `v` to [lo,hi]; `fallback` when the clamp would collapse the range. */
function clampInt(v: number, lo: number, hi: number, fallback: number): number {
    if (hi < lo) return fallback;
    return Math.max(lo, Math.min(hi, v));
}

/** §KITCHEN-WINDOW-SINK — the main-run cabinet-cell index whose centre lands nearest
 *  the window centred on `spine` (so the sink unit sits under the window). Returns 0
 *  when the spine carries no window (the default start-cell sink). The run cells
 *  span 0..mainLen along the spine; the window's projection `t` picks the cell.
 *  Deterministic. */
function sinkUnitIndexUnderWindow(
    spine: RoomWallSeg, input: FurnishRoomInput, numUnits: number, unitW: number, mainLen: number,
): number {
    const win = windowOnWall(spine, input);
    if (!win || numUnits <= 1) return 0;
    const d = wallDir(spine);
    let t = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
    // The run is centred on the spine midpoint with length `mainLen`; it occupies the
    // central `mainLen` band of the (possibly longer) wall, starting at
    // (spine.length - mainLen)/2 from endpoint a. Shift t into run-local coordinates.
    const runStart = (spine.length - mainLen) / 2;
    t -= runStart;
    const cell = Math.floor(t / unitW);
    return clampInt(cell, 0, numUnits - 1, 0);
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
    const rawArms = pickArms(walls, shape);
    if (rawArms.length === 0) return [];

    // §KITCHEN-WINDOW-SINK — make the SPINE (sink-carrying main run) hug an exterior
    // window wall when one of the arms qualifies, so the sink lands under the window.
    const { arms, spineIdx } = orderArmsForWindowSink(rawArms, shape, input);
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

    // §DIAG-KITCHEN — report the EMITTED run shape (after secondary-arm sizing).
    // If `shape` (the chosen geometry) and `layoutType` (the emitted run) disagree,
    // a secondary arm was too short to host a cabinet past the corner cell → the
    // run legitimately degraded one step (U→L or L→I). Surfacing it here makes that
    // collapse visible instead of silent. §KITCHEN-LU-PREFER.
    // eslint-disable-next-line no-console
    console.log(
        `§DIAG-KITCHEN room=${input.roomId} RUN layoutType=${layoutType} chosenShape=${shape} ` +
        `mainUnits=${numMain} leftUnits=${numLeft} rightUnits=${numRight} ` +
        `mainLen=${mainLen.toFixed(2)}m leftLen=${leftLen.toFixed(2)}m rightLen=${rightLen.toFixed(2)}m`,
    );

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
    // §KITCHEN-WINDOW-SINK — the sink slot: under the window when the spine wall has
    // one (the founder's "window over the sink"), else the start cell. The main run
    // is centred on the spine midpoint with unit 0 at the lay-origin end; the cell
    // whose centre is nearest the window-centre projection carries the sink.
    const sinkCell = sinkUnitIndexUnderWindow(spine, input, numMain, KITCHEN_UNIT_W, mainLen);
    setAppliance(main, sinkCell, 'sink_inox');
    // Hob two cells along from the sink (≈1.2 m → NKBA leg), clamped on-run and away
    // from the sink cell so they never collide.
    const hobCell = numMain >= 3
        ? clampInt(sinkCell + 2, 0, numMain - 1, sinkCell)
        : (numMain >= 2 ? (sinkCell === numMain - 1 ? sinkCell - 1 : numMain - 1) : sinkCell);
    if (numMain >= 2 && hobCell !== sinkCell) setAppliance(main, hobCell, 'hob');
    if (opts.washingMachine && numMain >= 4) {
        const wmCell = [0, 1, numMain - 1, numMain - 2].find(i => i !== sinkCell && i !== hobCell);
        if (wmCell !== undefined) setAppliance(main, wmCell, 'washing_machine_white');
    }

    const left: KUnit[] = [];
    for (let i = 0; i < numLeft; i++) left.push({ index: i, arm: 'left', front: 'door' });
    const right: KUnit[] = [];
    for (let i = 0; i < numRight; i++) right.push({ index: i, arm: 'right', front: 'door' });

    // Fridge: prefer the first secondary arm one cell off the corner; else a free
    // main-run cell (far end, then walking inward) that isn't the sink/hob/wm cell.
    if (numLeft >= 1) {
        setAppliance(left, Math.min(1, numLeft - 1), 'fridge_combi_silver');
    } else {
        const used = new Set(main.filter(u => u.appliance).map(u => u.index));
        let fridgeCell = -1;
        for (let i = numMain - 1; i >= 0; i--) { if (!used.has(i)) { fridgeCell = i; break; } }
        if (fridgeCell >= 0) setAppliance(main, fridgeCell, 'fridge_combi_silver');
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

    const result: PlacedFurniture[] = [{
        kind: layoutType as FurnitureKind,
        position: { x: round6(cx), y: input.levelElevation, z: round6(cz) },
        rotationY: yaw,
        footprint,
        hostedSpaceId: input.roomId,
        kitchenConfig: config,
    }];

    // §59 P2 — validation pass over the emitted run (door-swing / window-overlap of
    // the run footprint). The run is one parametric element; the per-appliance HARD
    // rules are enforced by construction in slot assignment above. §DIAG line only.
    reportKitchenRules(input.roomId, result, input);

    return result;
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
