// D-FLE × Program Rules — the furniture archetypes must SATISFY the rules database.
// Contract: SPEC-ARCHITECTURAL-PROGRAM-RULES §program. The rules DB is the single
// source of truth for WHAT each room must contain; the archetypes add placement.
// This test pins them consistent so the two never drift (e.g. the user's rule that
// a bedroom requires bed + 2 bedside tables + lighting + a wardrobe).

import { describe, expect, it } from 'vitest';
import { archetypeFor, FURNISHABLE_OCCUPANCIES } from '../src/workflows/furnishLayout/archetypes.js';
import { programForOccupancy } from '../src/workflows/apartmentLayout/rules/programRules.js';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import type { FurnishRoomInput, Pt } from '../src/workflows/furnishLayout/types.js';

describe('furniture archetypes satisfy the rules database', () => {
    it('every archetype contains all DB-required furniture kinds for its occupancy', () => {
        for (const occ of FURNISHABLE_OCCUPANCIES) {
            const archetype = archetypeFor(occ);
            const kinds = new Set((archetype?.items ?? []).map(i => i.kind));
            const required = programForOccupancy(occ).required;
            for (const k of required) {
                expect(kinds.has(k as never), `${occ} archetype is missing required '${k}'`).toBe(true);
            }
        }
    });

    it('bedroom archetype: bed + 2 bedside tables + lighting + wardrobe', () => {
        const a = archetypeFor('bedroom')!;
        const bed = a.items.find(i => i.kind === 'bed');
        const bedside = a.items.find(i => i.kind === 'bedside_table');
        const wardrobe = a.items.find(i => i.kind === 'wardrobe');
        const lamp = a.items.find(i => i.kind === 'lamp');
        expect(bed).toBeDefined();
        expect(bedside?.count).toBe(2);
        expect(wardrobe).toBeDefined();
        expect(lamp).toBeDefined();
    });
});

describe('furnishRoom places the bedroom program', () => {
    const bedroom = (w: number, d: number): FurnishRoomInput => {
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
        return {
            roomId: 'space-1', levelId: 'L0', occupancy: 'bedroom',
            polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
            walls: [
                { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
                { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: false },
                { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
                { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: false },
            ],
            doors: [{ type: 'door', center: { x: w / 2, z: d }, normal: { x: 0, z: -1 }, width: 0.9 }],
            windows: [], levelElevation: 0,
        };
    };

    it('a generous bedroom gets a bed, both bedside tables, a wardrobe and a lamp', () => {
        // Deeper-than-wide so the longest wall (the wardrobe wall) is NOT the bed wall
        // — both bedside tables then flank the bed head without colliding the wardrobe.
        const placed = furnishRoom(bedroom(3.6, 5.2));
        const kinds = placed.map(p => p.kind);
        expect(kinds).toContain('bed');
        expect(kinds.filter(k => k === 'bedside_table').length).toBe(2);
        expect(kinds).toContain('wardrobe');
        expect(kinds).toContain('lamp');
    });
});
