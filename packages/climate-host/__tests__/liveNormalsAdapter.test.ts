// CLIMATE-LIVE-DATA — Open-Meteo + PVGIS live keyless adapter tests.
//
// HEADLESS — NO network. The `fetch` is a FIXTURE stub: a captured Open-Meteo
// monthly/daily response → 12 valid NOAANormal entries; a malformed response →
// null (→ bundled fallback); PVGIS GHI refinement; cache-free pure mapping.

import { describe, expect, it, vi } from 'vitest';
import { NOAANormalSchema } from '@pryzm/schemas';
import {
    fetchLiveNormals,
    mapOpenMeteoToNormals,
    mapPvgisMonthlyGhi,
    buildOpenMeteoUrl,
    buildPvgisUrl,
    OPEN_METEO_ORIGIN,
    PVGIS_ORIGIN,
    type FetchLike,
} from '../src/liveNormalsAdapter.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A captured-shape Open-Meteo daily response. To keep the fixture compact
 *  yet exercise all-12-month aggregation, we emit one representative day per
 *  month (the adapter aggregates per calendar month, so 1 day/month is a
 *  valid — if coarse — gap-free year). */
function openMeteoFixture(): unknown {
    const time: string[] = [];
    const tmean: number[] = [];
    const tmax: number[] = [];
    const tmin: number[] = [];
    const rh: number[] = [];
    const precip: number[] = [];
    const wind: number[] = [];
    const wdir: number[] = [];
    const rad: number[] = [];
    // A plausible N-hemisphere seasonal cycle.
    const meanByMonth = [3, 4, 7, 11, 15, 18, 20, 19, 16, 12, 7, 4];
    for (let m = 1; m <= 12; m += 1) {
        const mm = String(m).padStart(2, '0');
        time.push(`2010-${mm}-15`);
        const mean = meanByMonth[m - 1]!;
        tmean.push(mean);
        tmax.push(mean + 4);
        tmin.push(mean - 4);
        rh.push(72);
        precip.push(2); // mm/day
        wind.push(4.0);
        wdir.push(225); // SW
        rad.push(m >= 4 && m <= 9 ? 18 : 8); // MJ/m²/day
    }
    return {
        latitude: 51.5,
        longitude: -0.12,
        daily: {
            time,
            temperature_2m_mean: tmean,
            temperature_2m_max: tmax,
            temperature_2m_min: tmin,
            relative_humidity_2m_mean: rh,
            precipitation_sum: precip,
            windspeed_10m_mean: wind,
            winddirection_10m_dominant: wdir,
            shortwave_radiation_sum: rad,
        },
    };
}

/** A captured-shape PVGIS MRcalc monthly response (H(h)_m kWh/m²/month). */
function pvgisFixture(): unknown {
    return {
        inputs: {},
        outputs: {
            monthly: Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                'H(h)_m': i >= 3 && i <= 8 ? 160 : 40, // kWh/m²/month
            })),
        },
    };
}

/** A fetch stub that routes by URL: Open-Meteo vs PVGIS, each with an
 *  overridable response + ok flag. */
function makeFetchStub(opts: {
    openMeteo?: unknown;
    openMeteoOk?: boolean;
    pvgis?: unknown;
    pvgisOk?: boolean;
}): FetchLike & { calls: string[] } {
    const calls: string[] = [];
    const fn = vi.fn(async (url: string) => {
        calls.push(url);
        const isPvgis = url.startsWith(PVGIS_ORIGIN);
        const ok = isPvgis ? (opts.pvgisOk ?? true) : (opts.openMeteoOk ?? true);
        const body = isPvgis ? opts.pvgis : opts.openMeteo;
        return {
            ok,
            status: ok ? 200 : 503,
            json: async () => body,
        };
    }) as unknown as FetchLike & { calls: string[] };
    (fn as { calls: string[] }).calls = calls;
    return fn;
}

// ── URL builders ──────────────────────────────────────────────────────────────

describe('URL builders', () => {
    it('Open-Meteo URL targets the keyless climate-api origin + daily fields', () => {
        const url = buildOpenMeteoUrl(51.5, -0.12);
        expect(url.startsWith(OPEN_METEO_ORIGIN)).toBe(true);
        expect(url).toContain('latitude=51.5');
        expect(url).toContain('temperature_2m_mean');
        expect(url).toContain('windspeed_10m_mean');
        expect(url).toContain('shortwave_radiation_sum');
    });

    it('PVGIS URL targets the JRC origin with JSON monthly horizontal irradiation', () => {
        const url = buildPvgisUrl(40, -74);
        expect(url.startsWith(PVGIS_ORIGIN)).toBe(true);
        expect(url).toContain('outputformat=json');
        expect(url).toContain('horirrad=1');
    });
});

// ── Pure mappers ──────────────────────────────────────────────────────────────

