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

    it('no kitchen module sits on the door wall', () => {
        const placed = planKitchen(rectRoom('kitchen', 3.6, 3), 'auto').filter(p => p.kind !== 'extractor');
        for (const p of placed) {
            const facesUp = Math.abs(Math.sin(p.rotationY)) < 0.1 && Math.cos(p.rotationY) > 0.9;
            expect(facesUp && p.position.z < 0.5).toBe(false);
        }
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
