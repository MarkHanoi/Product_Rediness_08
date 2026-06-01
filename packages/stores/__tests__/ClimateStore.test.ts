// A.10.d (Phase A · Sprint 2) — L3 ClimateStore tests.

import { describe, expect, it, vi } from 'vitest';
import {
    ClimateDatasetSchema,
    quantiseToCacheKey,
    type ClimateDataset,
} from '@pryzm/schemas';
import { ClimateStore } from '../src/ClimateStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

let counter = 0;
function makeId(): string {
    counter += 1;
    return `climate:${'a'.repeat(16)}${String(counter).padStart(4, '0')}`;
}

function makeRose() {
    const sectors = Array.from({ length: 16 }, (_, i) => ({
        sectorDeg: i * 22.5,
        speedBinHours: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
    }));
    return { sectors, meanSpeedMps: 4, p99SpeedMps: 18 };
}

function makeNormals() {
    return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        avgDryBulbC: 10,
        avgMinDryBulbC: 6,
        avgMaxDryBulbC: 14,
        avgRelHumidityPct: 65,
        avgPrecipMm: 50,
        avgWindSpeedMps: 3.5,
        prevailingWindDirDeg: 270,
        avgGlobalHorizontalWm2: 250,
        heatingDegreeDaysBase18: 200,
        coolingDegreeDaysBase18: 0,
    }));
}

