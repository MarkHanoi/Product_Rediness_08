// D-FLE F5/F7 — placement solver tests.
// Contract (SPEC-FURNITURE-LAYOUT-ENGINE §8): placed items lie inside the polygon;
// none overlap; deterministic; bed against the wall opposite the door.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintRect, rectsOverlap, pointInPolygon, rectCorners } from '../src/workflows/furnishLayout/collision.js';
import type { FurnishRoomInput, Pt, Rect } from '../src/workflows/furnishLayout/types.js';

/** Rectangular room [0,0]→[w,d] with 4 walls + one door on the bottom wall. */
function rectRoom(occupancy: string, w: number, d: number): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'r1', levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [],
        levelElevation: 0,
    };
}

const rectOf = (p: { position: { x: number; z: number }; footprint: { w: number; l: number }; rotationY: number }): Rect =>
    footprintRect(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);

// A surface-mounted accessory (a bedside lamp on a nightstand, an extractor over
// a hob) legitimately shares its host's PLAN footprint — it is height-stacked, not
// a floor collision. The furnish engine appends such items after solving and never
// runs them through its collision set; the floor-plan sanity check mirrors that by
// exempting any pair where one item RESTS ON the other (higher Y + its centre lies
// within the other's rect).
// §67.2 (2026-06-11) — bed variety: a bedroom may carry the plain `bed` OR an
// integrated variant bed (nordic_bed / solid_wood_bed). All read as "a bed".
const isBed = (k: string): boolean => k === 'bed' || k === 'nordic_bed' || k === 'solid_wood_bed';
// §67.1 (2026-06-11) — a rug is laid UNDER the bed / table / sofa; it is
// collision-EXEMPT by design (it underlaps the furniture above it) so the
// floor-plan overlap sanity check must skip any pair involving a rug.
const isRug = (k: string): boolean => k === 'rug';
const restsOn = (a: ReturnType<typeof furnishRoom>[number], b: ReturnType<typeof furnishRoom>[number]): boolean => {
    if (a.position.y <= b.position.y + 1e-6) return false;        // a must be above b
    const rb = rectOf(b);
    return pointInPolygon({ x: a.position.x, z: a.position.z }, rectCorners(rb));
};
const assertSane = (items: ReturnType<typeof furnishRoom>, poly: Pt[]): void => {
    for (const it of items) expect(pointInPolygon({ x: it.position.x, z: it.position.z }, poly)).toBe(true);
    const rects = items.map(rectOf);
    for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
            if (restsOn(items[i]!, items[j]!) || restsOn(items[j]!, items[i]!)) continue;
            if (isRug(items[i]!.kind) || isRug(items[j]!.kind)) continue;   // §67.1 rug is collision-exempt
            expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false);
        }
};

