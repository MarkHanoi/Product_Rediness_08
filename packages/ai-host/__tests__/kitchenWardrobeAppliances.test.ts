// A.21.D20 — kitchen / wardrobe I/L/U run + appliance placement tests.
// (SPEC-KITCHEN-WARDROBE-APPLIANCES §C / test plan)
//
// Pins: the layout shape is chosen by aspect / free-wall count (and forced by
// the brief); the kitchen places its appliances IN the run (sink + hob + oven +
// dishwasher + fridge, extractor over the hob) with a sane work-triangle; the
// wardrobe lays I/L/U along the bedroom's free walls.

import { describe, expect, it } from 'vitest';
import {
    planKitchen, kitchenTrianglePoints, normaliseKitchenLayout,
} from '../src/workflows/furnishLayout/kitchenLayout.js';
import {
    planWardrobe, normaliseWardrobeLayout,
} from '../src/workflows/furnishLayout/wardrobeLayout.js';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintRect, rectsOverlap, pointInPolygon } from '../src/workflows/furnishLayout/collision.js';
import { validateKitchenTriangle } from '../src/workflows/apartmentLayout/dimensions/validateKitchenTriangle.js';
import type { FurnishRoomInput, Pt, PlacedFurniture } from '../src/workflows/furnishLayout/types.js';

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

const rectOf = (p: PlacedFurniture) =>
    footprintRect(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);

/** Distinct run arms — count the number of distinct yaw orientations among the
 *  floor (worktop-height) appliance/cabinet modules. I=1, L=2, U=3 arms. */
function armCount(placed: readonly PlacedFurniture[]): number {
    const floor = placed.filter(p => p.kind !== 'extractor');
    const yaws = new Set(floor.map(p => Math.round(p.rotationY * 1e4)));
    return yaws.size;
}

describe('A.21.D20 — kitchen I/L/U + appliances', () => {
    it('places base units + sink + hob + oven + dishwasher + fridge in the run', () => {
        const placed = planKitchen(rectRoom('kitchen', 5, 4), 'auto');
        const kinds = new Set(placed.map(p => p.kind));
        for (const k of ['base_unit', 'sink', 'hob', 'oven', 'dishwasher', 'fridge'] as const) {
            expect(kinds.has(k), `expected ${k}`).toBe(true);
        }
    });

    it('mounts the extractor over the hob', () => {
        const placed = planKitchen(rectRoom('kitchen', 5, 4), 'auto');
        const hob = placed.find(p => p.kind === 'hob')!;
        const hood = placed.find(p => p.kind === 'extractor')!;
        expect(hob).toBeDefined();
        expect(hood).toBeDefined();
        expect(hood.position.x).toBeCloseTo(hob.position.x, 5);
        expect(hood.position.z).toBeCloseTo(hob.position.z, 5);
        expect(hood.position.y).toBeGreaterThan(hob.position.y);
    });

    it('floor modules lie inside the room and do not overlap', () => {
        const placed = planKitchen(rectRoom('kitchen', 5, 4), 'auto').filter(p => p.kind !== 'extractor');
        const poly = rectRoom('kitchen', 5, 4).polygon as Pt[];
        for (const p of placed) expect(pointInPolygon({ x: p.position.x, z: p.position.z }, poly)).toBe(true);
        for (let i = 0; i < placed.length; i++)
            for (let j = i + 1; j < placed.length; j++)
                expect(rectsOverlap(rectOf(placed[i]!), rectOf(placed[j]!))).toBe(false);
    });

    it('forces an I (1 arm) when the brief asks', () => {
        const placed = planKitchen(rectRoom('kitchen', 5, 4), 'I');
        expect(placed.length).toBeGreaterThan(0);
        expect(armCount(placed)).toBe(1);
    });

    it('auto chooses an L (2 arms) for a typical (longer-walled) kitchen', () => {
        // 4.5 × 3.8: longest wall 4.5 m > the U back-wall cap → L (the reliable
        // work-triangle shape).
        const placed = planKitchen(rectRoom('kitchen', 4.5, 3.8), 'auto');
        expect(armCount(placed)).toBe(2);
    });

    it('forces a U (3 arms) when the brief asks and the geometry allows', () => {
        const placed = planKitchen(rectRoom('kitchen', 3.2, 3.0), 'U');
        expect(armCount(placed)).toBe(3);
    });

    it('the auto (L) work-triangle is NKBA-sane (no HARD findings)', () => {
        // The auto choice is an L for typical kitchens — the most reliable
        // work-triangle (sink + hob on one wall, fridge on the perpendicular
        // wall, every leg inside the 1.2–2.7 m NKBA window).
        for (const [w, d] of [[4.5, 3.8], [6, 4], [5, 4]] as const) {
            const placed = planKitchen(rectRoom('kitchen', w, d), 'auto');
            const tri = kitchenTrianglePoints(placed);
            expect(tri, `${w}x${d} has a triangle`).not.toBeNull();
            const v = validateKitchenTriangle({ kitchenId: 'k1', sink: tri!.sink, stove: tri!.hob, fridge: tri!.fridge });
            expect(v.hardFindings.length, `${w}x${d}: ${JSON.stringify(v.hardFindings)}`).toBe(0);
        }
    });

    it('a U kitchen still places all three triangle stations on three walls', () => {
        const placed = planKitchen(rectRoom('kitchen', 3.2, 3.0), 'U');
        const tri = kitchenTrianglePoints(placed);
        expect(tri).not.toBeNull();
        // sink + hob on the back arm, fridge on a perpendicular arm.
        const fridge = placed.find(p => p.kind === 'fridge')!;
        const hob = placed.find(p => p.kind === 'hob')!;
        expect(Math.abs(((fridge.rotationY - hob.rotationY) % Math.PI))).toBeGreaterThan(0.1);
    });

    it('adds a washing machine to the run when requested (no utility room)', () => {
        const withWm = planKitchen(rectRoom('kitchen', 6, 4), 'auto', { washingMachine: true });
        const without = planKitchen(rectRoom('kitchen', 6, 4), 'auto', { washingMachine: false });
        expect(withWm.some(p => p.kind === 'washing_machine')).toBe(true);
        expect(without.some(p => p.kind === 'washing_machine')).toBe(false);
    });

    it('is deterministic', () => {
        const a = JSON.stringify(planKitchen(rectRoom('kitchen', 5, 4), 'auto'));
        const b = JSON.stringify(planKitchen(rectRoom('kitchen', 5, 4), 'auto'));
        expect(a).toEqual(b);
    });

    it('every kitchen gets exactly one fridge against a wall', () => {
        const placed = planKitchen(rectRoom('kitchen', 5, 4), 'auto');
        const fridges = placed.filter(p => p.kind === 'fridge');
        expect(fridges.length).toBe(1);
        // The fridge is a perimeter run module → it sits a footprint-depth off a
        // wall, i.e. near (not at) the room interior, never floating mid-floor.
        const f = fridges[0]!;
        const poly = rectRoom('kitchen', 5, 4).polygon as Pt[];
        expect(pointInPolygon({ x: f.position.x, z: f.position.z }, poly)).toBe(true);
    });

    it('no kitchen module sits on the door wall', () => {
        const placed = planKitchen(rectRoom('kitchen', 3.6, 3), 'auto').filter(p => p.kind !== 'extractor');
        for (const p of placed) {
            const facesUp = Math.abs(Math.sin(p.rotationY)) < 0.1 && Math.cos(p.rotationY) > 0.9;
            expect(facesUp && p.position.z < 0.5).toBe(false);
        }
    });
});

