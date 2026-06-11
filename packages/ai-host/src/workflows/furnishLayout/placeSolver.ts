// D-FLE F5 — deterministic placement solver (SPEC-FURNITURE-LAYOUT-ENGINE §5).
//
// Places an archetype's items into one room: anchor → against-wall position + yaw
// → clearance/collision check → slide along the wall → skip non-required on
// failure. Groups (bedside tables beside the bed, coffee table in front of the
// sofa, chairs around the dining table) are placed relative to their leader.
// Pure + deterministic (fixed candidate order; no RNG). Metres, world XZ.

import type {
    FurnitureArchetype, FurnitureItemSpec, FurnishRoomInput, PlacedFurniture, Pt, RoomWallSeg,
} from './types.js';
import { footprintOf } from './footprints.js';
import { footprintCorners, quadInPolygon, quadOverlapsAny, type Quad } from './collision.js';
import { longestWall, wallOppositeDoor, wallWithWindow, wallHasWindow, wallHasDoor, wallMid, wallDir, yawFromNormal } from './wallAnalysis.js';

const GAP = 0.02;
const SLIDE_STEP = 0.25;

const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const perp = (n: Pt): Pt => ({ x: n.z, z: -n.x });   // wall direction from inward normal

/** §67.2 — every bed-like kind (plain `bed` + the integrated variant beds) so
 *  bedside tables flank them and rugs centre under them identically. */
const BED_KINDS = new Set<PlacedFurniture['kind']>(['bed', 'nordic_bed', 'solid_wood_bed']);
const isBedKind = (k: PlacedFurniture['kind']): boolean => BED_KINDS.has(k);

/** §67.3 — every sofa-like kind (straight `sofa` + the L-shape `corner_sofa`) so
 *  the coffee table sits in front and the rug centres in front identically. */
const SOFA_KINDS = new Set<PlacedFurniture['kind']>(['sofa', 'corner_sofa']);
const isSofaKind = (k: PlacedFurniture['kind']): boolean => SOFA_KINDS.has(k);

/** §63.2 / §63.5 (2026-06-11) — WALL-HOSTED 'beside' kinds. These are flat
 *  panels / wall-mounted accessories that must sit FLUSH on their leader's wall
 *  (back plane on the wall face), VERTICAL, at their own baseOffset height —
 *  ABOVE / beside the floor-standing leader (the vanity, basin, sofa, tv unit,
 *  console). The pre-fix generic `placeBeside` else-branch floated them OUT INTO
 *  the room in front of the leader (the founder's "mirror floats / tilts" +
 *  "towel-rail radiator mid-wall on the floor" defects). For these kinds the
 *  solver instead pins them to the leader's wall with the leader's yaw + along-
 *  wall position, recessed so the back is on the wall. The mount height is the
 *  footprint's `baseOffset` (mirror ~1.1 m, towel rail ~0.4 m), so no tilt and
 *  the right eye / mount height. */
const WALL_HOSTED_BESIDE = new Set<PlacedFurniture['kind']>([
    'bathroom_mirror', 'wc_mirror', 'wall_mirror', 'wall_art', 'tv', 'towel_rail',
]);
const isWallHostedBeside = (k: PlacedFurniture['kind']): boolean => WALL_HOSTED_BESIDE.has(k);

/** §63.5 — wall-hosted kinds that mount BESIDE (to the side of) their leader at
 *  mid height, NOT stacked above it — the heated towel rail hangs next to the
 *  vanity within arm's reach of the basin, so it must offset along the wall past
 *  the leader's edge instead of centring on (and clashing with) the vanity body.
 *  Eye-level panels (mirror / art / TV) sit ABOVE the leader (high baseOffset),
 *  so they centre on it without a clash. */
const WALL_HOSTED_SIDE = new Set<PlacedFurniture['kind']>(['towel_rail']);
const isWallHostedSide = (k: PlacedFurniture['kind']): boolean => WALL_HOSTED_SIDE.has(k);

/** Door swing / keep-clear obstacle quads (in front of each door). */
function doorObstacles(input: FurnishRoomInput): Quad[] {
    return input.doors.map(d => {
        const c = add(d.center, d.normal, 0.45);
        return footprintCorners(c.x, c.z, d.width, 0.9, yawFromNormal(d.normal));
    });
}

interface Placement { item: PlacedFurniture; quad: Quad }

