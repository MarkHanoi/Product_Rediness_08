// A.23.a (Phase A · Sprint 2) — L0 Aggregates substrate tests.
//
// Imports via the subpath `@pryzm/schemas/aggregates` per the
// C20 substrate exports convention (root re-export would collide
// with elements/Room + types/Id.RoomId).

import { describe, expect, it } from 'vitest';
import {
    BuildingIdSchema,
    LevelIdSchema,
    ApartmentIdSchema,
    RoomIdSchema,
    BuildingSchema,
    LevelSchema,
    ApartmentSchema,
    RoomSchema,
} from '../src/aggregates/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Branded ids
// ─────────────────────────────────────────────────────────────────────────────

describe('Aggregate IDs', () => {
    it('accepts canonical prefix-ulid slugs', () => {
        expect(() => BuildingIdSchema.parse('bldg_proj-001')).not.toThrow();
        expect(() => LevelIdSchema.parse('lvl_018f-abc')).not.toThrow();
        expect(() => ApartmentIdSchema.parse('apt_unit-1a')).not.toThrow();
        expect(() => RoomIdSchema.parse('rm_master-br')).not.toThrow();
    });

    it.each(['ab', 'has space', 'has/slash', ''])(
        'rejects invalid id %s',
        (invalid) => {
            expect(() => LevelIdSchema.parse(invalid)).toThrow();
            expect(() => ApartmentIdSchema.parse(invalid)).toThrow();
            expect(() => RoomIdSchema.parse(invalid)).toThrow();
        },
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Building
// ─────────────────────────────────────────────────────────────────────────────

describe('BuildingSchema', () => {
    function makeBuilding(over: Record<string, unknown> = {}) {
        return {
            id: 'bldg_proj-001',
            projectId: 'proj-001',
            name: 'Holborn Block A',
            createdAt: '2026-06-01T12:00:00.000Z',
            updatedAt: '2026-06-01T12:00:00.000Z',
            ...over,
        };
    }

    it('parses a canonical Building', () => {
        const parsed = BuildingSchema.parse(makeBuilding());
        expect(parsed.id).toBe('bldg_proj-001');
        expect(parsed.description).toBe('');
        expect(parsed.ordinal).toBe(0);
        expect(parsed.siteId).toBeUndefined();
    });

    it('accepts an optional siteId (forward link to C19 Site)', () => {
        const parsed = BuildingSchema.parse(
            makeBuilding({ siteId: 'site_proj-001' }),
        );
        expect(parsed.siteId).toBe('site_proj-001');
    });

    it('rejects negative ordinal', () => {
        expect(() =>
            BuildingSchema.parse(makeBuilding({ ordinal: -1 })),
        ).toThrow();
    });

    it('rejects empty name', () => {
        expect(() =>
            BuildingSchema.parse(makeBuilding({ name: '' })),
        ).toThrow();
    });

    it('rejects description over 2000 chars', () => {
        expect(() =>
            BuildingSchema.parse(
                makeBuilding({ description: 'x'.repeat(2001) }),
            ),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Level
// ─────────────────────────────────────────────────────────────────────────────

describe('LevelSchema', () => {
    function makeLevel(over: Record<string, unknown> = {}) {
        return {
            id: 'lvl_ground',
            buildingId: 'bldg_proj-001',
            name: 'Ground Floor',
            levelNumber: 0,
            elevation: 0,
            height: 2.7,
            createdAt: '2026-06-01T12:00:00.000Z',
            updatedAt: '2026-06-01T12:00:00.000Z',
            ...over,
        };
    }

    it('parses a canonical ground-floor Level', () => {
        const parsed = LevelSchema.parse(makeLevel());
        expect(parsed.levelNumber).toBe(0);
        expect(parsed.elevation).toBe(0);
        expect(parsed.height).toBe(2.7);
        expect(parsed.isActive).toBe(false);
        expect(parsed.isReference).toBe(false);
    });

    it('accepts a basement Level (negative levelNumber + elevation)', () => {
        const parsed = LevelSchema.parse(
            makeLevel({
                id: 'lvl_basement-1',
                name: 'Basement -1',
                levelNumber: -1,
                elevation: -3.0,
            }),
        );
        expect(parsed.levelNumber).toBe(-1);
        expect(parsed.elevation).toBe(-3);
    });

    it('rejects non-integer levelNumber', () => {
        expect(() =>
            LevelSchema.parse(makeLevel({ levelNumber: 1.5 })),
        ).toThrow();
    });

    it('rejects non-positive height', () => {
        expect(() =>
            LevelSchema.parse(makeLevel({ height: 0 })),
        ).toThrow();
        expect(() =>
            LevelSchema.parse(makeLevel({ height: -1 })),
        ).toThrow();
    });

    it('rejects height > 20m (out-of-scope industrial cap)', () => {
        expect(() =>
            LevelSchema.parse(makeLevel({ height: 25 })),
        ).toThrow();
    });

    it('isActive defaults to false; isReference defaults to false', () => {
        const parsed = LevelSchema.parse(makeLevel());
        expect(parsed.isActive).toBe(false);
        expect(parsed.isReference).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Apartment
// ─────────────────────────────────────────────────────────────────────────────

describe('ApartmentSchema', () => {
    function makeApartmentParameters(): unknown {
        return {
            id: 'apt_unit-1a',
            shellAreaM2: { value: 75, min: 60, max: 90 },
            bedrooms: 2,
            bathrooms: 1,
            masterEnSuite: false,
            openPlanKitchenDining: true,
            livingRoom: true,
            entranceHall: true,
            typology: 'closed-plan-mid-rise',
        };
    }

    function makeApartment(over: Record<string, unknown> = {}) {
        return {
            id: 'apt_unit-1a',
            buildingId: 'bldg_proj-001',
            levelId: 'lvl_ground',
            name: 'Unit 1A',
            unitNumber: '1A',
            parameters: makeApartmentParameters(),
            createdAt: '2026-06-01T12:00:00.000Z',
            updatedAt: '2026-06-01T12:00:00.000Z',
            ...over,
        };
    }

    it('parses a canonical 2-bed Apartment', () => {
        const parsed = ApartmentSchema.parse(makeApartment());
        expect(parsed.id).toBe('apt_unit-1a');
        expect(parsed.unitNumber).toBe('1A');
        expect(parsed.parameters.bedrooms).toBe(2);
    });

    it('rejects unitNumber > 20 chars', () => {
        expect(() =>
            ApartmentSchema.parse(
                makeApartment({ unitNumber: 'x'.repeat(21) }),
            ),
        ).toThrow();
    });

    it('rejects empty unitNumber', () => {
        expect(() =>
            ApartmentSchema.parse(makeApartment({ unitNumber: '' })),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Room
// ─────────────────────────────────────────────────────────────────────────────

describe('RoomSchema', () => {
    function makeRoomParameters(): unknown {
        return {
            id: 'rm_master-br',
            apartmentId: 'apt_unit-1a',
            type: 'master',                                  // RoomType enum
            name: 'Master Bedroom',
            areaM2: { value: 14, min: 10, max: 20 },         // ParameterEnvelope
            widthM: { value: 3.5, min: 2.5, max: 4.5 },
            depthM: { value: 4, min: 3, max: 5 },
            daylightRequired: true,
            privacyTier: 4,                                  // int 1-4 (4 = master/ensuite)
        };
    }

    function makeRoom(over: Record<string, unknown> = {}) {
        return {
            id: 'rm_master-br',
            levelId: 'lvl_ground',
            apartmentId: 'apt_unit-1a',
            name: 'Master Bedroom',
            parameters: makeRoomParameters(),
            createdAt: '2026-06-01T12:00:00.000Z',
            updatedAt: '2026-06-01T12:00:00.000Z',
            ...over,
        };
    }

    it('parses a canonical Room', () => {
        const parsed = RoomSchema.parse(makeRoom());
        expect(parsed.id).toBe('rm_master-br');
        expect(parsed.apartmentId).toBe('apt_unit-1a');
        expect(parsed.parameters.type).toBe('master');
    });

    it('rejects unknown RoomType', () => {
        expect(() =>
            RoomSchema.parse(
                makeRoom({
                    parameters: {
                        ...(makeRoomParameters() as Record<string, unknown>),
                        type: 'foyer',           // not in RoomType enum
                    },
                }),
            ),
        ).toThrow();
    });

    it('rejects empty name', () => {
        expect(() =>
            RoomSchema.parse(makeRoom({ name: '' })),
        ).toThrow();
    });

    it('rejects privacyTier outside [1, 4]', () => {
        expect(() =>
            RoomSchema.parse(
                makeRoom({
                    parameters: {
                        ...(makeRoomParameters() as Record<string, unknown>),
                        privacyTier: 5,
                    },
                }),
            ),
        ).toThrow();
    });

    // NOTE: public-corridor case (apartmentId=null) deferred to A.23.b
    // along with the RoomParameters.apartmentId nullable-widening. See
    // Room.ts header comment for the C20 §2.4 divergence note.
});
