// A.R.3 (Revit round-trip · S55) — L3 IfcMetaStore tests.
//
// Pins the round-trip-critical behaviour: GlobalId index for re-export
// matching, pset/quantity mutation immutability, serialize↔hydrate fidelity
// (the `.pryzm` persistence path), project-switch reset, and post-dispose
// safety. This is the store the 2026-06-02 interop audit named the highest-
// leverage unlock (tracker §12.6 A.R.3).

import { describe, expect, it, beforeEach } from 'vitest';
import { IfcMetaStore } from '../src/IfcMetaStore.js';
import type { IfcElementMeta } from '@pryzm/schemas/ifc';

// ── Fixtures ────────────────────────────────────────────────────────────

const wall = (over: Partial<IfcElementMeta> = {}): IfcElementMeta => ({
    pryzmElementId: 'wall_01',
    globalId: '0YvctVUKr0kugbFTf53O9L',
    typeName: 'IFCWALLSTANDARDCASE',
    psets: { Pset_WallCommon: { LoadBearing: true, FireRating: '60' } },
    tier: 1,
    ...over,
});

describe('IfcMetaStore — read/write + GlobalId index', () => {
    let store: IfcMetaStore;
    beforeEach(() => { store = new IfcMetaStore(); });

    it('add() then get() round-trips the row', () => {
        store.add(wall());
        expect(store.get('wall_01')?.typeName).toBe('IFCWALLSTANDARDCASE');
        expect(store.size()).toBe(1);
        expect(store.has('wall_01')).toBe(true);
    });

    it('getByGlobalId() resolves the element by its IFC GlobalId (the re-export join)', () => {
        store.add(wall());
        const got = store.getByGlobalId('0YvctVUKr0kugbFTf53O9L');
        expect(got?.pryzmElementId).toBe('wall_01');
    });

    it('replacing an element under a NEW globalId drops the stale index entry', () => {
        store.add(wall());
        store.add(wall({ globalId: 'NEWGUID0000000000000aa' }));
        expect(store.getByGlobalId('0YvctVUKr0kugbFTf53O9L')).toBeUndefined();
        expect(store.getByGlobalId('NEWGUID0000000000000aa')?.pryzmElementId).toBe('wall_01');
        expect(store.size()).toBe(1);
    });

    it('addMany() bulk-loads and returns the count', () => {
        const n = store.addMany([wall(), wall({ pryzmElementId: 'wall_02', globalId: 'G2' })]);
        expect(n).toBe(2);
        expect(store.size()).toBe(2);
        expect(store.list().map((m) => m.pryzmElementId).sort()).toEqual(['wall_01', 'wall_02']);
    });
});

describe('IfcMetaStore — pset/quantity mutation (immutable copies)', () => {
    let store: IfcMetaStore;
    beforeEach(() => { store = new IfcMetaStore(); });

    it('updatePset() inserts a property without mutating the prior object', () => {
        store.add(wall());
        const before = store.get('wall_01')!;
        store.updatePset('wall_01', 'Pset_WallCommon', 'ThermalTransmittance', 0.18);
        expect(store.get('wall_01')!.psets.Pset_WallCommon.ThermalTransmittance).toBe(0.18);
        // original pset object was not mutated in place (copy-on-write)
        expect(before.psets.Pset_WallCommon.ThermalTransmittance).toBeUndefined();
    });

    it('updateQuantity() creates the qset on demand', () => {
        store.add(wall());
        store.updateQuantity('wall_01', 'Qto_WallBaseQuantities', 'NetVolume', 2.4);
        expect(store.get('wall_01')!.quantities?.Qto_WallBaseQuantities.NetVolume).toBe(2.4);
    });

    it('updatePset()/updateQuantity() are no-ops for unknown elements', () => {
        store.updatePset('ghost', 'P', 'k', 1);
        store.updateQuantity('ghost', 'Q', 'k', 1);
        expect(store.size()).toBe(0);
    });

    it('delete() removes the row + its globalId index entry', () => {
        store.add(wall());
        expect(store.delete('wall_01')).toBe(true);
        expect(store.get('wall_01')).toBeUndefined();
        expect(store.getByGlobalId('0YvctVUKr0kugbFTf53O9L')).toBeUndefined();
        expect(store.delete('wall_01')).toBe(false);
    });
});

describe('IfcMetaStore — persistence (.pryzm serialize ↔ hydrate)', () => {
    it('serialize() → hydrate() preserves rows + the globalId index', () => {
        const a = new IfcMetaStore();
        a.add(wall());
        a.add(wall({ pryzmElementId: 'door_01', globalId: 'GDOOR', typeName: 'IFCDOOR', tier: 1, psets: {} }));
        const snap = a.serialize();
        expect(snap.version).toBe(1);

        const b = new IfcMetaStore();
        const n = b.hydrate(snap);
        expect(n).toBe(2);
        expect(b.get('door_01')?.typeName).toBe('IFCDOOR');
        // the globalId index must be rebuilt on hydrate (re-export still matches)
        expect(b.getByGlobalId('GDOOR')?.pryzmElementId).toBe('door_01');
    });

    it('hydrate() rejects a corrupt snapshot via the Zod schema', () => {
        const store = new IfcMetaStore();
        expect(() => store.hydrate({ version: 1, elements: { x: { pryzmElementId: '' } } })).toThrow();
        expect(() => store.hydrate({ version: 2, elements: {} })).toThrow();
    });
});

describe('IfcMetaStore — lifecycle (reset / subscribe / dispose)', () => {
    it('subscribe() fires on write and the unsubscribe stops it', () => {
        const store = new IfcMetaStore();
        let hits = 0;
        const off = store.subscribe(() => { hits++; });
        store.add(wall());
        expect(hits).toBe(1);
        off();
        store.add(wall({ pryzmElementId: 'wall_02', globalId: 'G2' }));
        expect(hits).toBe(1);
    });

    it('reset() clears all rows (the project-switch hook) and notifies once', () => {
        const store = new IfcMetaStore();
        store.add(wall());
        let hits = 0;
        store.subscribe(() => { hits++; });
        store.reset();
        expect(store.size()).toBe(0);
        expect(hits).toBe(1);
        // reset on an empty store is a no-op (no spurious notify)
        store.reset();
        expect(hits).toBe(1);
    });

    it('dispose() freezes writes and is idempotent', () => {
        const store = new IfcMetaStore();
        store.add(wall());
        store.dispose();
        store.add(wall({ pryzmElementId: 'wall_02', globalId: 'G2' })); // ignored
        expect(store.size()).toBe(0);
        expect(() => store.dispose()).not.toThrow();
    });
});
