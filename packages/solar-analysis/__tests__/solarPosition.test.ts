// ADR-0074 — solar-position math: verify the THREE-free NOAA replica against
// known astronomy (equinox-noon altitude ≈ 90−|lat|; sun due-south at solar noon
// in the N hemisphere; below-horizon at night) and against the direction
// convention RealSunService builds for its DirectionalLight.

import { describe, expect, it } from 'vitest';
import {
    computeSolarPositionRad,
    sunDirectionFromAltAz,
    RAD_TO_DEG,
} from '../src/solarPosition.js';
import { dateFromDayAndMinute, marchEquinoxDayOfYear } from '../src/sunSamples.js';

const YEAR = 2025;

/** UTC instant of solar noon at longitude 0 is ≈ 12:00 UTC (±equation-of-time). */
function noonAtGreenwich(dayOfYear: number): Date {
    return dateFromDayAndMinute(YEAR, dayOfYear, 12 * 60);
}

describe('computeSolarPositionRad — known astronomy', () => {
    it('equinox noon at the equator: sun is ~overhead (altitude ≈ 90°)', () => {
        const eq = marchEquinoxDayOfYear(YEAR);
        const { altitude } = computeSolarPositionRad(0, 0, noonAtGreenwich(eq));
        const altDeg = altitude * RAD_TO_DEG;
        // Within a couple of degrees of the zenith (equation-of-time + civil-date
        // approximation for the equinox instant).
        expect(altDeg).toBeGreaterThan(85);
        expect(altDeg).toBeLessThanOrEqual(90 + 1e-6);
    });

    it('equinox noon: altitude ≈ 90 − |lat| for several latitudes', () => {
        const eq = marchEquinoxDayOfYear(YEAR);
        for (const lat of [0, 20, 40, 51.5, -34]) {
            const { altitude } = computeSolarPositionRad(lat, 0, noonAtGreenwich(eq));
            const altDeg = altitude * RAD_TO_DEG;
            const expected = 90 - Math.abs(lat);
            // ±2.5° tolerance (civil equinox date + equation of time).
            expect(Math.abs(altDeg - expected)).toBeLessThan(2.5);
        }
    });

    it('N-hemisphere solar noon: sun is due SOUTH (azimuth ≈ 180°)', () => {
        const eq = marchEquinoxDayOfYear(YEAR);
        const { azimuth } = computeSolarPositionRad(51.5, 0, noonAtGreenwich(eq));
        const azDeg = ((azimuth * RAD_TO_DEG) % 360 + 360) % 360;
        expect(Math.abs(azDeg - 180)).toBeLessThan(3);
    });

    it('S-hemisphere solar noon: sun is due NORTH (azimuth ≈ 0°/360°)', () => {
        const eq = marchEquinoxDayOfYear(YEAR);
        const { azimuth } = computeSolarPositionRad(-34, 0, noonAtGreenwich(eq));
        const azDeg = ((azimuth * RAD_TO_DEG) % 360 + 360) % 360;
        const distToNorth = Math.min(azDeg, 360 - azDeg);
        // ±4° tolerance: civil equinox date + equation-of-time mean noon ≠ exact
        // apparent solar noon, so the azimuth grazes a few degrees off due-north.
        expect(distToNorth).toBeLessThan(4);
    });

    it('local midnight: sun is below the horizon (altitude < 0)', () => {
        const eq = marchEquinoxDayOfYear(YEAR);
        const midnight = dateFromDayAndMinute(YEAR, eq, 0); // 00:00 UTC at lng 0
        const { altitude } = computeSolarPositionRad(51.5, 0, midnight);
        expect(altitude).toBeLessThan(0);
    });

    it('June solstice noon is HIGHER than December solstice noon (N hemisphere)', () => {
        const jun = dateFromDayAndMinute(YEAR, 172, 12 * 60); // ~Jun 21
        const dec = dateFromDayAndMinute(YEAR, 355, 12 * 60); // ~Dec 21
        const aJun = computeSolarPositionRad(51.5, 0, jun).altitude;
        const aDec = computeSolarPositionRad(51.5, 0, dec).altitude;
        expect(aJun).toBeGreaterThan(aDec);
    });
});

describe('sunDirectionFromAltAz — RealSunService ENU convention', () => {
    it('matches RealSunService dir = { cosAlt·sin(az), sin(alt), −cosAlt·cos(az) }', () => {
        // RealSunService.ts:379–382, replicated here as the reference formula.
        for (const [altDeg, azDeg] of [[45, 0], [30, 90], [60, 180], [20, 270]]) {
            const alt = altDeg! / RAD_TO_DEG;
            const az = azDeg! / RAD_TO_DEG;
            const dir = sunDirectionFromAltAz(alt, az);
            const cosAlt = Math.cos(alt);
            expect(dir.x).toBeCloseTo(cosAlt * Math.sin(az), 12);
            expect(dir.y).toBeCloseTo(Math.sin(alt), 12);
            expect(dir.z).toBeCloseTo(-cosAlt * Math.cos(az), 12);
        }
    });

    it('is a unit vector', () => {
        const dir = sunDirectionFromAltAz(0.7, 2.1);
        const len = Math.hypot(dir.x, dir.y, dir.z);
        expect(len).toBeCloseTo(1, 12);
    });

    it('due-south sun (az=180°) points toward +Z (South), zero East', () => {
        const dir = sunDirectionFromAltAz(30 / RAD_TO_DEG, 180 / RAD_TO_DEG);
        expect(dir.x).toBeCloseTo(0, 12);
        expect(dir.z).toBeGreaterThan(0); // +Z = South
        expect(dir.y).toBeGreaterThan(0); // above horizon ⇒ up
    });

    it('due-east sun (az=90°) points toward +X (East)', () => {
        const dir = sunDirectionFromAltAz(20 / RAD_TO_DEG, 90 / RAD_TO_DEG);
        expect(dir.x).toBeGreaterThan(0); // +X = East
        expect(dir.z).toBeCloseTo(0, 12);
    });
});
