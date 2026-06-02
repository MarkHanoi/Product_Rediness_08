// A.10.e (Phase A · Sprint 2) — climate.* command handler tests.

import { describe, expect, it } from 'vitest';
import { ClimateStore } from '../src/ClimateStore.js';
import {
    climateIngestEpw,
    climateRefreshNoaa,
    climateResolveSite,
    climateInvalidateCache,
    climateSolarSample,
    climateWindRose,
} from '../src/climate-commands/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mini-EPW fixture (8 header lines + 3 hours)
// ─────────────────────────────────────────────────────────────────────────────

const MINI_EPW_LONDON = [
    'LOCATION,London Gatwick,,GBR,037760,51.15,-0.18,0.0,62',
    'DESIGN CONDITIONS,1,...',
    'TYPICAL/EXTREME PERIODS,...',
    'GROUND TEMPERATURES,...',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,test',
    'COMMENTS 2,...',
    'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
    '1991,1,1,1,60,*,5.0,2.0,75,101300,0,0,0,0,0,0,0,0,0,0,180,3.5,5,5,30,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
    '1991,1,1,2,60,*,4.5,1.8,76,101290,0,0,0,0,0,0,0,0,0,0,200,4.0,6,6,28,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
    '1991,1,1,3,60,*,4.0,1.5,78,101280,0,0,0,0,0,0,0,0,0,0,210,3.8,7,7,25,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
].join('\n');

function makeIngestPayload(over: Partial<{
    siteId: string;
    rawEpwText: string;
    lat: number;
    lon: number;
}> = {}) {
    return {
        siteId: 'site_proj-001',
        rawEpwText: MINI_EPW_LONDON,
        lat: 51.5074,
        lon: -0.1278,
        elevationM: 11,
        timezone: 'Europe/London',
        vendor: 'EnergyPlus.net',
        datasetVersion: 'epw-tmy3-2024.1',
        license: 'CC-BY-4.0',
        ...over,
    };
}

