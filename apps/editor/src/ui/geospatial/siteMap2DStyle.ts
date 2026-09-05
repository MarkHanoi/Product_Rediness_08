// A.8.c.f.2 — Hektar-style cream/shadow MapLibre style spec (HEADLESS, VECTOR).
//
// WHY THIS EXISTS
// ---------------
// The founder's spec for the 2D boundary-draw surface (A.8.c.f) is an elegant
// plan-view map in the "Hektar" aesthetic (parametric.se): a cream / off-white
// basemap, thin grey streets, muted labels, and BUILDING FOOTPRINTS rendered as
// near-white fills with a subtle drop-shadow for a 3D-ish plan look. This module
// builds the MapLibre `StyleSpecification` that produces that look. It is PURE
// (no `maplibre-gl` import, no DOM) so the layer composition is unit-testable and
// the `maplibre-gl` runtime dependency stays confined to `SiteBoundaryMap2D.ts`.
//
// SOURCE — OpenFreeMap (free, keyless, full-planet VECTOR tiles)
// --------------------------------------------------------------
// The first cut used a CartoDB Positron RASTER base. Raster tiles are flat
// pictures — there is no building GEOMETRY to fill or shadow, so the Hektar look
// (near-white footprints floating over a cream page) was impossible and the map
// read as "too simple". This rewrite switches to OpenFreeMap
// (https://openfreemap.org) — free, no API key, full-planet MapLibre VECTOR
// tiles in the OpenMapTiles schema. We point a single `openmaptiles` vector
// source at the planet TileJSON and AUTHOR the Hektar cartography directly from
// its source-layers (`building`, `transportation`, `water`, `landuse`,
// `place`, …) so we control every colour + the building drop-shadow.
//
// The drop-shadow is faked the cartographer's way: a translucent dark fill of the
// SAME `building` geometry, translated a few pixels (`fill-translate`) and drawn
// BENEATH the near-white building fill. No blur filter (MapLibre fill layers have
// no blur), but the offset translucent duplicate reads as a soft plan-view shadow
// — the building appears to float over the cream page.
//
// OPTIONAL GENTLE 3D — `fill-extrusion` of the `building` layer (rendered when
// `extrude` is set + at high zoom) gives the founder's "see the building in 3D"
// without leaving the plan surface. Off by default to keep the tasteful plan look.
//
// CSP — OpenFreeMap needs `connect-src https://tiles.openfreemap.org` (style is
// authored here, but the TileJSON + .pbf vector tiles + glyphs are fetched from
// that origin). Added to server/securityHeaders.js buildConnectSrc. The sprite
// is an https image, already covered by `img-src https:`.

/** Hektar palette — single source of truth for the cream/shadow look. */
export const HEKTAR_PALETTE = {
    /** Cream page background behind/around everything (shows at edges + load). */
    cream: '#f4f1ea',
    /** Slightly warmer parchment for landuse/park fills. */
    parchment: '#ece7da',
    /** Muted water (kept low-saturation so it doesn't fight the cream page). */
    water: '#cdd7da',
    /** Near-white building fill. */
    buildingFill: '#fbfaf6',
    /** Thin building outline (warm grey). */
    buildingStroke: '#d8d2c4',
    /** Translucent drop-shadow colour for the offset duplicate fill. */
    shadow: 'rgba(60, 52, 40, 0.18)',
    /** Major street casing / fill (warm light grey). */
    roadMajor: '#e6e0d3',
    roadMajorCasing: '#d4ccba',
    /** Minor street fill (slightly lighter than major). */
    roadMinor: '#efeadf',
    /** Muted place/road label text + halo. */
    label: '#6b6354',
    labelHalo: 'rgba(244, 241, 234, 0.9)',
    /** PRYZM violet — drawn boundary ring + vertex handles. */
    violet: '#6600FF',
} as const;

/**
 * OpenFreeMap planet vector TileJSON (OpenMapTiles schema). Free + keyless. A
 * single vector source feeds every Hektar layer below via its source-layers.
 * Override target for a future env var if volume ever warrants self-hosting.
 */
export const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';

/** OpenFreeMap glyph (font PBF) endpoint — required for the muted labels. */
export const OPENFREEMAP_GLYPHS =
    'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/** The OpenFreeMap tile origin that must appear in the server CSP `connect-src`. */
export const OPENFREEMAP_ORIGIN = 'https://tiles.openfreemap.org';

/** Attribution required by the OpenFreeMap / OpenMapTiles / OSM terms. */
export const OPENFREEMAP_ATTRIBUTION =
    '© <a href="https://openfreemap.org">OpenFreeMap</a> ' +
    '© <a href="https://www.openmaptiles.org/">OpenMapTiles</a> ' +
    'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * The pixel offset of the building drop-shadow duplicate (x, y). Drawn beneath the
 * near-white fill so the building appears to float over the cream page.
 */
export const SHADOW_OFFSET: readonly [number, number] = [3, 4];

export interface SiteMap2DStyleOptions {
    /**
     * Render the `building` source-layer as a gentle `fill-extrusion` (the
     * founder's "see the building in 3D") instead of a flat fill. Off by default
     * to keep the tasteful plan-view look; gate any extrusion behind this + a map
     * pitch in the caller. The flat drop-shadow fill is still drawn beneath.
     */
    readonly extrude?: boolean;
}

/**
 * A minimal structural subset of MapLibre's `StyleSpecification`. We type it
 * locally (rather than importing maplibre's types) so this module imports nothing
 * — `maplibre-gl` accepts a plain object matching the JSON style spec at runtime.
 * The returned object is cast to maplibre's `StyleSpecification` at the call site.
 */
export interface Map2DStyleSpec {
    readonly version: 8;
    readonly name: string;
    readonly glyphs?: string;
    readonly sources: Record<string, unknown>;
    readonly layers: ReadonlyArray<Record<string, unknown>>;
}

/** The vector source name + its building source-layer (OpenMapTiles schema). */
export const OMT_SOURCE = 'openmaptiles';
export const BUILDING_SOURCE_LAYER = 'building';

// ── MAP-DATA-OVERTURE — richer OSM/Overture context-building overlay ───────────
// The base map's `building` source-layer (OpenFreeMap) is generalized + sparse.
// We overlay a SECOND building source — a GeoJSON FeatureCollection of richer OSM
// footprints fetched per-viewport from Overpass (see contextBuildings.ts) — drawn
// ABOVE the base `building` layer so coverage gaps fill in. The source starts
// EMPTY and is populated at runtime via `map.getSource(...).setData(...)`; if the
// fetch fails the layer simply shows nothing (today's behaviour). Styled per the
// active palette's building fill/stroke so it reads identically to the base
// footprints. The id is shared so both the Hektar + Forma styles + the snap-query
// (BUILDING_QUERY_LAYERS) can include it.

