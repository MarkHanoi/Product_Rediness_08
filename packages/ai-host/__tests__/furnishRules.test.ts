// D-FLE × Program Rules — the furniture archetypes must SATISFY the rules database.
// Contract: SPEC-ARCHITECTURAL-PROGRAM-RULES §program. The rules DB is the single
// source of truth for WHAT each room must contain; the archetypes add placement.
// This test pins them consistent so the two never drift (e.g. the user's rule that
// a bedroom requires bed + 2 bedside tables + lighting + a wardrobe).
//
// §FURNITURE-SPEC (2026-05-28): the rules DB now also carries door-vector-aware
// placement metadata (sizes mm, clearances mm, placementRule, exclusion flags).
// This test pins those specs against the D-FLE archetype kinds + footprint
// dimensions so the two sources cannot drift while D-FLE migration is in flight.

import { describe, expect, it } from 'vitest';
import { archetypeFor, FURNISHABLE_OCCUPANCIES } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import {
    ROOM_RULES,
    furnitureSpecsFor,
    programForOccupancy,
} from '../src/workflows/apartmentLayout/rules/programRules.js';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import type { FurnitureKind } from '../src/workflows/furnishLayout/types.js';
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

describe('§FURNITURE-SPEC ↔ D-FLE — pin specs against the footprint catalogue', () => {
    it('every furnitureSpec kind has a matching D-FLE footprint with identical dimensions', () => {
        for (const rule of Object.values(ROOM_RULES)) {
            for (const spec of rule.furnitureSpec) {
                const fp = footprintOf(spec.kind as FurnitureKind);
                expect(fp, `${rule.type}.${spec.kind} has no D-FLE footprint`).toBeDefined();
                // Specs are in mm; footprints in m. ×1000 with float tolerance.
                expect(Math.round(fp.w * 1000), `${rule.type}.${spec.kind} sizeW (mm)`).toBe(spec.sizeW);
                expect(Math.round(fp.l * 1000), `${rule.type}.${spec.kind} sizeD (mm)`).toBe(spec.sizeD);
                expect(Math.round(fp.clearFront * 1000), `${rule.type}.${spec.kind} clearFoot (mm)`).toBe(spec.clearFoot);
                expect(Math.round(fp.clearSides * 1000), `${rule.type}.${spec.kind} clearSide (mm)`).toBe(spec.clearSide);
            }
        }
    });

    it('furnitureSpec includes every requiredFurniture kind for every room', () => {
        for (const rule of Object.values(ROOM_RULES)) {
            const specKinds = new Set(rule.furnitureSpec.map(s => s.kind));
            for (const k of rule.requiredFurniture) {
                expect(specKinds.has(k), `${rule.type}.furnitureSpec missing required '${k}'`).toBe(true);
            }
            // Every spec marked `required: true` must appear in requiredFurniture
            // (the spec is the architect's truth — required-here means required-everywhere).
            for (const s of rule.furnitureSpec) {
                if (s.required) {
                    expect(rule.requiredFurniture.includes(s.kind), `${rule.type}: spec.${s.kind} is required but missing from requiredFurniture`).toBe(true);
                }
            }
        }
    });

    it('bedroom spec is door-vector-aware: bed opposite_door, wardrobe excludes window wall', () => {
        // Architect's interactive plan database: bed is anchored opposite the
        // door, the wardrobe goes on the longest free wall but NEVER on the
        // window wall (tall furniture blocks daylight).
        const bedroom = furnitureSpecsFor('bedroom');
        const bed = bedroom.find(s => s.kind === 'bed')!;
        const wardrobe = bedroom.find(s => s.kind === 'wardrobe')!;
        const bedside = bedroom.find(s => s.kind === 'bedside_table')!;

        expect(bed.placementRule).toBe('opposite_door');
        expect(bed.excludeDoorSwing).toBe(true);
        expect(bed.excludeWindowWall).toBe(true);

        expect(wardrobe.placementRule).toBe('longest_wall');
        expect(wardrobe.excludeDoorSwing).toBe(true);
        expect(wardrobe.excludeWindowWall).toBe(true);

        expect(bedside.placementRule).toBe('flank_group');
        expect(bedside.group).toBe('bed');
        expect(bedside.count).toBe(2);
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
