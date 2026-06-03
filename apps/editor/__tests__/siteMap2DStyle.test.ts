// A.8.c.f — pure Hektar-style helper tests (node env, no maplibre/DOM).
//
// Validates the cream/shadow MapLibre style composition:
//   - the cream basemap-only style is keyless + structurally valid (v8, raster)
//   - the cream background + Positron raster layers are present + ordered
//   - building footprints are added only when an MVT endpoint is supplied, and
//     the drop-shadow layer is drawn BENEATH the near-white fill (the elegant
//     plan-view "floating building" look)
//   - the violet + palette constants are the single source of truth

import { describe, it, expect } from 'vitest';
import {
    buildSiteMap2DStyle,
    HEKTAR_PALETTE,
    CARTO_POSITRON_TILES,
    SHADOW_OFFSET,
} from '../src/ui/geospatial/siteMap2DStyle';

describe('buildSiteMap2DStyle (Hektar cream/shadow)', () => {
    it('produces a valid v8 raster style with cream background first', () => {
        const style = buildSiteMap2DStyle();
        expect(style.version).toBe(8);

        const ids = style.layers.map((l) => l['id']);
        // Cream page background must be the bottom-most layer.
        expect(ids[0]).toBe('cream-background');
        expect(ids).toContain('carto-positron');

        const bg = style.layers[0] as Record<string, any>;
        expect(bg['paint']['background-color']).toBe(HEKTAR_PALETTE.cream);

        // Basemap raster source uses the keyless CartoDB Positron tiles.
        const src = (style.sources as any)['carto-positron'];
        expect(src.type).toBe('raster');
        expect(src.tiles).toEqual([...CARTO_POSITRON_TILES]);
        expect(String(src.attribution)).toContain('OpenStreetMap');
    });

    it('omits building layers when no MVT endpoint is supplied (keyless default)', () => {
        const style = buildSiteMap2DStyle();
        const ids = style.layers.map((l) => l['id']);
        expect(ids).not.toContain('buildings-fill');
        expect(ids).not.toContain('buildings-shadow');
        expect((style.sources as any)['buildings']).toBeUndefined();
    });

    it('adds near-white fill OVER an offset drop-shadow when an MVT endpoint is given', () => {
        const style = buildSiteMap2DStyle({
            buildingsSourceUrl: 'https://example.test/tiles/{z}/{x}/{y}.pbf',
        });
        const ids = style.layers.map((l) => l['id']);
        const shadowIdx = ids.indexOf('buildings-shadow');
        const fillIdx = ids.indexOf('buildings-fill');
        expect(shadowIdx).toBeGreaterThan(-1);
        expect(fillIdx).toBeGreaterThan(-1);
        // Shadow must be drawn BENEATH (earlier in the array than) the fill.
        expect(shadowIdx).toBeLessThan(fillIdx);

        const shadow = style.layers[shadowIdx] as Record<string, any>;
        expect(shadow['paint']['fill-color']).toBe(HEKTAR_PALETTE.shadow);
        expect(shadow['paint']['fill-translate']).toEqual([...SHADOW_OFFSET]);

        const fill = style.layers[fillIdx] as Record<string, any>;
        expect(fill['paint']['fill-color']).toBe(HEKTAR_PALETTE.buildingFill);

        const src = (style.sources as any)['buildings'];
        expect(src.type).toBe('vector');
        expect(src.tiles).toEqual(['https://example.test/tiles/{z}/{x}/{y}.pbf']);
    });

    it('exposes PRYZM violet as the boundary-ring colour', () => {
        expect(HEKTAR_PALETTE.violet).toBe('#6600FF');
    });
});
