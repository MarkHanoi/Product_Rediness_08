// A.7.b (Phase A · Sprint 2) — SiteModelStore tests.
//
// Validates the L3 reactive wrapper around the L0 SiteModel substrate.
// Mirrors the FamilyRegistryStore + ApartmentParametersStore listener
// patterns established earlier in this package.

import { describe, expect, it, vi } from 'vitest';
import { SiteModelSchema, type SiteModel } from '@pryzm/schemas';
import { SiteModelStore } from '../src/SiteModelStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSite(overrides: Partial<{
    id: string;
    projectId: string;
    name: string;
}> = {}): SiteModel {
    return SiteModelSchema.parse({
        id: overrides.id ?? 'site_proj-001',
        projectId: overrides.projectId ?? 'proj-001',
        name: overrides.name ?? 'Test Site',
        location: {},
        parcel: {
            boundary: {
                polygon: [
                    { x: 0, z: 0 },
                    { x: 10, z: 0 },
                    { x: 10, z: 8 },
                    { x: 0, z: 8 },
                ],
                edgeClassifications: ['front', 'side', 'rear', 'side'],
            },
            area: 80,
        },
        footprint: {
            polygon: [
                { x: 2, z: 2 },
                { x: 8, z: 2 },
                { x: 8, z: 6 },
                { x: 2, z: 6 },
            ],
            entryAnchor: { x: 2, z: 4 },
        },
        contextBuildings: [
            {
                id: 'ctx_neighbour-1',
                footprint: [
                    { x: 0, z: -5 },
                    { x: 10, z: -5 },
                    { x: 10, z: 0 },
                    { x: 0, z: 0 },
                ],
                height: 12,
                provenance: { source: 'osm' },
            },
        ],
        provenance: { source: 'user-authored' },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction + initial state
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteModelStore — construction', () => {
    it('starts with no site', () => {
        const store = new SiteModelStore();
        expect(store.getSite()).toBeNull();
        expect(store.getParcelBoundary()).toBeNull();
        expect(store.getFootprint()).toBeNull();
        expect(store.getLocation()).toBeNull();
        expect(store.getContextBuildings()).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// set() + resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteModelStore — set() + resolution helpers', () => {
    it('set() stores the SiteModel snapshot', () => {
        const store = new SiteModelStore();
        const site = makeSite();
        store.set(site);
        expect(store.getSite()).toBe(site);
    });

    it('getParcelBoundary returns the parcel polygon when set', () => {
        const store = new SiteModelStore();
        store.set(makeSite());
        const boundary = store.getParcelBoundary();
        expect(boundary?.polygon).toHaveLength(4);
        expect(boundary?.edgeClassifications).toEqual([
            'front',
            'side',
            'rear',
            'side',
        ]);
    });

    it('getFootprint returns the building footprint when set', () => {
        const store = new SiteModelStore();
        store.set(makeSite());
        const footprint = store.getFootprint();
        expect(footprint?.polygon).toHaveLength(4);
        expect(footprint?.entryAnchor).toEqual({ x: 2, z: 4 });
    });

    it('getContextBuildings returns the ContextBuilding array', () => {
        const store = new SiteModelStore();
        store.set(makeSite());
        const ctx = store.getContextBuildings();
        expect(ctx).toHaveLength(1);
        expect(ctx[0]?.id).toBe('ctx_neighbour-1');
        expect(ctx[0]?.editable).toBe(false);
    });

    it('getLocation returns the SiteLocation when set', () => {
        const store = new SiteModelStore();
        store.set(makeSite());
        const loc = store.getLocation();
        expect(loc).not.toBeNull();
        expect(loc?.latitude).toBe(0);
        expect(loc?.crs).toBeNull();
    });

    it('set(null) clears the site', () => {
        const store = new SiteModelStore();
        store.set(makeSite());
        expect(store.getSite()).not.toBeNull();
        store.set(null);
        expect(store.getSite()).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// reset() — C13 project-switch hook
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteModelStore — reset() (C13 project-switch hook)', () => {
    it('reset() clears the site and notifies listeners', () => {
        const store = new SiteModelStore();
        store.set(makeSite());
        const listener = vi.fn();
        store.subscribe(listener);
        store.reset();
        expect(store.getSite()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('reset() on an empty store is a no-op (no listener fire)', () => {
        const store = new SiteModelStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.reset();
        expect(listener).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// subscribe()
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteModelStore — subscribe()', () => {
    it('fires listeners on every set() that changes the reference', () => {
        const store = new SiteModelStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.set(makeSite({ id: 'site_a' }));
        store.set(makeSite({ id: 'site_b' }));
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('does NOT fire when set() receives the SAME reference', () => {
        const store = new SiteModelStore();
        const site = makeSite();
        store.set(site);
        const listener = vi.fn();
        store.subscribe(listener);
        store.set(site);                                  // same ref
        expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribe disposer stops further notifications', () => {
        const store = new SiteModelStore();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.set(makeSite({ id: 'site_a' }));
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.set(makeSite({ id: 'site_b' }));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not break the fan-out', () => {
        const store = new SiteModelStore();
        const throwing = vi.fn(() => {
            throw new Error('boom');
        });
        const good = vi.fn();
        store.subscribe(throwing);
        store.subscribe(good);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        store.set(makeSite());
        expect(throwing).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
        warn.mockRestore();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// dispose() — lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteModelStore — dispose()', () => {
    it('clears the site and listeners', () => {
        const store = new SiteModelStore();
        const listener = vi.fn();
        store.set(makeSite());
        store.subscribe(listener);
        store.dispose();
        expect(store.getSite()).toBeNull();
        // Further set() is a no-op + warn (does not throw, does not fire listeners)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        store.set(makeSite());
        expect(listener).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('is idempotent', () => {
        const store = new SiteModelStore();
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });
});
