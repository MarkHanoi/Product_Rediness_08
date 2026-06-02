// A.7.c.3 (Phase A · Sprint 2) — context-building command tests.

import { describe, expect, it } from 'vitest';
import { SiteModelStore } from '../src/SiteModelStore.js';
import {
    siteCreate,
    siteAddContextBuilding,
    siteRemoveContextBuilding,
    siteReplaceContextBuilding,
} from '../src/site-commands/index.js';

function setupSite(): SiteModelStore {
    const store = new SiteModelStore();
    siteCreate({ projectId: 'proj-001', location: {} }, store);
    return store;
}

function makeContextBuilding(id: string, height = 12): unknown {
    return {
        id,
        footprint: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 5 },
            { x: 0, z: 5 },
        ],
        height,
        provenance: { source: 'osm' },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// site.addContextBuilding
// ─────────────────────────────────────────────────────────────────────────────

describe('siteAddContextBuilding', () => {
    it('appends a ContextBuilding to the array', () => {
        const store = setupSite();
        const result = siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north'),
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.context-building-added');
        expect(result.event.contextBuildingId).toBe('ctx_north');
        expect(store.getSite()?.contextBuildings).toHaveLength(1);
    });

    it('preserves order across multiple adds', () => {
        const store = setupSite();
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north'),
            },
            store,
        );
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_south'),
            },
            store,
        );
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_east'),
            },
            store,
        );
        const ids = store.getSite()!.contextBuildings.map((cb) => cb.id);
        expect(ids).toEqual(['ctx_north', 'ctx_south', 'ctx_east']);
    });

    it('rejects when id already exists (no shadow-replace)', () => {
        const store = setupSite();
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north'),
            },
            store,
        );
        const result = siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north', 20),
            },
            store,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('context-building-duplicate-id');
        expect(result.message).toMatch(/use site\.replaceContextBuilding/);
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north'),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on invalid payload', () => {
        const store = setupSite();
        const result = siteAddContextBuilding(
            { siteId: '', contextBuilding: makeContextBuilding('ctx_north') },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('rejects when contextBuilding has editable: true (L0 schema enforces §1.5)', () => {
        const store = setupSite();
        const tampered = {
            ...(makeContextBuilding('ctx_north') as Record<string, unknown>),
            editable: true,
        };
        const result = siteAddContextBuilding(
            { siteId: 'site_proj-001', contextBuilding: tampered },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.removeContextBuilding
// ─────────────────────────────────────────────────────────────────────────────

describe('siteRemoveContextBuilding', () => {
    it('removes a ContextBuilding by id', () => {
        const store = setupSite();
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north'),
            },
            store,
        );
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_south'),
            },
            store,
        );

        const result = siteRemoveContextBuilding(
            { siteId: 'site_proj-001', contextBuildingId: 'ctx_north' },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.contextBuildingId).toBe('ctx_north');
        const ids = store.getSite()!.contextBuildings.map((cb) => cb.id);
        expect(ids).toEqual(['ctx_south']);
    });

    it('preserves order of remaining entries', () => {
        const store = setupSite();
        for (const id of ['ctx_a', 'ctx_b', 'ctx_c', 'ctx_d']) {
            siteAddContextBuilding(
                {
                    siteId: 'site_proj-001',
                    contextBuilding: makeContextBuilding(id),
                },
                store,
            );
        }
        siteRemoveContextBuilding(
            { siteId: 'site_proj-001', contextBuildingId: 'ctx_b' },
            store,
        );
        const ids = store.getSite()!.contextBuildings.map((cb) => cb.id);
        expect(ids).toEqual(['ctx_a', 'ctx_c', 'ctx_d']);
    });

    it('rejects with context-building-not-found when id is unknown', () => {
        const store = setupSite();
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_north'),
            },
            store,
        );
        const result = siteRemoveContextBuilding(
            { siteId: 'site_proj-001', contextBuildingId: 'ctx_does-not-exist' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('context-building-not-found');
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteRemoveContextBuilding(
            { siteId: 'site_proj-001', contextBuildingId: 'ctx_north' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.replaceContextBuilding
// ─────────────────────────────────────────────────────────────────────────────

describe('siteReplaceContextBuilding', () => {
    it('replaces in place, preserving order, with the SAME id', () => {
        const store = setupSite();
        for (const id of ['ctx_a', 'ctx_b', 'ctx_c']) {
            siteAddContextBuilding(
                {
                    siteId: 'site_proj-001',
                    contextBuilding: makeContextBuilding(id),
                },
                store,
            );
        }
        const result = siteReplaceContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuildingId: 'ctx_b',
                replacement: makeContextBuilding('ctx_b', 25),
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.context-building-replaced');
        const arr = store.getSite()!.contextBuildings;
        expect(arr.map((cb) => cb.id)).toEqual(['ctx_a', 'ctx_b', 'ctx_c']);
        expect(arr[1]?.height).toBe(25);
    });

    it('replaces in place with a NEW id', () => {
        const store = setupSite();
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_old'),
            },
            store,
        );
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_keep'),
            },
            store,
        );
        const result = siteReplaceContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuildingId: 'ctx_old',
                replacement: makeContextBuilding('ctx_new'),
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.contextBuildingId).toBe('ctx_old');
        expect(result.event.replacementId).toBe('ctx_new');
        const ids = store.getSite()!.contextBuildings.map((cb) => cb.id);
        expect(ids).toEqual(['ctx_new', 'ctx_keep']);
    });

    it('rejects when replacement id collides with a different existing entry', () => {
        const store = setupSite();
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_a'),
            },
            store,
        );
        siteAddContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuilding: makeContextBuilding('ctx_b'),
            },
            store,
        );
        // Try to replace ctx_a with an entry whose id is 'ctx_b' — collision.
        const result = siteReplaceContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuildingId: 'ctx_a',
                replacement: makeContextBuilding('ctx_b'),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('context-building-duplicate-id');
    });

    it('rejects with context-building-not-found when target id is unknown', () => {
        const store = setupSite();
        const result = siteReplaceContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuildingId: 'ctx_unknown',
                replacement: makeContextBuilding('ctx_new'),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('context-building-not-found');
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteReplaceContextBuilding(
            {
                siteId: 'site_proj-001',
                contextBuildingId: 'ctx_a',
                replacement: makeContextBuilding('ctx_a'),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });
});
