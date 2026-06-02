// A.R.3 — ifc.meta.* command handler tests.
//
// Pins the P6-clean mutation path: register bulk-loads into the IfcMetaStore +
// emits the canonical event; deregister drops by id + reports the real count;
// invalid payloads throw (programmer error, per the consent-commands pattern).

import { describe, expect, it, beforeEach } from 'vitest';
import { IfcMetaStore } from '../src/IfcMetaStore.js';
import { registerIfcMeta, deregisterIfcMeta } from '../src/ifc-commands/index.js';
import type { IfcElementMeta } from '@pryzm/schemas/ifc';

const meta = (over: Partial<IfcElementMeta> = {}): IfcElementMeta => ({
    pryzmElementId: 'wall_01',
    globalId: 'G-WALL-01',
    typeName: 'IFCWALLSTANDARDCASE',
    psets: {},
    tier: 1,
    ...over,
});

describe('ifc.meta.register', () => {
    let store: IfcMetaStore;
    beforeEach(() => { store = new IfcMetaStore(); });

    it('bulk-loads elements into the store and emits the canonical event', () => {
        const res = registerIfcMeta({ elements: [meta(), meta({ pryzmElementId: 'door_01', globalId: 'G-DOOR-01', typeName: 'IFCDOOR' })] }, store);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.event.type).toBe('ifc.meta-registered');
        expect(res.event.count).toBe(2);
        expect(res.event.globalIds).toEqual(['G-WALL-01', 'G-DOOR-01']);
        expect(store.size()).toBe(2);
        // the GlobalId index is live (the round-trip join)
        expect(store.getByGlobalId('G-DOOR-01')?.pryzmElementId).toBe('door_01');
    });

    it('throws on an empty batch (Zod .min(1) — programmer error)', () => {
        expect(() => registerIfcMeta({ elements: [] }, store)).toThrow(/invalid payload/);
    });

    it('throws on a malformed element (missing globalId)', () => {
        // @ts-expect-error — deliberately invalid payload
        expect(() => registerIfcMeta({ elements: [{ pryzmElementId: 'x', typeName: 'IFCWALL', psets: {}, tier: 1 }] }, store)).toThrow(/invalid payload/);
    });
});

describe('ifc.meta.deregister', () => {
    let store: IfcMetaStore;
    beforeEach(() => {
        store = new IfcMetaStore();
        registerIfcMeta({ elements: [meta(), meta({ pryzmElementId: 'door_01', globalId: 'G-DOOR-01' })] }, store);
    });

    it('drops the requested ids and reports how many were present', () => {
        const res = deregisterIfcMeta({ pryzmElementIds: ['wall_01', 'ghost_99'] }, store);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.event.type).toBe('ifc.meta-deregistered');
        expect(res.event.removed).toBe(1); // only wall_01 existed
        expect(store.has('wall_01')).toBe(false);
        expect(store.has('door_01')).toBe(true);
    });

    it('throws on an empty id list', () => {
        expect(() => deregisterIfcMeta({ pryzmElementIds: [] }, store)).toThrow(/invalid payload/);
    });
});