/** GeoJSON source name for the richer OSM/Overture context footprints. */
export const CONTEXT_BUILDINGS_SOURCE = 'pryzm-context-buildings';
/** Flat-fill layer id for the context footprints (plan view). */
export const CONTEXT_BUILDINGS_FILL_LAYER = 'context-buildings-fill';
/** Outline layer id for the context footprints (hairline). */
export const CONTEXT_BUILDINGS_LINE_LAYER = 'context-buildings-line';

/**
 * Build the Hektar-style cream/shadow MapLibre style backed by OpenFreeMap vector
 * tiles. PURE — returns a plain JSON style object (no maplibre import). See module
 * header for the aesthetic + source rationale.
 *
 * Layer order (bottom → top), so the building reads as floating over the page:
 *   cream-background → water → landuse → road-minor → road-major
 *   → buildings-shadow → buildings(-fill | -3d) → place/road labels
 */
export function buildSiteMap2DStyle(
    opts: SiteMap2DStyleOptions = {},
): Map2DStyleSpec {
    const P = HEKTAR_PALETTE;

    const sources: Record<string, unknown> = {
        [OMT_SOURCE]: {
            type: 'vector',
            url: OPENFREEMAP_TILEJSON,
            attribution: OPENFREEMAP_ATTRIBUTION,
        },
    };

    const layers: Array<Record<string, unknown>> = [
        // Cream page colour shows everywhere there is no other fill + before load.
        {
            id: 'cream-background',
            type: 'background',
            paint: { 'background-color': P.cream },
        },
        // Muted water bodies.
        {
            id: 'water',
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'water',
            paint: { 'fill-color': P.water },
        },
        // Warm parchment parks / landuse (subtle — keeps the cream feel).
        {
            id: 'landuse',
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'landuse',
            paint: { 'fill-color': P.parchment, 'fill-opacity': 0.6 },
        },
        // Thin minor streets.
        {
            id: 'road-minor',
            type: 'line',
            source: OMT_SOURCE,
            'source-layer': 'transportation',
            filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path', 'track']]],
            paint: {
                'line-color': P.roadMinor,
                'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 18, 4],
            },
        },
        // Major streets with a subtle casing.
        {
            id: 'road-major-casing',
            type: 'line',
            source: OMT_SOURCE,
            'source-layer': 'transportation',
            filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
            paint: {
                'line-color': P.roadMajorCasing,
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 18, 11],
            },
        },
        {
            id: 'road-major',
            type: 'line',
            source: OMT_SOURCE,
            'source-layer': 'transportation',
            filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
            paint: {
                'line-color': P.roadMajor,
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 18, 8],
            },
        },
    ];

    // ── Building footprints — the heart of the Hektar look. ───────────────────
    // Shadow FIRST (drawn beneath) — translucent dark duplicate of the SAME
    // `building` geometry, pixel-offset so each footprint reads as floating.
    layers.push({
        id: 'buildings-shadow',
        type: 'fill',
        source: OMT_SOURCE,
        'source-layer': BUILDING_SOURCE_LAYER,
        minzoom: 13,
        paint: {
            'fill-color': P.shadow,
            'fill-translate': [...SHADOW_OFFSET],
            'fill-translate-anchor': 'viewport',
        },
    });

    if (opts.extrude) {
        // Gentle 3D — extrude the footprints (the founder's "see it in 3D"). The
        // flat shadow above still grounds them. Caller should pitch the map.
        layers.push({
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: OMT_SOURCE,
            'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: 14,
            paint: {
                'fill-extrusion-color': P.buildingFill,
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.95,
            },
        });
    } else {
        // Near-white plan-view building fill on top of its own shadow.
        layers.push({
            id: 'buildings-fill',
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: 13,
            paint: {
                'fill-color': P.buildingFill,
                'fill-outline-color': P.buildingStroke,
                'fill-opacity': 0.97,
            },
        });
    }

    // ── Muted labels (place + street names). ──────────────────────────────────
    layers.push({
        id: 'road-label',
        type: 'symbol',
        source: OMT_SOURCE,
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
            'symbol-placement': 'line',
            'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
        },
        paint: {
            'text-color': P.label,
            'text-halo-color': P.labelHalo,
            'text-halo-width': 1.2,
        },
    });
    layers.push({
        id: 'place-label',
        type: 'symbol',
        source: OMT_SOURCE,
        'source-layer': 'place',
        layout: {
            'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 16],
        },
        paint: {
            'text-color': P.label,
            'text-halo-color': P.labelHalo,
            'text-halo-width': 1.4,
        },
    });

    return {
        version: 8,
        name: 'PRYZM Hektar (OpenFreeMap cream/shadow)',
        glyphs: OPENFREEMAP_GLYPHS,
        sources,
        layers,
    };
}

// ── A.8.c.f.4 — Satellite / aerial RASTER basemap (keyless ESRI World Imagery) ──
//
// WHY THIS EXISTS
// ---------------
// The Hektar cream basemap is OpenFreeMap → OSM-derived, and OSM has BUILDING
// FOOTPRINT coverage gaps (even in central Lisbon). Every OSM-based vector source
// shares those gaps — only real AERIAL IMAGERY fills them. So the 2D map offers a
// toggle to swap the cream vector style for this satellite raster style, which
// shows every building (and the actual plot) regardless of OSM coverage.
//
// SOURCE — ESRI World Imagery (same keyless tile endpoint Cesium already uses in
// CesiumViewport.ts). Note the ArcGIS tile path order is `{z}/{y}/{x}` (NOT the
// usual `{z}/{x}/{y}`). 256-px tiles, max native zoom ~19.
//
// CSP — these are RASTER tiles fetched as images, so they load under `img-src`,
// which the main app CSP already allows via `https:` (server/securityHeaders.js
// MAIN_CSP_DIRECTIVES.imgSrc includes 'https:', commented "Cesium tiles"). No
// connect-src change is needed for a raster source.

/**
 * Keyless ESRI World Imagery tile URL. ArcGIS uses `{z}/{y}/{x}` order — copied
 * verbatim from CesiumViewport.ts so both viewers share the exact same endpoint.
 */
export const ESRI_WORLD_IMAGERY_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** The ESRI tile origin (informational — raster tiles load under img-src https:). */
export const ESRI_WORLD_IMAGERY_ORIGIN = 'https://server.arcgisonline.com';

/** Attribution required by the ESRI World Imagery terms. */
export const ESRI_WORLD_IMAGERY_ATTRIBUTION =
    'Esri, Maxar, Earthstar Geographics';

