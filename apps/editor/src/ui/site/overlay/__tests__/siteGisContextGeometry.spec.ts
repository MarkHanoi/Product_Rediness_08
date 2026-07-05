// §FEAT-PLAN-VIEW-GIS (L-104) — unit tests for the pure web-mercator tile geometry that
// drives the plan-view GIS context underlay. Pure math only (no DOM/THREE/fetch), so these
// run headless in the root vitest happy-dom config.

import { describe, it, expect } from 'vitest';
import {
    webMercatorResolution,
    lonLatToWorldPixel,
    chooseGisZoom,
    computeGisTileGrid,
    computeGisContextUnderlayRotationZ,
    TILE_SIZE_PX,
} from '../siteGisContextGeometry';

describe('webMercatorResolution', () => {
    it('halves each zoom level (equator)', () => {
        const r10 = webMercatorResolution(0, 10);
        const r11 = webMercatorResolution(0, 11);
        expect(r11).toBeCloseTo(r10 / 2, 6);
    });

    it('shrinks with latitude (cos falloff)', () => {
        const eq = webMercatorResolution(0, 15);
        const hi = webMercatorResolution(60, 15);
        // cos(60°) = 0.5 → roughly half the ground resolution.
        expect(hi).toBeCloseTo(eq * Math.cos((60 * Math.PI) / 180), 4);
        expect(hi).toBeLessThan(eq);
    });
});

describe('lonLatToWorldPixel', () => {
    it('maps (0,0) to the centre of the pixel plane', () => {
        const z = 4;
        const mapSize = TILE_SIZE_PX * 2 ** z;
        const p = lonLatToWorldPixel(0, 0, z);
        expect(p.px).toBeCloseTo(mapSize / 2, 6);
        expect(p.py).toBeCloseTo(mapSize / 2, 6);
    });

    it('increases px eastward and py southward', () => {
        const z = 8;
        const west = lonLatToWorldPixel(-10, 0, z);
        const east = lonLatToWorldPixel(10, 0, z);
        const north = lonLatToWorldPixel(0, 10, z);
        const south = lonLatToWorldPixel(0, -10, z);
        expect(east.px).toBeGreaterThan(west.px);
        expect(south.py).toBeGreaterThan(north.py); // py grows toward the south
    });
});

describe('chooseGisZoom', () => {
    it('picks the sharpest zoom whose composite still fits the canvas cap', () => {
        const lat = -33.8568; // Sydney
        const extent = 400;
        const maxPx = 1536;
        const z = chooseGisZoom(lat, extent, maxPx);
        // The chosen zoom must fit …
        expect(extent / webMercatorResolution(lat, z)).toBeLessThanOrEqual(maxPx);
        // … and one level sharper must NOT fit (it is the maximal fitting zoom).
        expect(extent / webMercatorResolution(lat, z + 1)).toBeGreaterThan(maxPx);
    });

    it('never exceeds the ESRI native cap', () => {
        const z = chooseGisZoom(0, 1, 4096, 19);
        expect(z).toBeLessThanOrEqual(19);
    });
});

describe('computeGisTileGrid', () => {
    it('centres the origin on the canvas and reports the metric scale', () => {
        const lat = 51.5074; // London
        const lon = -0.1278;
        const zoom = 18;
        const canvasPx = 1024;
        const grid = computeGisTileGrid(lat, lon, zoom, canvasPx);
        expect(grid.canvasWidthPx).toBe(canvasPx);
        expect(grid.originCanvasX).toBeCloseTo(canvasPx / 2, 6);
        expect(grid.originCanvasY).toBeCloseTo(canvasPx / 2, 6);
        expect(grid.pxPerMeter).toBeCloseTo(1 / webMercatorResolution(lat, zoom), 6);
    });

    it('emits enough tiles to fully cover the canvas window', () => {
        const grid = computeGisTileGrid(51.5074, -0.1278, 18, 1024);
        // A 1024-px window spans ~4 tiles per axis, so at least 4×4 = 16 (up to 5×5 with
        // fractional straddle). Every tile must land inside or on the canvas bounds.
        expect(grid.tiles.length).toBeGreaterThanOrEqual(16);
        for (const t of grid.tiles) {
            expect(t.destX).toBeLessThan(grid.canvasWidthPx);
            expect(t.destY).toBeLessThan(grid.canvasHeightPx);
            expect(t.destX + TILE_SIZE_PX).toBeGreaterThan(0);
            expect(t.destY + TILE_SIZE_PX).toBeGreaterThan(0);
        }
    });
});

describe('computeGisContextUnderlayRotationZ', () => {
    it('is the identity at θ = 0 (north-aligned site = byte-identical to today)', () => {
        expect(computeGisContextUnderlayRotationZ(0)).toBe(0);
    });

    it('normalises θ into (−π, π] and passes it through (rotationZ = θ)', () => {
        expect(computeGisContextUnderlayRotationZ(Math.PI / 4)).toBeCloseTo(Math.PI / 4, 9);
        // 2π + small wraps back to small.
        expect(computeGisContextUnderlayRotationZ(2 * Math.PI + 0.1)).toBeCloseTo(0.1, 9);
    });
});