describe('§KITCHEN-ISLAND — central island on roomy kitchens', () => {
    const islandsIn = (p: readonly PlacedFurniture[]) => p.filter(x => x.kind === 'kitchen_island');

    it('adds a central island on a large open kitchen (min-dim ≥ 3.5 m)', () => {
        const placed = planKitchen(rectRoom('kitchen', 6, 5), 'auto');
        const islands = islandsIn(placed);
        expect(islands.length).toBe(1);
        // Centred on the room.
        const room = rectRoom('kitchen', 6, 5);
        expect(islands[0]!.position.x).toBeCloseTo(room.centroid.x, 5);
        expect(islands[0]!.position.z).toBeCloseTo(room.centroid.z, 5);
    });

    it('skips the island on a small galley kitchen (min-dim < 3.5 m)', () => {
        const placed = planKitchen(rectRoom('kitchen', 4.5, 2.6), 'auto');
        expect(islandsIn(placed).length).toBe(0);
    });

    it('skips the island on a compact U kitchen (runs fill the floor)', () => {
        // 3.2 × 3.0 is the U-shape fixture — too tight for an island + gangway.
        const placed = planKitchen(rectRoom('kitchen', 3.2, 3.0), 'U');
        expect(islandsIn(placed).length).toBe(0);
    });

    it('the island + circulation envelope stays inside the room and clear of the runs', () => {
        const room = rectRoom('kitchen', 6, 5);
        const placed = planKitchen(room, 'auto');
        const island = islandsIn(placed)[0]!;
        const poly = room.polygon as Pt[];
        // Body inside the room.
        expect(pointInPolygon({ x: island.position.x, z: island.position.z }, poly)).toBe(true);
        // The island body does not overlap any other floor module.
        const others = placed.filter(p => p !== island && p.kind !== 'extractor');
        for (const o of others) expect(rectsOverlap(rectOf(island), rectOf(o))).toBe(false);
        // Circulation gangway: the island grown by its clearance is still inside.
        const fp = island.footprint;
        const env = footprintRect(
            island.position.x, island.position.z,
            fp.w + 2 * fp.clearSides, fp.l + 2 * fp.clearFront, island.rotationY,
        );
        for (const c of [
            { x: env.x0, z: env.z0 }, { x: env.x1, z: env.z0 },
            { x: env.x1, z: env.z1 }, { x: env.x0, z: env.z1 },
        ]) expect(pointInPolygon(c, poly)).toBe(true);
    });

    it('the island worktop runs along the room\'s long axis', () => {
        // Wide room (x longer) → island width along x → yaw 0.
        const wide = planKitchen(rectRoom('kitchen', 6, 5), 'auto');
        expect(islandsIn(wide)[0]!.rotationY).toBeCloseTo(0, 5);
        // Deep room (z longer) → island width along z → yaw 90°.
        const deep = planKitchen(rectRoom('kitchen', 5, 6), 'auto');
        expect(islandsIn(deep)[0]!.rotationY).toBeCloseTo(Math.PI / 2, 5);
    });

    it('island placement is deterministic', () => {
        const a = JSON.stringify(planKitchen(rectRoom('kitchen', 6, 5), 'auto'));
        const b = JSON.stringify(planKitchen(rectRoom('kitchen', 6, 5), 'auto'));
        expect(a).toEqual(b);
    });
});