/** The raster source name used by the satellite style. */
export const SATELLITE_SOURCE = 'esri-world-imagery';

// ── FORMA.1 — Autodesk-Forma minimal-vector basemap (SPEC-FORMA-SITE-VIEW §3) ───
//
// WHY THIS EXISTS
// ---------------
// The Hektar cream/shadow look above is one aesthetic; the founder's FORMA spec
// asks the 2D site map to read like Autodesk Forma's site canvas: an extremely
// QUIET, abstract, minimal-vector basemap — off-white land, light-grey roads, a
// pale blue-grey water, NO POI icons, NO satellite imagery, only thin grey
// labels, and building footprints as the faintest light fills with hairline
// outlines (abstract, never photoreal). The drawn site boundary reads in a clear
// dashed GREEN so it stands apart from the muted page and matches the eventual
// 3D site boundary colour.
//
// This reuses the SAME OpenFreeMap keyless VECTOR source as the Hektar style —
// the provider already exposes the `building`, `transportation`, `water`,
// `landuse`, `place` source-layers we recolour here, so no provider swap is
// needed to honour the Forma palette (only the cartography differs).

/**
 * Forma palette — single source of truth for the minimal-vector site basemap
 * (SPEC-FORMA-SITE-VIEW §3). Quiet, abstract, off-white; the green is the drawn
 * boundary colour, kept consistent with the eventual 3D site boundary.
 */
export const FORMA_PALETTE = {
    /** Off-white land / page background behind everything. */
    land: '#F0EDE8',
    /** Light grey roads. */
    road: '#D9D6CF',
    /** Slightly darker casing for major roads (still light). */
    roadCasing: '#CFCBC2',
    /** Pale blue-grey water. */
    water: '#C8DCE8',
    /** Faint landuse / park wash (barely there — keeps the page quiet). */
    landuse: '#E9E6DE',
    /** Subtle light building fill (abstract, not photoreal). */
    buildingFill: '#E4E0D8',
    /** Hairline faint building outline. */
    buildingStroke: '#D2CDC3',
    /** Thin grey label text. */
    label: '#8C887F',
    /** Soft label halo against the off-white land. */
    labelHalo: 'rgba(240, 237, 232, 0.9)',
    /** Drawn site-boundary line — dashed green (matches eventual 3D boundary). */
    boundary: '#2D6A4F',
    /** Faint green boundary fill. */
    boundaryFill: 'rgba(45, 106, 79, 0.08)',
} as const;

/**
 * Dashed-green boundary line spec (SPEC §3): 8px on / 6px off, 2px wide.
 * MapLibre `line-dasharray` is expressed in MULTIPLES of line-width, so for a
 * 2px line the on/off run-lengths (8px / 6px) become [4, 3].
 */
export const FORMA_BOUNDARY_DASH: readonly [number, number] = [4, 3];
export const FORMA_BOUNDARY_WIDTH = 2;

/**
 * Build the Autodesk-Forma minimal-vector MapLibre style backed by the SAME
 * keyless OpenFreeMap vector tiles as the Hektar style. PURE — returns a plain
 * JSON style object (no maplibre import). See header for the aesthetic.
 *
 * NON-GOALS (SPEC §8): no POI icons, no satellite imagery, no busy labels —
 * only roads, water, land, abstract building footprints, and thin grey labels.
 *
 * Layer order (bottom → top):
 *   land-background → water → landuse → road-minor → road-major
 *   → buildings(-fill | -3d) → thin road/place labels
 */
export function buildFormaMap2DStyle(
    opts: SiteMap2DStyleOptions = {},
): Map2DStyleSpec {
    const P = FORMA_PALETTE;

    const sources: Record<string, unknown> = {
        [OMT_SOURCE]: {
            type: 'vector',
            url: OPENFREEMAP_TILEJSON,
            attribution: OPENFREEMAP_ATTRIBUTION,
        },
        // MAP-DATA-OVERTURE — richer OSM/Overture context footprints (starts empty;
        // SiteBoundaryMap2D populates it per-viewport via setData). Drawn above the
        // base `building` layer to fill OpenFreeMap's sparse coverage.
        [CONTEXT_BUILDINGS_SOURCE]: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            attribution:
                'Buildings © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
    };

    const layers: Array<Record<string, unknown>> = [
        // Off-white land shows everywhere there is no other fill + before load.
        {
            id: 'land-background',
            type: 'background',
            paint: { 'background-color': P.land },
        },
        // Pale blue-grey water.
        {
            id: 'water',
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'water',
            paint: { 'fill-color': P.water },
        },
        // Faint landuse wash — kept very subtle so the page stays quiet.
        {
            id: 'landuse',
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'landuse',
            paint: { 'fill-color': P.landuse, 'fill-opacity': 0.5 },
        },
        // Thin minor streets (light grey).
        {
            id: 'road-minor',
            type: 'line',
            source: OMT_SOURCE,
            'source-layer': 'transportation',
            filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path', 'track']]],
            paint: {
                'line-color': P.road,
                'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 18, 3],
            },
        },
        // Major streets with a faint casing (still light grey).
        {
            id: 'road-major-casing',
            type: 'line',
            source: OMT_SOURCE,
            'source-layer': 'transportation',
            filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
            paint: {
                'line-color': P.roadCasing,
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 18, 9],
            },
        },
        {
            id: 'road-major',
            type: 'line',
            source: OMT_SOURCE,
            'source-layer': 'transportation',
            filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
            paint: {
                'line-color': P.road,
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 18, 6],
            },
        },
    ];

    // ── Building footprints — subtle abstract light fills, never photoreal. ────
    if (opts.extrude) {
        // Optional gentle 3D (off by default). Faint light extrusion only.
        layers.push({
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: OMT_SOURCE,
            'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: 14,
            paint: {
                'fill-extrusion-color': P.buildingFill,
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.85,
            },
        });
    } else {
        layers.push({
            id: 'buildings-fill',
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: 13,
            paint: {
                'fill-color': P.buildingFill,
                'fill-outline-color': P.buildingStroke,
                'fill-opacity': 0.85,
            },
        });
    }

    // ── MAP-DATA-OVERTURE — richer context footprints ABOVE the base buildings. ──
    // Same palette fill + hairline outline as the base footprints so the overlay is
    // visually seamless, just denser. Populated at runtime; empty until then.
    layers.push({
        id: CONTEXT_BUILDINGS_FILL_LAYER,
        type: 'fill',
        source: CONTEXT_BUILDINGS_SOURCE,
        paint: {
            'fill-color': P.buildingFill,
            'fill-opacity': 0.9,
        },
    });
    layers.push({
        id: CONTEXT_BUILDINGS_LINE_LAYER,
        type: 'line',
        source: CONTEXT_BUILDINGS_SOURCE,
        paint: {
            'line-color': P.buildingStroke,
            'line-width': 0.8,
        },
    });

    // ── Minimal labels — thin grey, no POI icons (SPEC §8 NON-GOALS). ──────────
    layers.push({
        id: 'road-label',
        type: 'symbol',
        source: OMT_SOURCE,
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
            'symbol-placement': 'line',
            'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
        },
        paint: {
            'text-color': P.label,
            'text-halo-color': P.labelHalo,
            'text-halo-width': 1.2,
        },
    });
    layers.push({
        id: 'place-label',
        type: 'symbol',
        source: OMT_SOURCE,
        'source-layer': 'place',
        layout: {
            'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 15],
        },
        paint: {
            'text-color': P.label,
            'text-halo-color': P.labelHalo,
            'text-halo-width': 1.4,
        },
    });

    return {
        version: 8,
        name: 'PRYZM Forma (OpenFreeMap minimal-vector)',
        glyphs: OPENFREEMAP_GLYPHS,
        sources,
        layers,
    };
}

