// CLIMATE-LIVE-DATA — ensureSiteClimate wiring test (HEADLESS, no network).
//
// Verifies the L5 glue picks LIVE data when an injected fetch succeeds and
// degrades to the BUNDLED default when it does not — without ever performing
// real network I/O (the fetch is a fixture stub injected via `opts.fetchImpl`).

import { beforeEach, describe, expect, it } from 'vitest';
import { ClimateStore } from '@pryzm/stores';
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
