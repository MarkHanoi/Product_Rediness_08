// A.8.c.f.2 — pure Hektar-style helper tests (node env, no maplibre/DOM).
//
// Validates the cream/shadow OpenFreeMap VECTOR style composition:
//   - the style is keyless + structurally valid (v8) with a single OpenFreeMap
//     vector source backing every Hektar layer
//   - the cream background is the bottom-most layer; water/landuse/roads/labels
//     are present
//   - building footprints render from the `building` source-layer with the
//     drop-shadow drawn BENEATH the near-white fill (the elegant plan-view
//     "floating building" look), and the shadow sits ABOVE the roads
//   - `extrude` swaps the flat fill for a fill-extrusion (gentle 3D) but keeps
//     the grounding shadow
//   - the violet + palette constants are the single source of truth

import { describe, it, expect } from 'vitest';
import {
    buildSiteMap2DStyle,
    HEKTAR_PALETTE,
    SHADOW_OFFSET,
    OMT_SOURCE,
    BUILDING_SOURCE_LAYER,
    OPENFREEMAP_TILEJSON,
    OPENFREEMAP_GLYPHS,
} from '../src/ui/geospatial/siteMap2DStyle';

describe('buildSiteMap2DStyle (Hektar OpenFreeMap cream/shadow)', () => {
    it('produces a valid v8 vector style with cream background first + glyphs', () => {
        const style = buildSiteMap2DStyle();
        expect(style.version).toBe(8);
        expect(style.glyphs).toBe(OPENFREEMAP_GLYPHS);

        const ids = style.layers.map((l) => l['id']);
        // Cream page background must be the bottom-most layer.
        expect(ids[0]).toBe('cream-background');
        const bg = style.layers[0] as Record<string, any>;
        expect(bg['paint']['background-color']).toBe(HEKTAR_PALETTE.cream);

        // A single keyless OpenFreeMap vector source feeds every layer.
        const src = (style.sources as any)[OMT_SOURCE];
        expect(src.type).toBe('vector');
        expect(src.url).toBe(OPENFREEMAP_TILEJSON);
        expect(String(src.attribution)).toContain('OpenStreetMap');
    });

    it('includes the Hektar cartography layers (water, landuse, roads, labels)', () => {
        const ids = buildSiteMap2DStyle().layers.map((l) => l['id']);
        expect(ids).toContain('water');
        expect(ids).toContain('landuse');
        expect(ids).toContain('road-major');
        expect(ids).toContain('road-minor');
        expect(ids).toContain('road-label');
        expect(ids).toContain('place-label');
    });

    it('draws near-white building fill OVER an offset drop-shadow, above the roads', () => {
        const style = buildSiteMap2DStyle();
        const ids = style.layers.map((l) => l['id']);
        const shadowIdx = ids.indexOf('buildings-shadow');
        const fillIdx = ids.indexOf('buildings-fill');
        const roadIdx = ids.indexOf('road-major');
        expect(shadowIdx).toBeGreaterThan(-1);
        expect(fillIdx).toBeGreaterThan(-1);
        // Shadow drawn BENEATH (earlier than) the fill, but ABOVE the roads so the
        // building floats over the page rather than under the street network.
        expect(shadowIdx).toBeLessThan(fillIdx);
        expect(shadowIdx).toBeGreaterThan(roadIdx);

        const shadow = style.layers[shadowIdx] as Record<string, any>;
        expect(shadow['source']).toBe(OMT_SOURCE);
        expect(shadow['source-layer']).toBe(BUILDING_SOURCE_LAYER);
        expect(shadow['paint']['fill-color']).toBe(HEKTAR_PALETTE.shadow);
        expect(shadow['paint']['fill-translate']).toEqual([...SHADOW_OFFSET]);

        const fill = style.layers[fillIdx] as Record<string, any>;
        expect(fill['source-layer']).toBe(BUILDING_SOURCE_LAYER);
        expect(fill['paint']['fill-color']).toBe(HEKTAR_PALETTE.buildingFill);
    });

    it('swaps the flat fill for a fill-extrusion when extrude is set, keeping the shadow', () => {
        const style = buildSiteMap2DStyle({ extrude: true });
        const ids = style.layers.map((l) => l['id']);
        expect(ids).toContain('buildings-shadow'); // grounding shadow stays
        expect(ids).toContain('buildings-3d');
        expect(ids).not.toContain('buildings-fill');

        const ext = style.layers[ids.indexOf('buildings-3d')] as Record<string, any>;
        expect(ext['type']).toBe('fill-extrusion');
        expect(ext['source-layer']).toBe(BUILDING_SOURCE_LAYER);
    });

    it('exposes PRYZM violet as the boundary-ring colour', () => {
        expect(HEKTAR_PALETTE.violet).toBe('#6600FF');
    });
});