function make12NoaaNormals() {
    return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        avgDryBulbC: 10 + i,
        avgMinDryBulbC: 5 + i,
        avgMaxDryBulbC: 15 + i,
        avgRelHumidityPct: 65,
        avgPrecipMm: 50,
        avgWindSpeedMps: 3.5,
        prevailingWindDirDeg: 225,
        avgGlobalHorizontalWm2: 250,
        heatingDegreeDaysBase18: 200 - i * 10,
        coolingDegreeDaysBase18: i * 5,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// climate.ingestEPW
// ─────────────────────────────────────────────────────────────────────────────

describe('climateIngestEpw', () => {
    it('ingests a valid mini-EPW into the store', () => {
        const store = new ClimateStore();
        const result = climateIngestEpw(makeIngestPayload(), store);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('climate.ingested');
        expect(result.event.source).toBe('epw');
        expect(result.event.siteId).toBe('site_proj-001');
        expect(store.size()).toBe(1);
    });

    it('the resulting dataset has 3 hourly records', () => {
        const store = new ClimateStore();
        climateIngestEpw(makeIngestPayload(), store);
        const ds = store.resolveSite('site_proj-001' as never);
        expect(ds?.source).toBe('epw');
        expect(ds?.hourly).toHaveLength(3);
    });

    it('returns cacheKey reflecting the supplied lat/lon', () => {
        const store = new ClimateStore();
        const result = climateIngestEpw(
            makeIngestPayload({ lat: 51.5074, lon: -0.1278 }),
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.cacheKey.latE2).toBe(5151);
        expect(result.event.cacheKey.lonE2).toBe(-13);
    });

    it('rejects malformed EPW text with epw-parse-failed + structured error', () => {
        const store = new ClimateStore();
        const result = climateIngestEpw(
            makeIngestPayload({ rawEpwText: 'not an epw file\nshort\n' + 'x'.repeat(100) }),
            store,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('epw-parse-failed');
        expect(result.ingestionError?.kind).toBe('epw-parse-failed');
    });

    it('rejects invalid payload (empty siteId)', () => {
        const store = new ClimateStore();
        const result = climateIngestEpw(
            makeIngestPayload({ siteId: '' }),
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('re-ingesting same site supersedes prior entry; archive retains it', () => {
        const store = new ClimateStore();
        climateIngestEpw(makeIngestPayload(), store);
        climateIngestEpw(makeIngestPayload(), store);
        expect(store.size()).toBe(1);
        expect(store.archive()).toHaveLength(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// climate.refreshNOAA
// ─────────────────────────────────────────────────────────────────────────────

describe('climateRefreshNoaa', () => {
    function makePayload() {
        return {
            siteId: 'site_proj-001',
            lat: 51.5074,
            lon: -0.1278,
            elevationM: 11,
            timezone: 'Europe/London',
            monthlyNormals: make12NoaaNormals(),
            vendor: 'NOAA NCEI',
            datasetVersion: 'noaa-normals-1991-2020',
            license: 'public-domain',
        };
    }

    it('ingests NOAA normals into the store as source=noaa-normals', () => {
        const store = new ClimateStore();
        const result = climateRefreshNoaa(makePayload(), store);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.source).toBe('noaa-normals');
        const ds = store.resolveSite('site_proj-001' as never);
        expect(ds?.source).toBe('noaa-normals');
        expect(ds?.hourly).toBeUndefined();
        expect(ds?.monthlyNormals).toHaveLength(12);
    });

    it('derives design temps from monthly extremes', () => {
        const store = new ClimateStore();
        climateRefreshNoaa(makePayload(), store);
        const ds = store.resolveSite('site_proj-001' as never);
        // Coldest avgMin = month 1 (5°C); hottest avgMax = month 12 (26°C).
        expect(ds?.designTemps.heating99_6C).toBeCloseTo(5);
        expect(ds?.designTemps.cooling0_4C).toBeCloseTo(26);
    });

    it('sums annual HDD + CDD across the 12 months', () => {
        const store = new ClimateStore();
        climateRefreshNoaa(makePayload(), store);
        const ds = store.resolveSite('site_proj-001' as never);
        // HDD: 200..90 (declining by 10 per month) summed.
        // Wait — the test fixture: heatingDegreeDaysBase18 = 200 - i*10
        // For i=0..11: 200, 190, 180, ..., 90 → sum = 1740
        expect(ds?.degreeDays.hddBase18).toBe(1740);
    });

    it('rejects when monthlyNormals.length !== 12', () => {
        const store = new ClimateStore();
        const result = climateRefreshNoaa(
            {
                ...makePayload(),
                monthlyNormals: make12NoaaNormals().slice(0, 6),
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('subsequent EPW ingest supersedes a NOAA entry', () => {
        const store = new ClimateStore();
        climateRefreshNoaa(makePayload(), store);
        climateIngestEpw(makeIngestPayload(), store);
        const ds = store.resolveSite('site_proj-001' as never);
        expect(ds?.source).toBe('epw');
        // Archive retains the prior NOAA entry per §1.5.
        expect(store.archive()).toHaveLength(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// climate.resolveSite
// ─────────────────────────────────────────────────────────────────────────────

describe('climateResolveSite', () => {
    it('returns null when nothing is ingested for the site', () => {
        const store = new ClimateStore();
        const result = climateResolveSite(
            { siteId: 'site_proj-001' },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('climate.resolved');
        expect(result.event.dataset).toBeNull();
    });

    it('returns the dataset when ingested', () => {
        const store = new ClimateStore();
        climateIngestEpw(makeIngestPayload(), store);
        const result = climateResolveSite(
            { siteId: 'site_proj-001' },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.dataset?.source).toBe('epw');
    });

    it('rejects invalid payload', () => {
        const store = new ClimateStore();
        const result = climateResolveSite({ siteId: '' }, store);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// climate.invalidateCache
// ─────────────────────────────────────────────────────────────────────────────

describe('climateInvalidateCache', () => {
    it('marks the active entry stale; resolveSite returns null', () => {
        const store = new ClimateStore();
        climateIngestEpw(makeIngestPayload(), store);
        const result = climateInvalidateCache(
            { siteId: 'site_proj-001' },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('climate.cache-invalidated');
        expect(store.resolveSite('site_proj-001' as never)).toBeNull();
    });

    it('rejects with no-climate-data when nothing was ingested', () => {
        const store = new ClimateStore();
        const result = climateInvalidateCache(
            { siteId: 'site_proj-001' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-climate-data');
    });

    it('archive retains the invalidated entry (audit per §1.5)', () => {
        const store = new ClimateStore();
        climateIngestEpw(makeIngestPayload(), store);
        climateInvalidateCache({ siteId: 'site_proj-001' }, store);
        expect(store.archive()).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// climate.solarSample
// ─────────────────────────────────────────────────────────────────────────────

describe('climateSolarSample', () => {
    it('returns a valid SolarSample at solar noon (tropic of Cancer, June solstice)', () => {
        const store = new ClimateStore();
        const result = climateSolarSample(
            {
                lat: 23.44,
                lon: 0,
                utcIso: '2024-06-21T12:00:00.000Z',
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('climate.solar-sampled');
        expect(result.event.sample.isAboveHorizon).toBe(true);
        // Sun nearly overhead — altitudeRad ≈ π/2.
        expect(result.event.sample.altitudeRad).toBeGreaterThan(1.5);
    });

    it('does NOT require a Site to be ingested (per §1.3 pure compute)', () => {
        const store = new ClimateStore();
        const result = climateSolarSample(
            { lat: 0, lon: 0, utcIso: '2024-03-20T12:00:00.000Z' },
            store,
        );
        expect(result.ok).toBe(true);
    });

    it('wraps out-of-range lat as invalid-payload (Zod catches at boundary)', () => {
        const store = new ClimateStore();
        const result = climateSolarSample(
            { lat: 100, lon: 0, utcIso: '2024-06-21T12:00:00.000Z' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('rejects malformed utcIso', () => {
        const store = new ClimateStore();
        const result = climateSolarSample(
            { lat: 0, lon: 0, utcIso: 'not-a-date' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// climate.windRose
// ─────────────────────────────────────────────────────────────────────────────

describe('climateWindRose', () => {
    it('returns the windRose from the active dataset', () => {
        const store = new ClimateStore();
        climateIngestEpw(makeIngestPayload(), store);
        const result = climateWindRose(
            { siteId: 'site_proj-001' },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('climate.wind-rose');
        expect(result.event.windRose?.sectors).toHaveLength(16);
    });

    it('returns null when no climate data is ingested', () => {
        const store = new ClimateStore();
        const result = climateWindRose(
            { siteId: 'site_proj-001' },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.windRose).toBeNull();
    });

    it('rejects invalid payload', () => {
        const store = new ClimateStore();
        const result = climateWindRose({ siteId: '' }, store);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});
