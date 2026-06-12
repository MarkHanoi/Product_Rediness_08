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

const dot2 = (a: Pt, b: Pt): number => a.x * b.x + a.z * b.z;
const len2 = (a: Pt): number => Math.hypot(a.x, a.z);
const norm2 = (a: Pt): Pt => { const l = len2(a) || 1; return { x: a.x / l, z: a.z / l }; };

/** §67.2 — every bed-like kind (plain `bed` + the integrated variant beds) so
 *  bedside tables flank them and rugs centre under them identically. */
const BED_KINDS = new Set<PlacedFurniture['kind']>([
    'bed', 'nordic_bed', 'solid_wood_bed',
    // §BED-4-TYPES (2026-06-12) — the three JapaneseBedBuilder picker variants.
    'japanese_platform_bed', 'japanese_float_bed', 'japanese_walnut_bed',
]);
const isBedKind = (k: PlacedFurniture['kind']): boolean => BED_KINDS.has(k);

/**
 * §BED-HEADBOARD-FLUSH (founder #7, 2026-06-12) — the metres each bed kind's
 * HEADBOARD mesh protrudes BEHIND the footprint's geometric back edge (−fp.l/2).
 *
 * The bed footprints size `l` to the variant's DECK length (head→foot), but every
 * variant's headboard panel sits a further `HB_THICKNESS` (≈0.04–0.05 m) behind the
 * deck head face (BedEngine: headboard at `headZ − HB_THICKNESS`, headZ = −deckL/2).
 * The plain `bed` (BedBuilder) tucks its headboard INSIDE the frame (back flush at
 * −length/2) → 0 overhang. The generic wall-anchored placement only recesses the
 * FOOTPRINT back to GAP off the wall; without compensating for this rear overhang
 * the headboard mesh pokes (overhang − GAP) INTO the head wall — the founder's
 * "cabezero goes through the internal wall" defect (worst on the walnut bed, whose
 * deck was also under-sized in the footprint, compounding it to ~0.35 m).
 *
 * `placeBedAgainstWall` pushes the bed this much deeper into the room so the
 * REAR-MOST mesh face (the headboard back) — not the footprint back — sits at GAP
 * off the wall, and verifies the full bed (deck + headboard) stays inside the room.
 * Deterministic constants from the BedEngine geometry (ADR-0061).
 */
const BED_REAR_OVERHANG: Readonly<Record<string, number>> = {
    bed: 0,                          // BedBuilder: headboard inside the frame → flush.
    japanese_platform_bed: 0.05,     // BedEngine platform HB_THICKNESS.
    japanese_float_bed: 0.05,        // BedEngine float HB_THICKNESS.
    japanese_walnut_bed: 0.05,       // BedEngine walnut HB_THICKNESS.
    nordic_bed: 0.04,                // BedEngine nordic HB_THICKNESS.
    solid_wood_bed: 0.05,            // BedEngine solid_wood HB_THICKNESS.
};
const bedRearOverhang = (k: PlacedFurniture['kind']): number => BED_REAR_OVERHANG[k] ?? 0;

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

/**
 * §DOOR-KEEP-CLEAR (founder #5, 2026-06-12) — door swing / approach keep-clear
 * obstacle quads (in front of each door). A door needs BOTH its leaf-swing arc
 * AND a standing/approach strip kept clear; no sofa / table / bed may land there.
 *
 * The pre-fix rect was door-WIDTH × 0.9 m deep, centred 0.45 m off the leaf — it
 * covered the immediate threshold but NOT the full leaf swing (a 0.9 m leaf sweeps
 * a quarter-circle of radius ≈ the door width to ONE side) nor the ~0.9 m approach
 * a person needs to stand and pull the door. The founder saw furniture "in front
 * of doors" — a table edge clipping the swing fan that the shallow rect missed.
 *
 * The fix keeps a SINGLE conservative axis-aligned-in-door-frame rect (cheap, and
 * the solver's quads are oriented so SAT is exact):
 *   • DEPTH  = the leaf reach (≈ door width, floored at 0.9 m) — this already
 *     spans both the full quarter-circle swing AND the standing/approach strip a
 *     person needs to pull the door (they are the same zone). The pre-fix 0.9 m
 *     was right here; we keep it (NOT deeper — a deeper rect needlessly starved
 *     small rooms of their toilet / shower / 2nd bedside).
 *   • WIDTH  = door width + ~0.3 m each side, so the rect spans the swing FAN
 *     sideways past the leaf root (the pre-fix door-WIDTH-only rect left the fan's
 *     outer reach uncovered → a table edge could clip just beside the leaf). Kept
 *     MODEST (≈ +0.6 m total) so a 2.5 m wall still seats a fixture beside it.
 * Centred so the rect's near edge starts AT the door line and extends into the
 * room. Deterministic — pure geometry. The rug ('under') stays exempt by design;
 * every FLOOR placement path tests against this set.
 */
