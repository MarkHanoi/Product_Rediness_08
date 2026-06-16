// ADR-0074 (P1 L2 core) — deterministic sun-sample generation.
//
// Generates a `SunSample[]` for an analysis window (a single day, or an inclusive
// day-range) at a fixed minute cadence, using the THREE-free NOAA replica in
// solarPosition.ts. Below-horizon samples are dropped by default (matching the
// daylightAnalysis "below-horizon contributes nothing" rule). PURE +
// DETERMINISTIC: no Date.now, no Math.random — every instant is constructed from
// the explicit (year, dayOfYear, timeMinutes) so the same inputs give identical
// output. Sampling cadence + conventions are aligned with
// ai-host/.../daylight/daylightAnalysis.ts (compass azimuth N=0° clockwise; sun
// direction toward the sun in the same world ENU frame).

import type { SunSample, SunSampleOptions } from './types.js';
import { computeSolarPositionRad, sunDirectionFromAltAz, RAD_TO_DEG } from './solarPosition.js';

const DEFAULT_YEAR = 2025;
const DEFAULT_STEP_MINUTES = 15;
const MINUTES_PER_DAY = 1440;

// ── Solstice / equinox day-of-year helpers (UTC, approximate civil dates) ─────
// These are the conventional Northern-hemisphere dates; for the Southern
// hemisphere the SAME calendar dates apply (the solstice swaps which is the
// longest day, but the date is the same instant). Day-of-year is 1-based.

/** Day-of-year of the March (vernal) equinox — ≈ March 20. */
export function marchEquinoxDayOfYear(year: number = DEFAULT_YEAR): number {
    return dayOfYearOf(year, 2, 20); // month index 2 = March
}
/** Day-of-year of the June solstice — ≈ June 21 (N-summer / S-winter). */
export function juneSolsticeDayOfYear(year: number = DEFAULT_YEAR): number {
    return dayOfYearOf(year, 5, 21); // June
}
/** Day-of-year of the September (autumnal) equinox — ≈ September 22. */
export function septemberEquinoxDayOfYear(year: number = DEFAULT_YEAR): number {
    return dayOfYearOf(year, 8, 22); // September
}
/** Day-of-year of the December solstice — ≈ December 21 (N-winter / S-summer). */
export function decemberSolsticeDayOfYear(year: number = DEFAULT_YEAR): number {
    return dayOfYearOf(year, 11, 21); // December
}

/** Day-of-year (1-based, UTC) for a given calendar month-index (0=Jan) + day. */
export function dayOfYearOf(year: number, monthIndex: number, day: number): number {
    const start = Date.UTC(year, 0, 1);
    const target = Date.UTC(year, monthIndex, day);
    return Math.round((target - start) / 86_400_000) + 1;
}

/** Build the UTC Date for (year, dayOfYear 1-based, minutesPastMidnight). Pure. */
export function dateFromDayAndMinute(year: number, dayOfYear: number, timeMinutes: number): Date {
    const ms = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86_400_000 + timeMinutes * 60_000;
    return new Date(ms);
}

/**
 * Generate the deterministic sun-sample set for an analysis window.
 *
 * - Provide `dayOfYear` for a single day, OR `dateRange` for an inclusive span
 *   sampled every `dayStep` days (default 1). If neither is given, the March
 *   equinox of `year` is used.
 * - Within each day, instants are sampled every `stepMinutes` (default 15) from
 *   00:00 to 23:59 UTC.
 * - With `daylightOnly` (default true) only above-horizon samples (altitude > 0)
 *   are returned; set false to keep every instant (altitudeDeg may be ≤ 0).
 *
 * Output order is deterministic: day-ascending, then time-ascending.
 */
export function generateSunSamples(opts: SunSampleOptions): SunSample[] {
    const { latDeg, lngDeg } = opts;
    const year = opts.year ?? DEFAULT_YEAR;
    const stepMinutes = opts.stepMinutes && opts.stepMinutes > 0 ? opts.stepMinutes : DEFAULT_STEP_MINUTES;
    const daylightOnly = opts.daylightOnly ?? true;

    const days = resolveDays(opts, year);

    const out: SunSample[] = [];
    for (const dayOfYear of days) {
        for (let t = 0; t < MINUTES_PER_DAY; t += stepMinutes) {
            const date = dateFromDayAndMinute(year, dayOfYear, t);
            const { altitude, azimuth } = computeSolarPositionRad(latDeg, lngDeg, date);
            const altitudeDeg = altitude * RAD_TO_DEG;
            if (daylightOnly && altitudeDeg <= 0) continue;
            out.push({
                dir: sunDirectionFromAltAz(altitude, azimuth),
                altitudeDeg,
                azimuthDeg: ((azimuth * RAD_TO_DEG) % 360 + 360) % 360,
                timeMinutes: t,
                dayOfYear,
            });
        }
    }
    return out;
}

/** Resolve the explicit day-of-year list from the options. */
function resolveDays(opts: SunSampleOptions, year: number): number[] {
    if (opts.dateRange) {
        const { fromDayOfYear, toDayOfYear } = opts.dateRange;
        const dayStep = opts.dateRange.dayStep && opts.dateRange.dayStep > 0 ? opts.dateRange.dayStep : 1;
        const lo = Math.min(fromDayOfYear, toDayOfYear);
        const hi = Math.max(fromDayOfYear, toDayOfYear);
        const days: number[] = [];
        for (let d = lo; d <= hi; d += dayStep) days.push(d);
        return days;
    }
    if (opts.dayOfYear != null) return [opts.dayOfYear];
    return [marchEquinoxDayOfYear(year)];
}
