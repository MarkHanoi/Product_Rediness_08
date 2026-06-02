// A.23.b.2 (Phase A · Sprint 2) — RoomStore tests.

import { describe, expect, it, vi } from 'vitest';
import { RoomStore } from '../src/RoomStore.js';
import {
    RoomSchema,
    type Room,
} from '@pryzm/schemas/aggregates';

function makeRoomParameters(over: Record<string, unknown> = {}) {
    return {
        id: 'rm_master',
        apartmentId: 'apt_unit-1a',
        type: 'master',
        name: 'Master Bedroom',
        areaM2: { value: 14, min: 10, max: 20 },
        widthM: { value: 3.5, min: 2.5, max: 4.5 },
        depthM: { value: 4, min: 3, max: 5 },
        daylightRequired: true,
        privacyTier: 4,
        ...over,
    };
}

function makeRoom(over: Partial<Room> = {}): Room {
    const id = over.id ?? 'rm_master';
    return RoomSchema.parse({
        id,
        levelId: 'lvl_ground',
        apartmentId: 'apt_unit-1a',
        name: 'Master Bedroom',
        parameters: makeRoomParameters({
            id,
            apartmentId: over.apartmentId ?? 'apt_unit-1a',
        }),
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
        ...over,
    });
}

describe('RoomStore — construction + CRUD', () => {
    it('starts empty', () => {
        const s = new RoomStore();
        expect(s.size()).toBe(0);
    });

    it('add() + get() round-trip', () => {
        const s = new RoomStore();
        s.add(makeRoom());
        expect(s.get('rm_master' as never)?.name).toBe('Master Bedroom');
    });

    it('add() throws on duplicate id', () => {
        const s = new RoomStore();
        s.add(makeRoom());
        expect(() => s.add(makeRoom())).toThrow(/already exists/i);
    });

    it('update() throws on unknown id', () => {
        const s = new RoomStore();
        expect(() => s.update(makeRoom())).toThrow(/cannot update unknown/i);
    });
});

describe('RoomStore — scoped queries + sort', () => {
    it('list() sorts by levelId then name (case-insensitive)', () => {
        const s = new RoomStore();
        s.add(
            makeRoom({
                id: 'rm_b', levelId: 'lvl_1', name: 'Bedroom',
            }),
        );
        s.add(
            makeRoom({
                id: 'rm_a', levelId: 'lvl_0', name: 'Kitchen',
            }),
        );
        s.add(
            makeRoom({
                id: 'rm_c', levelId: 'lvl_0', name: 'living',
            }),
        );
        expect(s.list().map((r) => r.id)).toEqual([
            'rm_a',     // lvl_0 / Kitchen
            'rm_c',     // lvl_0 / living (case-insensitive: L > K)
            'rm_b',     // lvl_1
        ]);
    });

    it('listForLevel filters to one Level', () => {
        const s = new RoomStore();
        s.add(makeRoom({ id: 'rm_g_1', levelId: 'lvl_g' }));
        s.add(makeRoom({ id: 'rm_1_1', levelId: 'lvl_1' }));
        s.add(makeRoom({ id: 'rm_g_2', levelId: 'lvl_g' }));
        expect(
            s.listForLevel('lvl_g' as never).map((r) => r.id).sort(),
        ).toEqual(['rm_g_1', 'rm_g_2']);
    });

    it('listForApartment filters to one Apartment', () => {
        const s = new RoomStore();
        s.add(makeRoom({ id: 'rm_a_1', apartmentId: 'apt_a' }));
        s.add(makeRoom({ id: 'rm_b_1', apartmentId: 'apt_b' }));
        s.add(makeRoom({ id: 'rm_a_2', apartmentId: 'apt_a' }));
        expect(
            s.listForApartment('apt_a' as never).map((r) => r.id).sort(),
        ).toEqual(['rm_a_1', 'rm_a_2']);
    });
});

describe('RoomStore — removeForApartment cascade', () => {
    it('removes all Rooms belonging to an Apartment + returns count', () => {
        const s = new RoomStore();
        s.add(makeRoom({ id: 'rm_a_1', apartmentId: 'apt_a' }));
        s.add(makeRoom({ id: 'rm_b_1', apartmentId: 'apt_b' }));
        s.add(makeRoom({ id: 'rm_a_2', apartmentId: 'apt_a' }));
        const count = s.removeForApartment('apt_a' as never);
        expect(count).toBe(2);
        expect(s.size()).toBe(1);
        expect(s.get('rm_b_1' as never)).toBeDefined();
    });

    it('returns 0 when no Rooms match (no listener fire)', () => {
        const s = new RoomStore();
        s.add(makeRoom({ id: 'rm_a_1', apartmentId: 'apt_a' }));
        const listener = vi.fn();
        s.subscribe(listener);
        const count = s.removeForApartment('apt_other' as never);
        expect(count).toBe(0);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('RoomStore — lifecycle', () => {
    it('reset() clears + notifies once', () => {
        const s = new RoomStore();
        s.add(makeRoom({ id: 'rm_a' }));
        s.add(makeRoom({ id: 'rm_b' }));
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(s.size()).toBe(0);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('reset() on empty is a no-op', () => {
        const s = new RoomStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(listener).not.toHaveBeenCalled();
    });

    it('dispose() is idempotent', () => {
        const s = new RoomStore();
        s.dispose();
        expect(() => s.dispose()).not.toThrow();
    });
});