describe('A.21.D20 — wardrobe I/L/U', () => {
    const bedroom = (w: number, d: number): FurnishRoomInput => rectRoom('bedroom', w, d);

    it('furnishRoom replaces the single wardrobe with a run', () => {
        const items = furnishRoom(bedroom(4, 4));
        const wardrobes = items.filter(i => i.kind === 'wardrobe');
        expect(wardrobes.length).toBeGreaterThanOrEqual(1);
    });

    it('planWardrobe lays at least one module along a free wall (no existing items)', () => {
        const run = planWardrobe(bedroom(4, 4), [], 'I');
        expect(run.length).toBeGreaterThanOrEqual(1);
        for (const w of run) expect(w.kind).toBe('wardrobe');
    });

    it('forces an L wardrobe (2 arms) when asked', () => {
        const run = planWardrobe(bedroom(5, 5), [], 'L');
        const yaws = new Set(run.map(w => Math.round(w.rotationY * 1e4)));
        expect(yaws.size).toBeGreaterThanOrEqual(2);
    });

    it('auto picks a single (I) run in a narrow bedroom — only one free wall run fits', () => {
        // A room with windows + a door on three of four walls leaves a single
        // clear wall → the auto planner can only build an I.
        const room = bedroom(3.2, 4.0);
        // Put a window on each long wall + keep the door on the bottom → only the
        // top wall is free.
        const win = (cx: number, cz: number, nx: number, nz: number) =>
            ({ type: 'window' as const, center: { x: cx, z: cz }, normal: { x: nx, z: nz }, width: 1.2 });
        const constrained: FurnishRoomInput = {
            ...room,
            windows: [win(0, 2, 1, 0), win(3.2, 2, -1, 0)],   // both side walls have a window
        };
        const run = planWardrobe(constrained, [], 'auto');
        const yaws = new Set(run.map(w => Math.round(w.rotationY * 1e4)));
        expect(yaws.size).toBe(1);
    });

    it('auto upgrades to an L/U run when more free wall length is available', () => {
        // Big square bedroom, no windows → ≥3 free walls → U (3 distinct yaws).
        const run = planWardrobe(bedroom(5.5, 5.5), [], 'auto');
        const yaws = new Set(run.map(w => Math.round(w.rotationY * 1e4)));
        expect(yaws.size).toBeGreaterThanOrEqual(2);
    });

    it('does not overlap existing furniture', () => {
        const room = bedroom(5, 5);
        const bed: PlacedFurniture = {
            kind: 'bed', position: { x: 2.5, y: 0, z: 4.2 }, rotationY: Math.PI,
            footprint: { w: 1.35, l: 1.9, h: 0.5, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 },
            hostedSpaceId: 'r1',
        };
        const run = planWardrobe(room, [bed], 'auto');
        for (const w of run) expect(rectsOverlap(rectOf(w), rectOf(bed))).toBe(false);
    });

    it('is deterministic', () => {
        const a = JSON.stringify(planWardrobe(bedroom(5, 5), [], 'auto'));
        const b = JSON.stringify(planWardrobe(bedroom(5, 5), [], 'auto'));
        expect(a).toEqual(b);
    });
});

describe('A.21.D20 — layout normalisers', () => {
    it('normaliseKitchenLayout maps junk to auto, keeps I/L/U', () => {
        expect(normaliseKitchenLayout('I')).toBe('I');
        expect(normaliseKitchenLayout('L')).toBe('L');
        expect(normaliseKitchenLayout('U')).toBe('U');
        expect(normaliseKitchenLayout('nonsense')).toBe('auto');
        expect(normaliseKitchenLayout(undefined)).toBe('auto');
    });
    it('normaliseWardrobeLayout maps junk to auto, keeps I/L/U', () => {
        expect(normaliseWardrobeLayout('U')).toBe('U');
        expect(normaliseWardrobeLayout(42)).toBe('auto');
    });
});
