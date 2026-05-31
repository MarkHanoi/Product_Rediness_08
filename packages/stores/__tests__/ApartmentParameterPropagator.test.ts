// D-α-3 P2 (BIM 2/3 §6) — ApartmentParameterPropagator tests.
//
// Confirms the propagator bridges store change-notifications to an injected
// `recomputeImpact` resolver and re-emits one `PropagationEvent` per diff.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApartmentParametersStore } from '../src/ApartmentParametersStore.js';
import { RoomParametersStore } from '../src/RoomParametersStore.js';
import {
    ApartmentParameterPropagator,
    type ImpactResolver,
    type PropagationEvent,
} from '../src/ApartmentParameterPropagator.js';
import type { ApartmentParameters, RoomParameters } from '@pryzm/schemas/apartment';

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

/** Default resolver that returns a non-empty impact for any non-id field. */
const yesResolver: ImpactResolver = (_change, _state) => ({
    affectedRoomIds: ['r-x'],
    affectedFields: ['areaM2'],
});

/** Resolver that always reports zero impact. */
const noResolver: ImpactResolver = () => ({ affectedRoomIds: [], affectedFields: [] });

describe('ApartmentParameterPropagator (D-α-3 P2)', () => {
    let aStore: ApartmentParametersStore;
    let rStore: RoomParametersStore;

    beforeEach(() => {
        aStore = new ApartmentParametersStore();
        rStore = new RoomParametersStore();
    });

    it('emits a PropagationEvent when an apartment field changes', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        aStore.setApartment(validApt({ bedrooms: 3 }));

        expect(events).toHaveLength(1);
        expect(events[0]!.apartmentId).toBe('apt-1');
        expect(events[0]!.change.path).toBe('apartment.bedrooms');
        expect(events[0]!.change.priorValue).toBe(2);
        expect(events[0]!.change.newValue).toBe(3);
        expect(events[0]!.impact.affectedRoomIds).toEqual(['r-x']);
        prop.dispose();
    });

    it('emits a PropagationEvent when a room field changes (path uses rooms.<id>.<field>)', () => {
        aStore.setApartment(validApt());
        rStore.setRoom(validRoom());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        rStore.setRoom(validRoom({ areaM2: { value: 18, min: 12, max: 30 } }));

        expect(events).toHaveLength(1);
        expect(events[0]!.apartmentId).toBe('apt-1');
        expect(events[0]!.change.path).toBe('rooms.r-master.areaM2');
        prop.dispose();
    });

    it('passes current state into the injected resolver (apartment + rooms[])', () => {
        aStore.setApartment(validApt());
        rStore.setRoom(validRoom());
        rStore.setRoom(validRoom({ id: 'r-bath', type: 'bathroom', name: 'Bathroom',
            areaM2: { value: 5, min: 3, max: 8 }, widthM: { value: 2, min: 1.5, max: 3 },
            depthM: { value: 2.5, min: 1.5, max: 3.5 }, privacyTier: 4 }));

        const spy = vi.fn(yesResolver);
        const prop = new ApartmentParameterPropagator(aStore, rStore, spy);
        prop.subscribe(() => {});

        aStore.setApartment(validApt({ bedrooms: 3 }));

        expect(spy).toHaveBeenCalledTimes(1);
        const [change, state] = spy.mock.calls[0]!;
        expect(change.apartmentId).toBe('apt-1');
        expect(change.path).toBe('apartment.bedrooms');
        expect((state.apartment as ApartmentParameters).bedrooms).toBe(3);
        expect((state.rooms as RoomParameters[]).map(r => r.id).sort()).toEqual(['r-bath', 'r-master']);
        prop.dispose();
    });

    it('does NOT emit when resolver returns empty impact', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, noResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        aStore.setApartment(validApt({ bedrooms: 3 }));

        expect(events).toHaveLength(0);
        prop.dispose();
    });

    it('does NOT emit for unchanged fields (one event per real diff)', () => {
        aStore.setApartment(validApt());
        rStore.setRoom(validRoom());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        // Re-set with IDENTICAL data — no diff, no event.
        aStore.setApartment(validApt());
        rStore.setRoom(validRoom());

        expect(events).toHaveLength(0);
        prop.dispose();
    });

    it('fans out one event to multiple listeners', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const a: PropagationEvent[] = [];
        const b: PropagationEvent[] = [];
        prop.subscribe(e => a.push(e));
        prop.subscribe(e => b.push(e));

        aStore.setApartment(validApt({ bedrooms: 3 }));

        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
        expect(a[0]!.change.path).toBe(b[0]!.change.path);
        prop.dispose();
    });

    it('unsubscribe stops further events to that listener but others continue', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const a: PropagationEvent[] = [];
        const b: PropagationEvent[] = [];
        const unsubA = prop.subscribe(e => a.push(e));
        prop.subscribe(e => b.push(e));

        aStore.setApartment(validApt({ bedrooms: 3 }));
        unsubA();
        aStore.setApartment(validApt({ bedrooms: 4 }));

        expect(a).toHaveLength(1);
        expect(b).toHaveLength(2);
        prop.dispose();
    });

    it('listener errors are swallowed (other listeners still notified)', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const good: PropagationEvent[] = [];
        prop.subscribe(() => { throw new Error('boom'); });
        prop.subscribe(e => good.push(e));

        expect(() => aStore.setApartment(validApt({ bedrooms: 3 }))).not.toThrow();
        expect(good).toHaveLength(1);
        warn.mockRestore();
        prop.dispose();
    });

    it('resolver throws → caught, warned, no event emitted', () => {
        aStore.setApartment(validApt());
        const throwing: ImpactResolver = () => { throw new Error('resolver kaput'); };
        const prop = new ApartmentParameterPropagator(aStore, rStore, throwing);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        expect(() => aStore.setApartment(validApt({ bedrooms: 3 }))).not.toThrow();
        expect(events).toHaveLength(0);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
        prop.dispose();
    });

    it('dispose() unsubscribes from BOTH stores — no more events fire', () => {
        aStore.setApartment(validApt());
        rStore.setRoom(validRoom());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        prop.dispose();
        aStore.setApartment(validApt({ bedrooms: 3 }));
        rStore.setRoom(validRoom({ areaM2: { value: 20, min: 12, max: 30 } }));

        expect(events).toHaveLength(0);
    });

    it('first store-notify after construct uses constructor-time baseline (no spurious events for unchanged values)', () => {
        // Construct AFTER stores are populated — propagator must seed its
        // lastSeen from the current state, not from "empty".
        aStore.setApartment(validApt());
        rStore.setRoom(validRoom());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        // Touch the apartment store with an unrelated apartment — that's an
        // ADD (no prior snapshot), so it should NOT emit a diff event.
        aStore.setApartment(validApt({ id: 'apt-2' }));

        expect(events).toHaveLength(0);
        prop.dispose();
    });

    it('emits even if subscribe() is called BEFORE the change (no late-bind needed)', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        const events: PropagationEvent[] = [];
        prop.subscribe(e => events.push(e));

        aStore.setApartment(validApt({ bedrooms: 4 }));

        expect(events).toHaveLength(1);
        prop.dispose();
    });

    it('frozen event payload — listeners cannot mutate change/impact mid-fanout', () => {
        aStore.setApartment(validApt());
        const prop = new ApartmentParameterPropagator(aStore, rStore, yesResolver);
        let captured: PropagationEvent | null = null;
        prop.subscribe(e => { captured = e; });

        aStore.setApartment(validApt({ bedrooms: 3 }));

        expect(captured).not.toBeNull();
        expect(Object.isFrozen(captured!)).toBe(true);
        expect(Object.isFrozen(captured!.change)).toBe(true);
        expect(Object.isFrozen(captured!.impact)).toBe(true);
        prop.dispose();
    });
});
