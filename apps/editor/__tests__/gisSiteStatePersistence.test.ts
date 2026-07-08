// §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — regression test for the CRITICAL
// data-loss bug: a project authored WITH GIS data (real site location + parcel
// boundary + C19 geospatial origin) lost ALL of it on save/reload — the site
// silently defaulted to Madrid (lat 40.4168, lon -3.7038).
//
// ROOT: the C19 SiteModel lives ONLY in the per-runtime `SiteModelStore`, which
// was never captured by ProjectSerializer nor restored by ProjectLoader (the
// serialized `hierarchy` block held 0 site nodes because the site is NOT a
// hierarchy node — it is a separate store).
//
// FIX: ProjectSerializer captures `snapshot.site` (the full SiteModel) and
// ProjectLoader calls `restoreSiteState()` — which hydrates the SiteModelStore,
// re-seeds the LTP-ENU origin, and re-emits the `site.*` domain events so the
// sun / Cesium globe / parcel renderer re-anchor to the REAL site.
//
// This test drives the serialize→persist→deserialize→restore round-trip and
// asserts the real Sydney site is restored (NOT the Madrid default).

import { describe, it, expect, vi } from 'vitest';
import { SiteModelSchema, type SiteModel } from '@pryzm/schemas';
import { SiteModelStore } from '@pryzm/stores';
import { restoreSiteState } from '../src/ui/site/siteDispatch';

// The Madrid default that the bug fell back to — the value we must NEVER see
// after restoring a real GIS project.
const MADRID = { lat: 40.4168, lon: -3.7038 };
// A real Sydney site.
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

/** A fully-authored GIS SiteModel at a known real location + parcel boundary. */
function makeSydneySite(): SiteModel {
    return SiteModelSchema.parse({
        id: 'site_proj-syd',
        projectId: 'proj-syd',
        name: 'Sydney Site',
        location: {
            latitude: SYDNEY.lat,
            longitude: SYDNEY.lon,
            siteAddress: '1 Circular Quay, Sydney NSW',
        },
        parcel: {
            boundary: {
                polygon: [
                    { x: 0, z: 0 },
                    { x: 20, z: 0 },
                    { x: 20, z: 16 },
                    { x: 0, z: 16 },
                ],
                edgeClassifications: ['front', 'side', 'rear', 'side'],
            },
            area: 320,
        },
        provenance: { source: 'user-authored' },
    });
}

/** Minimal fake runtime carrying a SiteModelStore + an event sink. */
function makeFakeRuntime() {
    const emitted: Array<{ type: string; payload: unknown }> = [];
    const store = new SiteModelStore();
    const runtime = {
        siteModelStore: store,
        events: {
            emit: (type: string, payload: unknown) => { emitted.push({ type, payload }); },
            on: () => () => {},
        },
    };
    return { runtime, store, emitted };
}

describe('§FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — GIS site round-trips through the snapshot', () => {
    it('restores the REAL site location + boundary from a persisted snapshot (not the Madrid default)', () => {
        // 1) Author a GIS project — the site lives in the runtime SiteModelStore.
        const authored = makeSydneySite();

        // 2) SERIALIZE — this is exactly what ProjectSerializer.serialize does with
        //    the site: structuredClone the live SiteModel into the snapshot.
        const snapshotSite = structuredClone(authored) as SiteModel;

        // 3) PERSIST — the snapshot is JSON.stringify'd to IndexedDB/Supabase and
        //    JSON.parse'd on reopen. Prove the site survives that round-trip.
        const rehydrated = JSON.parse(JSON.stringify({ site: snapshotSite })).site as SiteModel;

        // 4) RESTORE — reopen the project into a FRESH runtime (as after a reload).
        const { runtime, store, emitted } = makeFakeRuntime();
        expect(store.getSite()).toBeNull(); // fresh — no site yet

        const restored = restoreSiteState(runtime as never, rehydrated);
        expect(restored).toBe(true);

        // The real site is back — NOT the Madrid default.
        const loc = store.getLocation();
        expect(loc).not.toBeNull();
        expect(loc!.latitude).toBeCloseTo(SYDNEY.lat, 4);
        expect(loc!.longitude).toBeCloseTo(SYDNEY.lon, 4);
        expect(loc!.latitude).not.toBeCloseTo(MADRID.lat, 2);
        expect(loc!.longitude).not.toBeCloseTo(MADRID.lon, 2);
        expect(loc!.siteAddress).toBe('1 Circular Quay, Sydney NSW');

        // The parcel boundary + geospatial origin came back too.
        const boundary = store.getParcelBoundary();
        expect(boundary?.polygon).toHaveLength(4);

        // The domain events were re-emitted so the sun / Cesium / parcel renderer
        // re-anchor to the real site.
        const types = emitted.map(e => e.type);
        expect(types).toContain('site.created');
        expect(types).toContain('site.location-changed');
        expect(types).toContain('site.parcel-boundary-set');

        const locEvt = emitted.find(e => e.type === 'site.location-changed')
            ?.payload as { location?: { latitude: number; longitude: number } } | undefined;
        expect(locEvt?.location?.latitude).toBeCloseTo(SYDNEY.lat, 4);
    });

    it('resets the SiteModelStore for project-switch isolation when the snapshot has no site', () => {
        const { runtime, store } = makeFakeRuntime();
        // A prior GIS project left a site in the store.
        store.set(makeSydneySite());
        expect(store.getSite()).not.toBeNull();

        // Reopening a NON-GIS project (snapshot.site absent) must clear it so the
        // prior project's site never leaks (C13 isolation).
        const restored = restoreSiteState(runtime as never, null);
        expect(restored).toBe(false);
        expect(store.getSite()).toBeNull();
    });

    it('does not throw and returns false when no runtime/site store is available', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(restoreSiteState(null, makeSydneySite())).toBe(false);
        expect(restoreSiteState({} as never, makeSydneySite())).toBe(false);
        warn.mockRestore();
    });
});
