// A.7.c.5 (Phase A · Sprint 2) — site.linkClimate / linkBuilding /
// replace / delete tests.

import { describe, expect, it } from 'vitest';
import { SiteModelStore } from '../src/SiteModelStore.js';
import {
    siteCreate,
    siteLinkClimate,
    siteLinkBuilding,
    siteReplace,
    siteDelete,
} from '../src/site-commands/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture — a Site with a 10×8 parcel + setbacks
// ─────────────────────────────────────────────────────────────────────────────

function setupSite(): SiteModelStore {
    const store = new SiteModelStore();
    siteCreate(
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
                setbacks: { front: 2, side: 2, rear: 2 },
            },
        },
        store,
    );
    return store;
}

// ─────────────────────────────────────────────────────────────────────────────
// site.linkClimate
// ─────────────────────────────────────────────────────────────────────────────

describe('siteLinkClimate', () => {
    it('sets SiteModel.climateRef + emits site.climate-linked', () => {
        const store = setupSite();
        const result = siteLinkClimate(
            {
                siteId: 'site_proj-001',
                climateRef: 'climate_london-2024',
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.climate-linked');
        expect(result.event.climateRef).toBe('climate_london-2024');
        expect(store.getSite()?.climateRef).toBe('climate_london-2024');
    });

    it('accepts null to clear the link', () => {
        const store = setupSite();
        siteLinkClimate(
            { siteId: 'site_proj-001', climateRef: 'climate_london-2024' },
            store,
        );
        const result = siteLinkClimate(
            { siteId: 'site_proj-001', climateRef: null },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(store.getSite()?.climateRef).toBeNull();
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteLinkClimate(
            { siteId: 'site_proj-001', climateRef: 'climate_x' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on siteId mismatch', () => {
        const store = setupSite();
        const result = siteLinkClimate(
            { siteId: 'site_proj-other', climateRef: 'climate_x' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.linkBuilding
// ─────────────────────────────────────────────────────────────────────────────

describe('siteLinkBuilding', () => {
    it('sets SiteModel.buildingRef', () => {
        const store = setupSite();
        const result = siteLinkBuilding(
            {
                siteId: 'site_proj-001',
                buildingRef: 'bldg_proj-001',
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.building-linked');
        expect(store.getSite()?.buildingRef).toBe('bldg_proj-001');
    });

    it('null clears the link (used when Building is deleted)', () => {
        const store = setupSite();
        siteLinkBuilding(
            { siteId: 'site_proj-001', buildingRef: 'bldg_proj-001' },
            store,
        );
        siteLinkBuilding(
            { siteId: 'site_proj-001', buildingRef: null },
            store,
        );
        expect(store.getSite()?.buildingRef).toBeNull();
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteLinkBuilding(
            { siteId: 'site_proj-001', buildingRef: 'bldg_x' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.replace — §1.4 + §4.4
// ─────────────────────────────────────────────────────────────────────────────

describe('siteReplace', () => {
    function buildReplacement(
        over: Partial<{
            id: string;
            projectId: string;
            name: string;
            parcelPolygon: Array<{ x: number; z: number }>;
        }> = {},
    ) {
        return {
            id: over.id ?? 'site_proj-001',
            projectId: over.projectId ?? 'proj-001',
            name: over.name ?? 'Site (redrawn)',
            location: {},
            parcel: {
                boundary: {
                    polygon: over.parcelPolygon ?? [
                        { x: 0, z: 0 },
                        { x: 20, z: 0 },
                        { x: 20, z: 16 },
                        { x: 0, z: 16 },
                    ],
                    edgeClassifications: ['front', 'side', 'rear', 'side'],
                },
                setbacks: { front: 3, side: 3, rear: 3 },
                area: 320,
            },
            provenance: { source: 'user-authored' as const },
        };
    }

    it('replaces the Site with a new parcel polygon', () => {
        const store = setupSite();
        const result = siteReplace(
            {
                siteId: 'site_proj-001',
                replacement: buildReplacement(),
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.replaced');
        // Parcel polygon CHANGED (per §1.4 — replace is the only path).
        expect(store.getSite()?.parcel.boundary.polygon).toHaveLength(4);
        expect(store.getSite()?.parcel.boundary.polygon[1]?.x).toBe(20);
    });

    it('event carries the priorSnapshot for the undo entry (§4.4)', () => {
        const store = setupSite();
        const priorPolygon = store.getSite()!.parcel.boundary.polygon;
        const result = siteReplace(
            {
                siteId: 'site_proj-001',
                replacement: buildReplacement(),
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        // Prior snapshot has the ORIGINAL (10×8) polygon.
        expect(result.event.priorSnapshot.parcel.boundary.polygon).toBe(
            priorPolygon,
        );
        expect(
            result.event.priorSnapshot.parcel.boundary.polygon[1]?.x,
        ).toBe(10);
    });

    it('rejects when replacement.id differs from current.id (§1.4)', () => {
        const store = setupSite();
        const result = siteReplace(
            {
                siteId: 'site_proj-001',
                replacement: buildReplacement({ id: 'site_other' }),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('id-mismatch');
        expect(result.message).toMatch(/C19 §1\.4/);
    });

    it('rejects when replacement.projectId differs (§1.1)', () => {
        const store = setupSite();
        const result = siteReplace(
            {
                siteId: 'site_proj-001',
                replacement: buildReplacement({ projectId: 'proj-other' }),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('project-mismatch');
        expect(result.message).toMatch(/C19 §1\.1/);
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteReplace(
            {
                siteId: 'site_proj-001',
                replacement: buildReplacement(),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects when replacement fails L0 schema validation', () => {
        const store = setupSite();
        const result = siteReplace(
            {
                siteId: 'site_proj-001',
                replacement: {
                    ...buildReplacement(),
                    location: { latitude: 200 }, // out of range
                },
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.delete — §1.1 cascade-only
// ─────────────────────────────────────────────────────────────────────────────

describe('siteDelete', () => {
    it('deletes the Site when cascadeFromProjectDelete: true', () => {
        const store = setupSite();
        const result = siteDelete(
            {
                siteId: 'site_proj-001',
                cascadeFromProjectDelete: true,
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.deleted');
        expect(store.getSite()).toBeNull();
    });

    it('event carries the priorSnapshot for the undo entry (§4.4)', () => {
        const store = setupSite();
        const before = store.getSite()!;
        const result = siteDelete(
            {
                siteId: 'site_proj-001',
                cascadeFromProjectDelete: true,
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.priorSnapshot).toBe(before);
    });

    it('REJECTS without cascadeFromProjectDelete flag (§1.1 FORBIDDEN)', () => {
        const store = setupSite();
        const result = siteDelete(
            // Caller forgot the flag.
            { siteId: 'site_proj-001' } as unknown,
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('delete-not-cascaded');
        expect(result.message).toMatch(/FORBIDDEN/i);
        expect(result.message).toMatch(/C19 §1\.1/);
        // Site is UNCHANGED.
        expect(store.getSite()).not.toBeNull();
    });

    it('REJECTS when cascadeFromProjectDelete: false', () => {
        const store = setupSite();
        const result = siteDelete(
            {
                siteId: 'site_proj-001',
                cascadeFromProjectDelete: false,
            } as unknown,
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('delete-not-cascaded');
        expect(store.getSite()).not.toBeNull();
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteDelete(
            {
                siteId: 'site_proj-001',
                cascadeFromProjectDelete: true,
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on siteId mismatch', () => {
        const store = setupSite();
        const result = siteDelete(
            {
                siteId: 'site_proj-other',
                cascadeFromProjectDelete: true,
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });
});
