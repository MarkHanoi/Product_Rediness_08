// P0.3 slice B (Family Platform) — FamilyRegistryStore tests.
//
// Verifies the L3 reactive wrapper around the L0 `FamilyRegistryState`
// substrate from `@pryzm/schemas/family-registry`. Covers:
//   • Empty initial state.
//   • register() side effects across every secondary index.
//   • subscribe() fan-out on register / unregister.
//   • unregister() removes from every index + fires subscribers.
//   • Multi-register + multi-unregister maintain consistent indexes.
//   • dispose() stops further listener firing + makes mutations no-op.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FamilyRegistryStore } from '../src/familyRegistryStore.js';
import { buildCoreFamilySeeds } from '../src/seedCoreFamilies.js';
import type { RegisteredFamily, FamilyId } from '@pryzm/schemas';

const sampleFamily = (over: Partial<RegisteredFamily> = {}): RegisteredFamily => ({
    identity: {
        id:      'family/test/desk',
        name:    'Test Desk',
        version: '1.0.0',
        author:  'PRYZM Test',
        license: 'MIT',
    },
    category:   'desks',
    mountClass: 'floor',
    origin:     'core',
    archetypeHints: [
        { occupancy: 'office', anchor: 'wall-window' },
    ],
    ifcMapping: {
        entityType:     'IfcFurniture',
        predefinedType: 'DESK',
        psets:          ['Pset_FurnitureTypeCommon'],
    },
    schemaHash: 'test:desk:1.0.0',
    tags:       ['desk', 'office'],
    ...over,
});

