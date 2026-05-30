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

    // D-α-2 (BIM 2/3) — patch-merge update for apartment.updateParameter.
    describe('updateApartment (D-α-2)', () => {
        beforeEach(() => { store.setApartment(validApt()); });

        it('accepts a partial patch + persists the merged record', () => {
            const r = store.updateApartment('apt-1', { bedrooms: 3 });
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.prior.bedrooms).toBe(2);
                expect(store.getApartment('apt-1')!.bedrooms).toBe(3);
                // Other fields preserved
                expect(store.getApartment('apt-1')!.bathrooms).toBe(1);
            }
        });

        it('multi-field patch updates every named field', () => {
            const r = store.updateApartment('apt-1', { bedrooms: 4, bathrooms: 2, typology: 'duplex' });
            expect(r.ok).toBe(true);
            const next = store.getApartment('apt-1')!;
            expect(next.bedrooms).toBe(4);
            expect(next.bathrooms).toBe(2);
            expect(next.typology).toBe('duplex');
        });

        it('rejects with not-found when the apartment does not exist', () => {
            const r = store.updateApartment('apt-X', { bedrooms: 3 });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('not-found');
        });

        it('rejects with invalid + detail when the patch violates schema', () => {
            const r = store.updateApartment('apt-1', { bedrooms: -1 });
            expect(r.ok).toBe(false);
            if (!r.ok && r.reason === 'invalid') {
                expect(r.detail).toMatch(/bedrooms/i);
            }
            // Store unchanged.
            expect(store.getApartment('apt-1')!.bedrooms).toBe(2);
        });

        it('rejects envelope value outside [min, max]', () => {
            const r = store.updateApartment('apt-1', {
                shellAreaM2: { value: 30, min: 60, max: 120 },
            });
            expect(r.ok).toBe(false);
        });

        it('strips id from the patch defensively (cannot rename via update)', () => {
            const r = store.updateApartment('apt-1', { id: 'apt-2', bedrooms: 3 });
            expect(r.ok).toBe(true);
            expect(store.getApartment('apt-1')!.bedrooms).toBe(3);
            expect(store.getApartment('apt-2')).toBeUndefined();
        });

        it('notifies subscribers on accepted update + NOT on rejection', () => {
            let count = 0;
            store.subscribe(() => { count++; });
            store.updateApartment('apt-1', { bedrooms: 3 });
            expect(count).toBe(1);
            store.updateApartment('apt-1', { bedrooms: -1 });   // invalid
            expect(count).toBe(1);
            store.updateApartment('apt-X', { bedrooms: 3 });    // not found
            expect(count).toBe(1);
        });

        it('returns prior record so caller can implement undo', () => {
            const r = store.updateApartment('apt-1', { bedrooms: 5 });
            if (r.ok) {
                // Undo: re-apply the prior
                store.setApartment(r.prior);
                expect(store.getApartment('apt-1')!.bedrooms).toBe(2);
            }
        });
    });
});
