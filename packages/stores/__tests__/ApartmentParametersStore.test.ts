// D-α-1 (BIM 2/3) — ApartmentParametersStore tests.

import { describe, expect, it, beforeEach } from 'vitest';
import { ApartmentParametersStore } from '../src/ApartmentParametersStore.js';
import type { ApartmentParameters } from '@pryzm/schemas/apartment';

const validApt = (over: Partial<ApartmentParameters> = {}): ApartmentParameters => ({
    id: 'apt-1',
    shellAreaM2: { value: 85, min: 60, max: 120 },
    bedrooms: 2,
    bathrooms: 1,
    masterEnSuite: true,
    openPlanKitchenDining: true,
    livingRoom: true,
    entranceHall: true,
    typology: 'open-plan-mid-rise',
    ...over,
});

describe('ApartmentParametersStore (D-α-1)', () => {
    let store: ApartmentParametersStore;
    beforeEach(() => { store = new ApartmentParametersStore(); });

    it('storeKey is "apartmentParameters"', () => {
        expect(store.storeKey).toBe('apartmentParameters');
    });

    it('setApartment with valid record returns true + persists', () => {
        const ok = store.setApartment(validApt());
        expect(ok).toBe(true);
        expect(store.getApartment('apt-1')).toEqual(validApt());
    });

    it('setApartment rejects invalid record + returns false + does NOT mutate', () => {
        // Negative bedrooms — fails schema.
        const ok = store.setApartment({ ...validApt(), bedrooms: -1 } as ApartmentParameters);
        expect(ok).toBe(false);
        expect(store.getApartment('apt-1')).toBeUndefined();
    });

    it('replace on same id updates the record', () => {
        store.setApartment(validApt({ bedrooms: 2 }));
        store.setApartment(validApt({ bedrooms: 3 }));
        expect(store.getApartment('apt-1')!.bedrooms).toBe(3);
    });

    it('list() returns every apartment record', () => {
        store.setApartment(validApt({ id: 'apt-A' }));
        store.setApartment(validApt({ id: 'apt-B' }));
        expect(store.list().map(a => a.id).sort()).toEqual(['apt-A', 'apt-B']);
    });

    it('remove() drops one record', () => {
        store.setApartment(validApt());
        store.remove('apt-1');
        expect(store.getApartment('apt-1')).toBeUndefined();
    });

    it('clear() removes every record', () => {
        store.setApartment(validApt({ id: 'a' }));
        store.setApartment(validApt({ id: 'b' }));
        store.clear();
        expect(store.list()).toHaveLength(0);
    });

    it('subscribe receives a notification on set / remove / clear', () => {
        let count = 0;
        const unsub = store.subscribe(() => { count++; });
        store.setApartment(validApt());
        store.remove('apt-1');
        store.setApartment(validApt());
        store.clear();
        unsub();
        store.setApartment(validApt());                  // no notification — unsubscribed
        expect(count).toBe(4);
    });

    it('subscribe does NOT notify when set is REJECTED (schema fail)', () => {
        let count = 0;
        store.subscribe(() => { count++; });
        store.setApartment({ ...validApt(), bedrooms: -1 } as ApartmentParameters);
        expect(count).toBe(0);
    });

    it('subscribe does NOT notify on clear() when already empty', () => {
        let count = 0;
        store.subscribe(() => { count++; });
        store.clear();
        expect(count).toBe(0);
    });

    it('records are frozen — direct mutation throws in strict mode', () => {
        store.setApartment(validApt());
        const rec = store.getApartment('apt-1')!;
        expect(Object.isFrozen(rec)).toBe(true);
    });

    it('listener errors are swallowed (one failing listener does NOT stop others)', () => {
        let goodCalls = 0;
        store.subscribe(() => { throw new Error('boom'); });
        store.subscribe(() => { goodCalls++; });
        store.setApartment(validApt());
        expect(goodCalls).toBe(1);
    });
});
