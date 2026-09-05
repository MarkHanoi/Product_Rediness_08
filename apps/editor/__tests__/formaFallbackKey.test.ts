// §FORMA-FALLBACK-KEY-IS-LOCAL (L-12920) — the night-time Forma key lights the ground at EVERY site.
// The founder's Cremorne Point (Sydney) and Melbourne sessions at 23:00 local rendered a black ground
// because the fallback key was a fixed ECEF vector centred near the Middle East; Sète and Barcelona,
// within ~60° of it, read fine. These arms pin the geometry with the old vector as the control.
import { describe, it, expect } from 'vitest';
import {
    formaFallbackKeyDirectionEcef,
    groundIlluminationAt,
    enuVectorToEcef,
    upVectorEcef,
} from '../src/ui/geospatial/formaFallbackKey';

const SITES = {
    cremorne: { lat: -33.8440, lon: 151.2230 },
    melbourne: { lat: -37.8545, lon: 144.9666 },
    sete: { lat: 43.3994, lon: 3.6851 },
    barcelona: { lat: 41.39, lon: 2.17 },
    nyc: { lat: 40.758, lon: -73.9855 },
    dubai: { lat: 25.2, lon: 55.27 },
};
const LEGACY_FIXED: readonly [number, number, number] = (() => {
    const v = [-0.55, -0.7, -0.45]; const n = Math.hypot(v[0]!, v[1]!, v[2]!);
    return [v[0]! / n, v[1]! / n, v[2]! / n];
})();

describe('§FORMA-FALLBACK-KEY-IS-LOCAL (L-12920)', () => {
    it('THE BUG, as a control: the legacy fixed ECEF key leaves Sydney and Melbourne in the dark', () => {
        expect(groundIlluminationAt(SITES.cremorne, LEGACY_FIXED)).toBeLessThan(0.05);
        expect(groundIlluminationAt(SITES.melbourne, LEGACY_FIXED)).toBeLessThan(0.05);
        // …while the European sites the fix had been judged on were lit.
        expect(groundIlluminationAt(SITES.sete, LEGACY_FIXED)).toBeGreaterThan(0.3);
    });

    it('the local key lights the ground at the same ~27° elevation at every site', () => {
        // to-sun = (0.55, 0.70, 0.45) normalised → up component 0.451 → elevation asin(0.451) ≈ 26.8°.
        const expected = 0.45 / Math.hypot(0.55, 0.7, 0.45);
        for (const site of Object.values(SITES)) {
            const dir = formaFallbackKeyDirectionEcef(site);
            expect(Math.hypot(...dir)).toBeCloseTo(1, 9);
            expect(groundIlluminationAt(site, dir)).toBeCloseTo(expected, 6);
        }
    });

    it('the local key is a NE key: its horizontal component points south-west in every ENU frame', () => {
        // Rotate back: the ECEF direction projected onto local east/north must be negative on both.
        for (const site of Object.values(SITES)) {
            const dir = formaFallbackKeyDirectionEcef(site);
            const e = enuVectorToEcef(1, 0, 0, site.lat, site.lon);
            const n = enuVectorToEcef(0, 1, 0, site.lat, site.lon);
            const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
            expect(dot(dir, e)).toBeLessThan(0);
            expect(dot(dir, n)).toBeLessThan(0);
        }
    });

    it('ENU→ECEF is the standard rotation (up at the equator/prime meridian is +X; up at the pole is +Z)', () => {
        expect(upVectorEcef(0, 0).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 0, 0]);
        expect(upVectorEcef(90, 0).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 0, 1]);
        expect(enuVectorToEcef(1, 0, 0, 0, 0).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, 0]);
    });

    it('with no site known it keeps the legacy fixed vector (the only case where "local" has no meaning)', () => {
        expect(formaFallbackKeyDirectionEcef(null)).toEqual(LEGACY_FIXED);
    });
});