describe('mapOpenMeteoToNormals', () => {
    it('maps a captured daily response to 12 valid NOAANormal entries', () => {
        const normals = mapOpenMeteoToNormals(openMeteoFixture());
        expect(normals).not.toBeNull();
        expect(normals!).toHaveLength(12);
        // Every entry validates against the canonical schema.
        for (const n of normals!) {
            expect(() => NOAANormalSchema.parse(n)).not.toThrow();
        }
        // Months are 1..12 in order.
        expect(normals!.map((n) => n.month)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
        ]);
    });

    it('derives min/max around the mean + a SW prevailing wind direction', () => {
        const normals = mapOpenMeteoToNormals(openMeteoFixture())!;
        const jul = normals[6]!; // July
        expect(jul.avgDryBulbC).toBeCloseTo(20, 1);
        expect(jul.avgMaxDryBulbC).toBeCloseTo(24, 1);
        expect(jul.avgMinDryBulbC).toBeCloseTo(16, 1);
        // Circular mean of a constant 225° is ~225° (SW).
        expect(jul.prevailingWindDirDeg).toBeCloseTo(225, 0);
        expect(jul.avgWindSpeedMps).toBeCloseTo(4.0, 1);
    });

    it('converts shortwave radiation MJ/day to a sane W/m² GHI', () => {
        const normals = mapOpenMeteoToNormals(openMeteoFixture())!;
        // 18 MJ/m²/day → ~208 W/m² mean (18e6 / 86400).
        expect(normals[6]!.avgGlobalHorizontalWm2).toBeGreaterThan(150);
        expect(normals[6]!.avgGlobalHorizontalWm2).toBeLessThan(260);
    });

    it('returns null for a malformed response (no daily block)', () => {
        expect(mapOpenMeteoToNormals({ error: true })).toBeNull();
        expect(mapOpenMeteoToNormals(null)).toBeNull();
        expect(mapOpenMeteoToNormals({ daily: { time: [] } })).toBeNull();
    });

    it('returns null when a month has zero coverage (gap in the year)', () => {
        const fx = openMeteoFixture() as { daily: { time: string[] } };
        // Drop every December sample → month 12 has no data.
        const drop = (arr: unknown[]) => arr.slice(0, 11);
        const d = (fx as any).daily;
        for (const k of Object.keys(d)) d[k] = drop(d[k]);
        expect(mapOpenMeteoToNormals(fx)).toBeNull();
    });
});

describe('mapPvgisMonthlyGhi', () => {
    it('extracts 12 monthly GHI means (W/m²) from H(h)_m kWh/month', () => {
        const ghi = mapPvgisMonthlyGhi(pvgisFixture());
        expect(ghi).not.toBeNull();
        expect(ghi!).toHaveLength(12);
        // 160 kWh/month → ~219 W/m² (160*1000/730.5).
        expect(ghi![5]).toBeGreaterThan(180);
        expect(ghi![5]).toBeLessThan(260);
    });

    it('returns null for a malformed PVGIS response', () => {
        expect(mapPvgisMonthlyGhi({ outputs: {} })).toBeNull();
        expect(mapPvgisMonthlyGhi(null)).toBeNull();
    });
});

// ── End-to-end fetchLiveNormals ───────────────────────────────────────────────

describe('fetchLiveNormals', () => {
    it('fetches Open-Meteo + PVGIS and returns a provenance-tagged result', async () => {
        const fetchImpl = makeFetchStub({
            openMeteo: openMeteoFixture(),
            pvgis: pvgisFixture(),
        });
        const res = await fetchLiveNormals(51.5, -0.12, { fetchImpl });
        expect(res).not.toBeNull();
        expect(res!.monthlyNormals).toHaveLength(12);
        expect(res!.vendor).toContain('Open-Meteo');
        expect(res!.license).toBe('CC-BY-4.0');
        // PVGIS refined the June GHI to ~219 W/m² (overrides Open-Meteo's ~208).
        expect(res!.monthlyNormals[5]!.avgGlobalHorizontalWm2).toBeGreaterThan(180);
    });

    it('still succeeds (Open-Meteo only) when PVGIS fails', async () => {
        const fetchImpl = makeFetchStub({
            openMeteo: openMeteoFixture(),
            pvgisOk: false,
        });
        const res = await fetchLiveNormals(51.5, -0.12, { fetchImpl });
        expect(res).not.toBeNull();
        expect(res!.monthlyNormals).toHaveLength(12);
        // GHI is the Open-Meteo-derived value (PVGIS did not override).
        expect(res!.monthlyNormals[6]!.avgGlobalHorizontalWm2).toBeGreaterThan(0);
    });

    it('skips PVGIS when skipPvgis is set (single fetch)', async () => {
        const fetchImpl = makeFetchStub({ openMeteo: openMeteoFixture() });
        const res = await fetchLiveNormals(51.5, -0.12, {
            fetchImpl,
            skipPvgis: true,
        });
        expect(res).not.toBeNull();
        expect((fetchImpl as { calls: string[] }).calls).toHaveLength(1);
    });

    it('returns null when Open-Meteo is not ok (→ bundled fallback upstream)', async () => {
        const fetchImpl = makeFetchStub({ openMeteoOk: false });
        const res = await fetchLiveNormals(51.5, -0.12, { fetchImpl });
        expect(res).toBeNull();
    });

    it('returns null on a malformed Open-Meteo body', async () => {
        const fetchImpl = makeFetchStub({ openMeteo: { nope: 1 } });
        const res = await fetchLiveNormals(51.5, -0.12, { fetchImpl });
        expect(res).toBeNull();
    });

    it('never throws even when fetch itself rejects', async () => {
        const fetchImpl = (async () => {
            throw new Error('network down');
        }) as unknown as FetchLike;
        const res = await fetchLiveNormals(51.5, -0.12, { fetchImpl });
        expect(res).toBeNull();
    });
});
