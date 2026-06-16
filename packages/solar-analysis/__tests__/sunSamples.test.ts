// ADR-0074 — sun-sample generation: horizon filtering, determinism, cadence,
// solstice/equinox helpers, single-day vs date-range.

import { describe, expect, it } from 'vitest';
import {
    generateSunSamples,
    marchEquinoxDayOfYear,
    juneSolsticeDayOfYear,
    decemberSolsticeDayOfYear,
    septemberEquinoxDayOfYear,
    dayOfYearOf,
} from '../src/sunSamples.js';

const LONDON = { latDeg: 51.5, lngDeg: -0.13 };

describe('generateSunSamples — horizon filtering', () => {
    it('daylightOnly (default) drops all below-horizon samples', () => {
        const samples = generateSunSamples({ ...LONDON, dayOfYear: marchEquinoxDayOfYear(), stepMinutes: 30 });
        expect(samples.length).toBeGreaterThan(0);
        for (const s of samples) {
            expect(s.altitudeDeg).toBeGreaterThan(0);
            expect(s.dir.y).toBeGreaterThan(0); // up-component positive above horizon
        }
    });

    it('daylightOnly:false keeps the full 24h of instants (incl. night)', () => {
        const step = 30;
        const all = generateSunSamples({ ...LONDON, dayOfYear: 172, stepMinutes: step, daylightOnly: false });
        expect(all.length).toBe(Math.ceil(1440 / step));
        expect(all.some((s) => s.altitudeDeg <= 0)).toBe(true); // some night samples
        const day = generateSunSamples({ ...LONDON, dayOfYear: 172, stepMinutes: step, daylightOnly: true });
        expect(day.length).toBeLessThan(all.length);
        expect(day.length).toBe(all.filter((s) => s.altitudeDeg > 0).length);
    });

    it('summer (June) has more daylight samples than winter (December) at high lat', () => {
        const summer = generateSunSamples({ ...LONDON, dayOfYear: juneSolsticeDayOfYear(), stepMinutes: 15 });
        const winter = generateSunSamples({ ...LONDON, dayOfYear: decemberSolsticeDayOfYear(), stepMinutes: 15 });
        expect(summer.length).toBeGreaterThan(winter.length);
    });
});

describe('generateSunSamples — determinism', () => {
    it('same inputs produce identical output (deep equal)', () => {
        const a = generateSunSamples({ ...LONDON, dayOfYear: 80, stepMinutes: 20 });
        const b = generateSunSamples({ ...LONDON, dayOfYear: 80, stepMinutes: 20 });
        expect(a).toEqual(b);
    });

    it('samples are ordered by ascending time within a day', () => {
        const s = generateSunSamples({ ...LONDON, dayOfYear: 172, stepMinutes: 60, daylightOnly: false });
        for (let i = 1; i < s.length; i++) {
            expect(s[i]!.timeMinutes).toBeGreaterThan(s[i - 1]!.timeMinutes);
        }
    });

    it('every dir is a unit vector and altitude/azimuth match the dir', () => {
        const s = generateSunSamples({ ...LONDON, dayOfYear: 172, stepMinutes: 30 });
        for (const x of s) {
            expect(Math.hypot(x.dir.x, x.dir.y, x.dir.z)).toBeCloseTo(1, 9);
            expect(x.dir.y).toBeCloseTo(Math.sin((x.altitudeDeg * Math.PI) / 180), 9);
            expect(x.azimuthDeg).toBeGreaterThanOrEqual(0);
            expect(x.azimuthDeg).toBeLessThan(360);
        }
    });
});

describe('generateSunSamples — date range', () => {
    it('a 3-day range at dayStep 1 covers all three days', () => {
        const eq = marchEquinoxDayOfYear();
        const s = generateSunSamples({
            ...LONDON,
            dateRange: { fromDayOfYear: eq, toDayOfYear: eq + 2 },
            stepMinutes: 60,
        });
        const days = new Set(s.map((x) => x.dayOfYear));
        expect(days).toEqual(new Set([eq, eq + 1, eq + 2]));
    });

    it('dayStep skips intermediate days', () => {
        const s = generateSunSamples({
            ...LONDON,
            dateRange: { fromDayOfYear: 100, toDayOfYear: 110, dayStep: 5 },
            stepMinutes: 120,
        });
        const days = [...new Set(s.map((x) => x.dayOfYear))].sort((a, b) => a - b);
        expect(days).toEqual([100, 105, 110]);
    });

    it('defaults to the March equinox when neither dayOfYear nor dateRange given', () => {
        const s = generateSunSamples({ ...LONDON, stepMinutes: 60 });
        const days = new Set(s.map((x) => x.dayOfYear));
        expect(days).toEqual(new Set([marchEquinoxDayOfYear()]));
    });
});

describe('solstice / equinox day-of-year helpers', () => {
    it('return the conventional civil dates', () => {
        // Default reference year 2025 (non-leap).
        expect(marchEquinoxDayOfYear(2025)).toBe(dayOfYearOf(2025, 2, 20));
        expect(juneSolsticeDayOfYear(2025)).toBe(dayOfYearOf(2025, 5, 21));
        expect(septemberEquinoxDayOfYear(2025)).toBe(dayOfYearOf(2025, 8, 22));
        expect(decemberSolsticeDayOfYear(2025)).toBe(dayOfYearOf(2025, 11, 21));
    });

    it('dayOfYearOf handles a leap year (Mar 1 is day 61 in a leap year)', () => {
        expect(dayOfYearOf(2024, 2, 1)).toBe(61); // 2024 is leap
        expect(dayOfYearOf(2025, 2, 1)).toBe(60); // 2025 non-leap
    });
});
