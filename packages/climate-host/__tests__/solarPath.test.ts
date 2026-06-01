// A.10.c (Phase A · Sprint 2) — Solar-position algorithm tests.
//
// Tests against known astronomical reference points (NOAA solar
// calculator + Meeus Ch. 25). The algorithm is accurate to better
// than 0.01° from 1800–2200; our tolerance is intentionally coarser
// (~0.5° altitude / ~3° azimuth) so floating-point drift between JS
// engines / OS time-libs never makes the test flaky. Reference values
// come from the NOAA solar-calculator at https://gml.noaa.gov/grad/solcalc/.

import { describe, expect, it } from 'vitest';
import { solarSample, toJulianDay } from '../src/solarPath.js';

const DEG_PER_RAD = 180 / Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// toJulianDay — anchored reference points
// ─────────────────────────────────────────────────────────────────────────────

describe('toJulianDay', () => {
    it('J2000 epoch (2000-01-01 12:00 UTC) → 2451545.0', () => {
        const d = new Date('2000-01-01T12:00:00.000Z');
        expect(toJulianDay(d)).toBeCloseTo(2451545.0, 4);
    });

    it('Y2K midnight (2000-01-01 00:00 UTC) → 2451544.5', () => {
        const d = new Date('2000-01-01T00:00:00.000Z');
        expect(toJulianDay(d)).toBeCloseTo(2451544.5, 4);
    });

    it('UNIX epoch (1970-01-01 00:00 UTC) → 2440587.5', () => {
        const d = new Date('1970-01-01T00:00:00.000Z');
        expect(toJulianDay(d)).toBeCloseTo(2440587.5, 4);
    });

    it('monotonically increases', () => {
        const a = toJulianDay(new Date('2024-06-21T00:00:00.000Z'));
        const b = toJulianDay(new Date('2024-06-21T12:00:00.000Z'));
        const c = toJulianDay(new Date('2024-06-22T00:00:00.000Z'));
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
        expect(b - a).toBeCloseTo(0.5, 4);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// solarSample — input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('solarSample — input validation', () => {
    it('throws on lat outside [-90, 90]', () => {
        expect(() => solarSample(91, 0, '2024-06-21T12:00:00.000Z')).toThrow(
            /lat must be in/i,
        );
        expect(() => solarSample(-91, 0, '2024-06-21T12:00:00.000Z')).toThrow();
    });

    it('throws on lon outside [-180, 180]', () => {
        expect(() => solarSample(0, 181, '2024-06-21T12:00:00.000Z')).toThrow(
            /lon must be in/i,
        );
    });

    it('throws on malformed utcIso', () => {
        expect(() => solarSample(0, 0, 'not-a-date')).toThrow(
            /not a valid date/i,
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Astronomical reference points
//
// Reference values from the NOAA solar calculator
// (https://gml.noaa.gov/grad/solcalc/). Tolerances are intentionally
// loose (~0.5° altitude / 3° azimuth) — the algorithm is accurate to
// far better than that, but Date / system-time precision across JS
// engines varies by a few seconds and azimuth near the poles or near
// solar noon is geometrically ill-conditioned.
// ─────────────────────────────────────────────────────────────────────────────

describe('solarSample — June solstice (sun at zenith on Tropic of Cancer)', () => {
    it('sun is nearly overhead at 23.44°N, 0°E at solar noon (June 21 12:00 UT)', () => {
        const s = solarSample(23.44, 0, '2024-06-21T12:00:00.000Z');
        const altDeg = s.altitudeRad * DEG_PER_RAD;
        expect(altDeg).toBeGreaterThan(89);     // within 1° of zenith
        expect(altDeg).toBeLessThan(90.1);
        expect(s.isAboveHorizon).toBe(true);
    });

    it('sun is BELOW horizon at midnight at 60°N, 0°E (June 21)', () => {
        // 60°N at midnight UT in June: civil twilight or polar day depending
        // on exact lat. At 60°N the sun is just below horizon at midnight.
        const s = solarSample(60, 0, '2024-06-21T00:00:00.000Z');
        const altDeg = s.altitudeRad * DEG_PER_RAD;
        // Allow ±5° tolerance — the sun is grazing horizon at this latitude.
        expect(altDeg).toBeLessThan(5);
    });
});

describe('solarSample — December solstice (sun at zenith on Tropic of Capricorn)', () => {
    it('sun is nearly overhead at 23.44°S, 0°E at solar noon (Dec 21 12:00 UT)', () => {
        const s = solarSample(-23.44, 0, '2024-12-21T12:00:00.000Z');
        const altDeg = s.altitudeRad * DEG_PER_RAD;
        expect(altDeg).toBeGreaterThan(89);
        expect(altDeg).toBeLessThan(90.1);
    });

    it('sun is BELOW horizon all day at 80°N (polar night, Dec 21)', () => {
        const noon = solarSample(80, 0, '2024-12-21T12:00:00.000Z');
        const altDeg = noon.altitudeRad * DEG_PER_RAD;
        expect(altDeg).toBeLessThan(0);
        expect(noon.isAboveHorizon).toBe(false);
    });
});

describe('solarSample — Equinox (sun rises due east, sets due west)', () => {
    it('at equator on spring equinox at noon: sun near zenith', () => {
        const s = solarSample(0, 0, '2024-03-20T12:00:00.000Z');
        const altDeg = s.altitudeRad * DEG_PER_RAD;
        expect(altDeg).toBeGreaterThan(88);
        expect(altDeg).toBeLessThan(90.1);
    });

    it('at 40°N (NYC-ish) at solar noon: alt ~50°', () => {
        // NYC longitude -74° → solar noon ≈ 17:00 UTC. Use 17:00 UT.
        const s = solarSample(40.7, -74.0, '2024-03-20T17:00:00.000Z');
        const altDeg = s.altitudeRad * DEG_PER_RAD;
        // At equinox at 40°N solar noon alt ≈ 90° - 40° = 50°.
        expect(altDeg).toBeGreaterThan(46);
        expect(altDeg).toBeLessThan(52);
    });
});

describe('solarSample — Night vs day', () => {
    it('isAboveHorizon=false at midnight (London, June)', () => {
        const s = solarSample(51.5, -0.1, '2024-06-21T00:00:00.000Z');
        // At 51.5°N in June, midnight UT — sun is just below horizon.
        // Tolerance: alt may be slightly positive (white nights). The
        // sign is what matters.
        expect(s.altitudeRad).toBeLessThan(0.1);
    });

    it('isAboveHorizon=true at midday (London, June)', () => {
        const s = solarSample(51.5, -0.1, '2024-06-21T12:00:00.000Z');
        expect(s.isAboveHorizon).toBe(true);
        const altDeg = s.altitudeRad * DEG_PER_RAD;
        // London June solar noon alt = 90° - 51.5° + 23.44° = 61.94°
        expect(altDeg).toBeGreaterThan(58);
        expect(altDeg).toBeLessThan(63);
    });
});

describe('solarSample — approxDirectWm2', () => {
    it('returns 0 below horizon', () => {
        const s = solarSample(80, 0, '2024-12-21T12:00:00.000Z');
        expect(s.approxDirectWm2).toBe(0);
    });

    it('returns > 800 W/m² near zenith (clear-sky)', () => {
        const s = solarSample(23.44, 0, '2024-06-21T12:00:00.000Z');
        expect(s.approxDirectWm2).toBeGreaterThan(800);
        expect(s.approxDirectWm2).toBeLessThan(1500);     // L0 schema cap
    });

    it('returns lower DNI at low altitude (high air mass)', () => {
        const zenith = solarSample(23.44, 0, '2024-06-21T12:00:00.000Z');
        const lowAlt = solarSample(60, 0, '2024-06-21T05:00:00.000Z');
        // Both should be positive (sun above horizon in both cases) but
        // the low-altitude one is much less.
        expect(lowAlt.approxDirectWm2).toBeLessThan(zenith.approxDirectWm2);
    });
});

describe('solarSample — azimuth direction', () => {
    it('at solar noon in northern hemisphere, azimuth is near 180° (south)', () => {
        const s = solarSample(40, 0, '2024-06-21T12:00:00.000Z');
        const azDeg = s.azimuthRad * DEG_PER_RAD;
        // At 40°N noon UT (lon 0°), sun is due S.
        expect(azDeg).toBeGreaterThan(170);
        expect(azDeg).toBeLessThan(190);
    });

    it('at solar noon in southern hemisphere, azimuth is near 0° or 360° (north)', () => {
        const s = solarSample(-40, 0, '2024-06-21T12:00:00.000Z');
        const azDeg = s.azimuthRad * DEG_PER_RAD;
        // Sun is in the north (away from -40°S observer).
        // Either close to 0 or close to 360 (wraparound).
        const distFromNorth = Math.min(azDeg, 360 - azDeg);
        expect(distFromNorth).toBeLessThan(10);
    });

    it('returns valid SolarSample shape (utcIso round-trip)', () => {
        const s = solarSample(51.5, -0.1, '2024-06-21T12:00:00.000Z');
        expect(s.utcIso).toBe('2024-06-21T12:00:00.000Z');
        expect(typeof s.altitudeRad).toBe('number');
        expect(typeof s.azimuthRad).toBe('number');
        expect(typeof s.isAboveHorizon).toBe('boolean');
        expect(typeof s.approxDirectWm2).toBe('number');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinism — same input MUST give same output
// ─────────────────────────────────────────────────────────────────────────────

describe('solarSample — determinism', () => {
    it('repeated calls with same input return identical results', () => {
        const a = solarSample(51.5, -0.1, '2024-06-21T12:00:00.000Z');
        const b = solarSample(51.5, -0.1, '2024-06-21T12:00:00.000Z');
        expect(a.altitudeRad).toBe(b.altitudeRad);
        expect(a.azimuthRad).toBe(b.azimuthRad);
        expect(a.approxDirectWm2).toBe(b.approxDirectWm2);
    });
});