/**
 * Build the satellite / aerial RASTER MapLibre style backed by keyless ESRI World
 * Imagery. PURE — returns a plain JSON style object (no maplibre import), mirroring
 * `buildSiteMap2DStyle`. A single `raster` source + one `raster` layer. Used by the
 * 2D map's Map ↔ Satellite toggle to fill OSM building-footprint coverage gaps.
 */
export function buildSatelliteStyle(): Map2DStyleSpec {
    return {
        version: 8,
        name: 'PRYZM Satellite (ESRI World Imagery)',
        sources: {
            [SATELLITE_SOURCE]: {
                type: 'raster',
                tiles: [ESRI_WORLD_IMAGERY_URL],
                tileSize: 256,
                maxzoom: 19,
                attribution: ESRI_WORLD_IMAGERY_ATTRIBUTION,
            },
        },
        layers: [
            {
                id: 'satellite',
                type: 'raster',
                source: SATELLITE_SOURCE,
                paint: { 'raster-opacity': 1 },
            },
        ],
    };
}

// ── MAP2D-PASTEL Stage M1 (L-12938) — the pastel architectural-masterplan style ──
//
// WHY THIS EXISTS
// ---------------
// docs/01-strategy/STR-2D-SITE-MAP-CARTOGRAPHY.md §0: the founder wants the 2D site
// map to read like an ARCHITECTURAL MASTERPLAN DRAWING — warm-white building masses
// with soft shadows, pastel sage lawns, powder-blue water, hundreds of individual
// round tree symbols, light-grey roads with casings, dashed pedestrian paths — while
// KEEPING the parcel-selection architecture exactly as it is. So this is a pure
// PRESENTATION change: nothing here touches the click → cadastre ladder → ring path.
//
// WHAT V2 ADDS OVER `FORMA_PALETTE` / `buildFormaMap2DStyle` (both kept, unchanged,
// for the existing callers + the existing `siteMap2DStyle.test.ts` pins):
//   1. `FORMA_PALETTE_V2` — the STR §2 low-saturation palette, hex for hex.
//   2. Building SHADOW: a translucent duplicate of the same footprint geometry,
//      `fill-translate`d 1.2 px SOUTH-EAST in VIEWPORT space and drawn UNDER the
//      building fill (MapLibre fill layers have no blur — an offset duplicate is the
//      cartographer's shadow). Order is load-bearing: shadow → fill → hairline outline.
//   3. Roads split BY CLASS — major (fill + casing), minor, footway/path (DASHED),
//      cycleway (a faint green accent), rail (hairline) — instead of v1's two buckets.
//   4. The OTHER baked context layers we already read for the 3D Site — roads, water
//      areas + waterways, parks (wood/forest darker than park/grass), landuse, rail,
//      trees — as GeoJSON sources the caller fills from the SAME warm cache
//      (`contextLayerWarm.ts` → the per-bbox memoised `fetchContext*` readers), so the
//      2D map costs NO new network reads: one read, two renderers (STR §4 M1).
//   5. Zoom gates so the page stays quiet when zoomed out: buildings z13+, labels z14+,
//      trees + footways z15+.
//
// THE CTX LAYERS ARE DENSITY OVERLAYS, NOT RIVALS. Each baked-collection layer is
// styled IDENTICALLY to its OpenFreeMap base twin and drawn immediately above it —
// the same trick `CONTEXT_BUILDINGS_*` has always used. Where the bake covers the
// area the map gets denser; where it does not (an unbaked region, a failed read) the
// source stays EMPTY and the base layer alone carries the map. A missing bake
// therefore degrades to today's picture, never to a hole.
//
// PERFORMANCE (STR §4 M1 gate). Every GeoJSON source declares `tolerance` + `buffer`
// (see `PASTEL_GEOJSON_SOURCE_OPTS`) so MapLibre simplifies once at tile-build time
// rather than shipping full-precision rings to the GPU; every layer declares a
// `minzoom`; nothing here runs per-frame JS.
// ⚠ STAGE M2 REPLACES THESE GEOJSON PUSHES WITH PMTILES SOURCES read straight off R2
// via the `pmtiles://` protocol (STR §4 M2). The GeoJSON hop exists only because M1
// deliberately changes no data plumbing — do not grow it.
//
// PURE. No maplibre import, no DOM, no clock. Every builder returns plain JSON.

/**
 * MAP2D-PASTEL palette (STR-2D-SITE-MAP-CARTOGRAPHY §2). Low saturation throughout;
 * the ONLY saturated colour on the page stays the PRYZM purple used for the parcel
 * highlight and the draw handles, so selection never competes with cartography.
 */