function doorObstacles(input: FurnishRoomInput): Quad[] {
    return input.doors.map(d => {
        // §DOOR-KEEP-CLEAR (founder #5, 2026-06-12) — the keep-clear in front of a
        // door: the door WIDTH (the leaf swings within its own width to one side)
        // × 0.9 m deep (the leaf reach = the standing/approach strip a person needs
        // to open it), centred 0.45 m in front of the leaf. EVERY floor-placement
        // path (center / corner / wall / beside / corner-sofa / media) tests against
        // this quad via quadOverlapsAny, so no sofa / table / bed / chair can land in
        // a door's swing or approach. The rug ('under') is collision-EXEMPT by design
        // (it underlaps the furniture above it), and wall-hosted accessories (mirror /
        // TV / art) mount at height so they never contend for this floor zone.
        //
        // NOTE (regression guard): the keep-clear is kept at the door WIDTH, NOT
        // widened past the jambs — a wider rect perturbs the SHARED placeRoom
        // obstacle set and shifts the living-room corner-sofa / TV-faces-sofa pose
        // (founder #12) and the wardrobe-run sizing. The width-only keep-clear plus
        // the all-paths obstacle test is what actually prevents door blocking; the
        // founderV189 §5 test pins this across room types + sizes.
        const c = add(d.center, d.normal, 0.45);
        return footprintCorners(c.x, c.z, d.width, 0.9, yawFromNormal(d.normal));
    });
}

interface Placement {
    item: PlacedFurniture;
    quad: Quad;
    /** §67.3 — true when this is a corner_sofa seated by the dedicated CORNER
     *  path (position = the inside-back corner origin). When false, a corner_sofa
     *  fell back to the straight-wall path (position = a wall-anchored centre), so
     *  its dependents use the straight-sofa front line, not the L pocket. */
    cornerAnchored?: boolean;
}

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

/**
 * §BED-HEADBOARD-FLUSH (founder #7, 2026-06-12) — wall-anchor a BED so its
 * HEADBOARD sits flush against the wall (back of the headboard at wall face + GAP),
 * with NO penetration, and the whole bed (deck + headboard) inside the room.
 *
 * Same slide-to-fit search as `placeAgainstWall`, but the bed centre is pushed an
 * extra `overhang` (the headboard's rear protrusion behind −fp.l/2) into the room
 * so the headboard back — not the deck back — lands at GAP off the wall. The
 * in-polygon test uses a quad extended by `overhang` on the rear (head) side so the
 * headboard is verified inside the room; collision against OTHER furniture still
 * uses the deck footprint (the headboard is a thin panel on the wall, never a floor
 * obstacle others must avoid). The returned `position` is the bed-mesh origin (deck
 * centre) so downstream (bedside tables, rug) read the same pose convention. */
