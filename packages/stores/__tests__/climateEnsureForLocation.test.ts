// A.10.f (Phase A · Sprint 2) — climate.ensureForLocation tests.
//
// Headless — no network. Exercises the full ingestion path:
//   lat/lon (+ optional injected fetch) → resolved normals → ClimateDataset
//   → store.ingest → resolveSite returns the populated dataset.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NOAANormal } from '@pryzm/schemas';
import { clearNormalsCache } from '@pryzm/climate-host';
import { ClimateStore } from '../src/ClimateStore.js';
import { climateEnsureForLocation } from '../src/climate-commands/index.js';

const SITE = 'site_proj-001';

function makePayload(over: Record<string, unknown> = {}) {
    return {
        siteId: SITE,
        lat: 51.5074,
        lon: -0.1278,
        elevationM: 11,
        timezone: 'Europe/London',
        ...over,
    };
}

function fakeNoaa(seed = 0): NOAANormal[] {
    return Array.from({ length: 12 }, (_, i) => ({
        month: (i + 1) as NOAANormal['month'],
        avgDryBulbC: 12 + seed,
        avgMinDryBulbC: 7 + seed,
        avgMaxDryBulbC: 17 + seed,
        avgRelHumidityPct: 60,
        avgPrecipMm: 40,
        avgWindSpeedMps: 3.2,
        prevailingWindDirDeg: 200,
        avgGlobalHorizontalWm2: 220,
        heatingDegreeDaysBase18: 150,
        coolingDegreeDaysBase18: 20,
    }));
}

describe('climateEnsureForLocation', () => {
    beforeEach(() => clearNormalsCache());

    it('ingests a bundled (offline) dataset and resolveSite returns it', async () => {
        const store = new ClimateStore();
        const res = await climateEnsureForLocation(makePayload(), { store });
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error('unreachable');
        expect(res.event.type).toBe('climate.ingested');
        expect(res.event.source).toBe('fallback-defaults');

        const ds = store.resolveSite(SITE as never);
        expect(ds).not.toBeNull();
        expect(ds!.monthlyNormals).toHaveLength(12);
        expect(ds!.windRose.sectors).toHaveLength(16);
        expect(ds!.source).toBe('fallback-defaults');
        expect(ds!.provenance.vendor).toBe('PRYZM-builtin');
    });

    it('the dataset has the fields the FORMA.5 card + ClimatePanel read', async () => {
        const store = new ClimateStore();
        await climateEnsureForLocation(makePayload(), { store });
        const ds = store.resolveSite(SITE as never)!;
        // Temperature profile (monthlyTempSeries reads these).
        for (const n of ds.monthlyNormals) {
            expect(typeof n.avgDryBulbC).toBe('number');
            expect(typeof n.avgMinDryBulbC).toBe('number');
            expect(typeof n.avgMaxDryBulbC).toBe('number');
        }
        // Wind rose (windRoseBars reads sectors + mean/p99).
        expect(typeof ds.windRose.meanSpeedMps).toBe('number');
        expect(typeof ds.windRose.p99SpeedMps).toBe('number');
        // Source tag.
        expect(['epw', 'noaa-normals', 'fallback-defaults']).toContain(ds.source);
    });

    it('upgrades to noaa-normals tier when a live fetch is injected', async () => {
        const store = new ClimateStore();
        const fetchImpl = vi.fn(async () => fakeNoaa(5));
        const res = await climateEnsureForLocation(makePayload(), {
            store,
            fetchImpl,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error('unreachable');
        expect(res.event.source).toBe('noaa-normals');
        const ds = store.resolveSite(SITE as never)!;
        expect(ds.source).toBe('noaa-normals');
        expect(ds.provenance.vendor).toBe('NOAA NCEI');
        expect(ds.monthlyNormals[0]!.avgDryBulbC).toBe(17);
    });

    it('skips re-ingest when a dataset already exists (skipIfPresent default)', async () => {
        const store = new ClimateStore();
        await climateEnsureForLocation(makePayload(), { store });
        const ingestSpy = vi.spyOn(store, 'ingest');
        const res = await climateEnsureForLocation(makePayload(), { store });
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error('unreachable');
        expect(res.event.skipped).toBe(true);
        expect(ingestSpy).not.toHaveBeenCalled();
        expect(store.size()).toBe(1);
    });

    it('re-ingests when skipIfPresent is false', async () => {
        const store = new ClimateStore();
        await climateEnsureForLocation(makePayload(), { store });
        const res = await climateEnsureForLocation(
            makePayload({ skipIfPresent: false }),
            { store },
        );
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error('unreachable');
        expect(res.event.skipped).toBeUndefined();
        // Still one ACTIVE entry (prior marked stale + archived).
        expect(store.size()).toBe(1);
    });

    it('rejects an invalid payload (soft, no throw)', async () => {
        const store = new ClimateStore();
        const res = await climateEnsureForLocation(
            { siteId: SITE, lat: 999, lon: 0, elevationM: 0, timezone: 'UTC' },
            { store },
        );
        expect(res.ok).toBe(false);
        if (res.ok) throw new Error('unreachable');
        expect(res.reason).toBe('invalid-payload');
    });

    it('degrades to bundled when the injected fetch rejects', async () => {
        const store = new ClimateStore();
        const fetchImpl = vi.fn(async () => {
            throw new Error('offline');
        });
        const res = await climateEnsureForLocation(makePayload(), {
            store,
            fetchImpl,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error('unreachable');
        expect(res.event.source).toBe('fallback-defaults');
    });
});
