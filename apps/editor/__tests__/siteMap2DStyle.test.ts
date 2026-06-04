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
    buildFormaMap2DStyle,
    buildSatelliteStyle,
    HEKTAR_PALETTE,
    FORMA_PALETTE,
    FORMA_BOUNDARY_DASH,
    FORMA_BOUNDARY_WIDTH,
    SHADOW_OFFSET,
    OMT_SOURCE,
    BUILDING_SOURCE_LAYER,
    OPENFREEMAP_TILEJSON,
    OPENFREEMAP_GLYPHS,
    SATELLITE_SOURCE,
    ESRI_WORLD_IMAGERY_URL,
    ESRI_WORLD_IMAGERY_ATTRIBUTION,
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

describe('buildFormaMap2DStyle (FORMA.1 — Autodesk-Forma minimal-vector)', () => {
    it('produces a valid v8 vector style with off-white land background first', () => {
        const style = buildFormaMap2DStyle();
        expect(style.version).toBe(8);
        expect(style.glyphs).toBe(OPENFREEMAP_GLYPHS);

        const ids = style.layers.map((l) => l['id']);
        expect(ids[0]).toBe('land-background');
        const bg = style.layers[0] as Record<string, any>;
        expect(bg['paint']['background-color']).toBe(FORMA_PALETTE.land);

        // Reuses the SAME keyless OpenFreeMap vector source (no provider swap).
        const src = (style.sources as any)[OMT_SOURCE];
        expect(src.type).toBe('vector');
        expect(src.url).toBe(OPENFREEMAP_TILEJSON);
        expect(String(src.attribution)).toContain('OpenStreetMap');
    });

    it('uses the Forma palette: off-white land, grey roads, pale blue-grey water', () => {
        expect(FORMA_PALETTE.land).toBe('#F0EDE8');
        expect(FORMA_PALETTE.road).toBe('#D9D6CF');
        expect(FORMA_PALETTE.water).toBe('#C8DCE8');
        const style = buildFormaMap2DStyle();
        const water = style.layers.find((l) => l['id'] === 'water') as Record<string, any>;
        expect(water['paint']['fill-color']).toBe(FORMA_PALETTE.water);
        const road = style.layers.find((l) => l['id'] === 'road-major') as Record<string, any>;
        expect(road['paint']['line-color']).toBe(FORMA_PALETTE.road);
    });

    it('renders abstract building footprints as subtle light fills with faint outlines', () => {
        const style = buildFormaMap2DStyle();
        const fill = style.layers.find((l) => l['id'] === 'buildings-fill') as Record<string, any>;
        expect(fill).toBeDefined();
        expect(fill['source-layer']).toBe(BUILDING_SOURCE_LAYER);
        expect(fill['paint']['fill-color']).toBe(FORMA_PALETTE.buildingFill);
        expect(fill['paint']['fill-outline-color']).toBe(FORMA_PALETTE.buildingStroke);
        // No drop-shadow layer — Forma is flat/abstract, not the Hektar float look.
        expect(style.layers.map((l) => l['id'])).not.toContain('buildings-shadow');
    });

    it('has NO POI icons and NO satellite layer (SPEC §8 NON-GOALS), only thin labels', () => {
        const ids = buildFormaMap2DStyle().layers.map((l) => l['id']);
        expect(ids).not.toContain('poi');
        expect(ids).not.toContain('poi-label');
        expect(ids).not.toContain('satellite');
        // Minimal labels are present but thin/grey.
        expect(ids).toContain('road-label');
        expect(ids).toContain('place-label');
        const style = buildFormaMap2DStyle();
        const placeLabel = style.layers.find((l) => l['id'] === 'place-label') as Record<string, any>;
        expect(placeLabel['paint']['text-color']).toBe(FORMA_PALETTE.label);
    });

    it('exposes the dashed-green boundary spec (8/6 → [4,3] at 2px width)', () => {
        expect(FORMA_PALETTE.boundary).toBe('#2D6A4F');
        expect(FORMA_PALETTE.boundaryFill).toBe('rgba(45, 106, 79, 0.08)');
        expect(FORMA_BOUNDARY_WIDTH).toBe(2);
        expect([...FORMA_BOUNDARY_DASH]).toEqual([4, 3]);
    });

    it('swaps to a faint extrusion when extrude is set (still abstract, no shadow)', () => {
        const ids = buildFormaMap2DStyle({ extrude: true }).layers.map((l) => l['id']);
        expect(ids).toContain('buildings-3d');
        expect(ids).not.toContain('buildings-fill');
        expect(ids).not.toContain('buildings-shadow');
    });
});

describe('buildSatelliteStyle (A.8.c.f.4 — keyless ESRI World Imagery raster)', () => {
    it('produces a valid v8 raster style with a single keyless ESRI source', () => {
        const style = buildSatelliteStyle();
        expect(style.version).toBe(8);

        const src = (style.sources as any)[SATELLITE_SOURCE];
        expect(src.type).toBe('raster');
        expect(src.tiles).toEqual([ESRI_WORLD_IMAGERY_URL]);
        expect(src.tileSize).toBe(256);
        expect(src.maxzoom).toBe(19);
        expect(String(src.attribution)).toBe(ESRI_WORLD_IMAGERY_ATTRIBUTION);
    });

    it('uses the keyless ArcGIS {z}/{y}/{x} endpoint (no API key)', () => {
        expect(ESRI_WORLD_IMAGERY_URL).toContain('server.arcgisonline.com');
        expect(ESRI_WORLD_IMAGERY_URL).toContain('World_Imagery');
        // ArcGIS tile path order is {z}/{y}/{x} (NOT {z}/{x}/{y}).
        expect(ESRI_WORLD_IMAGERY_URL).toContain('{z}/{y}/{x}');
        // Keyless — no token / api-key query string.
        expect(ESRI_WORLD_IMAGERY_URL).not.toMatch(/token|api[_-]?key/i);
    });

    it('renders a single raster layer bound to the ESRI source', () => {
        const style = buildSatelliteStyle();
        expect(style.layers).toHaveLength(1);
        const layer = style.layers[0] as Record<string, any>;
        expect(layer['id']).toBe('satellite');
        expect(layer['type']).toBe('raster');
        expect(layer['source']).toBe(SATELLITE_SOURCE);
    });

    it('credits ESRI / Maxar / Earthstar Geographics in the attribution', () => {
        expect(ESRI_WORLD_IMAGERY_ATTRIBUTION).toContain('Esri');
        expect(ESRI_WORLD_IMAGERY_ATTRIBUTION).toContain('Maxar');
        expect(ESRI_WORLD_IMAGERY_ATTRIBUTION).toContain('Earthstar');
    });
});
