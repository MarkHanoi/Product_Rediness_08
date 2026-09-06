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
            terrainEnabled: true, photorealActive: false, formaMode: true, boundedTerrainPermitted: true, ...MADRID,
        });
        expect(d.attach).toBe(true);
        if (d.attach) expect(d.city).toBe('madrid');
        // sanity: the city resolver agrees.
        expect(cityForLonLat(MADRID.lon, MADRID.lat)).toBe('madrid');
    });

    it('the user toggle OFF wins over everything → flat ground (the escape hatch)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: false, photorealActive: false, formaMode: true, boundedTerrainPermitted: true, ...MADRID,
        });
        expect(d).toEqual({ attach: false, reason: 'toggle-off' });
    });

    it('skips on the true photoreal (non-Forma) path — Google 3D tiles carry their own ground', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: true, formaMode: false, boundedTerrainPermitted: true, ...MADRID,
        });
        expect(d).toEqual({ attach: false, reason: 'photoreal' });
    });

    it('still attaches in Forma even when a photoreal tileset exists (it is hidden in Forma)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: true, formaMode: true, boundedTerrainPermitted: true, ...MADRID,
        });
        expect(d.attach).toBe(true);
    });

    it('keeps flat for an un-baked location (no regression outside baked bboxes)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true, boundedTerrainPermitted: true, ...OPEN_SEA,
        });
        expect(d).toEqual({ attach: false, reason: 'no-baked-city' });
    });

    it('toggle OFF still reports toggle-off even for an un-baked location (ordering: toggle first)', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: false, photorealActive: false, formaMode: true, boundedTerrainPermitted: true, ...OPEN_SEA,
        });
        expect(d).toEqual({ attach: false, reason: 'toggle-off' });
    });

    // ═══ §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) ═══════════════════════════════════════════
    // The founder, 2026-09-06: *"no need to select analyse - parcel law - the 3d globe doesnt
    // render correct initially"* — his `3D Globe` pane rendered ONE BEIGE TRIANGULAR SHARD. §L-412
    // keeps exactly one Cesium viewer re-targeted between panes (correct, and unchanged), so the
    // world framing inherited Córdoba's CITY-BOUNDED tileset. A bounded quantized-mesh provider
    // declares availability only inside its own layer.json bbox, so at world range Cesium has one
    // or two level-0 roots and nothing else. His console said it in numbers: `renderedTerrainTiles`
    // 0 → 1 → 2 for an entire planet, and `L0-TILES[2]: L0(0,0)st1-ts4 L0(1,0)st3-ts0`.
    it('refuses a bounded city tileset while the camera is framed on the WHOLE EARTH', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true,
            boundedTerrainPermitted: false, ...MADRID,
        });
        expect(d).toEqual({ attach: false, reason: 'world-framing' });
    });

    // ⛔ THE ORDERING IS LOAD-BEARING, NOT COSMETIC. At world framing the answer is the same
    // whether or not the paid photoreal tileset ever loaded, so the REASON must not depend on a
    // fact irrelevant to it — a `photoreal` reason here would send a future reader to the wrong
    // gate. (`toggle-off` still wins over both: it is the founder's escape hatch.)
    it('world-framing outranks the photoreal gate, and the user toggle outranks world-framing', () => {
        expect(decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: true, formaMode: false,
            boundedTerrainPermitted: false, ...MADRID,
        })).toEqual({ attach: false, reason: 'world-framing' });
        expect(decideBakedTerrainAttach({
            terrainEnabled: false, photorealActive: false, formaMode: true,
            boundedTerrainPermitted: false, ...MADRID,
        })).toEqual({ attach: false, reason: 'toggle-off' });
    });

    // ⛔ AND THE SITE VIEW STILL GETS ITS TERRAIN. L-12991 explicitly forbids "fix it by refusing to
    // attach the baked city terrain": L-636 §TERRAIN-NORMALS, L-639 §CAMERA-UNDERGROUND-FIX and the
    // whole per-footprint seat path depend on it. This pins that the new gate is scoped to the
    // world framing and nothing else.
    it('the SITE framing is unaffected — a baked city still attaches exactly as before', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true,
            boundedTerrainPermitted: true, ...MADRID,
        });
        expect(d.attach).toBe(true);
        if (d.attach) expect(d.city).toBe('madrid');
    });
});
