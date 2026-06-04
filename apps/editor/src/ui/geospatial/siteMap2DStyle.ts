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