export const FORMA_PALETTE_V2 = {
    /** Warm paper land / page background behind everything. */
    land: '#F5F2EA',
    /** Park / grass / recreation sage. */
    parks: '#DDEBD4',
    /** Wood + forest — a deeper sage than `parks`, so canopy reads as canopy. */
    woodland: '#C9DDBF',
    /** Powder blue-green water (lakes, basins, sea, rivers). */
    water: '#D9E9E8',
    /** Warm-white building mass. */
    buildingFill: '#E8E1D4',
    /** Hairline building outline. */
    buildingStroke: '#D6CFC2',
    /** Translucent duplicate-fill shadow, offset south-east under each footprint. */
    buildingShadow: 'rgba(126, 116, 100, 0.16)',
    /** Major-road fill (motorway…tertiary). */
    roadMajor: '#D2CEC5',
    /** Major-road casing — one step darker, drawn wider underneath the fill. */
    roadMajorCasing: '#C8C3B9',
    /** Minor-road fill (residential / service / unclassified). */
    roadMinor: '#E6E2DA',
    /** Footway / path / steps — drawn DASHED so pedestrian circulation reads without labels. */
    footway: '#CFCAC0',
    /** Cycleway — a faint green accent, distinguishable from a footway at a glance. */
    cycleway: '#C6D3C4',
    /** Rail hairline. */
    rail: '#C9C4BA',
    /** Industrial land-use tint (very faint). */
    landuseIndustrial: '#ECE9E3',
    /** Commercial / retail land-use tint (very faint). */
    landuseCommercial: '#EEEAE2',
    /** Muted label text. */
    label: '#77766F',
    /** Label halo against the warm paper land. */
    labelHalo: 'rgba(245, 242, 234, 0.9)',
    /** Tree / canopy symbol fill. */
    treeFill: '#B9CDA8',
    /** Tree / canopy symbol stroke. */
    treeStroke: '#9DB58C',
    /** Parcel + selection accent — the unified PRYZM purple, unchanged from today. */
    parcelAccent: '#6600FF',
} as const;

/**
 * ⛔ RESIDENTIAL LAND-USE IS DELIBERATELY UNTINTED (STR §2 "residential none").
 * Residential is the DEFAULT ground of nearly every site we open; tinting it would
 * paint most of the page a second colour and destroy the warm-paper read. These
 * classes are FILTERED OUT of the land-use layer rather than painted transparent, so
 * they cost no fill at all.
 */
export const PASTEL_LANDUSE_UNTINTED: readonly string[] = ['residential'];

/**
 * OSM `landuse` values that take the industrial tint. Anything not listed here and
 * not in `PASTEL_LANDUSE_COMMERCIAL` is left untinted — an unclassified land-use must
 * not paint a colour we cannot justify (§CONTEXT-DATA-HONESTY, mirroring
 * `contextLanduse.classifyLanduse`, which drops what it cannot classify).
 */
export const PASTEL_LANDUSE_INDUSTRIAL: readonly string[] = ['industrial', 'railway', 'quarry', 'brownfield'];
/** OSM `landuse` values that take the commercial tint. */
export const PASTEL_LANDUSE_COMMERCIAL: readonly string[] = ['commercial', 'retail'];

/**
 * Zoom gates (STR §4 M1). A gate is the cheapest possible performance control: below
 * it MapLibre never builds the layer's tiles at all.
 */
export const PASTEL_ZOOM = {
    /** Building footprints + their shadow + outline. */
    buildings: 13,
    /** Individual tree / canopy symbols — the drawing's "secret ingredient" (STR §2). */
    trees: 15,
    /** Footways, paths, steps, cycleways. */
    footways: 15,
    /** Road + place labels. */
    labels: 14,
    /** Minor roads. */
    roadMinor: 13,
    /** Major roads (fill + casing). */
    roadMajor: 10,
    /** Rail. */
    rail: 13,
    /** Land-use tints. */
    landuse: 11,
    /** Parks / woodland. */
    parks: 10,
    /** Water areas + waterways. */
    water: 8,
} as const;

/**
 * The SOUTH-EAST shadow offset in VIEWPORT pixels, `[x, y]`. `+x` is right and `+y`
 * is DOWN in MapLibre's viewport frame, so `[1.2, 1.2]` throws the shadow to the
 * lower-right — the light comes from the north-west, the architectural drawing
 * convention the reference image uses. 1.2 px keeps it a hint, not a drop-shadow.
 */
export const PASTEL_SHADOW_OFFSET: readonly [number, number] = [1.2, 1.2];

/**
 * GeoJSON source options carried on EVERY pastel context source.
 *  • `tolerance` — Douglas-Peucker simplification in tile units. MapLibre's default is
 *    0.375; 0.5 drops appreciably more vertices from OSM rings at the scales this map
 *    is read at (z13–z19) with no visible change to a building corner or a kerb line.
 *  • `buffer` — pixels of geometry carried past each tile edge. The default 128 is
 *    sized for label collision across tiles; these layers carry NO labels, so 64 halves
 *    the duplicated edge geometry.
 *  • `maxzoom` 16 — the source's own tile pyramid stops there and MapLibre overzooms
 *    the z16 tiles, so panning at z17–19 re-tiles nothing.
 */
export const PASTEL_GEOJSON_SOURCE_OPTS = {
    tolerance: 0.5,
    buffer: 64,
    maxzoom: 16,
} as const;

/**
 * GeoJSON source ids for the baked context collections the caller pushes in. Exported
 * so `SiteBoundaryMap2D` can `map.getSource(id).setData(...)` without restating a
 * string — one name, one place (the `CONTEXT_BUILDINGS_SOURCE` precedent).
 */
export const PASTEL_SOURCES = {
    roads: 'pryzm-ctx-roads',
    water: 'pryzm-ctx-water',
    waterways: 'pryzm-ctx-waterways',
    parks: 'pryzm-ctx-parks',
    landuse: 'pryzm-ctx-landuse',
    rail: 'pryzm-ctx-rail',
    trees: 'pryzm-ctx-trees',
} as const;

/** Layer ids, bottom → top. Exported so the spec pins the ORDER, not a redrawn copy of it. */
export const PASTEL_LAYERS = {
    background: 'pastel-background',
    landuseBase: 'pastel-landuse-base',
    landuseCtx: 'pastel-landuse-ctx',
    parksBase: 'pastel-parks-base',
    parksCtx: 'pastel-parks-ctx',
    waterBase: 'pastel-water-base',
    waterCtx: 'pastel-water-ctx',
    waterwayCtx: 'pastel-waterway-ctx',
    railCtx: 'pastel-rail-ctx',
    roadMinorBase: 'pastel-road-minor-base',
    roadMinorCtx: 'pastel-road-minor-ctx',
    roadMajorCasingBase: 'pastel-road-major-casing-base',
    roadMajorCasingCtx: 'pastel-road-major-casing-ctx',
    roadMajorBase: 'pastel-road-major-base',
    roadMajorCtx: 'pastel-road-major-ctx',
    footwayBase: 'pastel-footway-base',
    footwayCtx: 'pastel-footway-ctx',
    cyclewayBase: 'pastel-cycleway-base',
    cyclewayCtx: 'pastel-cycleway-ctx',
    buildingsShadow: 'buildings-shadow',
    buildingsFill: 'buildings-fill',
    buildingsOutline: 'pastel-buildings-outline',
    buildings3d: 'buildings-3d',
    contextBuildingsShadow: 'pastel-context-buildings-shadow',
    contextBuildingsFill: CONTEXT_BUILDINGS_FILL_LAYER,
    contextBuildingsLine: CONTEXT_BUILDINGS_LINE_LAYER,
    trees: 'pastel-trees',
    roadLabel: 'road-label',
    placeLabel: 'place-label',
} as const;

