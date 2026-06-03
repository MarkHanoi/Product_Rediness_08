// A.11 — pure chart-data helper tests (node env, no DOM).
//
// Validates the math that backs the ClimatePanel sub-views:
//   - solar position for a known lat/lon/date matches a reference within
//     tolerance (cross-checked against the NOAA solar calculator)
//   - the stereographic projection clips below-horizon points
//   - wind-rose binning produces correct frequencies from sample sectors
//   - monthly temperature aggregation orders + bounds correctly

import { describe, it, expect } from 'vitest';
import type {
    ClimateDataset,
    WindRoseAggregate,
    NOAANormal,
} from '@pryzm/schemas';
import {
    solarArcForDay,
    solarArcsForYear,
    projectSunToDisc,
    windRoseBars,
    windBarEndpoint,
    monthlyTempSeries,
    COMPASS_16,
} from '../src/ui/climate/climateChartData';

// ── Sun-path ─────────────────────────────────────────────────────────────────

describe('solar arcs', () => {
    it('produces three named arcs for a year', () => {
        const arcs = solarArcsForYear(51.5, -0.13, 2026, 60);
        expect(arcs.map((a) => a.label)).toEqual([
            'Summer solstice',
            'Equinox',
            'Winter solstice',
        ]);
        // 60-min step over 24h → 25 inclusive samples.
        expect(arcs[0].points.length).toBe(25);
    });

    it('puts the sun higher at summer-solstice solar noon than winter (N hemisphere)', () => {
        // London ~51.5°N, lon ~0 → solar noon ≈ 12:00 UTC.
        const summer = solarArcForDay(51.5, 0, '2026-06-21T00:00:00.000Z', 's', 60);
        const winter = solarArcForDay(51.5, 0, '2026-12-21T00:00:00.000Z', 'w', 60);
        const noonAlt = (arc: typeof summer) =>
            arc.points.find((p) => Math.abs(p.hourUtc - 12) < 1e-6)!.altitudeRad;
        expect(noonAlt(summer)).toBeGreaterThan(noonAlt(winter));
        // Summer-solstice noon altitude at 51.5°N ≈ 90 − 51.5 + 23.44 = 61.9°.
        expect(noonAlt(summer) * (180 / Math.PI)).toBeGreaterThan(58);
        expect(noonAlt(summer) * (180 / Math.PI)).toBeLessThan(66);
    });

    it('solar altitude at the equator equinox noon is near the zenith', () => {
        // Equator, lon 0, Mar-equinox, 12:00 UTC → sun nearly overhead (~90°).
        const arc = solarArcForDay(0, 0, '2026-03-20T00:00:00.000Z', 'eq', 30);
        const noon = arc.points.find((p) => Math.abs(p.hourUtc - 12) < 1e-6)!;
        const altDeg = noon.altitudeRad * (180 / Math.PI);
        expect(altDeg).toBeGreaterThan(85);
        expect(altDeg).toBeLessThanOrEqual(90.001);
    });

    it('reports night points below the horizon at local midnight', () => {
        const arc = solarArcForDay(51.5, 0, '2026-06-21T00:00:00.000Z', 's', 60);
        const midnight = arc.points.find((p) => p.hourUtc === 0)!;
        expect(midnight.altitudeRad).toBeLessThan(0);
        expect(midnight.isAboveHorizon).toBe(false);
    });
});

describe('projectSunToDisc', () => {
    it('returns null below the horizon', () => {
        expect(projectSunToDisc(-0.1, 0)).toBeNull();
    });
    it('maps the zenith to the disc centre', () => {
        const p = projectSunToDisc(Math.PI / 2, 0)!;
        expect(p.x).toBeCloseTo(0, 6);
        expect(p.y).toBeCloseTo(0, 6);
    });
    it('maps a low northern sun (az=0) toward the rim, upward (−y)', () => {
        const p = projectSunToDisc(0.05, 0)!;
        expect(p.y).toBeLessThan(0); // north = up
        expect(Math.abs(p.x)).toBeLessThan(1e-6);
        // r ≈ 1 near the horizon.
        expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.9);
    });
    it('maps an eastern sun (az=90°) to the +x side', () => {
        const p = projectSunToDisc(0.3, Math.PI / 2)!;
        expect(p.x).toBeGreaterThan(0);
        expect(Math.abs(p.y)).toBeLessThan(1e-6);
    });
});

