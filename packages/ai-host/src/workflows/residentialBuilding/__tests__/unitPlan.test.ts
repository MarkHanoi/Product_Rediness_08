// L-864 / UNIT CONTAINMENT — the plate partitioner KNOWS which rooms form an apartment
// (`PerLevelApartments.apartments[]`, one entry per placed cell) and the executor used to
// DISCARD that grouping, shipping every room flat under its level ("Unassigned rooms on
// Level 01"). `planBuildingUnits` is the pure carrier of that grouping: one PlannedUnit per
// PLACED apartment, in the SAME order the executor walks `perLevel.apartments`, so the
// executor can mint a hierarchy Unit per apartment and stamp `room.unitId` on the rooms it
// builds from that apartment's layout.
//
// C81 §8 records unit containment as a HARD PRECONDITION for the edit layer: "combine these
// two apartments" is meaningless against a model with no concept of an apartment.

import { describe, it, expect } from 'vitest';
import {
    planBuildingUnits,
    unitTypeForBedrooms,
    unitLetter,
    type PlannedUnit,
} from '../unitPlan.js';
import type { PerLevelApartments, PlacedApartment } from '../residentialBuildingOrchestrator.js';

// ── Fixtures ────────────────────────────────────────────────────────────────────────────

function room(type: string, name = type): any {
    return { name, type, area: 12, windowCount: 1, hasDirectAccess: true, adjacentTo: [] };
}

function apt(
    typology: 'T1' | 'T2' | 'T3' | 'T4',
    bedroomTypes: readonly string[],
    opts: { status?: 'ok' | 'rejected'; rect?: { x0: number; z0: number; x1: number; z1: number } } = {},
): PlacedApartment {
    const rect = opts.rect ?? { x0: 0, z0: 0, x1: 10, z1: 7 };
    const status = opts.status ?? 'ok';
    return {
        typology,
        targetAreaM2: 70,
        program: { bedrooms: bedroomTypes.length } as any,
        cell: { rect, typology, targetAreaM2: 70 } as any,
        layout: status === 'ok'
            ? ({
                rooms: [
                    ...bedroomTypes.map(t => room(t)),
                    room('living'), room('kitchen'), room('bathroom'), room('hall'),
                ],
                walls: [],
                windows: [],
                score: 1,
            } as any)
            : undefined,
        status,
        rejectReason: status === 'rejected' ? 'D-TGL produced no layout for this cell' : undefined,
        facadeEdges: [],
        blindEdges: [],
    } as PlacedApartment;
}

function level(levelIndex: number, apartments: readonly PlacedApartment[]): PerLevelApartments {
    return {
        levelIndex,
        role: levelIndex === 0 ? 'ground' : 'upper',
        apartments,
        publicCorridor: [],
    } as PerLevelApartments;
}

// ── unitLetter ──────────────────────────────────────────────────────────────────────────

describe('unitLetter', () => {
    it('maps 0..25 to A..Z', () => {
        expect(unitLetter(0)).toBe('A');
        expect(unitLetter(4)).toBe('E');
        expect(unitLetter(25)).toBe('Z');
    });
    it('rolls over past Z without colliding', () => {
        expect(unitLetter(26)).toBe('AA');
        expect(unitLetter(27)).toBe('AB');
        expect(unitLetter(26)).not.toBe(unitLetter(0));
    });
});

// ── unitTypeForBedrooms ─────────────────────────────────────────────────────────────────

describe('unitTypeForBedrooms', () => {
    it('names a 0-bed a studio and n-bed an "n-bed"', () => {
        expect(unitTypeForBedrooms(0)).toBe('studio');
        expect(unitTypeForBedrooms(1)).toBe('1-bed');
        expect(unitTypeForBedrooms(3)).toBe('3-bed');
    });
});

// ── planBuildingUnits ───────────────────────────────────────────────────────────────────

describe('planBuildingUnits', () => {
    it('THE FINDING (L-864): five apartments on a level yield FIVE distinct units, not one flat bag of rooms', () => {
        const l1 = level(1, [
            apt('T2', ['master', 'bedroom']),
            apt('T2', ['master', 'bedroom']),
            apt('T1', ['master']),
            apt('T3', ['master', 'bedroom', 'bedroom']),
            apt('T1', ['master']),
        ]);
        const units = planBuildingUnits([l1]);
        expect(units).toHaveLength(5);
        expect(new Set(units.map(u => u.unitNumber)).size).toBe(5);
        expect(units.map(u => u.unitNumber)).toEqual(['01A', '01B', '01C', '01D', '01E']);
        expect(units.every(u => u.levelIndex === 1)).toBe(true);
        expect(units.map(u => u.indexOnLevel)).toEqual([0, 1, 2, 3, 4]);
    });

    it('numbers units per level, so level 2 restarts at A but never collides with level 1', () => {
        const units = planBuildingUnits([
            level(1, [apt('T1', ['master']), apt('T1', ['master'])]),
            level(2, [apt('T1', ['master'])]),
        ]);
        expect(units.map(u => u.unitNumber)).toEqual(['01A', '01B', '02A']);
        expect(new Set(units.map(u => u.unitNumber)).size).toBe(3);
    });

    it('derives the unit type from the SHIPPED layout, not the pinned typology', () => {
        // A T3 cell whose engine layout came back as a 2-bed (§RESI-CELL-PROGRAM-SCALE
        // scales the program DOWN to the cell area) must READ as a 2-bed, not a 3-bed.
        const units = planBuildingUnits([level(1, [apt('T3', ['master', 'bedroom'])])]);
        expect(units[0]!.bedrooms).toBe(2);
        expect(units[0]!.unitType).toBe('2-bed');
        expect(units[0]!.typology).toBe('T3');
    });

    it('counts a studio (no bedroom rooms) as 0-bed', () => {
        const units = planBuildingUnits([level(1, [apt('T1', [])])]);
        expect(units[0]!.bedrooms).toBe(0);
        expect(units[0]!.unitType).toBe('studio');
    });

    it('gives a REJECTED cell no unit — and does not shift the letters of the units after it', () => {
        const units = planBuildingUnits([level(1, [
            apt('T1', ['master']),
            apt('T2', ['master', 'bedroom'], { status: 'rejected' }),
            apt('T1', ['master']),
        ])]);
        expect(units).toHaveLength(2);
        expect(units.map(u => u.unitNumber)).toEqual(['01A', '01B']);
        // indexOnLevel indexes the PLACED apartments (what the executor iterates and builds),
        // so the executor can zip units to apartmentBuilds positionally.
        expect(units.map(u => u.indexOnLevel)).toEqual([0, 1]);
    });

    it('emits nothing for a level with no apartments (the ground floor)', () => {
        expect(planBuildingUnits([level(0, [])])).toEqual([]);
        expect(planBuildingUnits([])).toEqual([]);
    });

    it('carries the cell gross area (m²) so the unit node is not shipped blank', () => {
        const units = planBuildingUnits([level(1, [
            apt('T2', ['master', 'bedroom'], { rect: { x0: 0, z0: 0, x1: 12, z1: 8 } }),
        ])]);
        expect(units[0]!.grossUnitAreaM2).toBeCloseTo(96, 3);
        expect(units[0]!.roomCount).toBe(6);
        expect(units[0]!.name).toBe('Apartment 01A');
    });

    it('is deterministic — the same input yields byte-identical plans', () => {
        const input = [level(1, [apt('T2', ['master', 'bedroom']), apt('T1', ['master'])])];
        const a: PlannedUnit[] = planBuildingUnits(input);
        const b: PlannedUnit[] = planBuildingUnits(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