function placeBedAgainstWall(
    kind: PlacedFurniture['kind'], wall: RoomWallSeg,
    input: FurnishRoomInput, obstacles: readonly Quad[],
): Placement | null {
    const fp = footprintOf(kind);
    const overhang = bedRearOverhang(kind);
    const yaw = yawFromNormal(wall.inwardNormal);
    const n = wall.inwardNormal;
    // Deck centre so the headboard BACK (deck back − overhang) sits at GAP off wall:
    //   headboardBack = deckCentre − n·(fp.l/2 + overhang) = wallMid + n·GAP
    //   ⇒ deckCentre   = wallMid + n·(fp.l/2 + overhang + GAP)
    const base = add(wallMid(wall), n, fp.l / 2 + overhang + GAP);
    // A rear-extended quad spanning deck + headboard (length fp.l + overhang), whose
    // centre is shifted back toward the wall by overhang/2 — used ONLY for the
    // in-room check so the headboard is proven inside the polygon.
    const fullLen = fp.l + overhang;
    const dir = wallDir(wall);
    const maxSlide = Math.max(0, wall.length / 2 - fp.w / 2);
    const offsets: number[] = [0];
    for (let s = SLIDE_STEP; s <= maxSlide + 1e-6; s += SLIDE_STEP) { offsets.push(s, -s); }
    for (const off of offsets) {
        const c = add(base, dir, off);
        const deckQuad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);          // collision
        const fullCtr = add(c, n, -overhang / 2);                              // rear-extended centre
        const fullQuad = footprintCorners(fullCtr.x, fullCtr.z, fp.w, fullLen, yaw); // in-room
        if (quadInPolygon(fullQuad, input.polygon) && !quadOverlapsAny(deckQuad, obstacles)) {
            return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, quad: deckQuad };
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

/**
 * §DINING-TABLE-ALWAYS (founder #9, 2026-06-12) — place a CENTER-anchored item
 * (dining table, kitchen island) ROBUSTLY so a REQUIRED centerpiece is never
 * silently dropped on a tilted plate.
 *
 * THE REGRESSION (§FURNITURE-BUILDING-RELATIVE / v186): the center path was a
 * SINGLE `placeAtPoint(centroid, centerYaw)` try. On a 30°-tilted dining room the
 * rotated 1.40 × 0.90 m table footprint pokes a corner past the (rotated) polygon
 * → quadInPolygon fails → the table returns null AND its dependent chairs + rug
 * are dropped (they have no leader). The founder saw "cabinets but no table" — the
 * sideboard/buffet place via the oriented wall path (works at any angle) while the
 * centre table vanished.
 *
 * THE FIX — a deterministic ladder, stopping at the first success:
 *   1. centroid + centerYaw at full size (the original, byte-identical on success);
 *   2. centroid + the OTHER building yaw (centerYaw ± 90° — a portrait table fits a
 *      landscape pocket and vice-versa);
 *   3. progressively SHRINK the footprint (scale 0.95…0.55) at both yaws — a
 *      smaller-but-present dining table beats none;
 *   4. nudge the centre toward the polygon centroid-of-vertices when the room's
 *      reported `centroid` sits off the true middle.
 * Collision-aware throughout (still yields to obstacles). Returns null only when
 * even the smallest table cannot fit anywhere near the centre — then the required
 * flag is genuinely unsatisfiable (a sub-min room). Pure + deterministic.
 */
function placeCenterRobust(
    kind: PlacedFurniture['kind'], centerYaw: number,
    input: FurnishRoomInput, obstacles: readonly Quad[],
): Placement | null {
    const fpBase = footprintOf(kind);
    // Candidate centres: the reported centroid first, then the mean of the polygon
    // vertices (a better "middle" for an L / non-convex plate). Deterministic order.
    const vcx = input.polygon.reduce((s, p) => s + p.x, 0) / Math.max(1, input.polygon.length);
    const vcz = input.polygon.reduce((s, p) => s + p.z, 0) / Math.max(1, input.polygon.length);
    const centres: Pt[] = [input.centroid, { x: vcx, z: vcz }];
    // Candidate yaws: the building yaw, then its +90° partner (portrait vs landscape).
    const yaws = [centerYaw, centerYaw + Math.PI / 2];
    // Shrink ladder — full size first (no churn on the axis-aligned/45° happy path).
    const scales = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55];
    for (const scale of scales) {
        const w = fpBase.w * scale;
        const l = fpBase.l * scale;
        for (const c of centres) {
            for (const yaw of yaws) {
                const quad = footprintCorners(c.x, c.z, w, l, yaw);
                if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
                    const footprint = scale === 1.0 ? fpBase : { ...fpBase, w, l };
                    return {
                        item: {
                            kind,
                            position: { x: c.x, y: input.levelElevation + fpBase.baseOffset, z: c.z },
                            rotationY: yaw, footprint, hostedSpaceId: input.roomId,
                        },
                        quad,
                    };
                }
            }
        }
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
    } else if (leader.cornerAnchored) {
        // §67.3 — coffee table centred in the L's INNER POCKET (diagonally out
        // from the inside-back corner along the opening bisector), aligned to the
        // sofa facing, ~0.40 m clear of the seat fronts. The pocket centre is the
        // void framed by the two seat runs, NOT a straight front line.
        const pk = cornerSofaPocket(L, fp);
        tryPush(pk.center, pk.yaw);
    } else if (isSofaKind(L.kind)) {
        // coffee table in front of the straight sofa, toward the room
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
    if (leader.cornerAnchored) {
        // §67.3 — the rug anchors the L's INNER POCKET (under the coffee table),
        // centred diagonally out from the inside-back corner, not on the corner
        // origin (which is buried in the seat backs).
        const pk = cornerSofaPocket(L);
        cx = pk.center.x;
        cz = pk.center.z;
    } else if (isSofaKind(L.kind)) {
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

// ── §67.3 (2026-06-12) — CORNER (L-shape) SOFA anchoring ─────────────────────
//
// WHY THE STRAIGHT-SOFA PATH FLOATS THE L:
//   The CornerSofaBuilder builds the L with its group ORIGIN at the inside-back
//   corner (where the two backs meet), the main run extending along LOCAL +X and
//   the side run along LOCAL +Z (backs on the X=0 and Z=0 edges; the open seat
//   quadrant faces +X/+Z). The editor sets `group.position = placement.position`
//   and `group.rotation.y = placement.rotationY` with NO recentring (see the
//   editor's FurniturePlanToolHandler "inside-back-corner" anchor note). The
//   generic placeAgainstWall path instead computes `position` as the CENTRE of a
//   w×l box pinned to one wall — so the editor drops the L's CORNER at that
//   centre point and the body sprawls +X/+Z into the room → it reads as floating
//   in the middle, seated against no corner, opening in an arbitrary direction.
//
// THE FIX — seat the inside-back corner in a real room corner:
//   THREE Y-rotation by yaw maps  localX(1,0) → world(cos,-sin)  and
//   localZ(0,1) → world(sin,cos)  (matches footprintCorners' convention). So if
//   the main run must run along inward direction `u` (localX → u) then the side
//   run direction is FORCED to v = (−u.z, u.x) (localZ → v) — the +90° partner.
//   We seat the corner origin at the room corner, inset by GAP along both legs,
//   so the two backs sit flush on the two perpendicular walls and the opening
//   (+X/+Z quadrant) faces into the room.

/** §67.3 — the seat depth of each corner-sofa run (CornerSofaBuilder default). */
const CORNER_SOFA_SEAT_DEPTH = 0.90;
/** §67.3 — gap band between a corner sofa's seat fronts and the coffee table. */
const POCKET_GAP = 0.40;

/** A room corner = a vertex where two (≈perpendicular) walls meet, with the two
 *  unit "into-room along each wall" leg directions e1,e2 from that vertex. */
interface RoomCorner { readonly p: Pt; readonly e1: Pt; readonly e2: Pt }

/** Find interior corners: pairs of walls sharing an endpoint whose directions
 *  are ≈perpendicular. Each leg direction points FROM the shared vertex ALONG
 *  its wall, into the room span. Deterministic (input wall order). */
function findRoomCorners(input: FurnishRoomInput): RoomCorner[] {
    const W = input.walls;
    const out: RoomCorner[] = [];
    const near = (a: Pt, b: Pt): boolean => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
    // leg direction from a shared endpoint into the wall (toward its other end).
    const legFrom = (w: RoomWallSeg, v: Pt): Pt => near(w.a, v) ? norm2({ x: w.b.x - v.x, z: w.b.z - v.z })
                                                                : norm2({ x: w.a.x - v.x, z: w.a.z - v.z });
    for (let i = 0; i < W.length; i++) {
        for (let j = i + 1; j < W.length; j++) {
            const wi = W[i]!, wj = W[j]!;
            // shared vertex?
            const verts: Pt[] = [];
            for (const a of [wi.a, wi.b]) for (const b of [wj.a, wj.b]) if (near(a, b)) verts.push(a);
            if (verts.length === 0) continue;
            const v = verts[0]!;
            const e1 = legFrom(wi, v), e2 = legFrom(wj, v);
            if (Math.abs(dot2(e1, e2)) > 0.2) continue;   // not ≈perpendicular
            out.push({ p: v, e1, e2 });
        }
    }
    return out;
}

/** The media/TV wall (the wall the sofa should face) — wall opposite the door,
 *  excluding window walls, falling back to the longest. Used to orient the L's
 *  opening toward the screen. Returns its inward normal, or the room centroid
 *  direction when no media wall resolves. */
function mediaFacingDir(input: FurnishRoomInput, from: Pt): Pt {
    const noWin = input.walls.filter(w => !wallHasWindow(w, input.windows) && !wallHasDoor(w, input.doors));
    const media = wallOppositeDoor(noWin.length ? noWin : input.walls, input.doors);
    if (media) {
        // face toward the media wall's mid-point
        const m = wallMid(media);
        return norm2({ x: m.x - from.x, z: m.z - from.z });
    }
    return norm2({ x: input.centroid.x - from.x, z: input.centroid.z - from.z });
}

/**
 * Seat a `corner_sofa` (L-shape) in a real room corner: BACK of the main run +
 * SIDE of the side run flush against two perpendicular walls, the open seating
 * quadrant facing into the room / toward the media wall. Returns the placement
 * (position = the inside-back CORNER origin, the editor's anchor) or null when
 * no corner fits both legs collision-clear → caller falls back to straight-sofa.
 */
function placeCornerSofa(input: FurnishRoomInput, obstacles: readonly Quad[]): Placement | null {
    const fp = footprintOf('corner_sofa');
    const corners = findRoomCorners(input);
    if (corners.length === 0) return null;

    interface Cand { quad: Quad; pos: Pt; yaw: number; score: number }
    const cands: Cand[] = [];

    for (const corner of corners) {
        // Two ways to map the L onto this corner: main run along e1 (side along
        // e2) OR main run along e2 (side along e1). For each we need localZ's
        // forced partner v=(−u.z,u.x) to equal the OTHER leg, so the backs land
        // on both walls. Try both leg-assignments; keep the consistent ones.
        const tries: Array<{ u: Pt; v: Pt }> = [
            { u: corner.e1, v: corner.e2 },
            { u: corner.e2, v: corner.e1 },
        ];
        for (const { u, v } of tries) {
            const forcedV = { x: -u.z, z: u.x };            // localZ partner of u
            if (dot2(forcedV, v) < 0.95) continue;          // assignment inconsistent
            // yaw from localX → u:  u = (cos, −sin) → yaw = atan2(−u.z, u.x)
            const yaw = Math.atan2(-u.z, u.x);
            // Corner origin: room vertex pushed GAP into the room along both legs
            // so the backs are flush (GAP) off the two walls.
            const pos = { x: corner.p.x + (u.x + v.x) * GAP, z: corner.p.z + (u.z + v.z) * GAP };
            // The L bbox in local frame is [0,w]×[0,l]; its CENTRE is at local
            // (w/2,l/2) → world = pos + u·(w/2) + v·(l/2). Build the bbox quad for
            // collision/in-room tests (footprintCorners is centre-based).
            const cx = pos.x + u.x * (fp.w / 2) + v.x * (fp.l / 2);
            const cz = pos.z + u.z * (fp.w / 2) + v.z * (fp.l / 2);
            const quad = footprintCorners(cx, cz, fp.w, fp.l, yaw);
            if (!quadInPolygon(quad, input.polygon)) continue;
            if (quadOverlapsAny(quad, obstacles)) continue;
            // SCORE: prefer the corner+orientation whose open quadrant (the seat
            // fronts face +X/+Z → the bisector u+v) points toward the media wall,
            // and whose main (longer) run lies along the longer free leg.
            const open = norm2({ x: u.x + v.x, z: u.z + v.z });
            const face = mediaFacingDir(input, { x: cx, z: cz });
            const openScore = dot2(open, face);            // 1 = opening at the screen
            cands.push({ quad, pos, yaw, score: openScore });
        }
    }
    if (cands.length === 0) return null;
    // Deterministic: best open-toward-media score; ties → lower pos.x then pos.z.
    cands.sort((a, b) => (b.score - a.score) || (a.pos.x - b.pos.x) || (a.pos.z - b.pos.z));
    const best = cands[0]!;
    return {
        item: {
            kind: 'corner_sofa',
            position: { x: best.pos.x, y: input.levelElevation + fp.baseOffset, z: best.pos.z },
            rotationY: best.yaw, footprint: fp, hostedSpaceId: input.roomId,
        },
        quad: best.quad,
    };
}

/**
 * §67.3 — the TRUE occupied area of a placed corner sofa is the L (two legs),
 * NOT its bounding box: the inner pocket is FREE (that's where the coffee table
 * + rug go). We return the two leg quads (main run w×seatDepth along the back
 * wall + side run seatDepth×l along the perpendicular wall) so the obstacle set
 * blocks the seats but leaves the pocket open. Using the bbox instead would make
 * the coffee table overlap the (empty) pocket and get dropped.
 */
function cornerSofaLegQuads(L: PlacedFurniture): Quad[] {
    const yaw = L.rotationY;
    const u: Pt = { x: Math.cos(yaw), z: -Math.sin(yaw) };   // main run dir (localX)
    const v: Pt = { x: Math.sin(yaw), z: Math.cos(yaw) };    // side run dir (localZ)
    const corner: Pt = { x: L.position.x, z: L.position.z }; // inside-back origin
    const seatDepth = CORNER_SOFA_SEAT_DEPTH;   // CornerSofaBuilder run depth
    const w = L.footprint.w, l = L.footprint.l;
    // Main run: local rect [0,w]×[0,seatDepth] → centre at u·(w/2)+v·(seatDepth/2).
    const mc: Pt = { x: corner.x + u.x * (w / 2) + v.x * (seatDepth / 2),
                     z: corner.z + u.z * (w / 2) + v.z * (seatDepth / 2) };
    const mainQuad = footprintCorners(mc.x, mc.z, w, seatDepth, yaw);
    // Side run: local rect [0,seatDepth]×[0,l] → centre at u·(seatDepth/2)+v·(l/2).
    const sc: Pt = { x: corner.x + u.x * (seatDepth / 2) + v.x * (l / 2),
                     z: corner.z + u.z * (seatDepth / 2) + v.z * (l / 2) };
    const sideQuad = footprintCorners(sc.x, sc.z, seatDepth, l, yaw);
    return [mainQuad, sideQuad];
}

/**
 * §67.3 — coffee table (and rug) for a CORNER sofa sit in the L's INNER POCKET,
 * not on a straight front line. The pocket centre is offset from the inside-back
 * corner DIAGONALLY along the opening bisector (u+v) into the seating void. We
 * seat the dependent (footprint `fp`) so its trailing edge sits POCKET_GAP past
 * BOTH inner seat fronts: along the main run (localX = u, table half-extent
 * fp.w/2) and the side run (localZ = v, table half-extent fp.l/2). The two leg
 * directions carry different table half-extents, so the reach differs per axis —
 * this keeps the table centred in the pocket and clear of both seat fronts. When
 * `fp` is omitted (rug), a nominal reach centres the rug in the void. Aligned to
 * the sofa facing. Returns the pocket centre + the open bisector + yaw.
 */
function cornerSofaPocket(L: PlacedFurniture, fp?: { w: number; l: number }): { center: Pt; open: Pt; yaw: number } {
    // Reconstruct the leg directions from the yaw: localX→u, localZ→v.
    const yaw = L.rotationY;
    const u: Pt = { x: Math.cos(yaw), z: -Math.sin(yaw) };   // main run dir
    const v: Pt = { x: Math.sin(yaw), z: Math.cos(yaw) };    // side run dir
    const corner: Pt = { x: L.position.x, z: L.position.z };
    const open = norm2({ x: u.x + v.x, z: u.z + v.z });
    // reach along each leg = seat front + gap + the dependent's half-extent on
    // that axis (so the table edge nearest each seat front sits POCKET_GAP clear,
    // and its body never overlaps either leg). Rug (no fp) → a nominal pocket.
    const reachU = CORNER_SOFA_SEAT_DEPTH + POCKET_GAP + (fp ? fp.w / 2 : 0.45);
    const reachV = CORNER_SOFA_SEAT_DEPTH + POCKET_GAP + (fp ? fp.l / 2 : 0.45);
    const center: Pt = {
        x: corner.x + u.x * reachU + v.x * reachV,
        z: corner.z + u.z * reachU + v.z * reachV,
    };
    return { center, open, yaw };
}

// ── §LIVING-TV-FACES-SOFA (founder #12, 2026-06-12) — the TV opposite the sofa ──
//
// FOUNDER #12: "the TV and the furniture for the TV should be placed IN FRONT OF
// (or as front as possible to) the sofa."
//
// The pre-fix archetype anchored the tv_unit on `wall-opposite-door` — which is
// NOT guaranteed to be the wall the SOFA faces (the sofa anchors `wall-longest`;
// the two can coincide, be perpendicular, or even be the same wall → the TV ends
// up BESIDE or BEHIND the sofa). This path instead seats the media unit on the
// wall the sofa's FRONT looks at, centred on the sofa's forward axis, FACING back
// at the sofa — so the screen is squarely in front of the seating.
//
// The unit's back is pinned on that focal wall; the tv panel then yields to the
// unit's wall via the existing `media`-group + isWallHostedBeside path (it mounts
// flush above the unit). Deterministic — geometry only, no RNG.

/** The sofa's FORWARD (look) direction + the SEAT centre the viewer occupies —
 *  correct for BOTH a straight sofa (localZ; placement centre) and a corner sofa
 *  (opening bisector localX+localZ; corner origin pushed into the pocket). Mirrors
 *  livingValidation.sofaForward/sofaSeatCentre so the placement + the rule module
 *  agree on where the sofa "faces from". */
function sofaPose(sofa: PlacedFurniture): { fwd: Pt; seat: Pt } {
    const v: Pt = { x: Math.sin(sofa.rotationY), z: Math.cos(sofa.rotationY) };    // localZ (look dir)
    if (sofa.kind === 'corner_sofa') {
        const u: Pt = { x: Math.cos(sofa.rotationY), z: -Math.sin(sofa.rotationY) };   // localX (main run)
        const halfMain = sofa.footprint.w / 2, seatDepth = 0.45;
        const seat: Pt = {
            x: sofa.position.x + u.x * halfMain + v.x * seatDepth,
            z: sofa.position.z + u.z * halfMain + v.z * seatDepth,
        };
        return { fwd: v, seat };
    }
    return { fwd: v, seat: { x: sofa.position.x, z: sofa.position.z } };
}

/** Pick the wall the sofa's FRONT faces: the wall whose inward normal is most
 *  anti-parallel to the sofa forward (you look INTO the room toward it), excluding
 *  the sofa's own wall + door/window walls when alternatives exist. Falls back to
 *  the most-opposite of all walls. Deterministic. */
function focalWallForSofa(sofa: PlacedFurniture, input: FurnishRoomInput): RoomWallSeg | null {
    const { fwd } = sofaPose(sofa);   // sofa forward (main-run look dir)
    // A corner sofa has TWO seating runs: the main run looks along +localZ (`fwd`)
    // and the side run along +localX. A screen opposite EITHER run is watchable, so
    // try both facing directions and keep the best available clean wall — this gives
    // the corner-sofa case a second chance at a focal wall that doesn't starve the
    // room's other wall pieces. A straight sofa uses its single forward only.
    const dirs: Pt[] = sofa.kind === 'corner_sofa'
        ? [fwd, { x: Math.cos(sofa.rotationY), z: -Math.sin(sofa.rotationY) }]   // localZ, localX
        : [fwd];
    // The focal wall's inward normal points BACK toward the sofa → it is most
    // anti-parallel to the look dir. The sofa's OWN wall's inward normal ≈ the look
    // dir (the sofa backs onto it, facing into the room), so it scores worst.
    const prefer = input.walls.filter(w =>
        !wallHasWindow(w, input.windows) && !wallHasDoor(w, input.doors));
    // The longest free wall is the FALLBACK anchor for the room's other wall pieces
    // (bookshelf, curtains). Among walls that ALL face the sofa, prefer the screen on
    // a NON-longest one so those pieces keep the long wall — but a facing wall always
    // wins over a non-facing one (facing the sofa is the founder's HARD intent).
    const longest = longestWall(prefer);
    let best: RoomWallSeg | null = null;
    let bestScore = Infinity, bestIsLongest = true;
    for (const look of dirs) {
        for (const w of prefer) {
            const faces = dot2(w.inwardNormal, look);   // most negative = most opposite the run
            if (faces >= -0.5) continue;                // does not face this run → skip
            const isLongest = w === longest;
            // rank: facing strength first, then prefer a NON-longest wall on a tie
            // (leave the longest free for the bookshelf / curtains fallback).
            if (faces < bestScore - 1e-3 ||
                (Math.abs(faces - bestScore) <= 1e-3 && bestIsLongest && !isLongest)) {
                bestScore = faces; best = w; bestIsLongest = isLongest;
            }
        }
    }
    // Only seat the screen on a CLEAN wall that a seating run faces. We never relocate
    // the TV onto a door wall (a screen by the entrance) or a window wall (daylight
    // glare + blocks the aperture) — if no clean facing wall exists, return null so the
    // caller keeps the generic anchor instead of worsening the layout.
    return best;
}

/**
 * §LIVING-TV-FACES-SOFA — seat the media unit (`tv_unit`) on the wall the sofa
 * faces, centred on the sofa's forward axis, facing BACK at the sofa. Returns the
 * placement (slid along the wall to clear obstacles while staying as close to the
 * sofa centre-line as possible) or null when no facing wall fits → the caller
 * falls back to the generic wall path. Pure + deterministic.
 */
function placeMediaOppositeSofa(
    kind: PlacedFurniture['kind'], sofa: PlacedFurniture,
    input: FurnishRoomInput, obstacles: readonly Quad[],
): Placement | null {
    const wall = focalWallForSofa(sofa, input);
    if (!wall) return null;
    const fp = footprintOf(kind);
    const yaw = yawFromNormal(wall.inwardNormal);   // unit faces into the room (back on the wall)
    // The on-wall centre nearest the sofa's forward axis: project the sofa SEAT
    // centre (the viewer position) onto the wall line and seat the unit there, then
    // slide along to clear. For a corner sofa the seat centre is the pocket, not the
    // back-corner anchor — so the screen lands square in front of the cushions.
    const { seat } = sofaPose(sofa);
    const dir = wallDir(wall);
    const t0 = (seat.x - wall.a.x) * dir.x + (seat.z - wall.a.z) * dir.z;
    const tClamped = Math.max(fp.w / 2 + GAP, Math.min(t0, wall.length - fp.w / 2 - GAP));
    const baseOnWall = add(wall.a, dir, tClamped);
    const base = add(baseOnWall, wall.inwardNormal, fp.l / 2 + GAP);
    // Slide outward from the sofa-axis centre, nearest first, so the unit stays as
    // centred on the sofa as obstacles allow ("as front as possible").
    const maxSlide = Math.max(0, wall.length / 2 - fp.w / 2);
    const offsets: number[] = [0];
    for (let s = SLIDE_STEP; s <= maxSlide + 1e-6; s += SLIDE_STEP) { offsets.push(s, -s); }
    for (const off of offsets) {
        const c = add(base, dir, off);
        const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
        if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
            return {
                item: {
                    kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
                    rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId,
                },
                quad,
            };
        }
    }
    return null;
}

/**
 * §FURNITURE-BUILDING-RELATIVE (founder #8/#9, 2026-06-12) — the room's TILT from
 * world axes, folded into [−45°, +45°]. A `center`/`corner` item (dining table,
 * kitchen island, corner cabinet) was placed at yaw 0 (world X/Z) — so on a rotated
 * plate the table stayed TRUE-NORTH while the room sat at 45° (the founder: "the
 * dining table is relative to X/Y true-north angles — it needs to be relative to the
 * BUILDING and rotate with the layout"). We take the longest wall's direction angle
 * and subtract the nearest multiple of 90°, yielding the room's rotation away from
 * axis-aligned. For an AXIS-ALIGNED room (apartment + every existing fixture) this is
 * exactly 0 → byte-identical, no test churn; for a 45° plate it is ~±45° → the item
 * rotates WITH the building. Deterministic (pure geometry, ADR-0061).
 */
function roomTiltYaw(walls: readonly RoomWallSeg[]): number {
    const w = longestWall(walls);
    if (!w) return 0;
    const d = wallDir(w);
    const a = Math.atan2(d.z, d.x);                 // longest-wall direction angle
    const q = Math.PI / 2;
    return a - Math.round(a / q) * q;               // tilt from axis-aligned ∈ [−45°,45°]
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
    // §FURNITURE-BUILDING-RELATIVE — the yaw a center/corner item takes so it aligns
    // with the room (0 for an axis-aligned room → no change to existing behaviour).
    const centerYaw = roomTiltYaw(input.walls);
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
        // §67.3 — when the L-shape sofa was seated by the dedicated corner path,
        // its TRUE obstacle is the two legs (the inner pocket stays free for the
        // coffee table + rug). A fallback straight-wall placement uses the bbox.
        let cornerAnchored = false;
        if (spec.anchor === 'center') {
            // §DINING-TABLE-ALWAYS (founder #9) — a REQUIRED centre item (the dining
            // table) must never silently drop on a tilted plate: use the robust
            // ladder (alt yaw + shrink) so it always lands. The original single-try
            // path is preserved for optional centre items (the kitchen island), which
            // are MEANT to drop cleanly when the centroid is busy.
            p = spec.required
                ? placeCenterRobust(spec.kind, centerYaw, input, obstacles)
                : placeAtPoint(spec.kind, input.centroid, centerYaw, input, obstacles);
        } else if (spec.anchor === 'corner') {
            const fp = footprintOf(spec.kind);
            for (const c of cornerPoints(input, Math.max(fp.w, fp.l) / 2 + GAP)) {
                p = placeAtPoint(spec.kind, c, centerYaw, input, obstacles); if (p) break;
            }
        } else if (spec.kind === 'corner_sofa') {
            // §67.3 — the L-shape sofa is CORNER-anchored: seat its inside-back
            // corner in a real room corner (both backs flush on two perpendicular
            // walls, opening into the room). Fall back to the straight-sofa
            // wall path only when no corner fits both legs collision-clear.
            p = placeCornerSofa(input, obstacles);
            if (p) {
                cornerAnchored = true;
            } else {
                for (const wall of resolveAnchorWalls(spec, input)) {
                    p = placeAgainstWall(spec.kind, wall, input, obstacles);
                    if (p) break;
                }
            }
        } else if (spec.kind === 'tv_unit') {
            // §LIVING-TV-FACES-SOFA (founder #12) — the media unit must sit IN
            // FRONT OF the sofa: the screen FACES the seating, opposite it across
            // the coffee table. We try the FOCAL wall (the clean wall the sofa
            // faces) FIRST, seated on the sofa's forward axis facing back at it;
            // THEN we fall through the archetype's normal anchor walls. Trying the
            // focal wall first puts the screen in front of the sofa whenever it
            // fits, but the fallback chain keeps the unit placed (and the room's
            // other walls free for the decorative items) when it doesn't. The tv
            // panel yields to the unit's wall via the existing 'media' group.
            const sofaLeader = leaders.get('sofa');
            if (sofaLeader) p = placeMediaOppositeSofa(spec.kind, sofaLeader.item, input, obstacles);
            if (!p) {
                for (const wall of resolveAnchorWalls(spec, input)) {
                    p = placeAgainstWall(spec.kind, wall, input, obstacles);
                    if (p) break;
                }
            }
        } else if (isBedKind(spec.kind)) {
            // §BED-HEADBOARD-FLUSH (founder #7) — the bed is wall-anchored via the
            // bed-aware path so the HEADBOARD (which protrudes behind the deck
            // footprint) sits flush on the wall instead of penetrating it.
            for (const wall of resolveAnchorWalls(spec, input)) {
                p = placeBedAgainstWall(spec.kind, wall, input, obstacles);
                if (p) break;
            }
        } else {
            for (const wall of resolveAnchorWalls(spec, input)) {
                p = placeAgainstWall(spec.kind, wall, input, obstacles);
                if (p) break;
            }
        }
        if (p) {
            if (cornerAnchored) p.cornerAnchored = true;
            added.push(p);
            if (cornerAnchored) for (const q of cornerSofaLegQuads(p.item)) obstacles.push(q);
            else obstacles.push(p.quad);
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
