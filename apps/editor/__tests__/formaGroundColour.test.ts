// §FORMA-GROUND-URBAN-WHITE (L-12922) — the terrain base is off-white in and beside urban land
// (every city and village), light brown in open country (the founder's 2026-07-29 mountain rule).
import { describe, it, expect } from 'vitest';
import {
    formaGroundBaseColour, shouldPaintFormaGroundBase, FORMA_GROUND_RURAL, FORMA_GROUND_URBAN, URBAN_NEAR_M,
} from '../src/ui/geospatial/formaGroundColour';

// Euston, London: a residential polygon around the site (lon −0.1316, lat 51.5265).
const EUSTON_URBAN = { kind: 'urban' as const, ring: [[-0.135, 51.524], [-0.128, 51.524], [-0.128, 51.529], [-0.135, 51.529], [-0.135, 51.524]] as Array<readonly [number, number]> };
// A village: one small residential polygon 200 m east of a house standing just outside it.
const VILLAGE = { kind: 'urban' as const, ring: [[3.702, 43.400], [3.706, 43.400], [3.706, 43.403], [3.702, 43.403], [3.702, 43.400]] as Array<readonly [number, number]> };
const FARMLAND = { kind: 'rural' as const, ring: [[3.60, 43.30], [3.80, 43.30], [3.80, 43.50], [3.60, 43.50], [3.60, 43.30]] as Array<readonly [number, number]> };

describe('§FORMA-GROUND-URBAN-WHITE (L-12922)', () => {
    it('a site INSIDE an urban landuse polygon gets the off-white base (Euston)', () => {
        const v = formaGroundBaseColour([EUSTON_URBAN, FARMLAND], 51.5265, -0.1316);
        expect(v.arm).toBe('urban-inside');
        expect(v.colour).toBe(FORMA_GROUND_URBAN);
        expect(v.nearestUrbanM).toBe(0);
    });

    it('a house just OUTSIDE the village polygon, within 300 m, is still "in the village"', () => {
        // 3.7005 is ~120 m west of the polygon's west edge at this latitude.
        const v = formaGroundBaseColour([FARMLAND, VILLAGE], 43.4015, 3.7005);
        expect(v.arm).toBe('urban-near');
        expect(v.nearestUrbanM).toBeGreaterThan(50);
        expect(v.nearestUrbanM).toBeLessThanOrEqual(URBAN_NEAR_M);
        expect(v.colour).toBe(FORMA_GROUND_URBAN);
    });

    it('open country far from any urban polygon keeps the light-brown base (the 2026-07-29 mountain rule)', () => {
        const v = formaGroundBaseColour([FARMLAND, VILLAGE], 43.45, 3.65);   // ~5 km from the village
        expect(v.arm).toBe('rural');
        expect(v.colour).toBe(FORMA_GROUND_RURAL);
        expect(v.nearestUrbanM).toBeGreaterThan(URBAN_NEAR_M);
    });

    it('no landuse at all is an ADMISSION, not a finding: the rural default, arm no-landuse', () => {
        expect(formaGroundBaseColour([], 51.5, -0.13).arm).toBe('no-landuse');
        expect(formaGroundBaseColour(null, 51.5, -0.13).colour).toBe(FORMA_GROUND_RURAL);
        expect(formaGroundBaseColour([FARMLAND], 43.4, 3.7).arm).toBe('rural');
    });

    it('never throws on junk input', () => {
        expect(() => formaGroundBaseColour([{ kind: 'urban', ring: [] }], Number.NaN, 0)).not.toThrow();
        expect(formaGroundBaseColour([{ kind: 'urban', ring: [[0, 0]] }], 0.5, 0.5).arm).toBe('rural');
    });

    // §FORMA-GROUND-PAINT-GATE (L-12948) — the reason the off-white never appeared in production.
    it('THE BUG: a session that loaded photoreal tiles still paints the Forma ground', () => {
        // photorealTilesActive is set on first tile load and is never reset on Forma re-entry, so the
        // old `formaMode && !photorealActive` guard was false for the rest of the session.
        expect(shouldPaintFormaGroundBase({ formaMode: true, photorealActive: true })).toBe(true);
        expect(shouldPaintFormaGroundBase({ formaMode: true, photorealActive: false })).toBe(true);
    });

    it('outside Forma the photoreal tiles carry the ground and we must NOT paint it', () => {
        expect(shouldPaintFormaGroundBase({ formaMode: false, photorealActive: true })).toBe(false);
        expect(shouldPaintFormaGroundBase({ formaMode: false, photorealActive: false })).toBe(false);
    });
});