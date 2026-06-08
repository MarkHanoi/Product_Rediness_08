// CLIMATE-LIVE-DATA — ensureSiteClimate wiring test (HEADLESS, no network).
//
// Verifies the L5 glue picks LIVE data when an injected fetch succeeds and
// degrades to the BUNDLED default when it does not — without ever performing
// real network I/O (the fetch is a fixture stub injected via `opts.fetchImpl`).

import { beforeEach, describe, expect, it } from 'vitest';
import { ClimateStore, SiteModelStore } from '@pryzm/stores';
import { ensureSiteClimate } from '../src/ui/climate/ensureSiteClimate';
import {
    makeLiveClimateFetch,
    LIVE_CLIMATE_ORIGINS,
} from '../src/ui/climate/liveClimateFetch';
import {
    clearNormalsCache,
    OPEN_METEO_ORIGIN,
    PVGIS_ORIGIN,
    type FetchLike,
} from '@pryzm/climate-host';

// ── Runtime fake ──────────────────────────────────────────────────────────────

function fakeRuntime(climateStore: ClimateStore) {
    return {
        siteModelStore: {
            getSite: () => ({ id: 'site_proj-live-001' }),
            getLocation: () => ({
                latitude: 51.5074,
                longitude: -0.1278,
                elevationAsl: 11,
            }),
        },
        climateStore,
    } as unknown as Parameters<typeof ensureSiteClimate>[0];
}

// ── Fixtures (1 representative day/month → gap-free 12 months) ─────────────────

function openMeteoFixture(): unknown {
    const mk = (n: number) => Array.from({ length: 12 }, () => n);
    const time = Array.from({ length: 12 }, (_, i) =>
        `2010-${String(i + 1).padStart(2, '0')}-15`,
    );
    return {
        daily: {
            time,
            temperature_2m_mean: Array.from({ length: 12 }, (_, i) => 5 + i),
            temperature_2m_max: Array.from({ length: 12 }, (_, i) => 9 + i),
            temperature_2m_min: Array.from({ length: 12 }, (_, i) => 1 + i),
            relative_humidity_2m_mean: mk(70),
            precipitation_sum: mk(2),
            windspeed_10m_mean: mk(4),
            winddirection_10m_dominant: mk(225),
            shortwave_radiation_sum: mk(15),
        },
    };
}

function liveFetchStub(): FetchLike {
    return (async (url: string) => ({
        ok: true,
        status: 200,
        // PVGIS shape would have outputs.monthly; we return Open-Meteo for the
        // climate-api host and an empty (ignored) body for PVGIS.
        json: async () =>
            url.startsWith(OPEN_METEO_ORIGIN) ? openMeteoFixture() : {},
    })) as unknown as FetchLike;
}

const SITE = 'site_proj-live-001';

