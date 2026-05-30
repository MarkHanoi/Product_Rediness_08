// D-α-1 (BIM 2/3) — RoomParametersStore tests.

import { describe, expect, it, beforeEach } from 'vitest';
import { RoomParametersStore } from '../src/RoomParametersStore.js';
import type { RoomParameters } from '@pryzm/schemas/apartment';

const validRoom = (over: Partial<RoomParameters> = {}): RoomParameters => ({
    id: 'r-master',
    apartmentId: 'apt-1',
    type: 'master',
    name: 'Master Bedroom',
    areaM2: { value: 16, min: 12, max: 30 },
    widthM:  { value: 3.5, min: 2.75, max: 5.0 },
    depthM:  { value: 4.6, min: 3.0, max: 6.0 },
    daylightRequired: true,
    privacyTier: 3,
    ...over,
});

describe('RoomParametersStore (D-α-1)', () => {
    let store: RoomParametersStore;
    beforeEach(() => { store = new RoomParametersStore(); });

    it('storeKey is "roomParameters"', () => {
        expect(store.storeKey).toBe('roomParameters');
    });

    it('setRoom with valid record returns true + persists', () => {
        const ok = store.setRoom(validRoom());
        expect(ok).toBe(true);
        expect(store.getRoom('r-master')).toEqual(validRoom());
    });

    it('setRoom rejects invalid (privacyTier out of range)', () => {
        const ok = store.setRoom({ ...validRoom(), privacyTier: 99 } as RoomParameters);
        expect(ok).toBe(false);
        expect(store.getRoom('r-master')).toBeUndefined();
    });

    it('setMany skips invalid rooms + returns count of accepted', () => {
        const set = store.setMany([
            validRoom({ id: 'r-1' }),
            { ...validRoom({ id: 'r-2' }), privacyTier: 99 } as RoomParameters,   // invalid
            validRoom({ id: 'r-3' }),
        ]);
        expect(set).toBe(2);
        expect(store.list().map(r => r.id).sort()).toEqual(['r-1', 'r-3']);
    });

    it('forApartment filters by foreign key', () => {
        store.setMany([
            validRoom({ id: 'a1-r1', apartmentId: 'apt-A' }),
            validRoom({ id: 'a1-r2', apartmentId: 'apt-A' }),
            validRoom({ id: 'a2-r1', apartmentId: 'apt-B' }),
        ]);
        expect(store.forApartment('apt-A').map(r => r.id).sort())
            .toEqual(['a1-r1', 'a1-r2']);
        expect(store.forApartment('apt-B').map(r => r.id).sort())
            .toEqual(['a2-r1']);
        expect(store.forApartment('apt-X')).toHaveLength(0);
    });

    it('removeForApartment drops every room owned by that apartment', () => {
        store.setMany([
            validRoom({ id: 'a1-r1', apartmentId: 'apt-A' }),
            validRoom({ id: 'a1-r2', apartmentId: 'apt-A' }),
            validRoom({ id: 'a2-r1', apartmentId: 'apt-B' }),
        ]);
        expect(store.removeForApartment('apt-A')).toBe(2);
        expect(store.list().map(r => r.id)).toEqual(['a2-r1']);
    });

    it('subscribe fires once per accepted setMany', () => {
        let count = 0;
        store.subscribe(() => { count++; });
        store.setMany([
            validRoom({ id: 'r-1' }),
            validRoom({ id: 'r-2' }),
        ]);
        expect(count).toBe(1);
    });

    it('subscribe does NOT fire on setMany when ALL rooms are invalid', () => {
        let count = 0;
        store.subscribe(() => { count++; });
        store.setMany([
            { ...validRoom({ id: 'r-1' }), type: 'cinema' } as unknown as RoomParameters,
        ]);
        expect(count).toBe(0);
    });

    it('records are frozen', () => {
        store.setRoom(validRoom());
        expect(Object.isFrozen(store.getRoom('r-master'))).toBe(true);
    });

    it('clear() removes every record + notifies', () => {
        let notified = 0;
        store.subscribe(() => { notified++; });
        store.setMany([validRoom({ id: 'r-1' }), validRoom({ id: 'r-2' })]);
        store.clear();
        expect(store.list()).toHaveLength(0);
        expect(notified).toBe(2);                          // 1 setMany + 1 clear
    });

    it('listener errors are swallowed', () => {
        let goodCalls = 0;
        store.subscribe(() => { throw new Error('boom'); });
        store.subscribe(() => { goodCalls++; });
        store.setRoom(validRoom());
        expect(goodCalls).toBe(1);
    });

    // D-α-2 (BIM 2/3) — patch-merge update for room.updateParameter.
    describe('updateRoom (D-α-2)', () => {
        beforeEach(() => { store.setRoom(validRoom()); });

        it('accepts a name rename + persists', () => {
            const r = store.updateRoom('r-master', { name: 'Primary Bedroom' });
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.prior.name).toBe('Master Bedroom');
                expect(store.getRoom('r-master')!.name).toBe('Primary Bedroom');
            }
        });

        it('accepts a type retype + persists', () => {
            const r = store.updateRoom('r-master', { type: 'study' });
            expect(r.ok).toBe(true);
            expect(store.getRoom('r-master')!.type).toBe('study');
        });

        it('rejects empty name (schema)', () => {
            const r = store.updateRoom('r-master', { name: '' });
            expect(r.ok).toBe(false);
            expect(store.getRoom('r-master')!.name).toBe('Master Bedroom');
        });

        it('rejects privacyTier out of range', () => {
            const r = store.updateRoom('r-master', { privacyTier: 99 });
            expect(r.ok).toBe(false);
        });

        it('rejects with not-found when the room is missing', () => {
            const r = store.updateRoom('r-other', { name: 'X' });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('not-found');
        });

        it('preserves other fields when patching a single field', () => {
            store.updateRoom('r-master', { name: 'Renamed' });
            const r = store.getRoom('r-master')!;
            expect(r.type).toBe('master');
            expect(r.areaM2.value).toBe(16);
            expect(r.privacyTier).toBe(3);
        });

        it('strips id from the patch defensively', () => {
            const r = store.updateRoom('r-master', { id: 'r-other', name: 'Renamed' });
            expect(r.ok).toBe(true);
            expect(store.getRoom('r-master')!.name).toBe('Renamed');
            expect(store.getRoom('r-other')).toBeUndefined();
        });

        it('notifies on accepted update + NOT on rejection', () => {
            let count = 0;
            store.subscribe(() => { count++; });
            store.updateRoom('r-master', { name: 'X' });
            store.updateRoom('r-master', { privacyTier: 99 });     // invalid
            store.updateRoom('r-X', { name: 'X' });                 // not found
            expect(count).toBe(1);
        });

        it('returns prior record so caller can implement undo', () => {
            const r = store.updateRoom('r-master', { name: 'X' });
            if (r.ok) {
                store.setRoom(r.prior);
                expect(store.getRoom('r-master')!.name).toBe('Master Bedroom');
            }
        });
    });
});
