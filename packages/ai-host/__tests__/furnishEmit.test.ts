// D-FLE F8 — emission tests.
// Contract (SPEC-FURNITURE-LAYOUT-ENGINE §8): one furniture.create per item;
// rotation scalar; hostedSpaceId set; ids unique; deterministic.

import { describe, expect, it } from 'vitest';
import { buildFurnishCommands } from '../src/workflows/furnishLayout/buildFurnishCommands.js';
import { styleFinishFor, normaliseStyle } from '../src/workflows/furnishLayout/styleFinish.js';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import type { FurnishRoomInput, PlacedFurniture, Pt } from '../src/workflows/furnishLayout/types.js';

function rectRoom(occupancy: string, w: number, d: number, elev = 0): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'space-1', levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [], levelElevation: elev,
    };
}

describe('buildFurnishCommands (D-FLE F8)', () => {
    it('emits one furniture.create per placed item, scalar rotation, hostedSpaceId set', () => {
        const items = furnishRoom(rectRoom('bedroom', 4, 3));
        let n = 0;
        const set = buildFurnishCommands(items, 'L0', 0, () => `furniture-${n++}`);
        expect(set.commands.length).toBe(items.length);
        expect(set.ids.length).toBe(items.length);
        for (const c of set.commands) {
            const p = c.payload as Record<string, unknown>;
            expect(c.command).toBe('furniture.create');
            expect(typeof p.rotation).toBe('number');                 // SCALAR yaw
            expect(p.levelId).toBe('L0');
            expect((p.metadata as { hostedSpaceId: string }).hostedSpaceId).toBe('space-1');
            const pos = p.position as { x: number; y: number; z: number };
            expect(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)).toBe(true);
        }
        expect(new Set(set.ids).size).toBe(set.ids.length);           // unique ids
        expect(set.warnings).toEqual([]);
    });

    it('baseOffset accounts for level elevation', () => {
        const items = furnishRoom(rectRoom('living-room', 5, 4, 3.0));
        const set = buildFurnishCommands(items, 'L1', 3.0, (() => { let n = 0; return () => `f-${n++}`; })());
        // F1.3 / F1.10 / F1.11 (2026-05-30): the living-room archetype
        // now includes wall-mounted items (tv 1.20 m, wall_art 1.20 m,
        // curtain_rod 2.40 m). Emitted baseOffset is
        // `position.y - levelElevation`; floor items resolve to 0, wall
        // items to their footprint baseOffset. Pin each case.
        const WALL_ITEMS: Readonly<Record<string, number>> = {
            tv: 1.20,
            wall_art: 1.20,
            wall_mirror: 1.20,
            bathroom_mirror: 1.10,
            towel_rail: 0.40,
            curtain_rod: 2.40,
        };
        for (const c of set.commands) {
            const p = c.payload as Record<string, unknown>;
            const baseOffset = p.baseOffset as number;
            const ft = p.furnitureType as string;
            if (ft in WALL_ITEMS) {
                expect(baseOffset, `wall item "${ft}"`).toBeCloseTo(WALL_ITEMS[ft]!, 6);
            } else {
                expect(baseOffset, `floor item "${ft}"`).toBeCloseTo(0, 6);
            }
        }
    });

    it('is deterministic for the same placement + minter', () => {
        const items = furnishRoom(rectRoom('bedroom', 4, 3));
        const mk = () => { let n = 0; return () => `f-${n++}`; };
        expect(JSON.stringify(buildFurnishCommands(items, 'L0', 0, mk())))
            .toEqual(JSON.stringify(buildFurnishCommands(items, 'L0', 0, mk())));
    });

    it('empty placement → empty set', () => {
        const set = buildFurnishCommands([] as PlacedFurniture[], 'L0', 0, () => 'x');
        expect(set.commands).toEqual([]);
        expect(set.totalElementCount).toBe(0);
    });
});

