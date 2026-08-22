// @pryzm/geometry-lift — data-layer acceptance tests (residential-building P2).
//
// Covers LiftStore (mirror of StairStore §F4/F24/IFC discipline), LiftTypeStore
// (mirror of StairTypeStore CRUD + immutability), and the built-in type defaults.
// Mesh building (THREE) is validated in-browser per the P2 gate — not here.

import { describe, it, expect, beforeEach } from 'vitest';
import { LiftStore } from '../src/LiftStore';
import { LiftTypeStore } from '../src/LiftTypeStore';
import { BUILT_IN_LIFT_TYPES } from '../src/LiftTypeDefinitions';
import type { LiftData } from '../src/LiftTypes';

function makeLift(overrides: Partial<LiftData> = {}): LiftData {
    const now = new Date().toISOString();
    return {
        id: overrides.id ?? 'lift_test_1',
        type: 'verticalCirculation',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L3',
        kind: 'passenger',
        origin: { x: 0, y: 0, z: 0 },
        rotation: 0,
        shaftWidth: 1.8,
        shaftDepth: 1.8,
        carCapacityPersons: 8,
        doorWidth: 0.9,
        properties: {},
        metadata: { createdAt: now, modifiedAt: now, version: 0, source: 'user' },
        ...overrides,
    };
}

const ctx = { activeLevelId: 'L0' };

describe('LiftStore', () => {
    let store: LiftStore;
    beforeEach(() => { store = new LiftStore(ctx); });

    it('add() assigns ifcClass IfcTransportElement + a LF mark', () => {
        store.add(makeLift());
        const lift = store.get('lift_test_1')!;
        expect(lift.ifcData?.ifcClass).toBe('IfcTransportElement');
        expect(lift.ifcData?.guid).toBeTruthy();
        expect(lift.properties.mark).toBe('LF001');
    });

    it('add() rejects a lift with no base level', () => {
        expect(() => store.add(makeLift({ baseLevelId: '' }))).toThrow(/base level/i);
    });

    it('add() clones the input (caller mutation cannot corrupt the store)', () => {
        const input = makeLift();
        store.add(input);
        input.shaftWidth = 99;
        expect(store.get('lift_test_1')!.shaftWidth).toBe(1.8);
    });

    it('update() bumps version on every update', () => {
        store.add(makeLift());
        const v1 = store.update('lift_test_1', { shaftWidth: 2.0 })!;
        expect(v1.metadata.version).toBe(1);
        expect(v1.shaftWidth).toBe(2.0);
        const v2 = store.update('lift_test_1', { kind: 'goods' })!;
        expect(v2.metadata.version).toBe(2);
    });

    it('getLiftConnectingLevels finds a lift spanning base↔top', () => {
        store.add(makeLift());
        expect(store.getLiftConnectingLevels('L0', 'L3')?.id).toBe('lift_test_1');
        expect(store.getLiftConnectingLevels('L0', 'L9')).toBeUndefined();
    });

    it('getByLevel matches both base and top membership', () => {
        store.add(makeLift());
        expect(store.getByLevel('L0').length).toBe(1);
        expect(store.getByLevel('L3').length).toBe(1);
        expect(store.getByLevel('L7').length).toBe(0);
    });

    it('remove() deletes + subscribers receive the lifecycle events', () => {
        const events: string[] = [];
        store.subscribe((ev) => events.push(ev));
        store.add(makeLift());
        store.update('lift_test_1', { rotation: 0.5 });
        store.remove('lift_test_1');
        expect(events).toEqual(['add', 'update', 'remove']);
        expect(store.get('lift_test_1')).toBeUndefined();
    });
});

describe('LiftTypeStore', () => {
    let ts: LiftTypeStore;
    beforeEach(() => { ts = new LiftTypeStore(); });

    // §FEAT-LIFT-COMPOUND-SYSTEM (L-5701) — this case USED to read
    // `toEqual(['accessible', 'goods', 'passenger-8'])` and went red when
    // `passenger-6` was added. It went red CORRECTLY: a hard-coded set is exactly the
    // right guard for a census, because adding a lift type is a decision that should
    // have to be made twice.
    //
    // ⭐ SO THE SET IS UPDATED, NOT RELAXED — the assertion still fails on an
    // unannounced addition. What is ALSO pinned now is the half that actually matters,
    // which the bare census could not express: that adding the founder's 6-person
    // default did NOT displace the two standards-cited types. `accessible` cites
    // EN 81-70 for its 1.1 x 1.4 m clear car (regulatory), and `passenger-8` is what
    // `LiftToolPlacement.DEFAULT_TYPE_ID` pins for the residential-building generator.
    // A future edit that "simplifies" the list by dropping either one fails here with
    // a reason attached rather than with a diff.
    it('ships the built-in types — passenger-6 ADDED, the standards-cited pair UNTOUCHED', () => {
        const ids = ts.getAll().map((t) => t.id).sort();
        expect(ids).toEqual(['accessible', 'goods', 'passenger-6', 'passenger-8']);

        // The regulatory car keeps its EN 81-70 clear dimensions.
        const accessible = ts.getAll().find((t) => t.id === 'accessible')!;
        expect(accessible.defaults.shaftWidth).toBeCloseTo(1.8, 10);
        expect(accessible.defaults.shaftDepth).toBeCloseTo(2.0, 10);

        // The generator's type keeps its capacity.
        expect(ts.getAll().find((t) => t.id === 'passenger-8')!.defaults.carCapacityPersons)
            .toBe(8);
        // …and the new one really is the 6-person car the founder asked for.
        expect(ts.getAll().find((t) => t.id === 'passenger-6')!.defaults.carCapacityPersons)
            .toBe(6);
    });

    it('every built-in type has positive shaft + door defaults', () => {
        for (const t of BUILT_IN_LIFT_TYPES) {
            expect(t.defaults.shaftWidth).toBeGreaterThan(0);
            expect(t.defaults.shaftDepth).toBeGreaterThan(0);
            expect(t.defaults.doorWidth).toBeGreaterThan(0);
            expect(t.defaults.shaftWidth).toBeGreaterThanOrEqual(t.defaults.doorWidth);
            expect(t.kind).toMatch(/passenger|accessible|goods/);
        }
    });

    it('refuses to overwrite or remove a built-in type', () => {
        expect(() => ts.add({ ...BUILT_IN_LIFT_TYPES[0]! })).toThrow(/built-in/i);
        expect(() => ts.remove('passenger-8')).toThrow(/built-in/i);
    });

    it('add()/remove() a custom type round-trips', () => {
        ts.add({
            id: 'panoramic',
            name: 'Panoramic Glass Lift',
            kind: 'passenger',
            defaults: { shaftWidth: 2.0, shaftDepth: 2.0, carCapacityPersons: 10, doorWidth: 1.0, material: 'glass' },
            rules: { minDoorWidth: 0.9, minShaftDim: 1.6 },
        });
        expect(ts.get('panoramic')?.name).toBe('Panoramic Glass Lift');
        expect(ts.resolveDefaults('panoramic')?.material).toBe('glass');
        expect(ts.remove('panoramic')).toBe(true);
        expect(ts.get('panoramic')).toBeUndefined();
    });
});