function makeDataset(overrides: Partial<{
    id: string;
    siteRef: string;
    lat: number;
    lon: number;
    source: 'epw' | 'noaa-normals' | 'fallback-defaults';
    datasetVersion: string;
}> = {}): ClimateDataset {
    return ClimateDatasetSchema.parse({
        id: overrides.id ?? makeId(),
        siteRef: overrides.siteRef ?? 'site_proj-001',
        lat: overrides.lat ?? 51.5074,
        lon: overrides.lon ?? -0.1278,
        elevationM: 11,
        timezone: 'Europe/London',
        source: overrides.source ?? 'noaa-normals',
        monthlyNormals: makeNormals(),
        windRose: makeRose(),
        designTemps: {
            heating99_6C: -3.5,
            cooling0_4C: 29.5,
            cooling0_4MwbC: 21,
        },
        degreeDays: {
            hddBase18: 2200,
            cddBase18: 50,
            hddBase65F: 2150,
            cddBase65F: 55,
        },
        provenance: {
            source: overrides.source ?? 'noaa-normals',
            vendor: 'NOAA NCEI',
            datasetVersion: overrides.datasetVersion ?? 'noaa-normals-1991-2020',
            fetchedAtUtcIso: '2026-06-01T12:00:00.000Z',
            license: 'public-domain',
        },
        ingestedAtUtcIso: '2026-06-01T12:00:01.000Z',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction + initial state
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateStore — construction', () => {
    it('starts empty', () => {
        const s = new ClimateStore();
        expect(s.size()).toBe(0);
        expect(s.resolveSite('site_proj-001' as never)).toBeNull();
        expect(s.archive()).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ingest + resolve
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateStore — ingest + resolveSite', () => {
    it('ingest() stores the dataset, resolveSite() returns it', () => {
        const s = new ClimateStore();
        const d = makeDataset({ siteRef: 'site_a' });
        s.ingest(d);
        expect(s.resolveSite('site_a' as never)).toBe(d);
        expect(s.size()).toBe(1);
    });

    it('ingest() returns the cache key', () => {
        const s = new ClimateStore();
        const d = makeDataset({ lat: 51.5074, lon: -0.1278 });
        const key = s.ingest(d);
        expect(key.latE2).toBe(5151);
        expect(key.lonE2).toBe(-13);
        expect(key.datasetVersion).toBe('noaa-normals-1991-2020');
    });

    it('re-ingesting for the same site supersedes the prior entry', () => {
        const s = new ClimateStore();
        const d1 = makeDataset({ siteRef: 'site_a', source: 'noaa-normals' });
        const d2 = makeDataset({ siteRef: 'site_a', source: 'epw' });
        s.ingest(d1);
        s.ingest(d2);
        expect(s.resolveSite('site_a' as never)).toBe(d2);
    });

    it('prior superseded entry is retained in archive (audit per §1.5)', () => {
        const s = new ClimateStore();
        const d1 = makeDataset({ siteRef: 'site_a', source: 'noaa-normals' });
        const d2 = makeDataset({ siteRef: 'site_a', source: 'epw' });
        s.ingest(d1);
        s.ingest(d2);
        const archive = s.archive();
        expect(archive).toHaveLength(2);
        expect(archive[0]).toBe(d1);   // older entry kept
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache key resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateStore — cache key lookup', () => {
    it('resolveByCacheKey returns the dataset when the slot is filled', () => {
        const s = new ClimateStore();
        const d = makeDataset({ lat: 51.5074, lon: -0.1278 });
        s.ingest(d);
        const got = s.resolveByCacheKey(
            quantiseToCacheKey(51.5074, -0.1278, 'noaa-normals-1991-2020'),
        );
        expect(got).toBe(d);
    });

    it('resolveByLatLon convenience helper agrees', () => {
        const s = new ClimateStore();
        const d = makeDataset({ lat: 51.5074, lon: -0.1278 });
        s.ingest(d);
        const got = s.resolveByLatLon(
            51.5074,
            -0.1278,
            'noaa-normals-1991-2020',
        );
        expect(got).toBe(d);
    });

    it('cache hit for two sites within ~1 km (lat/lon round to 0.01°)', () => {
        const s = new ClimateStore();
        // Site A at 51.5074, -0.1278; Site B at 51.5081, -0.1275 (~80m away).
        const a = makeDataset({ siteRef: 'site_a', lat: 51.5074, lon: -0.1278 });
        s.ingest(a);
        const got = s.resolveByLatLon(
            51.5081,
            -0.1275,
            'noaa-normals-1991-2020',
        );
        expect(got).toBe(a);
    });

    it('different dataset versions get different cache slots', () => {
        const s = new ClimateStore();
        const d2020 = makeDataset({
            siteRef: 'site_a',
            datasetVersion: 'noaa-normals-1991-2020',
        });
        s.ingest(d2020);
        const got = s.resolveByLatLon(51.5074, -0.1278, 'epw-tmy3-2024.1');
        expect(got).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// invalidateCache (§1.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateStore — invalidateCache', () => {
    it('marks the entry stale; resolveSite returns null', () => {
        const s = new ClimateStore();
        const d = makeDataset({ siteRef: 'site_a' });
        s.ingest(d);
        s.invalidateCache('site_a' as never);
        expect(s.resolveSite('site_a' as never)).toBeNull();
    });

    it('archive STILL contains the invalidated entry (audit retention §1.5)', () => {
        const s = new ClimateStore();
        const d = makeDataset({ siteRef: 'site_a' });
        s.ingest(d);
        s.invalidateCache('site_a' as never);
        expect(s.archive()).toHaveLength(1);
    });

    it('invalidating unknown site is a no-op (does not fire listeners)', () => {
        const s = new ClimateStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.invalidateCache('site_x' as never);
        expect(listener).not.toHaveBeenCalled();
    });

    it('size() reflects active (non-stale) count', () => {
        const s = new ClimateStore();
        s.ingest(makeDataset({ siteRef: 'site_a' }));
        s.ingest(makeDataset({ siteRef: 'site_b' }));
        expect(s.size()).toBe(2);
        s.invalidateCache('site_a' as never);
        expect(s.size()).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// reset (C13 project-switch hook)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateStore — reset()', () => {
    it('clears all state and fires listeners', () => {
        const s = new ClimateStore();
        s.ingest(makeDataset({ siteRef: 'site_a' }));
        s.ingest(makeDataset({ siteRef: 'site_b' }));
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(s.size()).toBe(0);
        expect(s.archive()).toEqual([]);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('reset on empty store is a no-op (no listener fire)', () => {
        const s = new ClimateStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(listener).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// subscribe / dispose
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateStore — subscribe', () => {
    it('fires listeners on ingest', () => {
        const s = new ClimateStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.ingest(makeDataset({ siteRef: 'site_a' }));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops further notifications', () => {
        const s = new ClimateStore();
        const listener = vi.fn();
        const unsub = s.subscribe(listener);
        s.ingest(makeDataset({ siteRef: 'site_a' }));
        unsub();
        s.ingest(makeDataset({ siteRef: 'site_b' }));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not break the fan-out', () => {
        const s = new ClimateStore();
        const throwing = vi.fn(() => {
            throw new Error('boom');
        });
        const good = vi.fn();
        s.subscribe(throwing);
        s.subscribe(good);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        s.ingest(makeDataset({ siteRef: 'site_a' }));
        expect(throwing).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('ClimateStore — dispose', () => {
    it('clears state + listeners; further ingest is a no-op', () => {
        const s = new ClimateStore();
        const listener = vi.fn();
        s.ingest(makeDataset({ siteRef: 'site_a' }));
        s.subscribe(listener);
        s.dispose();
        expect(s.size()).toBe(0);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        s.ingest(makeDataset({ siteRef: 'site_b' }));
        expect(listener).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('is idempotent', () => {
        const s = new ClimateStore();
        s.dispose();
        expect(() => s.dispose()).not.toThrow();
    });
});
