// D-FLE F8 — emission tests.
// Contract (SPEC-FURNITURE-LAYOUT-ENGINE §8): one furniture.create per item;
// rotation scalar; hostedSpaceId set; ids unique; deterministic.

import { describe, expect, it } from 'vitest';
import { buildFurnishCommands } from '../src/workflows/furnishLayout/buildFurnishCommands.js';
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
        // F1.3 (2026-05-30): living-room archetype now includes a
        // wall-mounted TV (footprint baseOffset = 1.20 m). Emitted
        // baseOffset is `position.y - levelElevation`; floor items resolve
        // to 0, wall items to their footprint baseOffset. Pin both cases.
        for (const c of set.commands) {
            const p = c.payload as Record<string, unknown>;
            const baseOffset = p.baseOffset as number;
            if (p.furnitureType === 'tv') {
                expect(baseOffset).toBeCloseTo(1.20, 6);
            } else {
                expect(baseOffset).toBeCloseTo(0, 6);
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