/**
 * §MAP2D-PASTEL — the empty resting state of every pastel context source. The caller
 * fills them from the warm cache; an unbaked region simply leaves them empty and the
 * OpenFreeMap base layers alone carry the map (failure ≠ empty is the READER's job —
 * `contextRail` / `contextTrees` etc. already log the degraded case honestly).
 */
export function buildPastelContextSources(): Record<string, unknown> {
    const empty = { type: 'FeatureCollection', features: [] };
    const src: Record<string, unknown> = {};
    for (const id of Object.values(PASTEL_SOURCES)) {
        src[id] = { type: 'geojson', data: empty, ...PASTEL_GEOJSON_SOURCE_OPTS };
    }
    return src;
}

/** A zoom-interpolated width/radius ramp: `[[zoom, value], …]` → a MapLibre expression. */
function zoomRamp(stops: ReadonlyArray<readonly [number, number]>): unknown {
    const out: unknown[] = ['interpolate', ['linear'], ['zoom']];
    for (const [z, v] of stops) { out.push(z, v); }
    return out;
}

/** `['in', ['get', prop], ['literal', values]]` — the class filter both twins share. */
function inValues(prop: string, values: readonly string[]): unknown {
    return ['in', ['get', prop], ['literal', [...values]]];
}

// ── layer builders — one concern each, all pure ──────────────────────────────

/** The warm-paper page behind everything (and before any tile lands). */
export function buildPastelBackgroundLayer(): Record<string, unknown> {
    return {
        id: PASTEL_LAYERS.background,
        type: 'background',
        paint: { 'background-color': FORMA_PALETTE_V2.land },
    };
}

/**
 * Land-use tints. The OpenFreeMap (`OpenMapTiles`) `landuse` source-layer carries a
 * `class` attribute; our baked collection carries `contextLanduse`'s `kind`
 * (`urban` / `rural`) because the reader classifies and DROPS the raw tag. So the two
 * twins key on different properties by necessity, and the ctx twin can only ever
 * paint the coarse urban tint — stated here rather than implied, because a viewer
 * must not read the ctx tint as a finer classification than it is.
 */
export function buildPastelLanduseLayers(): Array<Record<string, unknown>> {
    const P = FORMA_PALETTE_V2;
    return [
        {
            id: PASTEL_LAYERS.landuseBase,
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'landuse',
            minzoom: PASTEL_ZOOM.landuse,
            filter: ['all',
                ['!', inValues('class', PASTEL_LANDUSE_UNTINTED)],
                inValues('class', [...PASTEL_LANDUSE_INDUSTRIAL, ...PASTEL_LANDUSE_COMMERCIAL]),
            ],
            paint: {
                'fill-color': ['match', ['get', 'class'],
                    [...PASTEL_LANDUSE_INDUSTRIAL], P.landuseIndustrial,
                    P.landuseCommercial],
                'fill-opacity': 0.9,
            },
        },
        {
            id: PASTEL_LAYERS.landuseCtx,
            type: 'fill',
            source: PASTEL_SOURCES.landuse,
            minzoom: PASTEL_ZOOM.landuse,
            // `rural` is left to the page: farmland under a warm-paper masterplan reads
            // as ground, and tinting it would put a second colour under most rural sites.
            filter: ['==', ['get', 'kind'], 'urban'],
            paint: { 'fill-color': P.landuseIndustrial, 'fill-opacity': 0.55 },
        },
    ];
}

/** Parks + woodland. `wood`/`forest` take the deeper sage; `park`/`grass`/`other` the lawn sage. */
export function buildPastelParkLayers(): Array<Record<string, unknown>> {
    const P = FORMA_PALETTE_V2;
    return [
        {
            id: PASTEL_LAYERS.parksBase,
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'park',
            minzoom: PASTEL_ZOOM.parks,
            paint: { 'fill-color': P.parks, 'fill-opacity': 0.9 },
        },
        {
            id: PASTEL_LAYERS.parksCtx,
            type: 'fill',
            source: PASTEL_SOURCES.parks,
            minzoom: PASTEL_ZOOM.parks,
            paint: {
                // `kind` is `contextParks.ContextParkKind`, read off the OSM tag that
                // defines the polygon — not a guess (contextParks.classifyParkKind).
                'fill-color': ['match', ['get', 'kind'],
                    'wood', P.woodland,
                    'forest', P.woodland,
                    P.parks],
                'fill-opacity': 0.95,
            },
        },
    ];
}

/** Water areas (both twins) + the baked waterway centre-lines. */
export function buildPastelWaterLayers(): Array<Record<string, unknown>> {
    const P = FORMA_PALETTE_V2;
    return [
        {
            id: PASTEL_LAYERS.waterBase,
            type: 'fill',
            source: OMT_SOURCE,
            'source-layer': 'water',
            minzoom: PASTEL_ZOOM.water,
            paint: { 'fill-color': P.water },
        },
        {
            id: PASTEL_LAYERS.waterCtx,
            type: 'fill',
            source: PASTEL_SOURCES.water,
            minzoom: PASTEL_ZOOM.water,
            paint: { 'fill-color': P.water },
        },
        {
            // A waterway is a CENTRE-LINE, never a surveyed channel width — the nominal
            // width below is a cartographic choice by class, exactly as
            // `contextWater.ContextWaterway.kind` documents for the 3D ribbon.
            id: PASTEL_LAYERS.waterwayCtx,
            type: 'line',
            source: PASTEL_SOURCES.waterways,
            minzoom: PASTEL_ZOOM.water,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': P.water,
                'line-width': ['*',
                    ['match', ['get', 'kind'],
                        'river', 3.0, 'canal', 2.2, 'stream', 1.2, 'drain', 0.9, 'ditch', 0.7, 1.2],
                    zoomRamp([[12, 0.6], [16, 2.2], [19, 6]]),
                ],
            },
        },
    ];
}

/** Rail as a hairline — present, never dominant. */
export function buildPastelRailLayer(): Record<string, unknown> {
    return {
        id: PASTEL_LAYERS.railCtx,
        type: 'line',
        source: PASTEL_SOURCES.rail,
        minzoom: PASTEL_ZOOM.rail,
        paint: {
            'line-color': FORMA_PALETTE_V2.rail,
            'line-width': zoomRamp([[13, 0.5], [16, 0.9], [19, 1.4]]),
        },
    };
}

