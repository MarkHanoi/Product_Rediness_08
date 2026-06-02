// A.23.b.2 (Phase A · Sprint 2) — ApartmentStore tests.

import { describe, expect, it, vi } from 'vitest';
import { ApartmentStore } from '../src/ApartmentStore.js';
import {
    ApartmentSchema,
    type Apartment,
} from '@pryzm/schemas/aggregates';

function makeApartmentParameters(over: Record<string, unknown> = {}) {
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
        ...over,
    };
}

function makeApartment(over: Partial<Apartment> = {}): Apartment {
    const id = over.id ?? 'apt_unit-1a';
    return ApartmentSchema.parse({
        id,
        buildingId: 'bldg_proj-001',
        levelId: 'lvl_ground',
        name: 'Unit 1A',
        unitNumber: '1A',
        parameters: makeApartmentParameters({ id }),
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
        ...over,
    });
}

describe('ApartmentStore — construction + CRUD', () => {
    it('starts empty', () => {
        const s = new ApartmentStore();
        expect(s.size()).toBe(0);
        expect(s.list()).toEqual([]);
    });

    it('add() stores + get() returns', () => {
        const s = new ApartmentStore();
        s.add(makeApartment());
        expect(s.get('apt_unit-1a' as never)?.unitNumber).toBe('1A');
    });

    it('add() throws on duplicate id', () => {
        const s = new ApartmentStore();
        s.add(makeApartment());
        expect(() => s.add(makeApartment())).toThrow(/already exists/i);
    });

    it('update() throws on unknown id', () => {
        const s = new ApartmentStore();
        expect(() => s.update(makeApartment())).toThrow(
            /cannot update unknown/i,
        );
    });

    it('remove() drops + notifies', () => {
        const s = new ApartmentStore();
        const listener = vi.fn();
        s.add(makeApartment());
        s.subscribe(listener);
        s.remove('apt_unit-1a' as never);
        expect(s.has('apt_unit-1a' as never)).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('ApartmentStore — list + scoped queries', () => {
    it('list() sorts by buildingId then unitNumber asc', () => {
        const s = new ApartmentStore();
        s.add(
            makeApartment({
                id: 'apt_b2', buildingId: 'bldg_b', unitNumber: '2A',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_a2', buildingId: 'bldg_a', unitNumber: '2A',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_a1', buildingId: 'bldg_a', unitNumber: '1A',
            }),
        );
        expect(s.list().map((a) => a.id)).toEqual([
            'apt_a1', 'apt_a2', 'apt_b2',
        ]);
    });

    it('listForLevel filters to one Level', () => {
        const s = new ApartmentStore();
        s.add(
            makeApartment({
                id: 'apt_g_1', levelId: 'lvl_ground', unitNumber: 'G1',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_1_1', levelId: 'lvl_l1', unitNumber: 'L1-1',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_g_2', levelId: 'lvl_ground', unitNumber: 'G2',
            }),
        );
        expect(
            s.listForLevel('lvl_ground' as never).map((a) => a.id).sort(),
        ).toEqual(['apt_g_1', 'apt_g_2']);
    });

    it('listForBuilding filters across Levels', () => {
        const s = new ApartmentStore();
        s.add(
            makeApartment({
                id: 'apt_g_1', buildingId: 'bldg_a', levelId: 'lvl_g',
                unitNumber: 'G1',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_1_1', buildingId: 'bldg_a', levelId: 'lvl_1',
                unitNumber: 'L1-1',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_b_1', buildingId: 'bldg_b', levelId: 'lvl_b_g',
                unitNumber: 'B1',
            }),
        );
        expect(
            s.listForBuilding('bldg_a' as never).map((a) => a.id),
        ).toEqual(['apt_g_1', 'apt_1_1']);
    });

    it('findByUnitNumber returns the matching Apartment', () => {
        const s = new ApartmentStore();
        s.add(
            makeApartment({
                id: 'apt_1a', buildingId: 'bldg_a', unitNumber: '1A',
            }),
        );
        s.add(
            makeApartment({
                id: 'apt_1b', buildingId: 'bldg_a', unitNumber: '1B',
            }),
        );
        expect(
            s.findByUnitNumber('bldg_a' as never, '1B')?.id,
        ).toBe('apt_1b');
        expect(
            s.findByUnitNumber('bldg_a' as never, '99Z'),
        ).toBeUndefined();
    });
});

describe('ApartmentStore — lifecycle', () => {
    it('reset() clears + notifies; empty-reset is a no-op', () => {
        const s = new ApartmentStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(listener).not.toHaveBeenCalled();
        s.add(makeApartment());
        s.reset();
        expect(s.size()).toBe(0);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('dispose() is idempotent', () => {
        const s = new ApartmentStore();
        s.dispose();
        expect(() => s.dispose()).not.toThrow();
    });
});