describe('furnishRoom (D-FLE F5/F7)', () => {
    it('bedroom: bed + bedside tables (+wardrobe), all inside, non-overlapping', () => {
        const room = rectRoom('bedroom', 4, 3);
        const items = furnishRoom(room);
        expect(items.some(i => isBed(i.kind))).toBe(true);
        expect(items.filter(i => i.kind === 'bedside_table').length).toBeGreaterThanOrEqual(1);
        assertSane(items, room.polygon as Pt[]);
        // bed is against the FAR wall (opposite the door on z=0) → bed z well above 0
        const bed = items.find(i => isBed(i.kind))!;
        expect(bed.position.z).toBeGreaterThan(1.0);
    });

    it('living-room: sofa + coffee table, sane', () => {
        // §67.3 (2026-06-11) — a 5 × 4 (20 m²) living room is large enough that
        // the engine prefers the L-shape corner sofa over the straight sofa.
        const isSofa = (k: string): boolean => k === 'sofa' || k === 'corner_sofa';
        const room = rectRoom('living-room', 5, 4);
        const items = furnishRoom(room);
        expect(items.some(i => isSofa(i.kind))).toBe(true);
        assertSane(items, room.polygon as Pt[]);
    });

    it('dining-room: table + chairs around it, sane', () => {
        const room = rectRoom('dining-room', 5, 4);
        const items = furnishRoom(room);
        expect(items.some(i => i.kind === 'dining_table')).toBe(true);
        expect(items.filter(i => i.kind === 'dining_chair').length).toBeGreaterThanOrEqual(1);
        assertSane(items, room.polygon as Pt[]);
    });

    it('kitchen (§KITCHEN-PARAMETRIC-RUN): a normal kitchen is ONE parametric run with a config, sane', () => {
        // §KITCHEN-PARAMETRIC-RUN (2026-06-10) — furnishRoom(kitchen) now emits a
        // SINGLE parametric kitchen run (rendered by the GOOD KitchenCabinetEngine
        // with swappable cabinet units + integrated appliances + countertop), NOT a
        // concatenation of loose sink/hob/base_unit/fridge items. The appliances
        // live on the config's cabinet-unit slots; the extractor is part of the run
        // mesh. The per-item layout is still exercised directly via planKitchen.
        const room = rectRoom('kitchen', 4, 3);
        const items = furnishRoom(room);
        expect(items.length).toBe(1);
        const run = items[0]!;
        expect(['kitchen_straight', 'kitchen_l_shape', 'kitchen_u_shape']).toContain(run.kind);
        const cfg = run.kitchenConfig;
        expect(cfg).toBeDefined();
        const appliances = (cfg!.units ?? []).map(u => u.appliance).filter(Boolean);
        expect(appliances.some(a => a === 'sink_inox')).toBe(true);
        expect(appliances.some(a => String(a).startsWith('fridge'))).toBe(true);
        // The run element sits inside the room and doesn't self-overlap (one item).
        assertSane(items, room.polygon as Pt[]);
    });

    it('no furniture overlaps the door swing', () => {
        const room = rectRoom('bedroom', 4, 3);
        const items = furnishRoom(room);
        const door = room.doors[0]!;
        const swing = footprintRect(door.center.x + door.normal.x * 0.45, door.center.z + door.normal.z * 0.45, door.width, 0.9, Math.atan2(door.normal.x, door.normal.z));
        for (const it of items) expect(rectsOverlap(rectOf(it), swing)).toBe(false);
    });

    it('is deterministic', () => {
        const room = rectRoom('bedroom', 4, 3);
        expect(JSON.stringify(furnishRoom(room))).toEqual(JSON.stringify(furnishRoom(room)));
    });

    it('a too-small room furnishes to []', () => {
        expect(furnishRoom(rectRoom('bedroom', 1.5, 1.5))).toEqual([]);   // below minAreaM2
        expect(furnishRoom(rectRoom('corridor', 6, 1.2))).toEqual([]);    // unfurnished type
    });

    describe('§FURNISH-OBB — oriented footprints furnish non-orthogonal rooms', () => {
        // Rotate a rectangular room (its polygon, walls, normals + door) by θ about
        // its centroid. The shape is unchanged — only the world-axis alignment is —
        // so it MUST furnish identically to its axis-aligned twin. The pre-fix solver
        // built an AXIS-ALIGNED footprint (footprintRect snapped yaw to {0,90,180,270})
        // which poked outside the rotated polygon → rectInPolygon failed → most items
        // dropped. The oriented-quad solver tests the TRUE rotated footprint, so the
        // furniture fits. This is the regression guard for that fix.
        const rot = (p: Pt, c: Pt, cs: number, sn: number): Pt =>
            ({ x: c.x + (p.x - c.x) * cs - (p.z - c.z) * sn, z: c.z + (p.x - c.x) * sn + (p.z - c.z) * cs });
        const rotVec = (v: Pt, cs: number, sn: number): Pt => ({ x: v.x * cs - v.z * sn, z: v.x * sn + v.z * cs });
        const rotatedRoom = (occupancy: string, w: number, d: number, theta: number): FurnishRoomInput => {
            const base = rectRoom(occupancy, w, d);
            const c = base.centroid; const cs = Math.cos(theta), sn = Math.sin(theta);
            return {
                ...base,
                polygon: (base.polygon as Pt[]).map(p => rot(p, c, cs, sn)),
                walls: base.walls.map(wl => ({ ...wl, a: rot(wl.a, c, cs, sn), b: rot(wl.b, c, cs, sn), inwardNormal: rotVec(wl.inwardNormal, cs, sn) })),
                doors: base.doors.map(dr => ({ ...dr, center: rot(dr.center, c, cs, sn), normal: rotVec(dr.normal, cs, sn) })),
            };
        };

        it('a 30°-rotated bedroom still places the bed + bedsides (AABB solver would drop them)', () => {
            const room = rotatedRoom('bedroom', 4, 3, Math.PI / 6);
            const items = furnishRoom(room);
            expect(items.some(i => isBed(i.kind))).toBe(true);
            expect(items.length).toBeGreaterThanOrEqual(3); // bed + ≥1 bedside (+ wardrobe)
            // every placed item's centre lies inside the rotated polygon
            for (const it of items)
                expect(pointInPolygon({ x: it.position.x, z: it.position.z }, room.polygon as Pt[])).toBe(true);
        });

        it('rotating the room retains the bulk of the furniture (pre-fix AABB dropped to ~0)', () => {
            const flat = furnishRoom(rectRoom('living-room', 5, 4)).length;
            for (const theta of [Math.PI / 9, Math.PI / 4, Math.PI / 3]) {
                const tilted = furnishRoom(rotatedRoom('living-room', 5, 4, theta)).length;
                // Rotation can cost a couple of placements (the discrete 0.25 m slide
                // offsets land differently against a rotated boundary), but must keep
                // the bulk — the pre-fix axis-aligned solver dropped to ~0. Require at
                // least 70% of the axis-aligned count, and never zero.
                expect(tilted).toBeGreaterThan(0);
                expect(tilted).toBeGreaterThanOrEqual(Math.ceil(flat * 0.7));
            }
        });
    });

    describe('§FURNITURE-SPEC excludeWindowWall (door-vector-aware placement)', () => {
        // Same 4 × 3 bedroom (door on the bottom wall) but the wall OPPOSITE
        // the door (z = 3) now carries a window. Without the exclusion,
        // `wall-opposite-door` lands the bed on the window wall (z ≈ 2.05) and
        // `wall-longest` may pick it for the wardrobe — the architect's spec
        // forbids both (privacy + thermal envelope + daylight blocking).
        const windowOppositeDoor = (w: number, d: number): FurnishRoomInput => {
            const r = rectRoom('bedroom', w, d);
            return { ...r, windows: [{ type: 'window', center: { x: w / 2, z: d }, normal: { x: 0, z: -1 }, width: 1.5 }] };
        };

        it('bedroom bed never anchors on the window wall', () => {
            const room = windowOppositeDoor(4, 3);
            const bed = furnishRoom(room).find(i => isBed(i.kind));
            expect(bed).toBeDefined();
            // A bed against the window wall (z = 3) has centre z ≈ 3 − 1.9/2 ≈ 2.05.
            // A side-wall placement puts the centre near the room z-midpoint (1.5).
            expect(bed!.position.z).toBeLessThan(2.0);
        });

        it('bedroom wardrobe never anchors on the window wall', () => {
            const room = windowOppositeDoor(4, 3);
            const wardrobe = furnishRoom(room).find(i => i.kind === 'wardrobe');
            // The wardrobe is `required: true` — must be placed somewhere — but
            // never against the window wall (whose footprint would put z ≈ 2.7).
            if (wardrobe) expect(wardrobe.position.z).toBeLessThan(2.5);
        });
    });

    describe('§FURNITURE-SPEC corner-anchor sort (farthest from door)', () => {
        // Architect's rule: the shower / lamp / plant goes in the corner
        // FARTHEST from the door — not the first corner the loop happens to
        // hit. A 3 × 2 bathroom (door bottom-centre) is the boundary case: the
        // bottom-left/right corners just clear the door swing rect and would
        // be picked first by the old fixed-order loop.

        it('bathroom shower lands in a far-from-door (top half) corner', () => {
            const room = rectRoom('bathroom', 3, 2);
            const shower = furnishRoom(room).find(i => i.kind === 'shower_glass_panel');
            expect(shower).toBeDefined();
            // Door centre is at z = 0; the FAR corners are at z ≈ 1.53 (top
            // half of the room). A near-corner placement would have z ≈ 0.47.
            expect(shower!.position.z).toBeGreaterThan(1.0);
        });
    });

    describe('§FURNITURE-SPEC excludeDoorSwing (anchor wall ≠ door wall)', () => {
        // Bathroom toilet anchored 'wall-longest' would land on the BOTTOM wall
        // (the door wall, tied length 2.5 m with the top wall but first in
        // input order), slid past the door obstacle to (2.0, 0.37) — toilet
        // greets the user as they open the door. excludeDoorSwing prefers a
        // wall WITHOUT the door so the toilet anchors on the TOP wall instead.
        it('bathroom toilet anchors on the wall opposite the door', () => {
            const room = rectRoom('bathroom', 2.5, 2);
            const toilet = furnishRoom(room).find(i => i.kind === 'toilet_radiator');
            expect(toilet).toBeDefined();
            // Toilet on the top wall has centre z ≈ 2 − 0.7/2 − 0.02 ≈ 1.63;
            // toilet on the bottom (door) wall would have centre z ≈ 0.37.
            expect(toilet!.position.z).toBeGreaterThan(1.0);
        });

        // A.21.D20 — the kitchen run (base units + appliances) must NOT sit on
        // the door wall (a counter slid past the door is unusable + the swing
        // fouls the working zone). A door-wall module faces +z (yaw ≈ 0) AND
        // sits near z = 0; side-wall modules face ±x (yaw ≈ ±π/2). Assert no
        // floor module is a door-wall module.
        it('the parametric kitchen run does not anchor on the door wall', () => {
            // 3.5 × 3 room — door on the bottom wall; the run's spine wall must
            // clear it. §KITCHEN-PARAMETRIC-RUN: furnishRoom emits ONE run; its
            // yaw + position reflect the spine wall it anchors on. A door-wall
            // spine would face +z (yaw ≈ 0) AND sit near z = 0.
            const room = rectRoom('kitchen', 3.5, 3);
            const items = furnishRoom(room).filter(i =>
                i.kind === 'kitchen_straight' || i.kind === 'kitchen_l_shape' || i.kind === 'kitchen_u_shape');
            expect(items.length).toBeGreaterThan(0);
            for (const it of items) {
                const facesUp = Math.abs(Math.sin(it.rotationY)) < 0.1 && Math.cos(it.rotationY) > 0.9;
                const onDoorWall = facesUp && it.position.z < 0.5;
                expect(onDoorWall, `${it.kind} anchors on the door wall`).toBe(false);
            }
        });

        // Bedroom wardrobe MUST still be placed (it's required) even when
        // both filters (window-wall + door-wall) leave only two short side
        // walls and the bed has already claimed one of them.
        it('bedroom wardrobe still places when filters over-constrain (cascading fallback)', () => {
            const base = rectRoom('bedroom', 4, 3);
            const room: FurnishRoomInput = {
                ...base,
                windows: [{ type: 'window', center: { x: 2, z: 3 }, normal: { x: 0, z: -1 }, width: 1.5 }],
            };
            const items = furnishRoom(room);
            expect(items.some(i => isBed(i.kind))).toBe(true);
            expect(items.some(i => i.kind === 'wardrobe')).toBe(true);
        });
    });

    describe('single-pass archetype order (bedsides placed before lamp)', () => {
        // Architect's rule: bedroom has BED + 2 BEDSIDE TABLES + WARDROBE + LAMP.
        // With the prior two-pass model the lamp (Pass 1, corner) was placed
        // before the bedsides (Pass 2, beside-leader) and took the corner one
        // bedside needed — only 1 bedside fit. Single-pass in archetype order
        // places the bedsides immediately after the bed; the lamp yields.
        it('bedroom with window opposite door places BOTH bedsides', () => {
            const base = rectRoom('bedroom', 4, 3);
            const room: FurnishRoomInput = {
                ...base,
                windows: [{ type: 'window', center: { x: 2, z: 3 }, normal: { x: 0, z: -1 }, width: 1.5 }],
            };
            const items = furnishRoom(room);
            expect(items.filter(i => i.kind === 'bedside_table').length).toBe(2);
        });
    });

    describe('open-plan merged room (furnishRoomCompound)', () => {
        // The apartment-layout's open-plan case: living + kitchen + dining
        // merge into ONE detected room. furnishRoomCompound runs all three
        // archetypes within the same polygon, sharing the obstacle set, so
        // the kitchen run + dining table + sofa all land without collision.
        it('places sofa + kitchen run + dining table in one merged 8 x 6 room', async () => {
            const { furnishRoomCompound } = await import('../src/workflows/furnishLayout/furnishRoom.js');
            const room = rectRoom('living-room', 8, 6);
            const placed = furnishRoomCompound(room, ['living-room', 'kitchen', 'dining-room']);
            expect(placed.some(p => p.kind === 'sofa')).toBe(true);
            // §KITCHEN-PARAMETRIC-RUN — the kitchen sub-program now contributes ONE
            // parametric run element (rendered by KitchenCabinetEngine) carrying a
            // kitchenConfig, instead of loose base_unit/sink modules.
            const kitchenRun = placed.find(p =>
                p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape');
            expect(kitchenRun).toBeDefined();
            expect(kitchenRun!.kitchenConfig).toBeDefined();
            expect(placed.some(p => p.kind === 'dining_table')).toBe(true);
        });

        // Unknown / corridor occupancies are silently skipped (the bubble
        // graph's compound may include 'corridor' or 'entrance-lobby' which
        // contribute no furniture).
        it('silently skips occupancies without an archetype', async () => {
            const { furnishRoomCompound } = await import('../src/workflows/furnishLayout/furnishRoom.js');
            const room = rectRoom('living-room', 6, 5);
            const placed = furnishRoomCompound(room, ['living-room', 'corridor', 'not-a-real-occupancy']);
            expect(placed.some(p => p.kind === 'sofa')).toBe(true);
        });
    });

    describe('dining_chair orientation (chairs face the table)', () => {
        // The chair's local +z is its forward direction; a chair at +x of the
        // table must face −x (toward the table). Previously slots 3 and 4 had
        // swapped yaws → side chairs faced AWAY from the table.
        it('every chair faces the dining table centre', () => {
            const room = rectRoom('dining-room', 5, 4);
            const items = furnishRoom(room);
            const table = items.find(i => i.kind === 'dining_table');
            const chairs = items.filter(i => i.kind === 'dining_chair');
            expect(table).toBeDefined();
            expect(chairs.length).toBeGreaterThanOrEqual(1);
            for (const c of chairs) {
                const dx = table!.position.x - c.position.x;
                const dz = table!.position.z - c.position.z;
                const len = Math.hypot(dx, dz);
                expect(len).toBeGreaterThan(0.1);
                // chair's facing in world is (sin yaw, cos yaw)
                const fx = Math.sin(c.rotationY);
                const fz = Math.cos(c.rotationY);
                // direction to table normalised; expect facing ≈ that direction
                expect(fx).toBeCloseTo(dx / len, 2);
                expect(fz).toBeCloseTo(dz / len, 2);
            }
        });
    });

    describe('§FURNITURE-SPEC clearFront (working zone reserved)', () => {
        // The toilet has 60 cm knee clearance; later items must not occupy
        // the strip in front of it. The bathroom shower (corner-anchored) is
        // placed AFTER the toilet — it must avoid the toilet's clear-front.
        it('bathroom shower never sits inside the toilet knee-clearance zone', () => {
            const room = rectRoom('bathroom', 2.5, 2);
            const items = furnishRoom(room);
            const toilet = items.find(i => i.kind === 'toilet_radiator');
            const shower = items.find(i => i.kind === 'shower_glass_panel');
            expect(toilet).toBeDefined();
            expect(shower).toBeDefined();
            // Toilet on top wall (z ≈ 1.63) faces -z; its clear-front zone is
            // the strip at z ∈ [1.63 − 0.7/2 − 0.6, 1.63 − 0.7/2] ≈ [0.68, 1.28]
            // over the toilet's x span. The shower's centre must NOT lie inside.
            const tcx = toilet!.position.x, tcz = toilet!.position.z;
            const dx = Math.abs(shower!.position.x - tcx);
            const dz = tcz - shower!.position.z;
            const inFront = dx < (0.4 / 2 + 0.9 / 2) && dz > 0.35 && dz < 0.95;
            expect(inFront).toBe(false);
        });
    });

    describe('§63.2 / §63.5 — bathroom fixtures wall-hosted + raised', () => {
        // A generous 3.2 × 3 bathroom: room enough for the vanity (the mirror's
        // leader) so the wall-host placement engages. The mirror must sit FLUSH on
        // the vanity wall (not floating in the room), VERTICAL (yaw = leader yaw),
        // at eye height (~1.5 m centre = baseOffset 1.10 + half its 0.70 m height),
        // normal into the room. The radiator must be flush + raised off the floor.
        const bigBath = (): FurnishRoomInput => rectRoom('bathroom', 3.2, 3);

        it('the bathroom mirror is wall-hosted: back on the wall, vertical, at eye height', () => {
            const items = furnishRoom(bigBath());
            const vanity = items.find(i => i.kind === 'vanity_unit');
            const mirror = items.find(i => i.kind === 'bathroom_mirror');
            expect(vanity, 'vanity must place to host the mirror').toBeDefined();
            expect(mirror, 'mirror must place').toBeDefined();
            // Same yaw as the vanity (vertical, no tilt; rotationY is the only
            // rotation — pitch/roll are always 0 in the engine → never angled).
            expect(mirror!.rotationY).toBeCloseTo(vanity!.rotationY, 6);
            // Mounted at eye height: baseOffset 1.10 m on the FLOOR datum.
            expect(mirror!.position.y).toBeCloseTo(1.10, 6);
            // FLUSH: the mirror's BACK plane lies on the same wall as the vanity's
            // back. Both backs sit at wallFace = centre − n·(l/2) along the inward
            // normal; project both onto the normal and require they match.
            const n = { x: Math.sin(vanity!.rotationY), z: Math.cos(vanity!.rotationY) };
            const vanityBack = (vanity!.position.x - n.x * vanity!.footprint.l / 2) * n.x
                             + (vanity!.position.z - n.z * vanity!.footprint.l / 2) * n.z;
            const mirrorBack = (mirror!.position.x - n.x * mirror!.footprint.l / 2) * n.x
                             + (mirror!.position.z - n.z * mirror!.footprint.l / 2) * n.z;
            expect(mirrorBack).toBeCloseTo(vanityBack, 4);
            // Centred over the vanity (same along-wall position).
            const d = { x: n.z, z: -n.x };
            const along = (p: { x: number; z: number }): number => p.x * d.x + p.z * d.z;
            expect(along(mirror!.position)).toBeCloseTo(along(vanity!.position), 4);
        });

        it('the towel-rail radiator is RAISED off the floor and flush to a wall', () => {
            const items = furnishRoom(bigBath());
            const rad = items.find(i => i.kind === 'toilet_radiator');
            expect(rad, 'radiator is required').toBeDefined();
            // §63.5 — raised: baseOffset 0.30 m (bottom rail off the floor), NOT 0.
            expect(rad!.position.y).toBeCloseTo(0.30, 6);
            // Flush to a wall: the radiator was placed against a room wall, so its
            // BACK plane lies on a wall line within tolerance.
            const n = { x: Math.sin(rad!.rotationY), z: Math.cos(rad!.rotationY) };
            const bx = rad!.position.x - n.x * rad!.footprint.l / 2;
            const bz = rad!.position.z - n.z * rad!.footprint.l / 2;
            const onAWall = bigBath().walls.some(w => {
                const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
                const dx = (w.b.x - w.a.x) / len, dz = (w.b.z - w.a.z) / len;
                const t = (bx - w.a.x) * dx + (bz - w.a.z) * dz;
                if (t < -0.05 || t > len + 0.05) return false;
                const px = w.a.x + dx * t, pz = w.a.z + dz * t;
                return Math.hypot(bx - px, bz - pz) < 0.05;
            });
            expect(onAWall, 'radiator back must lie on a wall (flush)').toBe(true);
        });

        it('the towel rail (heated rail) is raised + hosted on the vanity wall', () => {
            const items = furnishRoom(bigBath());
            const vanity = items.find(i => i.kind === 'vanity_unit');
            const towel = items.find(i => i.kind === 'towel_rail');
            if (!vanity || !towel) return;     // optional — only assert when both placed
            // Wall-hung at its mount height (0.40 m), not on the floor.
            expect(towel.position.y).toBeCloseTo(0.40, 6);
            // Same yaw as the vanity (hosted on the same wall, into-room normal).
            expect(towel.rotationY).toBeCloseTo(vanity.rotationY, 6);
            // SIDE-mounted: offset along the wall PAST the vanity edge (not centred
            // on / clashing with the cabinet body).
            const d = { x: Math.cos(vanity.rotationY), z: -Math.sin(vanity.rotationY) };
            const along = (p: { x: number; z: number }): number => p.x * d.x + p.z * d.z;
            expect(Math.abs(along(towel.position) - along(vanity.position)))
                .toBeGreaterThan(vanity.footprint.w / 2);
        });
    });
});
