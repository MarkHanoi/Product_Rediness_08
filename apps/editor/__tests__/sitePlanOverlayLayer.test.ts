// §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — the DECISIVE render fix.
//
// Root cause the founder hit: the Map↔Satellite basemap toggle calls
// `map.setStyle(..., {diff:false})`, which tears down EVERY custom source + layer and
// re-fires `style.load`. SiteBoundaryMap2D re-added only the boundary ring in that event
// — NOT the site-plan overlay raster — so the overlay vanished the moment the user was on
// (or switched to) the satellite basemap they were viewing.
//
// The fix makes `SitePlanOverlayLayer` SELF-HEAL: it registers a `style.load` listener and
// re-installs its source+layer (idempotently) after a style swap, preserving the live
// opacity + visibility. These tests drive a fake MapLibre map through a style wipe and
// assert the overlay comes back.

import { describe, it, expect } from 'vitest';
import { SitePlanOverlayLayer } from '../src/ui/site/overlay/SitePlanOverlayLayer';
import { defaultOverlayTransform } from '../src/ui/site/overlay/sitePlanOverlayGeometry';

const SOURCE = 'pryzm-site-plan-overlay';
const LAYER = 'pryzm-site-plan-overlay-raster';

// Minimal fake of the MapLibre surface SitePlanOverlayLayer uses. Records style-reload
// handlers so a test can simulate a `setStyle` wipe (clears sources+layers, fires
// `style.load`) exactly as MapLibre does.
class FakeMap {
    handlers: Record<string, Array<() => void>> = {};
    sources = new Map<string, Record<string, unknown>>();
    layers = new Map<string, { paint: Record<string, unknown>; layout: Record<string, unknown> }>();

    on(ev: string, fn: () => void) { (this.handlers[ev] ??= []).push(fn); }
    off(ev: string, fn: () => void) { this.handlers[ev] = (this.handlers[ev] ?? []).filter((h) => h !== fn); }
    private fire(ev: string) { (this.handlers[ev] ?? []).slice().forEach((h) => h()); }

    getSource(id: string) { return this.sources.get(id); }
    addSource(id: string, def: Record<string, unknown>) {
        this.sources.set(id, { ...def, setCoordinates() {}, updateImage() {} });
    }
    getLayer(id: string) { return this.layers.get(id); }
    addLayer(def: { id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }) {
        this.layers.set(def.id, { paint: { ...(def.paint ?? {}) }, layout: { ...(def.layout ?? {}) } });
    }
    setPaintProperty(id: string, k: string, v: unknown) { const l = this.layers.get(id); if (l) l.paint[k] = v; }
    setLayoutProperty(id: string, k: string, v: unknown) { const l = this.layers.get(id); if (l) l.layout[k] = v; }
    removeLayer(id: string) { this.layers.delete(id); }
    removeSource(id: string) { this.sources.delete(id); }

    /** Simulate `setStyle({diff:false})`: wipe custom sources+layers, re-fire style.load. */
    wipeStyle() { this.sources.clear(); this.layers.clear(); this.fire('style.load'); }
}

function makeLayer(map: FakeMap, opacity = 0.7, visible = true) {
    return new SitePlanOverlayLayer({
        map: map as unknown as import('maplibre-gl').Map,
        dataUrl: 'data:image/png;base64,AAAA',
        transform: defaultOverlayTransform(1000, 700),
        originLat: 51.5,
        originLon: -0.12,
        opacity,
        visible,
    });
}

describe('SitePlanOverlayLayer — self-heal across a basemap setStyle swap', () => {
    it('installs the overlay source + raster layer on construction', () => {
        const map = new FakeMap();
        makeLayer(map);
        expect(map.getSource(SOURCE)).toBeTruthy();
        expect(map.getLayer(LAYER)).toBeTruthy();
    });

    it('RE-INSTALLS the overlay after a style wipe (the satellite-toggle bug)', () => {
        const map = new FakeMap();
        makeLayer(map);
        // Basemap toggle wipes every custom source/layer …
        map.wipeStyle();
        // … and the overlay heals itself back on `style.load`.
        expect(map.getSource(SOURCE)).toBeTruthy();
        expect(map.getLayer(LAYER)).toBeTruthy();
    });

    it('preserves the live opacity through a style wipe', () => {
        const map = new FakeMap();
        const layer = makeLayer(map, 0.7);
        layer.setOpacity(0.3);
        map.wipeStyle();
        expect(map.getLayer(LAYER)!.paint['raster-opacity']).toBeCloseTo(0.3, 9);
    });

    it('preserves the hidden state through a style wipe', () => {
        const map = new FakeMap();
        const layer = makeLayer(map, 0.7, true);
        layer.setVisible(false);
        map.wipeStyle();
        expect(map.getLayer(LAYER)!.layout['visibility']).toBe('none');
    });

    it('dispose() removes the layer/source AND stops healing on later swaps', () => {
        const map = new FakeMap();
        const layer = makeLayer(map);
        layer.dispose();
        expect(map.getSource(SOURCE)).toBeFalsy();
        expect(map.getLayer(LAYER)).toBeFalsy();
        // A later style reload must NOT resurrect a disposed overlay.
        map.wipeStyle();
        expect(map.getSource(SOURCE)).toBeFalsy();
        expect(map.getLayer(LAYER)).toBeFalsy();
    });
});
