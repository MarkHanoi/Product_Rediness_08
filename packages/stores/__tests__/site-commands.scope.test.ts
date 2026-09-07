// §SITE-SCOPE (L-645, C12 §13 / ADR-0382) — `site.setScope` command tests.
//
// What these pin: the command is the ONLY write path for `SiteModel.scope` (P6), it touches
// nothing else on the model, `null` clears honestly, an invalid scope is refused BEFORE the
// store is touched, and the scope survives a whole-site `site.replace` that carries it.

import { describe, expect, it } from 'vitest';
import { SiteModelStore } from '../src/SiteModelStore.js';
import { siteCreate, siteSetScope, siteReplace } from '../src/site-commands/index.js';

function setupSite(): SiteModelStore {
    const store = new SiteModelStore();
    const res = siteCreate(
        {
            projectId: 'proj-001',
            location: { latitude: 41.39, longitude: 2.17 },
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
    if (!res.ok) throw new Error(res.message);
    return store;
}

describe('siteSetScope — the only write path for SiteModel.scope', () => {
    it('a fresh site has no authored scope (null), and getScope() says so', () => {
        const store = setupSite();
        expect(store.getSite()!.scope).toBeNull();
        expect(store.getScope()).toBeNull();
    });

    it('sets a circle and emits site.scope-changed with the post-write value', () => {
        const store = setupSite();
        const res = siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: 900 } }, store);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.event).toEqual({
            type: 'site.scope-changed',
            siteId: 'site_proj-001',
            scope: { shape: 'circle', radiusM: 900 },
        });
        expect(store.getScope()).toEqual({ shape: 'circle', radiusM: 900 });
        expect(res.site.scope).toEqual({ shape: 'circle', radiusM: 900 });
    });

    it('sets a rectangle', () => {
        const store = setupSite();
        const res = siteSetScope(
            { siteId: 'site_proj-001', scope: { shape: 'rectangle', halfWidthM: 700, halfDepthM: 500 } },
            store,
        );
        expect(res.ok).toBe(true);
        expect(store.getScope()).toEqual({ shape: 'rectangle', halfWidthM: 700, halfDepthM: 500 });
    });

    it('touches NOTHING but scope — location, parcel, footprint, ids are preserved verbatim', () => {
        const store = setupSite();
        const before = store.getSite()!;
        siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: 1200 } }, store);
        const after = store.getSite()!;
        expect(after.id).toBe(before.id);
        expect(after.projectId).toBe(before.projectId);
        expect(after.location).toBe(before.location);
        expect(after.parcel).toBe(before.parcel);
        expect(after.footprint).toBe(before.footprint);
        expect(after.contextBuildings).toBe(before.contextBuildings);
        expect(after.provenance).toBe(before.provenance);
        expect(after.scope).toEqual({ shape: 'circle', radiusM: 1200 });
    });

    it('null clears the scope (back to "not authored")', () => {
        const store = setupSite();
        siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: 900 } }, store);
        const res = siteSetScope({ siteId: 'site_proj-001', scope: null }, store);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.event.scope).toBeNull();
        expect(store.getScope()).toBeNull();
    });

    it('refuses an invalid scope BEFORE touching the store', () => {
        const store = setupSite();
        siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: 900 } }, store);
        const snapshot = store.getSite();
        const res = siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: -1 } }, store);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('invalid-payload');
        expect(store.getSite()).toBe(snapshot);
        expect(store.getScope()).toEqual({ shape: 'circle', radiusM: 900 });
    });

    it('refuses a siteId mismatch with no-site', () => {
        const store = setupSite();
        const res = siteSetScope({ siteId: 'site_other', scope: { shape: 'circle', radiusM: 900 } }, store);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('no-site');
    });

    it('refuses when no site is set at all', () => {
        const store = new SiteModelStore();
        const res = siteSetScope({ siteId: 'site_proj-001', scope: null }, store);
        expect(res.ok).toBe(false);
    });

    it('notifies subscribers exactly once per successful write', () => {
        const store = setupSite();
        let n = 0;
        store.subscribe(() => { n++; });
        siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: 900 } }, store);
        expect(n).toBe(1);
        siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: -1 } }, store);
        expect(n).toBe(1);
    });
});

describe('site.replace carries the scope', () => {
    it('a replacement that includes scope keeps it; one that omits it resolves to null', () => {
        const store = setupSite();
        siteSetScope({ siteId: 'site_proj-001', scope: { shape: 'circle', radiusM: 900 } }, store);
        const current = store.getSite()!;

        const withScope = siteReplace(
            {
                siteId: current.id,
                replacement: { ...current, scope: { shape: 'rectangle', halfWidthM: 300, halfDepthM: 200 } },
            },
            store,
        );
        expect(withScope.ok).toBe(true);
        expect(store.getScope()).toEqual({ shape: 'rectangle', halfWidthM: 300, halfDepthM: 200 });

        const { scope: _dropped, ...withoutScope } = store.getSite()!;
        void _dropped;
        const res = siteReplace({ siteId: current.id, replacement: withoutScope }, store);
        expect(res.ok).toBe(true);
        expect(store.getScope()).toBeNull();
    });
});