describe('ensureSiteClimate — live wiring', () => {
    beforeEach(() => clearNormalsCache());

    it('uses LIVE Open-Meteo data when the injected fetch succeeds', async () => {
        const store = new ClimateStore();
        const fetchImpl = makeLiveClimateFetch(liveFetchStub());
        const ok = await ensureSiteClimate(fakeRuntime(store), { fetchImpl });
        expect(ok).toBe(true);
        const ds = store.resolveSite(SITE as never)!;
        expect(ds).not.toBeNull();
        expect(ds.source).toBe('noaa-normals'); // live tier
        expect(ds.provenance.vendor).toContain('Open-Meteo');
        expect(ds.monthlyNormals).toHaveLength(12);
    });

    it('degrades to BUNDLED when the live fetch yields no usable data', async () => {
        const store = new ClimateStore();
        // A fetch that always 503s → adapter returns null → bundled fallback.
        const failing = (async () => ({
            ok: false,
            status: 503,
            json: async () => ({}),
        })) as unknown as FetchLike;
        const fetchImpl = makeLiveClimateFetch(failing);
        const ok = await ensureSiteClimate(fakeRuntime(store), { fetchImpl });
        expect(ok).toBe(true);
        const ds = store.resolveSite(SITE as never)!;
        expect(ds.source).toBe('fallback-defaults');
        expect(ds.provenance.vendor).toBe('PRYZM-builtin');
    });

    it('forces BUNDLED when fetchImpl is explicitly null', async () => {
        const store = new ClimateStore();
        const ok = await ensureSiteClimate(fakeRuntime(store), {
            fetchImpl: null,
        });
        expect(ok).toBe(true);
        expect(store.resolveSite(SITE as never)!.source).toBe('fallback-defaults');
    });

    it('returns false with no site/location', async () => {
        const store = new ClimateStore();
        const runtime = {
            siteModelStore: { getSite: () => null, getLocation: () => null },
            climateStore: store,
        } as unknown as Parameters<typeof ensureSiteClimate>[0];
        expect(await ensureSiteClimate(runtime)).toBe(false);
    });

    it('exposes the two CSP origins that connect-src must allow', () => {
        expect(LIVE_CLIMATE_ORIGINS).toContain(OPEN_METEO_ORIGIN);
        expect(LIVE_CLIMATE_ORIGINS).toContain(PVGIS_ORIGIN);
    });

    // §A.21.D39(#7) — the generate-house → Forma flow: a location is resolvable
    // (sun-path renders) but NO Site aggregate exists yet, so the climate dataset
    // had nothing to key to and the wind rose sat on "No wind data". ensureSiteClimate
    // must AUTO-CREATE the deterministic Site and ingest the bundled dataset under
    // the SAME id the wind-rose/overlay reads (resolveSite(getSite().id)).
    it('auto-creates the Site + ingests bundled climate when only a location exists (house→Forma)', async () => {
        const climate = new ClimateStore();
        // A real SiteModelStore that starts with NO Site (mirrors the house flow:
        // walls generated, origin known, but no Site aggregate authored).
        const siteStore = new SiteModelStore();
        // The runtime exposes the real store for getSite()/set() (so the auto-create
        // round-trips), but a location resolvable from the start (the LTP origin /
        // geocoded plot the house was generated at).
        const runtime = {
            audit: { projectId: 'proj-house-001', actorId: 'u', clientId: 'c' },
            siteModelStore: {
                getSite: () => siteStore.getSite(),
                getLocation: () => ({ latitude: 41.3874, longitude: 2.1686, elevationAsl: 12 }),
                set: (s: unknown) => siteStore.set(s as never),
            },
            climateStore: climate,
            events: { emit: () => {}, on: () => () => {} },
        } as unknown as Parameters<typeof ensureSiteClimate>[0];

        expect(siteStore.getSite()).toBeNull();
        const ok = await ensureSiteClimate(runtime, { fetchImpl: null }); // bundled only
        expect(ok).toBe(true);

        // The Site was created with the deterministic id…
        const created = siteStore.getSite();
        expect(created).not.toBeNull();
        expect(created!.id).toBe('site_proj-house-001');

        // …and the wind-rose/overlay read (resolveSite(getSite().id)) returns the
        // dataset with a NON-EMPTY wind rose (the thing that was failing).
        const ds = climate.resolveSite(created!.id as never);
        expect(ds).not.toBeNull();
        expect(ds!.source).toBe('fallback-defaults');
        const totalWindHours = ds!.windRose.sectors.reduce(
            (a, s) => a + s.speedBinHours.reduce((b, h) => b + h, 0),
            0,
        );
        expect(totalWindHours).toBeGreaterThan(0);
        expect(ds!.windRose.meanSpeedMps).toBeGreaterThan(0);
    });

    it('falls back to projectContext.projectId when audit.projectId is empty (house demo path)', async () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        // audit.projectId EMPTY (the house demo gap) but projectContext carries it —
        // resolveActiveProjectId must use it so the Site is still keyed correctly.
        const runtime = {
            audit: { projectId: '', actorId: 'u', clientId: 'c' },
            projectContext: { projectId: 'proj-ctx-002', projectName: 'Casa', levelId: null },
            siteModelStore: {
                getSite: () => siteStore.getSite(),
                getLocation: () => ({ latitude: 48.8566, longitude: 2.3522, elevationAsl: 35 }),
                set: (s: unknown) => siteStore.set(s as never),
            },
            climateStore: climate,
            events: { emit: () => {}, on: () => () => {} },
        } as unknown as Parameters<typeof ensureSiteClimate>[0];
        const ok = await ensureSiteClimate(runtime, { fetchImpl: null });
        expect(ok).toBe(true);
        const created = siteStore.getSite();
        expect(created!.id).toBe('site_proj-ctx-002');
        expect(climate.resolveSite(created!.id as never)).not.toBeNull();
    });

    // §A.21.D40(#6) — DEAD-BRANCH FIX. On the editor, `window.projectContext` is the
    // core-app-model ProjectContext (no `projectId` field), so the D39 third fallback
    // was always undefined. The legacy `window.__pendingProjectId` global IS populated
    // on the house demo flow → it must key the Site when audit + runtime.projectContext
    // are both empty. (No DOM env here, so mirror the global onto `globalThis.window`.)
    it('falls back to window.__pendingProjectId when audit + projectContext are empty', async () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        const g = globalThis as unknown as { window?: unknown };
        const hadWindow = 'window' in g;
        const prevWindow = g.window;
        // siteDispatch reads `window.__pendingProjectId`; resolveSiteContext also
        // reads `window.runtime` (left absent — we pass the runtime explicitly).
        g.window = { __pendingProjectId: 'proj-pending-003' };
        try {
            const runtime = {
                audit: { projectId: '', actorId: 'u', clientId: 'c' },
                // No projectContext → forces the window.__pendingProjectId branch.
                siteModelStore: {
                    getSite: () => siteStore.getSite(),
                    getLocation: () => ({ latitude: 41.39, longitude: 2.17, elevationAsl: 5 }),
                    set: (s: unknown) => siteStore.set(s as never),
                },
                climateStore: climate,
                events: { emit: () => {}, on: () => () => {} },
            } as unknown as Parameters<typeof ensureSiteClimate>[0];
            const ok = await ensureSiteClimate(runtime, { fetchImpl: null });
            expect(ok).toBe(true);
            const created = siteStore.getSite();
            expect(created!.id).toBe('site_proj-pending-003');
            expect(climate.resolveSite(created!.id as never)).not.toBeNull();
        } finally {
            if (hadWindow) g.window = prevWindow;
            else delete g.window;
        }
    });

    it('makeLiveClimateFetch returns undefined when no fetch is available', () => {
        // Simulate a headless runtime with no global fetch by removing it.
        const prev = (globalThis as { fetch?: unknown }).fetch;
        try {
            delete (globalThis as { fetch?: unknown }).fetch;
            expect(makeLiveClimateFetch()).toBeUndefined();
        } finally {
            (globalThis as { fetch?: unknown }).fetch = prev;
        }
    });
});