/**
 * Road classes, keyed per source because the two sources name the attribute
 * differently: the OpenMapTiles base carries `class` (+ `subclass` for path kinds),
 * our baked collection carries the raw OSM `highway` tag (`contextRoads.ContextWay`).
 */
export const PASTEL_ROAD_CLASSES = {
    /** OpenMapTiles `class` values. */
    omtMajor: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'] as readonly string[],
    omtMinor: ['minor', 'service'] as readonly string[],
    /** Raw OSM `highway` values on the baked `roads` layer. */
    ctxMajor: [
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
        'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
    ] as readonly string[],
    ctxMinor: ['residential', 'unclassified', 'service', 'living_street', 'road'] as readonly string[],
    ctxFootway: ['footway', 'path', 'steps', 'pedestrian', 'track'] as readonly string[],
    ctxCycleway: ['cycleway'] as readonly string[],
} as const;

/** Dash pattern for footways / paths, in MULTIPLES of line-width (MapLibre's unit). */
export const PASTEL_FOOTWAY_DASH: readonly [number, number] = [3, 2];

/**
 * Roads, bottom → top: minor, then the major CASING, then the major FILL over it, then
 * the pedestrian network. Each class is drawn twice — once from the OpenFreeMap base
 * and once from the baked overlay, in IDENTICAL colour and width, so the overlap is
 * invisible and the overlay only ever adds density (see the header).
 */
export function buildPastelRoadLayers(): Array<Record<string, unknown>> {
    const P = FORMA_PALETTE_V2;
    const C = PASTEL_ROAD_CLASSES;
    const minorW = zoomRamp([[13, 0.5], [16, 2.0], [19, 5.0]]);
    const majorCasingW = zoomRamp([[10, 1.0], [14, 3.4], [16, 6.0], [19, 14.0]]);
    const majorW = zoomRamp([[10, 0.6], [14, 2.2], [16, 4.2], [19, 11.0]]);
    const footW = zoomRamp([[15, 0.6], [17, 1.1], [19, 1.8]]);
    const cycleW = zoomRamp([[15, 0.7], [17, 1.3], [19, 2.0]]);
    const cap = { 'line-cap': 'round', 'line-join': 'round' };

    return [
        {
            id: PASTEL_LAYERS.roadMinorBase,
            type: 'line', source: OMT_SOURCE, 'source-layer': 'transportation',
            minzoom: PASTEL_ZOOM.roadMinor, layout: cap,
            filter: inValues('class', C.omtMinor),
            paint: { 'line-color': P.roadMinor, 'line-width': minorW },
        },
        {
            id: PASTEL_LAYERS.roadMinorCtx,
            type: 'line', source: PASTEL_SOURCES.roads,
            minzoom: PASTEL_ZOOM.roadMinor, layout: cap,
            filter: inValues('highway', C.ctxMinor),
            paint: { 'line-color': P.roadMinor, 'line-width': minorW },
        },
        {
            id: PASTEL_LAYERS.roadMajorCasingBase,
            type: 'line', source: OMT_SOURCE, 'source-layer': 'transportation',
            minzoom: PASTEL_ZOOM.roadMajor, layout: cap,
            filter: inValues('class', C.omtMajor),
            paint: { 'line-color': P.roadMajorCasing, 'line-width': majorCasingW },
        },
        {
            id: PASTEL_LAYERS.roadMajorCasingCtx,
            type: 'line', source: PASTEL_SOURCES.roads,
            minzoom: PASTEL_ZOOM.roadMajor, layout: cap,
            filter: inValues('highway', C.ctxMajor),
            paint: { 'line-color': P.roadMajorCasing, 'line-width': majorCasingW },
        },
        {
            id: PASTEL_LAYERS.roadMajorBase,
            type: 'line', source: OMT_SOURCE, 'source-layer': 'transportation',
            minzoom: PASTEL_ZOOM.roadMajor, layout: cap,
            filter: inValues('class', C.omtMajor),
            paint: { 'line-color': P.roadMajor, 'line-width': majorW },
        },
        {
            id: PASTEL_LAYERS.roadMajorCtx,
            type: 'line', source: PASTEL_SOURCES.roads,
            minzoom: PASTEL_ZOOM.roadMajor, layout: cap,
            filter: inValues('highway', C.ctxMajor),
            paint: { 'line-color': P.roadMajor, 'line-width': majorW },
        },
        {
            // OpenMapTiles folds every pedestrian way into class `path` and separates
            // them by `subclass`; the cycleway is pulled out below so it gets the accent.
            id: PASTEL_LAYERS.footwayBase,
            type: 'line', source: OMT_SOURCE, 'source-layer': 'transportation',
            minzoom: PASTEL_ZOOM.footways, layout: cap,
            filter: ['all', ['==', ['get', 'class'], 'path'], ['!=', ['get', 'subclass'], 'cycleway']],
            paint: { 'line-color': P.footway, 'line-width': footW, 'line-dasharray': [...PASTEL_FOOTWAY_DASH] },
        },
        {
            id: PASTEL_LAYERS.footwayCtx,
            type: 'line', source: PASTEL_SOURCES.roads,
            minzoom: PASTEL_ZOOM.footways, layout: cap,
            filter: inValues('highway', C.ctxFootway),
            paint: { 'line-color': P.footway, 'line-width': footW, 'line-dasharray': [...PASTEL_FOOTWAY_DASH] },
        },
        {
            id: PASTEL_LAYERS.cyclewayBase,
            type: 'line', source: OMT_SOURCE, 'source-layer': 'transportation',
            minzoom: PASTEL_ZOOM.footways, layout: cap,
            filter: ['==', ['get', 'subclass'], 'cycleway'],
            paint: { 'line-color': P.cycleway, 'line-width': cycleW },
        },
        {
            id: PASTEL_LAYERS.cyclewayCtx,
            type: 'line', source: PASTEL_SOURCES.roads,
            minzoom: PASTEL_ZOOM.footways, layout: cap,
            filter: inValues('highway', C.ctxCycleway),
            paint: { 'line-color': P.cycleway, 'line-width': cycleW },
        },
    ];
}

/**
 * Building masses. ORDER IS THE WHOLE EFFECT and the spec pins it: the translucent
 * SE-offset duplicate (shadow) must sit UNDER the warm-white fill, and the hairline
 * outline over both. `buildings-fill` + the CONTEXT_BUILDINGS_* ids are unchanged from
 * v1 because `SiteBoundaryMap2D.BUILDING_QUERY_LAYERS` queries them for edge snapping —
 * renaming them would silently kill the snap without failing anything.
 */
