// Furnish realism — founder feedback ("furniture not accurate") closeout.
//
// Pins the three realism gaps from the wishlist:
//   (1) BEDROOM lighting is room-appropriate: a ceiling fixture (D-LE) PLUS a
//       bedside lamp on each nightstand (D-FLE bedsideLamps).
//   (2) WARDROBE is sized to the room — a bigger bedroom yields a longer
//       wardrobe run (more modules), not a fixed token.
//   (3) KITCHEN includes a fridge in the run.
// Plus a per-room lighting-appropriateness sweep (dining→pendant, bath→downlight
// + mirror task light, kitchen→cluster/downlight, bedroom→ceiling fixture).

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { placeBedsideLamps } from '../src/workflows/furnishLayout/bedsideLamps.js';
import { footprintRect, rectsOverlap, pointInPolygon } from '../src/workflows/furnishLayout/collision.js';
import { lightRoom } from '../src/workflows/lightingLayout/lightRoom.js';
import type { FurnishRoomInput, Pt, PlacedFurniture } from '../src/workflows/furnishLayout/types.js';
import type { LightRoomInput } from '../src/workflows/lightingLayout/types.js';

/** Rectangular room [0,0]→[w,d], 4 walls, one door on the bottom wall. */
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

const lightInput = (over: Partial<LightRoomInput> = {}): LightRoomInput => ({
    roomId: 'r1', levelId: 'L0', occupancy: 'living-room',
    polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }],
    centroid: { x: 2.5, z: 2 }, areaM2: 20, levelElevation: 0,
    ...over,
});

// ── Gap 1 — bedroom bedside lamps + room-appropriate lighting ────────────────
describe('realism gap 1 — bedside lamps', () => {
    it('places a bedside lamp on EACH bedside table', () => {
        // Deeper-than-wide so the bed wall is not the longest wall and both
        // bedside tables flank the bed head (mirrors furnishRules.test.ts).
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2));
        const tables = placed.filter(p => p.kind === 'bedside_table');
        const lamps = placed.filter(p => p.kind === 'lamp');
        expect(tables.length).toBe(2);
        // A floor lamp (corner) MAY also be placed; bedside lamps are the ones
        // sitting on a bedside table footprint — at least one per table.
        const onTables = lamps.filter(l =>
            tables.some(t => Math.abs(t.position.x - l.position.x) < 1e-6
                          && Math.abs(t.position.z - l.position.z) < 1e-6));
        expect(onTables.length).toBe(2);
    });

    it('seats each bedside lamp ON the table surface (not on the floor)', () => {
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2));
        const tables = placed.filter(p => p.kind === 'bedside_table');
        for (const t of tables) {
            const lamp = placed.find(p => p.kind === 'lamp'
                && Math.abs(p.position.x - t.position.x) < 1e-6
                && Math.abs(p.position.z - t.position.z) < 1e-6);
            expect(lamp).toBeDefined();
            // Lamp base sits at the table top → table base Y + table height.
            expect(lamp!.position.y).toBeCloseTo(t.position.y + t.footprint.h, 6);
            // Compact bedside-lamp footprint (not the 1.5 m floor standard lamp).
            expect(lamp!.footprint.h).toBeLessThan(0.6);
        }
    });

    it('bedside lamps stay inside the room polygon', () => {
        const input = rectRoom('bedroom', 3.6, 5.2);
        const placed = furnishRoom(input);
        const tables = placed.filter(p => p.kind === 'bedside_table');
        const lamps = placeBedsideLamps(input, placed);
        expect(lamps.length).toBe(tables.length);
        for (const l of lamps) {
            expect(pointInPolygon({ x: l.position.x, z: l.position.z }, input.polygon)).toBe(true);
        }
    });

    it('no bedside lamps when there are no bedside tables', () => {
        // A room with no bedside_table → placeBedsideLamps returns nothing.
        const input = rectRoom('bedroom', 3.6, 5.2);
        expect(placeBedsideLamps(input, [])).toEqual([]);
    });

    it('bedroom also gets a CEILING fixture (lighting engine)', () => {
        const placed = lightRoom(lightInput({ occupancy: 'bedroom', areaM2: 16 }));
        const ceiling = placed.find(p => p.ceilingMounted);
        expect(ceiling).toBeDefined();
    });
});