describe('FamilyRegistryStore (P0.3 slice B)', () => {
    let store: FamilyRegistryStore;
    beforeEach(() => { store = new FamilyRegistryStore(); });

    // ── 1. Initial state ────────────────────────────────────────────────────
    it('starts empty — every index is empty', () => {
        const s = store.get();
        expect(Object.keys(s.byId)).toHaveLength(0);
        expect(Object.keys(s.byCategory)).toHaveLength(0);
        expect(Object.keys(s.byOccupancy)).toHaveLength(0);
        expect(Object.keys(s.byMountClass)).toHaveLength(0);
        expect(Object.keys(s.byTag)).toHaveLength(0);
    });

    // ── 2. register() — primary index ──────────────────────────────────────
    it('register() makes the family findable by id', () => {
        const fam = sampleFamily();
        store.register(fam);
        expect(store.findById(fam.identity.id as FamilyId)).toEqual(fam);
    });

    // ── 3. register() — secondary indexes ──────────────────────────────────
    it('register() populates every secondary index (category / mountClass / occupancy / tag)', () => {
        const fam = sampleFamily();
        store.register(fam);
        expect(store.findByCategory('desks')).toHaveLength(1);
        expect(store.findByMountClass('floor')).toHaveLength(1);
        expect(store.findByOccupancy('office')).toHaveLength(1);
        expect(store.findByTag('desk')).toHaveLength(1);
        expect(store.findByTag('office')).toHaveLength(1);
    });

    // ── 4. subscribe — fires on register ───────────────────────────────────
    it('subscribe() fires the listener on register()', () => {
        const listener = vi.fn();
        store.subscribe(listener);
        store.register(sampleFamily());
        expect(listener).toHaveBeenCalledTimes(1);
    });

    // ── 5. unregister removes from primary index ───────────────────────────
    it('unregister() removes the family from byId', () => {
        const fam = sampleFamily();
        store.register(fam);
        store.unregister(fam.identity.id as FamilyId);
        expect(store.findById(fam.identity.id as FamilyId)).toBeUndefined();
    });

    // ── 6. unregister removes from EVERY secondary index ───────────────────
    it('unregister() removes the family from every secondary index', () => {
        const fam = sampleFamily();
        store.register(fam);
        store.unregister(fam.identity.id as FamilyId);
        expect(store.findByCategory('desks')).toHaveLength(0);
        expect(store.findByMountClass('floor')).toHaveLength(0);
        expect(store.findByOccupancy('office')).toHaveLength(0);
        expect(store.findByTag('desk')).toHaveLength(0);
    });

    // ── 7. subscribe — fires on unregister ─────────────────────────────────
    it('subscribe() fires the listener on a real unregister()', () => {
        const fam = sampleFamily();
        store.register(fam);
        const listener = vi.fn();
        store.subscribe(listener);
        store.unregister(fam.identity.id as FamilyId);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    // ── 8. subscribe — silent on no-op unregister ──────────────────────────
    it('subscribe() is silent on no-op unregister() (unknown id)', () => {
        const listener = vi.fn();
        store.subscribe(listener);
        store.unregister('family/unknown' as FamilyId);
        expect(listener).not.toHaveBeenCalled();
    });

    // ── 9. unsubscribe disposer ────────────────────────────────────────────
    it('subscribe() returns an unsubscribe disposer', () => {
        const listener = vi.fn();
        const unsub = store.subscribe(listener);
        unsub();
        store.register(sampleFamily());
        expect(listener).not.toHaveBeenCalled();
    });

    // ── 10. Multi-register: consistent indexes across many families ─────────
    it('multiple registers + unregisters keep every secondary index consistent', () => {
        store.register(sampleFamily({
            identity: { id: 'a', name: 'A', version: '1.0.0', author: 'PRYZM', license: 'MIT' },
            category: 'cat1',
            tags: ['t1'],
            archetypeHints: [{ occupancy: 'living', anchor: 'center' }],
        }));
        store.register(sampleFamily({
            identity: { id: 'b', name: 'B', version: '1.0.0', author: 'PRYZM', license: 'MIT' },
            category: 'cat1',
            tags: ['t1', 't2'],
            archetypeHints: [{ occupancy: 'bedroom', anchor: 'wall-longest' }],
        }));
        store.register(sampleFamily({
            identity: { id: 'c', name: 'C', version: '1.0.0', author: 'PRYZM', license: 'MIT' },
            category: 'cat2',
            mountClass: 'wall',
            tags: ['t2'],
            archetypeHints: [{ occupancy: 'bathroom', anchor: 'wall-longest' }],
        }));

        expect(store.findByCategory('cat1')).toHaveLength(2);
        expect(store.findByCategory('cat2')).toHaveLength(1);
        expect(store.findByMountClass('floor')).toHaveLength(2);
        expect(store.findByMountClass('wall')).toHaveLength(1);
        expect(store.findByTag('t1')).toHaveLength(2);
        expect(store.findByTag('t2')).toHaveLength(2);

        store.unregister('b' as FamilyId);
        expect(store.findByCategory('cat1')).toHaveLength(1);
        expect(store.findByTag('t1')).toHaveLength(1);
        expect(store.findByTag('t2')).toHaveLength(1);
    });

    // ── 11. Re-register same id — replaces payload, indexes stay clean ─────
    it('re-registering same id replaces payload + strips stale secondary entries', () => {
        store.register(sampleFamily({ category: 'old-cat', tags: ['old-tag'] }));
        store.register(sampleFamily({ category: 'new-cat', tags: ['new-tag'] }));
        expect(store.findByCategory('old-cat')).toHaveLength(0);
        expect(store.findByCategory('new-cat')).toHaveLength(1);
        expect(store.findByTag('old-tag')).toHaveLength(0);
        expect(store.findByTag('new-tag')).toHaveLength(1);
    });

    // ── 12. dispose() stops listener fan-out ────────────────────────────────
    it('dispose() stops further listener firing', () => {
        const listener = vi.fn();
        store.subscribe(listener);
        store.dispose();
        // Suppress the post-dispose warn so the test output stays clean.
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        store.register(sampleFamily());
        warnSpy.mockRestore();
        expect(listener).not.toHaveBeenCalled();
    });

    // ── 13. dispose() is idempotent ─────────────────────────────────────────
    it('dispose() is idempotent — double-dispose does not throw', () => {
        expect(() => { store.dispose(); store.dispose(); }).not.toThrow();
    });

    // ── 14. Listener errors are caught (loud-fail-soft) ─────────────────────
    it('listener errors are caught + warned without breaking the fan-out', () => {
        const ok = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        store.subscribe(() => { throw new Error('boom'); });
        store.subscribe(ok);
        store.register(sampleFamily());
        expect(ok).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── 15. Seed function round-trip — proves the seed shape is registrable ─
    // Slice B extension (2026-05-31): grew from 6 → 25 entries.
    // Slice B extension 2 (2026-05-31): grew from 25 → 40 entries.
    it('buildCoreFamilySeeds() returns 40 entries, all registrable + origin=core', () => {
        const seeds = buildCoreFamilySeeds();
        expect(seeds).toHaveLength(40);
        for (const seed of seeds) {
            expect(seed.origin).toBe('core');
            store.register(seed);
        }
        expect(Object.keys(store.get().byId)).toHaveLength(40);
    });
});