// ── Wind rose ────────────────────────────────────────────────────────────────

function makeRose(sectorHours: number[][]): WindRoseAggregate {
    return {
        sectors: sectorHours.map((bins, i) => ({
            sectorDeg: i * 22.5,
            speedBinHours: bins as [number, number, number, number, number, number],
        })),
        meanSpeedMps: 4.2,
        p99SpeedMps: 18.5,
    };
}

describe('windRoseBars', () => {
    it('computes correct per-sector frequencies that sum to 1', () => {
        // 16 sectors; put all wind in N (100h) and E (300h) → 25% / 75%.
        const bins = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0, 0]);
        bins[0] = [50, 50, 0, 0, 0, 0]; // N total 100
        bins[4] = [100, 100, 100, 0, 0, 0]; // E total 300
        const chart = windRoseBars(makeRose(bins));

        expect(chart.bars[0].label).toBe('N');
        expect(chart.bars[0].totalHours).toBe(100);
        expect(chart.bars[0].frequency).toBeCloseTo(0.25, 6);
        expect(chart.bars[4].label).toBe('E');
        expect(chart.bars[4].frequency).toBeCloseTo(0.75, 6);

        const sum = chart.bars.reduce((acc, b) => acc + b.frequency, 0);
        expect(sum).toBeCloseTo(1, 6);
        expect(chart.maxFrequency).toBeCloseTo(0.75, 6);
        expect(chart.meanSpeedMps).toBe(4.2);
        expect(chart.p99SpeedMps).toBe(18.5);
    });

    it('handles an all-zero rose without dividing by zero', () => {
        const bins = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0, 0]);
        const chart = windRoseBars(makeRose(bins));
        expect(chart.maxFrequency).toBe(0);
        expect(chart.bars.every((b) => b.frequency === 0)).toBe(true);
    });

    it('orders 16 sectors by compass label', () => {
        const bins = Array.from({ length: 16 }, () => [1, 0, 0, 0, 0, 0]);
        const chart = windRoseBars(makeRose(bins));
        expect(chart.bars.map((b) => b.label)).toEqual([...COMPASS_16]);
    });
});

describe('windBarEndpoint', () => {
    it('returns the rim for a max-frequency northern sector', () => {
        const p = windBarEndpoint(0, 0.5, 0.5, 100);
        expect(p.y).toBeCloseTo(-100, 6); // N = up, full length
        expect(p.x).toBeCloseTo(0, 6);
    });
    it('returns the origin when maxFrequency is 0', () => {
        const p = windBarEndpoint(90, 0, 0, 100);
        expect(p.x).toBeCloseTo(0, 6);
        expect(p.y).toBeCloseTo(0, 6);
    });
});

// ── Temperature profile ──────────────────────────────────────────────────────

function makeNormal(month: number, avg: number, lo: number, hi: number): NOAANormal {
    return {
        month,
        avgDryBulbC: avg,
        avgMinDryBulbC: lo,
        avgMaxDryBulbC: hi,
        avgRelHumidityPct: 70,
        avgPrecipMm: 40,
        avgWindSpeedMps: 4,
        prevailingWindDirDeg: 200,
        avgGlobalHorizontalWm2: 150,
        heatingDegreeDaysBase18: 100,
        coolingDegreeDaysBase18: 0,
    };
}

describe('monthlyTempSeries', () => {
    it('orders months Jan..Dec and computes the min/max extent', () => {
        // Deliberately supply months out of order.
        const normals: NOAANormal[] = [];
        for (let m = 12; m >= 1; m -= 1) {
            const avg = m; // Jan=1 … Dec=12
            normals.push(makeNormal(m, avg, avg - 5, avg + 5));
        }
        const dataset = { monthlyNormals: normals } as unknown as ClimateDataset;
        const series = monthlyTempSeries(dataset);

        expect(series.points.map((p) => p.month)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
        ]);
        expect(series.points[0].label).toBe('Jan');
        expect(series.points[11].label).toBe('Dec');
        // Coldest min = Jan (1−5 = −4); warmest max = Dec (12+5 = 17).
        expect(series.minC).toBe(-4);
        expect(series.maxC).toBe(17);
    });
});
