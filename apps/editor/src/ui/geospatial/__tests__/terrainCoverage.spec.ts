// §TERRAIN-TOGGLE (founder 2026-07-27) — the PURE attach/detach decision behind the 3D-Site
// terrain ON/OFF toggle. These lock the gate ordering so the escape hatch (toggle OFF), the
// photoreal path, and un-baked cities each keep flat ground, and only a baked city with the
// toggle ON attaches — independent of any Cesium/DOM wiring.

import { describe, it, expect } from 'vitest';
import { decideBakedTerrainAttach, cityForLonLat } from '../terrainCoverage';

// A known baked city (Madrid — the high-relief case this feature exists to study).
const MADRID = { lon: -3.7038, lat: 40.4168 };
// A point outside every baked bbox → no terrain regardless of the toggle.
const OPEN_SEA = { lon: 0, lat: 0 };

describe('decideBakedTerrainAttach — the terrain toggle gate', () => {
    it('attaches for a baked city when the toggle is ON (Forma path)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true, ...MADRID,
        });
        expect(d.attach).toBe(true);
        if (d.attach) expect(d.city).toBe('madrid');
        // sanity: the city resolver agrees.
        expect(cityForLonLat(MADRID.lon, MADRID.lat)).toBe('madrid');
    });

    it('the user toggle OFF wins over everything → flat ground (the escape hatch)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: false, photorealActive: false, formaMode: true, ...MADRID,
        });
        expect(d).toEqual({ attach: false, reason: 'toggle-off' });
    });

    it('skips on the true photoreal (non-Forma) path — Google 3D tiles carry their own ground', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: true, formaMode: false, ...MADRID,
        });
        expect(d).toEqual({ attach: false, reason: 'photoreal' });
    });

    it('still attaches in Forma even when a photoreal tileset exists (it is hidden in Forma)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: true, formaMode: true, ...MADRID,
        });
        expect(d.attach).toBe(true);
    });

    it('keeps flat for an un-baked location (no regression outside baked bboxes)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true, ...OPEN_SEA,
        });
        expect(d).toEqual({ attach: false, reason: 'no-baked-city' });
    });

    it('toggle OFF still reports toggle-off even for an un-baked location (ordering: toggle first)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: false, photorealActive: false, formaMode: true, ...OPEN_SEA,
        });
        expect(d).toEqual({ attach: false, reason: 'toggle-off' });
    });
});