/**
 * §FURNITURE-SPEC clearFront — the keep-clear zone in front of the item where
 * the user stands / opens drawers / accesses the unit (kitchen working zone,
 * toilet knee clearance, wardrobe drawer slide-out). Built as a rect extending
 * `fp.clearFront` metres FROM the item's front edge along the wall's inward
 * normal (the item was placed with its back to the wall, so its `+front` is
 * `+inwardNormal`). Returns null when the item has no clear-front zone or its
 * yaw is not a wall-anchor yaw (center / corner items leave this null).
 */
function clearFrontRectFor(p: Placement): Quad | null {
    const fp = p.item.footprint;
    if (fp.clearFront <= 0) return null;
    const yaw = p.item.rotationY;
    const n: Pt = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const cx = p.item.position.x + n.x * (fp.l / 2 + fp.clearFront / 2);
    const cz = p.item.position.z + n.z * (fp.l / 2 + fp.clearFront / 2);
    return footprintCorners(cx, cz, fp.w, fp.clearFront, yaw);
}

/** Try to place `kind` against `wall`, sliding along it until it fits. */
function placeAgainstWall(
    kind: PlacedFurniture['kind'], wall: RoomWallSeg,
    input: FurnishRoomInput, obstacles: readonly Quad[],
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
        const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
        if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
            return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, quad };
        }
    }
    return null;
}

/** Place at a free point (center/corner) with a given yaw. */
function placeAtPoint(kind: PlacedFurniture['kind'], c: Pt, yaw: number, input: FurnishRoomInput, obstacles: readonly Quad[]): Placement | null {
    const fp = footprintOf(kind);
    const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
        return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, quad };
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

/**
 * §63.2 / §63.5 — true when the leader sits with its BACK on a room wall (so a
 * wall-hosted accessory can pin to that wall). We project the wall face point
 * behind the leader (leaderCentre − n·(L.l/2)) onto each wall segment and accept
 * if it lies within the segment span AND within ~12 cm of the wall line. A
 * centre-anchored leader (dining table, kitchen island) fails this (its back is
 * not near any wall) → the caller falls back to the generic in-front placement.
 */
function leaderIsWallAnchored(L: PlacedFurniture, input: FurnishRoomInput): boolean {
    const n: Pt = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };
    const fx = L.position.x - n.x * (L.footprint.l / 2);
    const fz = L.position.z - n.z * (L.footprint.l / 2);
    for (const w of input.walls) {
        const dir = wallDir(w);
        const t = (fx - w.a.x) * dir.x + (fz - w.a.z) * dir.z;
        if (t < -0.05 || t > w.length + 0.05) continue;
        const px = w.a.x + dir.x * t, pz = w.a.z + dir.z * t;
        if (Math.hypot(fx - px, fz - pz) < 0.12) return true;
    }
    return false;
}

/**
 * §63.2 / §63.5 (2026-06-11) — place a WALL-HOSTED accessory (mirror / wall art /
 * TV / towel rail) FLUSH on its leader's wall, above / beside the leader.
 *
 * The leader was placed against a wall: its centre sits at
 *   wallPoint + n·(L.l/2 + GAP)   (n = leader inward normal).
 * So the wall face is at  leaderCentre − n·(L.l/2 + GAP). We pin the accessory's
 * BACK on that wall face → its centre is  wallFace + n·(fp.l/2). Same along-wall
 * position + same yaw as the leader (vertical, normal into the room), and its
 * floor height comes from the footprint baseOffset (mirror ~1.1 m, towel rail
 * ~0.4 m) applied via `levelElevation + fp.baseOffset`.
 *
 * Wall-hosted accessories are height-stacked above the leader (mirror above the
 * vanity) or are thin flat panels (towel rail) — they do NOT contend for floor
 * space, so the placement is collision-EXEMPT (neither tested against obstacles
 * nor pushed as one), exactly like the rug. This keeps the mirror reliably above
 * the vanity instead of being slid away / dropped by the floor-collision set.
 * `count` accessories (e.g. two flanking wall_mirror panels) are spread along the
 * wall symmetrically about the leader. Deterministic.
 */