describe('realism gap 1 — per-room lighting is appropriate', () => {
    it('dining room ≥ 10 m² → pendant (cluster centrepiece over the table)', () => {
        const placed = lightRoom(lightInput({ occupancy: 'dining-room', areaM2: 14 }));
        expect(placed[0]!.kind).toBe('pendant_cluster');
    });

    it('bathroom (wet room) → ceiling downlight + a wall mirror task light', () => {
        const placed = lightRoom(lightInput({ occupancy: 'bathroom', areaM2: 6 }));
        const ceiling = placed.find(p => p.ceilingMounted);
        const wall = placed.find(p => !p.ceilingMounted);
        expect(ceiling!.kind).toBe('downlight');
        expect(wall!.kind).toBe('mirror_light');
    });

    it('small kitchen (wet room) → downlight ceiling', () => {
        const placed = lightRoom(lightInput({ occupancy: 'kitchen', areaM2: 6 }));
        expect(placed[0]!.kind).toBe('downlight');
    });
});

// ── Gap 2 — wardrobe sized to the room ───────────────────────────────────────
describe('realism gap 2 — wardrobe sized to the room', () => {
    const wardrobeWidth = (placed: readonly PlacedFurniture[]): number =>
        placed.filter(p => p.kind === 'wardrobe')
            .reduce((sum, p) => sum + p.footprint.w, 0);

    it('a larger bedroom gets a longer wardrobe run than a small one', () => {
        const small = furnishRoom(rectRoom('bedroom', 3.0, 3.2));
        const big   = furnishRoom(rectRoom('bedroom', 4.5, 6.0));
        expect(small.some(p => p.kind === 'wardrobe')).toBe(true);
        expect(big.some(p => p.kind === 'wardrobe')).toBe(true);
        // More wall = more 1.2 m wardrobe modules → a strictly wider total run.
        expect(wardrobeWidth(big)).toBeGreaterThan(wardrobeWidth(small));
    });

    it('the wardrobe never overlaps the bed / bedside tables', () => {
        const placed = furnishRoom(rectRoom('bedroom', 4.5, 6.0));
        const wardrobes = placed.filter(p => p.kind === 'wardrobe').map(rectOf);
        const others = placed.filter(p => p.kind === 'bed' || p.kind === 'bedside_table').map(rectOf);
        for (const w of wardrobes) {
            for (const o of others) {
                expect(rectsOverlap(w, o)).toBe(false);
            }
        }
    });
});

// ── Gap 3 — kitchen fridge ───────────────────────────────────────────────────
// §KITCHEN-PARAMETRIC-RUN (2026-06-10): furnishRoom(kitchen) now emits a single
// parametric run; the fridge lives on a cabinet-unit appliance slot in the
// config (rendered by KitchenCabinetEngine), not as a loose `fridge` element.
describe('realism gap 3 — kitchen includes a fridge', () => {
    const hasFridgeSlot = (placed: ReturnType<typeof furnishRoom>): boolean => {
        const run = placed.find(p =>
            p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape');
        const appliances = (run?.kitchenConfig?.units ?? []).map(u => u.appliance).filter(Boolean);
        return appliances.some(a => String(a).startsWith('fridge'));
    };

    it('an I / L / U kitchen all carry a fridge in the run config', () => {
        for (const layoutDims of [[3.0, 2.4], [5.0, 4.0], [4.5, 4.5]] as const) {
            const placed = furnishRoom(rectRoom('kitchen', layoutDims[0], layoutDims[1]));
            expect(hasFridgeSlot(placed),
                `kitchen ${layoutDims[0]}×${layoutDims[1]} should have a fridge slot`).toBe(true);
        }
    });

    it('the kitchen run sits inside the room', () => {
        const room = rectRoom('kitchen', 5.0, 4.0);
        const placed = furnishRoom(room);
        const run = placed.find(p =>
            p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape')!;
        expect(run).toBeDefined();
        expect(pointInPolygon({ x: run.position.x, z: run.position.z }, room.polygon as Pt[])).toBe(true);
    });
});