describe('§LAMP-FLOAT-FIX — bedside lamp rests ON the nightstand top', () => {
    // Regression for the 2026-06-11 founder report: the bedside table lamp
    // floated ~0.50 m above the nightstand. The vertical contract is
    // `worldY = levelElevation + baseOffset` (FurnitureFragmentBuilder applies
    // the mount offset EXACTLY ONCE; furnitureElevation.furnitureWorldY). So the
    // lamp's emitted baseOffset MUST equal the bedside table's TOP surface
    // (table baseOffset + table height), placing the lamp base flush on the
    // table — no gap, no double-count.
    const LEVEL_ELEV = 3.0; // upper storey — exercises the floor-datum offset too

    function bedsideTable(levelElev: number): PlacedFurniture {
        // As placeSolver emits a floor item: position.y = levelElevation + baseOffset(0).
        return {
            kind: 'bedside_table',
            position: { x: 1, y: levelElev, z: 2 },
            rotationY: 0,
            footprint: { w: 0.45, l: 0.40, h: 0.50, baseOffset: 0, clearFront: 0, clearSides: 0 },
            hostedSpaceId: 'space-1',
        } as PlacedFurniture;
    }

    it('lamp baseOffset === table top, so worldY rests on the table (not floating)', async () => {
        const { placeBedsideLamps } = await import('../src/workflows/furnishLayout/bedsideLamps.js');
        const table = bedsideTable(LEVEL_ELEV);
        const tableTop = table.position.y + table.footprint.h; // 3.50 m world
        const lamps = placeBedsideLamps({ roomId: 'space-1', levelElevation: LEVEL_ELEV } as FurnishRoomInput, [table]);
        expect(lamps.length).toBe(1);

        let n = 0;
        const set = buildFurnishCommands([table, ...lamps], 'L0', LEVEL_ELEV, () => `f-${n++}`);
        const lampCmd = set.commands.find((c) => (c.payload as Record<string, unknown>).furnitureType === 'lamp');
        expect(lampCmd, 'lamp furniture.create emitted').toBeDefined();
        const p = lampCmd!.payload as Record<string, unknown>;

        // Emitted baseOffset = table-top mount height (0.50), NOT 0 and NOT doubled.
        expect(p.baseOffset as number).toBeCloseTo(0.50, 6);

        // FragmentBuilder world Y = levelElevation + baseOffset → lands ON the table top.
        const worldY = LEVEL_ELEV + (p.baseOffset as number);
        expect(worldY).toBeCloseTo(tableTop, 6);
    });
});

describe('A.21.D4 — style → furniture finish', () => {
    const mk = () => { let n = 0; return () => `f-${n++}`; };
    const payload = (c: { payload: unknown }) => c.payload as Record<string, unknown>;

    it('stamps a style-driven colour + material on every furniture.create', () => {
        const items = furnishRoom(rectRoom('bedroom', 4, 3));
        const set = buildFurnishCommands(items, 'L0', 0, mk(), 'classic');
        expect(set.commands.length).toBeGreaterThan(0);
        for (const c of set.commands) {
            const p = payload(c);
            expect(typeof p.color).toBe('string');
            // §bedroom-mirror (2026-06-11) — + 'mirror' (the bedroom now places
            // wall_mirror items, which route to the reflective 'mirror' finish).
            expect(['fabric', 'wood', 'metal', 'glass', 'mirror']).toContain(p.material);
            expect((p.metadata as { style: string }).style).toBe('classic');
        }
    });

    it('different styles produce different colours for the same piece (bed)', () => {
        const items = furnishRoom(rectRoom('bedroom', 4, 3));
        const modern = buildFurnishCommands(items, 'L0', 0, mk(), 'modern');
        const classic = buildFurnishCommands(items, 'L0', 0, mk(), 'classic');
        // §67.2 (2026-06-11) — the bedroom may carry the plain `bed` OR an
        // integrated variant bed (nordic_bed / solid_wood_bed). Match whichever.
        const isBed = (ft: unknown): boolean =>
            ft === 'bed' || ft === 'nordic_bed' || ft === 'solid_wood_bed';
        const bedM = modern.commands.find((c) => isBed(payload(c).furnitureType));
        const bedC = classic.commands.find((c) => isBed(payload(c).furnitureType));
        expect(bedM).toBeDefined();
        expect(bedC).toBeDefined();
        expect(payload(bedM!).color).not.toBe(payload(bedC!).color);
    });

    it('styleFinishFor: upholstered → fabric, case-goods → wood; unknown style → nordic (default)', () => {
        expect(styleFinishFor('classic', 'sofa').material).toBe('fabric');
        expect(styleFinishFor('classic', 'dining_table').material).toBe('wood');
        expect(normaliseStyle('nonsense')).toBe('nordic');
        expect(styleFinishFor(normaliseStyle(undefined), 'bed').material).toBe('fabric');
    });

    it('no style arg → defaults to nordic (still stamps a colour)', () => {
        const items = furnishRoom(rectRoom('bedroom', 4, 3));
        const set = buildFurnishCommands(items, 'L0', 0, () => 'x');
        const c = set.commands[0]!;
        const ft = payload(c).furnitureType as string;
        expect(payload(c).color).toBe(styleFinishFor('nordic', ft).color);
    });
});