function placeOnLeaderWall(spec: FurnitureItemSpec, leader: Placement, input: FurnishRoomInput): Placement[] {
    const out: Placement[] = [];
    const L = leader.item;
    const n: Pt = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };   // leader inward normal
    const d = perp(n);                                                       // along the wall
    const fp = footprintOf(spec.kind);
    const count = spec.count ?? 1;
    // Wall face behind the leader, then push the accessory's back onto it.
    const wallFaceX = L.position.x - n.x * (L.footprint.l / 2);
    const wallFaceZ = L.position.z - n.z * (L.footprint.l / 2);
    const baseX = wallFaceX + n.x * (fp.l / 2);
    const baseZ = wallFaceZ + n.z * (fp.l / 2);
    // §63.5 SIDE-MOUNT: a towel rail hangs to the SIDE of the vanity (offset
    // along the wall past the leader's edge) so it doesn't clash with the cabinet
    // body. ABOVE-MOUNT panels (mirror / art / TV) sit at high baseOffset directly
    // over the leader → no clash, centre on it.
    const sideMount = isWallHostedSide(spec.kind);
    const sideShift = L.footprint.w / 2 + fp.w / 2 + GAP;   // just past the leader edge
    // Spread `count` items symmetrically along the wall, centred on the leader.
    // (1 → centred; 2 → ±(leaderW − fp.w)/2; N → evenly across the leader span.)
    const span = Math.max(L.footprint.w - fp.w, 0);
    for (let i = 0; i < count; i++) {
        const t = sideMount
            ? (count === 1 ? sideShift : ((i % 2 === 0 ? 1 : -1) * sideShift))
            : (count === 1 ? 0 : (i / (count - 1) - 0.5) * span);   // −span/2 … +span/2
        const cx = baseX + d.x * t;
        const cz = baseZ + d.z * t;
        const yaw = L.rotationY;
        const quad = footprintCorners(cx, cz, fp.w, fp.l, yaw);
        out.push({
            item: {
                kind: spec.kind,
                position: { x: cx, y: input.levelElevation + fp.baseOffset, z: cz },
                rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId,
            },
            quad,
        });
    }
    return out;
}

/** Place the 'beside' items of a group relative to its already-placed leader. */
function placeBeside(spec: FurnitureItemSpec, leader: Placement, input: FurnishRoomInput, obstacles: Quad[]): Placement[] {
    const out: Placement[] = [];
    const L = leader.item;
    const n: Pt = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };   // leader inward normal
    const d = perp(n);                                                       // along the wall
    const fp = footprintOf(spec.kind);
    const count = spec.count ?? 1;
    const tryPush = (c: Pt, yaw: number): void => {
        const p = placeAtPoint(spec.kind, c, yaw, input, obstacles);
        if (p) { out.push(p); obstacles.push(p.quad); }
    };

    // §63.2 / §63.5 — wall-hosted accessory: pin FLUSH on the leader's wall
    // (above / beside it), collision-EXEMPT. Only valid when the leader is itself
    // wall-anchored (its back sits on a room wall); a centre-anchored leader has
    // no wall to host against → fall through to the generic in-front placement.
    if (isWallHostedBeside(spec.kind) && leaderIsWallAnchored(L, input)) {
        for (const p of placeOnLeaderWall(spec, leader, input)) out.push(p);
        return out;
    }

    if (isBedKind(L.kind)) {
        // flank the bed head (at the wall) with up to `count` bedside tables
        const wallPt = add({ x: L.position.x, z: L.position.z }, n, -L.footprint.l / 2);
        const headCtr = add(wallPt, n, fp.l / 2 + GAP);
        const side = L.footprint.w / 2 + fp.w / 2 + GAP;
        const slots = [side, -side].slice(0, count);
        for (const s of slots) tryPush(add(headCtr, d, s), L.rotationY);
    } else if (isSofaKind(L.kind)) {
        // coffee table in front of the sofa, toward the room
        const c = add({ x: L.position.x, z: L.position.z }, n, L.footprint.l / 2 + 0.35 + fp.l / 2);
        tryPush(c, L.rotationY);
    } else if (L.kind === 'dining_table') {
        // chairs around the table (front/back/left/right), facing it. The
        // chair's local +z is its forward direction; a chair at +d (right of
        // the table) must FACE −d (toward the table) → its inward-normal is
        // −d, yawFromNormal(−d) = L.rotationY − π/2. (Earlier the side yaws
        // were swapped, leaving the side chairs facing AWAY from the table.)
        const tc: Pt = { x: L.position.x, z: L.position.z };
        const half = { fwd: L.footprint.l / 2 + fp.l / 2 + GAP, side: L.footprint.w / 2 + fp.l / 2 + GAP };
        const slots: Array<{ c: Pt; yaw: number }> = [
            { c: add(tc, n, half.fwd),   yaw: L.rotationY + Math.PI },
            { c: add(tc, n, -half.fwd),  yaw: L.rotationY },
            { c: add(tc, d, half.side),  yaw: L.rotationY - Math.PI / 2 },
            { c: add(tc, d, -half.side), yaw: L.rotationY + Math.PI / 2 },
        ];
        for (const s of slots.slice(0, count)) tryPush(s.c, s.yaw);
    } else {
        // generic: one item in front of the leader (e.g. desk chair)
        tryPush(add({ x: L.position.x, z: L.position.z }, n, L.footprint.l / 2 + 0.1 + fp.l / 2), L.rotationY + Math.PI);
    }
    return out;
}

