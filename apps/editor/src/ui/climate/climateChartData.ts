// A.11 (Phase A · Sprint 2) — Climate panel chart-data helpers.
//
// PURE, DOM-free, unit-testable math that turns the A.10 climate
// substrate (ClimateDataset + the L2 `solarSample` NOAA calculator) into
// plottable primitives for the L5 ClimatePanel sub-views:
//
//   - sun-path        → `solarArcForDay()` / `solarArcsForYear()`
//   - wind rose       → `windRoseBars()`
//   - temperature     → `monthlyTempSeries()`
//
// The DOM/SVG rendering lives in `ClimatePanel.ts`; this file has zero
// `document` / THREE references so it can be tested under plain `node`.
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.3 + §2.5
//   - packages/climate-host/src/solarPath.ts (the NOAA `solarSample`)

import { solarSample } from '@pryzm/climate-host';
import type {
    ClimateDataset,
    SolarSample,
    WindRoseAggregate,
} from '@pryzm/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Sun-path
// ─────────────────────────────────────────────────────────────────────────────

/** One sampled instant on a day's solar arc. */
export interface SunArcPoint {
    /** Hour-of-day in UTC (0..24, fractional). */
    readonly hourUtc: number;
    /** Solar altitude above horizon (radians; negative = below horizon). */
    readonly altitudeRad: number;
    /** Solar azimuth, clockwise from N (radians, [0, 2π)). */
    readonly azimuthRad: number;
    /** Convenience flag from the underlying SolarSample. */
    readonly isAboveHorizon: boolean;
}

/** A whole day's arc (e.g. a solstice) plus a label for the legend. */
export interface SunArc {
    readonly label: string;
    /** ISO date (UTC midnight) the arc was sampled for. */
    readonly dateIso: string;
    readonly points: readonly SunArcPoint[];
}

/**
 * Sample the sun's altitude/azimuth across a single UTC day at the given
 * site. `stepMinutes` controls resolution (default 20 min → 73 points).
 *
 * Pure: delegates to the tested NOAA `solarSample`. Night points (below
 * horizon) are retained so callers can clip to the horizon themselves.
 */
export function solarArcForDay(
    lat: number,
    lon: number,
    dateIsoUtcMidnight: string,
    label: string,
    stepMinutes = 20,
): SunArc {
    const base = new Date(dateIsoUtcMidnight);
    if (!Number.isFinite(base.getTime())) {
        throw new RangeError(`solarArcForDay: invalid date ${dateIsoUtcMidnight}`);
    }
    const step = Math.max(1, Math.min(120, stepMinutes));
    const points: SunArcPoint[] = [];
    for (let min = 0; min <= 24 * 60; min += step) {
        const t = new Date(base.getTime() + min * 60_000);
        const sample: SolarSample = solarSample(lat, lon, t.toISOString());
        points.push({
            hourUtc: min / 60,
            altitudeRad: sample.altitudeRad,
            azimuthRad: sample.azimuthRad,
            isAboveHorizon: sample.isAboveHorizon,
        });
    }
    return { label, dateIso: base.toISOString(), points };
}

/**
 * The three canonical solar arcs for a site in a given year: summer
 * solstice (Jun 21), the equinox (Mar 20), and winter solstice (Dec 21).
 * Northern-hemisphere labels; the dates are hemisphere-agnostic (the
 * geometry is correct either way — only the "summer"/"winter" wording is
 * N-hemisphere-centric, which the panel notes).
 */
export function solarArcsForYear(
    lat: number,
    lon: number,
    year: number,
    stepMinutes = 20,
): SunArc[] {
    const y = Math.trunc(year);
    return [
        solarArcForDay(lat, lon, `${y}-06-21T00:00:00.000Z`, 'Summer solstice', stepMinutes),
        solarArcForDay(lat, lon, `${y}-03-20T00:00:00.000Z`, 'Equinox', stepMinutes),
        solarArcForDay(lat, lon, `${y}-12-21T00:00:00.000Z`, 'Winter solstice', stepMinutes),
    ];
}

/**
 * Stereographic projection of an (altitude, azimuth) onto the unit disc
 * used by the polar sun-path chart. Returns `null` for points below the
 * horizon (which fall outside the disc). The zenith maps to the centre
 * (r=0); the horizon maps to the rim (r=1). North is up (−y), east is
 * right (+x) — matching a plan-view compass.
 *
 *   r = (π/2 − altitude) / (π/2)         [linear-altitude polar plot]
 *   x =  r · sin(azimuth)
 *   y = −r · cos(azimuth)                 [azimuth 0 = N → up]
 */