export function buildPastelBuildingLayers(opts: SiteMap2DStyleOptions = {}): Array<Record<string, unknown>> {
    const P = FORMA_PALETTE_V2;
    const z = PASTEL_ZOOM.buildings;
    const shadowPaint = {
        'fill-color': P.buildingShadow,
        'fill-translate': [...PASTEL_SHADOW_OFFSET],
        'fill-translate-anchor': 'viewport',
    };
    const layers: Array<Record<string, unknown>> = [
        {
            id: PASTEL_LAYERS.buildingsShadow,
            type: 'fill', source: OMT_SOURCE, 'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: z, paint: shadowPaint,
        },
    ];
    if (opts.extrude) {
        layers.push({
            id: PASTEL_LAYERS.buildings3d,
            type: 'fill-extrusion', source: OMT_SOURCE, 'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: 14,
            paint: {
                'fill-extrusion-color': P.buildingFill,
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.9,
            },
        });
    } else {
        layers.push({
            id: PASTEL_LAYERS.buildingsFill,
            type: 'fill', source: OMT_SOURCE, 'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: z,
            paint: { 'fill-color': P.buildingFill, 'fill-opacity': 1 },
        });
        layers.push({
            id: PASTEL_LAYERS.buildingsOutline,
            type: 'line', source: OMT_SOURCE, 'source-layer': BUILDING_SOURCE_LAYER,
            minzoom: z,
            paint: { 'line-color': P.buildingStroke, 'line-width': 0.7 },
        });
    }
    // The denser OSM/Overture overlay gets the SAME three-layer treatment so a footprint
    // that exists only in the overlay still casts a shadow and still reads as a mass.
    layers.push({
        id: PASTEL_LAYERS.contextBuildingsShadow,
        type: 'fill', source: CONTEXT_BUILDINGS_SOURCE, minzoom: z, paint: shadowPaint,
    });
    layers.push({
        id: PASTEL_LAYERS.contextBuildingsFill,
        type: 'fill', source: CONTEXT_BUILDINGS_SOURCE, minzoom: z,
        paint: { 'fill-color': P.buildingFill, 'fill-opacity': 1 },
    });
    layers.push({
        id: PASTEL_LAYERS.contextBuildingsLine,
        type: 'line', source: CONTEXT_BUILDINGS_SOURCE, minzoom: z,
        paint: { 'line-color': P.buildingStroke, 'line-width': 0.7 },
    });
    return layers;
}

/**
 * Individual tree symbols — STR §2's "secret ingredient". One circle per point, mapped
 * trees and synthesised canopies alike; the caller labels the synthetic ones
 * `synthetic: true` in the feature properties and counts them SEPARATELY in its console
 * line (C57 §1.5). They are drawn with the SAME symbol on purpose: this is scenery, and
 * a viewer must be told which is which by the honest count, not misled by two symbols
 * into thinking a synthesis was surveyed.
 */
export function buildPastelTreeLayer(): Record<string, unknown> {
    return {
        id: PASTEL_LAYERS.trees,
        type: 'circle',
        source: PASTEL_SOURCES.trees,
        minzoom: PASTEL_ZOOM.trees,
        paint: {
            'circle-radius': zoomRamp([[15, 2.5], [17, 3.2], [19, 4.0]]),
            'circle-color': FORMA_PALETTE_V2.treeFill,
            'circle-stroke-color': FORMA_PALETTE_V2.treeStroke,
            'circle-stroke-width': 0.5,
            'circle-opacity': 0.95,
        },
    };
}

/** Muted road + place labels. No POI icons (SPEC-FORMA-SITE-VIEW §8 NON-GOALS still hold). */
export function buildPastelLabelLayers(): Array<Record<string, unknown>> {
    const P = FORMA_PALETTE_V2;
    return [
        {
            id: PASTEL_LAYERS.roadLabel,
            type: 'symbol', source: OMT_SOURCE, 'source-layer': 'transportation_name',
            minzoom: PASTEL_ZOOM.labels,
            layout: {
                'symbol-placement': 'line',
                'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
            },
            paint: { 'text-color': P.label, 'text-halo-color': P.labelHalo, 'text-halo-width': 1.2 },
        },
        {
            id: PASTEL_LAYERS.placeLabel,
            type: 'symbol', source: OMT_SOURCE, 'source-layer': 'place',
            minzoom: PASTEL_ZOOM.labels,
            layout: {
                'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
                'text-font': ['Noto Sans Regular'],
                'text-size': zoomRamp([[14, 12], [18, 16]]),
            },
            paint: { 'text-color': P.label, 'text-halo-color': P.labelHalo, 'text-halo-width': 1.4 },
        },
    ];
}

/**
 * MAP2D-PASTEL Stage M1 — the composed style. PURE (plain JSON, no maplibre import),
 * same contract as `buildFormaMap2DStyle`, which is kept UNCHANGED beside it for the
 * existing callers and its existing pins.
 *
 * Layer order (bottom → top):
 *   background → landuse(base, ctx) → parks(base, ctx) → water(base, ctx) → waterways
 *   → rail → roads(minor, major casing, major, footway, cycleway — each base then ctx)
 *   → buildings(shadow → fill → outline; then the ctx overlay's shadow → fill → outline)
 *   → trees → labels
 *
 * The parcel highlight, the drawn ring and the vertex handles are NOT here: they are
 * added on top at runtime by `SiteBoundaryMap2D.installRingLayers()`, in the PRYZM
 * purple, exactly as before. This style changes nothing about selection.
 */
export function buildFormaMap2DStyleV2(opts: SiteMap2DStyleOptions = {}): Map2DStyleSpec {
    const sources: Record<string, unknown> = {
        [OMT_SOURCE]: {
            type: 'vector',
            url: OPENFREEMAP_TILEJSON,
            attribution: OPENFREEMAP_ATTRIBUTION,
        },
        [CONTEXT_BUILDINGS_SOURCE]: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            ...PASTEL_GEOJSON_SOURCE_OPTS,
            attribution:
                'Buildings © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
        ...buildPastelContextSources(),
    };

    const layers: Array<Record<string, unknown>> = [
        buildPastelBackgroundLayer(),
        ...buildPastelLanduseLayers(),
        ...buildPastelParkLayers(),
        ...buildPastelWaterLayers(),
        buildPastelRailLayer(),
        ...buildPastelRoadLayers(),
        ...buildPastelBuildingLayers(opts),
        buildPastelTreeLayer(),
        ...buildPastelLabelLayers(),
    ];

    return {
        version: 8,
        name: 'PRYZM Pastel Masterplan (OpenFreeMap + baked context)',
        glyphs: OPENFREEMAP_GLYPHS,
        sources,
        layers,
    };
}