/**
 * §67.1 (2026-06-11) — place a RUG UNDER its group leader (bed / dining_table /
 * sofa). The rug is centred on the leader, inherits the leader's yaw, and is
 * sized to sit beneath the leader + its dependents (a rug reads as the zone
 * anchor: it extends past the bed foot, past the dining chairs, in front of the
 * sofa). Collision-EXEMPT: the rug underlaps the furniture above it, so it is
 * NEITHER tested against obstacles NOR added as one — it must never block a
 * placement or count against circulation. We DO clamp it inside the room
 * polygon (shrinking if a full rug would poke outside) so it never spills past a
 * wall. Pure + deterministic.
 */
function placeUnder(
    spec: FurnitureItemSpec, leader: Placement, input: FurnishRoomInput,
): Placement | null {
    const fpBase = footprintOf(spec.kind);
    const L = leader.item;
    const n: Pt = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };  // leader inward normal
    const yaw = L.rotationY;

    // Target rug extent: cover the leader generously (the rug "anchors the zone").
    //   • bed: a touch wider than the bed, extending well past the foot.
    //   • dining_table: cover the table + the chair ring.
    //   • sofa: in front of the sofa (under the coffee table), sofa-width.
    let targetW: number;
    let targetL: number;
    if (L.kind === 'dining_table') {
        targetW = L.footprint.w + 1.4;       // table + chairs on both sides
        targetL = L.footprint.l + 1.4;
    } else if (isSofaKind(L.kind)) {
        targetW = L.footprint.w;             // sofa width
        targetL = Math.max(fpBase.l, L.footprint.l + 0.9);   // reach in front
    } else {
        // bed (or any other leader): wider than the bed, past the foot.
        targetW = L.footprint.w + 0.5;
        targetL = L.footprint.l + 0.7;
    }

    // Centre: dining/bed → on the leader centroid; sofa → shifted toward the room
    // so the rug sits in FRONT of the sofa (under the coffee table), not under it.
    let cx = L.position.x;
    let cz = L.position.z;
    if (isSofaKind(L.kind)) {
        const shift = L.footprint.l / 2 + 0.35;   // ~coffee-table gap
        cx += n.x * shift;
        cz += n.z * shift;
    }

    // Clamp inside the polygon: shrink the rug (keeping its centre + aspect) until
    // its oriented quad fits. Deterministic fixed shrink ladder — never RNG.
    for (let scale = 1.0; scale >= 0.4 - 1e-9; scale -= 0.1) {
        const w = targetW * scale;
        const l = targetL * scale;
        const quad = footprintCorners(cx, cz, w, l, yaw);
        if (quadInPolygon(quad, input.polygon)) {
            const footprint = { ...fpBase, w, l };
            return {
                item: {
                    kind: spec.kind,
                    position: { x: cx, y: input.levelElevation + fpBase.baseOffset, z: cz },
                    rotationY: yaw, footprint, hostedSpaceId: input.roomId,
                },
                quad,
            };
        }
    }
    return null;
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
 * Run ONE archetype within an existing obstacle/leader context. Used by both
 * `placeRoom` (fresh context) and `placeRoomMulti` (shared across archetypes
 * for the open-plan merged-room case). Returns the placements appended.
 */
