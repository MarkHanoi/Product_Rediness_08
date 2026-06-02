// A.7.c (Phase A · Sprint 2) — site.* command handler tests.
//
// Validates the pure handlers per [C19 §4.1] + the §1.x invariants
// they enforce (§1.1 idempotency · §1.3 location replace · §1.4 parcel
// immutability · §2.7 edge-classifications length).

import { describe, expect, it } from 'vitest';
import { SiteModelStore } from '../src/SiteModelStore.js';
import {
    siteCreate,
    siteUpdateLocation,
    siteSetParcelBoundary,
    deterministicSiteId,
} from '../src/site-commands/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// site.create
// ─────────────────────────────────────────────────────────────────────────────

describe('siteCreate', () => {
    it('creates a SiteModel with deterministic id', () => {
        const store = new SiteModelStore();
        const result = siteCreate(
            {
                projectId: 'proj-001',
                location: {},
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.created');
        expect(result.event.siteId).toBe('site_proj-001');
        expect(result.event.projectId).toBe('proj-001');
        expect(store.getSite()?.id).toBe('site_proj-001');
    });

    it('uses the supplied name when given', () => {
        const store = new SiteModelStore();
        const result = siteCreate(
            {
                projectId: 'proj-001',
                name: 'Holborn Block',
                location: {},
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.site.name).toBe('Holborn Block');
    });

    it('defaults name to "Site" when absent', () => {
        const store = new SiteModelStore();
        const result = siteCreate(
            { projectId: 'proj-001', location: {} },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.site.name).toBe('Site');
    });

    it('computes parcel.area from boundary polygon (shoelace)', () => {
        const store = new SiteModelStore();
        const result = siteCreate(
            {
                projectId: 'proj-001',
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
                },
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.site.parcel.area).toBe(80);
    });

    it('rejects when edgeClassifications.length mismatches polygon.length', () => {
        const store = new SiteModelStore();
        const result = siteCreate(
            {
                projectId: 'proj-001',
                location: {},
                parcel: {
                    boundary: {
                        polygon: [
                            { x: 0, z: 0 },
                            { x: 10, z: 0 },
                            { x: 10, z: 8 },
                        ],
                        edgeClassifications: ['front', 'side'], // length 2 vs 3
                    },
                },
            },
            store,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('edge-classifications-mismatch');
    });

    it('rejects invalid payload with reason invalid-payload', () => {
        const store = new SiteModelStore();
        const result = siteCreate(
            { projectId: '', location: {} },          // bad projectId (< 3 chars)
            store,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('is idempotent per §1.1 — replaces an existing Site', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-001', location: {} }, store);
        const first = store.getSite();
        siteCreate(
            { projectId: 'proj-001', name: 'Replaced', location: {} },
            store,
        );
        const second = store.getSite();
        expect(second).not.toBe(first);
        expect(second?.name).toBe('Replaced');
        expect(second?.id).toBe('site_proj-001'); // same deterministic id
    });

    it('deterministicSiteId returns site_<projectId>', () => {
        expect(deterministicSiteId('proj-abc')).toBe('site_proj-abc');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.updateLocation
// ─────────────────────────────────────────────────────────────────────────────

describe('siteUpdateLocation', () => {
    function setupSite(): SiteModelStore {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-001', location: {} }, store);
        return store;
    }

    it('replaces SiteModel.location and emits site.location-changed', () => {
        const store = setupSite();
        const result = siteUpdateLocation(
            {
                siteId: 'site_proj-001',
                location: {
                    latitude: 51.5074,
                    longitude: -0.1278,
                    elevationAsl: 11,
                    trueNorth: 0.05,
                    crs: 'EPSG:27700',
                },
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.location-changed');
        expect(result.event.location.latitude).toBeCloseTo(51.5074);
        expect(store.getSite()?.location.crs).toBe('EPSG:27700');
    });

    it('rejects when no Site exists (no-site)', () => {
        const store = new SiteModelStore();
        const result = siteUpdateLocation(
            {
                siteId: 'site_proj-001',
                location: { latitude: 0, longitude: 0 },
            },
            store,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects when siteId does not match the current Site', () => {
        const store = setupSite();
        const result = siteUpdateLocation(
            {
                siteId: 'site_proj-other',
                location: { latitude: 0, longitude: 0 },
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects out-of-range latitude (Zod refuses)', () => {
        const store = setupSite();
        const result = siteUpdateLocation(
            {
                siteId: 'site_proj-001',
                location: { latitude: 91, longitude: 0 },
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.setParcelBoundary — §1.4 one-shot
// ─────────────────────────────────────────────────────────────────────────────

describe('siteSetParcelBoundary', () => {
    function setupSite(): SiteModelStore {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-001', location: {} }, store);
        return store;
    }

    const validBoundary = {
        polygon: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 8 },
            { x: 0, z: 8 },
        ],
        edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
    };

    it('sets the parcel boundary and computes area', () => {
        const store = setupSite();
        const result = siteSetParcelBoundary(
            { siteId: 'site_proj-001', boundary: validBoundary },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.parcel-boundary-set');
        expect(result.event.area).toBe(80);
        expect(store.getSite()?.parcel.boundary.polygon).toHaveLength(4);
        expect(store.getSite()?.parcel.area).toBe(80);
    });

    it('REJECTS when parcel polygon is already non-empty (§1.4 immutability)', () => {
        const store = new SiteModelStore();
        // Create a site WITH a parcel boundary supplied upfront.
        siteCreate(
            {
                projectId: 'proj-001',
                location: {},
                parcel: { boundary: validBoundary },
            },
            store,
        );
        const result = siteSetParcelBoundary(
            { siteId: 'site_proj-001', boundary: validBoundary },
            store,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('parcel-already-set');
        expect(result.message).toMatch(/immutable.*C19 §1\.4/);
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteSetParcelBoundary(
            { siteId: 'site_proj-001', boundary: validBoundary },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects when edgeClassifications.length mismatches polygon.length (§2.7)', () => {
        const store = setupSite();
        const result = siteSetParcelBoundary(
            {
                siteId: 'site_proj-001',
                boundary: {
                    polygon: validBoundary.polygon,
                    edgeClassifications: ['front', 'side'],  // length 2 vs 4
                },
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('edge-classifications-mismatch');
    });

    it('rejects invalid payload (Zod failure on empty siteId)', () => {
        const store = setupSite();
        const result = siteSetParcelBoundary(
            { siteId: '', boundary: validBoundary },     // < 3 chars
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});