export function projectSunToDisc(
    altitudeRad: number,
    azimuthRad: number,
): { x: number; y: number } | null {
    if (altitudeRad <= 0) return null;
    const r = (Math.PI / 2 - altitudeRad) / (Math.PI / 2);
    return {
        x: r * Math.sin(azimuthRad),
        y: -r * Math.cos(azimuthRad),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wind rose
// ─────────────────────────────────────────────────────────────────────────────

/** 16-point compass labels, index 0 = N, clockwise. */
export const COMPASS_16 = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** One radial bar of the wind rose (a single direction sector). */
export interface WindRoseBar {
    /** Sector index 0..15 (0 = N, clockwise). */
    readonly sectorIndex: number;
    /** Sector centre direction in degrees (0, 22.5, …, 337.5). */
    readonly sectorDeg: number;
    /** Compass label, e.g. 'NNE'. */
    readonly label: string;
    /** Total hours/year the wind blew FROM this sector (sum of bins). */
    readonly totalHours: number;
    /** Fraction of all (non-calm) wind hours in this sector, [0, 1]. */
    readonly frequency: number;
    /** Per-speed-bin hours (Beaufort-ish, 6 bins) for stacked bars. */
    readonly speedBinHours: readonly number[];
}

/** The whole wind rose ready to draw, with max frequency for scaling. */
export interface WindRoseChart {
    readonly bars: readonly WindRoseBar[];
    /** Largest `frequency` across all sectors — the outer-ring scale. */
    readonly maxFrequency: number;
    /** Annual mean wind speed (m/s), passed through from the aggregate. */
    readonly meanSpeedMps: number;
    /** 99th-percentile gust (m/s). */
    readonly p99SpeedMps: number;
}

/**
 * Turn a stored `WindRoseAggregate` (16 sectors × 6 bins, hours/year)
 * into normalised radial bars. Frequencies sum to 1 across sectors
 * (unless the rose is all-zero, in which case every frequency is 0).
 *
 * Pure: no DOM, no randomness. Sectors are returned in compass order
 * (0..15); the helper tolerates an aggregate whose sectors are out of
 * order by sorting on `sectorDeg`.
 */
export function windRoseBars(rose: WindRoseAggregate): WindRoseChart {
    const sorted = [...rose.sectors].sort((a, b) => a.sectorDeg - b.sectorDeg);
    const totals = sorted.map((s) =>
        s.speedBinHours.reduce((acc, h) => acc + h, 0),
    );
    const grand = totals.reduce((acc, h) => acc + h, 0);
    const bars: WindRoseBar[] = sorted.map((s, i) => {
        const totalHours = totals[i];
        return {
            sectorIndex: i,
            sectorDeg: s.sectorDeg,
            label: COMPASS_16[i] ?? `${s.sectorDeg}°`,
            totalHours,
            frequency: grand > 0 ? totalHours / grand : 0,
            speedBinHours: [...s.speedBinHours],
        };
    });
    const maxFrequency = bars.reduce((m, b) => Math.max(m, b.frequency), 0);
    return {
        bars,
        maxFrequency,
        meanSpeedMps: rose.meanSpeedMps,
        p99SpeedMps: rose.p99SpeedMps,
    };
}

/**
 * Polar coordinate for the END of a wind-rose bar of a given normalised
 * length. `frequency` is divided by `maxFrequency` to fill the disc;
 * `radius` is the pixel radius of the outer ring. North is up.
 */
export function windBarEndpoint(
    sectorDeg: number,
    frequency: number,
    maxFrequency: number,
    radius: number,
): { x: number; y: number } {
    const frac = maxFrequency > 0 ? frequency / maxFrequency : 0;
    const r = frac * radius;
    const rad = (sectorDeg * Math.PI) / 180;
    return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Temperature profile
// ─────────────────────────────────────────────────────────────────────────────

/** One month's temperature triple for the profile chart. */
export interface MonthlyTempPoint {
    /** 1..12, Jan..Dec. */
    readonly month: number;
    /** Three-letter month label. */
    readonly label: string;
    readonly avgC: number;
    readonly minC: number;
    readonly maxC: number;
}

/** Monthly temperature series + the y-axis extent for scaling. */
export interface MonthlyTempSeries {
    readonly points: readonly MonthlyTempPoint[];
    readonly minC: number;
    readonly maxC: number;
}

const MONTH_LABELS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Build the monthly temperature series from a dataset's `monthlyNormals`
 * (present for BOTH EPW + NOAA per the C21 schema). Returns the 12
 * points in Jan..Dec order plus the overall min/max (across the daily
 * min/max columns) for the chart's y-extent.
 *
 * Pure: reads only the dataset's `monthlyNormals` array.
 */
export function monthlyTempSeries(dataset: ClimateDataset): MonthlyTempSeries {
    const byMonth = new Map(dataset.monthlyNormals.map((n) => [n.month, n]));
    const points: MonthlyTempPoint[] = [];
    let minC = Infinity;
    let maxC = -Infinity;
    for (let m = 1; m <= 12; m += 1) {
        const n = byMonth.get(m);
        const avgC = n?.avgDryBulbC ?? 0;
        const lo = n?.avgMinDryBulbC ?? avgC;
        const hi = n?.avgMaxDryBulbC ?? avgC;
        minC = Math.min(minC, lo);
        maxC = Math.max(maxC, hi);
        points.push({ month: m, label: MONTH_LABELS[m - 1], avgC, minC: lo, maxC: hi });
    }
    if (!Number.isFinite(minC)) minC = 0;
    if (!Number.isFinite(maxC)) maxC = 0;
    return { points, minC, maxC };
}