function applyArchetype(
    input: FurnishRoomInput, archetype: FurnitureArchetype,
    obstacles: Quad[], leaders: Map<string, Placement>,
): Placement[] {
    if (input.areaM2 < archetype.minAreaM2 || input.walls.length === 0) return [];
    const added: Placement[] = [];
    for (const spec of archetype.items) {
        if (spec.anchor === 'beside') {
            const leader = spec.group ? leaders.get(spec.group) : undefined;
            if (!leader) continue;       // leader couldn't place → drop the dependents
            for (const p of placeBeside(spec, leader, input, obstacles)) added.push(p);
            continue;
        }
        if (spec.anchor === 'under') {
            // §67.1 — RUG under its leader. Collision-EXEMPT: it is placed by the
            // leader pose only and is NEITHER overlap-tested NOR pushed onto the
            // obstacle set (it underlaps the furniture above it). Dropped if no
            // leader placed (nothing to sit under).
            const leader = spec.group ? leaders.get(spec.group) : undefined;
            if (!leader) continue;
            const rug = placeUnder(spec, leader, input);
            if (rug) added.push(rug);    // intentionally NOT added to `obstacles`
            continue;
        }
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
        if (p) {
            added.push(p);
            obstacles.push(p.quad);
            // §FURNITURE-SPEC clearFront: reserve the working/knee-clearance
            // zone in front of items that have NO group members (sofa→coffee
            // table, bed→bedsides, dining_table→chairs intentionally sit in
            // the leader's clear-front, so we skip when there's a group).
            if (!spec.group) {
                const cf = clearFrontRectFor(p);
                if (cf) obstacles.push(cf);
            }
            if (spec.group) leaders.set(spec.group, p);
        }
    }
    return added;
}

/**
 * Place an archetype's items into a room. Returns the placed furniture (best-effort:
 * items that can't fit are skipped; a required item that can't be placed downgrades
 * the rest of its group). Deterministic.
 *
 * SINGLE-PASS ARCHETYPE ORDER: items are placed in archetype order, with 'beside'
 * items resolved against their group leader (which the archetype guarantees is
 * earlier in the list — see test pinning in furnishRules.test.ts). This is what
 * keeps bedside_tables from being shoved aside by a later corner-anchored lamp:
 * the bedsides are placed BEFORE the lamp, become obstacles, and the lamp yields
 * to another corner.
 */
export function placeRoom(input: FurnishRoomInput, archetype: FurnitureArchetype): PlacedFurniture[] {
    const obstacles: Quad[] = doorObstacles(input);
    const leaders = new Map<string, Placement>();
    return applyArchetype(input, archetype, obstacles, leaders).map(p => p.item);
}

/**
 * Open-plan / multi-program furnishing: run several archetypes in sequence
 * within ONE room polygon, sharing the obstacle set. Used when a detected room
 * has merged D-TGL spaces (hall + living + kitchen + dining) — running each
 * archetype with shared obstacles is what gets the kitchen run AND the sofa
 * AND the dining table into the same zone without overlap. Archetypes are
 * placed in the given order; later archetypes yield to earlier placements.
 */
export function placeRoomMulti(
    input: FurnishRoomInput, archetypes: readonly FurnitureArchetype[],
): PlacedFurniture[] {
    if (input.walls.length === 0) return [];
    const obstacles: Quad[] = doorObstacles(input);
    const leaders = new Map<string, Placement>();
    const placed: Placement[] = [];
    // §COMPOUND-ORDER (2026-05-29) — process archetypes ordered by priority so
    // an open-plan compound (living + kitchen + dining) places the dining
    // table at the centroid BEFORE the kitchen island tries to. The compound
    // semantics are: the dining table is the centerpiece; the island is a
    // bonus when there's space. Without this, the kitchen archetype (passed
    // before dining-room by some callers) grabs the centroid via its island,
    // and the dining table drops.
    for (const a of [...archetypes].sort(_compoundPriority)) {
        for (const p of applyArchetype(input, a, obstacles, leaders)) placed.push(p);
    }
    return placed.map(p => p.item);
}

/** §COMPOUND-ORDER — Lower priority runs LATER in the compound. Kitchen runs
 *  last because its island competes for the centroid with the dining table. */
const _COMPOUND_ORDER: Record<string, number> = {
    'living-room': 1,
    'dining-room': 2,
    'entrance-lobby': 3,
    'kitchen': 9,
};
function _compoundPriority(a: FurnitureArchetype, b: FurnitureArchetype): number {
    return (_COMPOUND_ORDER[a.occupancy] ?? 5) - (_COMPOUND_ORDER[b.occupancy] ?? 5);
}
