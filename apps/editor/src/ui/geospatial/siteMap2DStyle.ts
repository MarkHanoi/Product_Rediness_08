// A.8.c.f (core) — Hektar-style cream/shadow MapLibre style spec (HEADLESS).
//
// WHY THIS EXISTS
// ---------------
// The founder's spec for the 2D boundary-draw surface (A.8.c.f) is an elegant
// plan-view map in the "Hektar" aesthetic (parametric.se): a cream / off-white
// basemap, thin grey streets, muted labels, and building footprints rendered as
// near-white fills with a subtle drop-shadow for a 3D-ish plan look. This module
// builds the MapLibre `StyleSpecification` that produces that look. It is PURE
// (no `maplibre-gl` import, no DOM) so the layer composition is unit-testable and
// the `maplibre-gl` runtime dependency stays confined to `SiteBoundaryMap2D.ts`.
//
// SOURCES (free + keyless)
// ------------------------
// - Basemap raster: CartoDB Positron `light_all` ({a-c} sub-domains). A clean
//   light grey/cream cartographic base. Served over https → covered by the
//   server CSP `img-src https:` (server/securityHeaders.js:153), so no CSP change
//   is needed for the tiles.
// - Building footprints: an MVT (Mapbox Vector Tile) source. For the FIRST CUT we
//   compose the building source/layers conditionally — `buildingsSourceUrl` is
//   optional. When omitted, the style is the cream raster basemap alone (still
//   the correct aesthetic); when a keyless MVT buildings endpoint is supplied,
//   the near-white fill + offset drop-shadow layers are added. This keeps the
//   first cut keyless-by-default while leaving the elegant shadow look one config
//   line away (documented as browser-verify / follow-up).
//
// The drop-shadow is faked the cartographer's way: a translucent dark fill of the
// SAME building geometry, translated by a few pixels (fill-translate) and drawn
// BENEATH the near-white building fill. No blur filter (MapLibre fill layers have
// no blur), but the offset translucent duplicate reads as a soft plan-view shadow.

/** Hektar palette — single source of truth for the cream/shadow look. */
export const HEKTAR_PALETTE = {
    /** Cream page background behind/around the raster (shows at map edges + load). */
    cream: '#f4f1ea',
    /** Near-white building fill. */
    buildingFill: '#fbfaf6',
    /** Thin building outline (warm grey). */
    buildingStroke: '#d8d2c4',
    /** Translucent drop-shadow colour for the offset duplicate fill. */
    shadow: 'rgba(60, 52, 40, 0.18)',
    /** PRYZM violet — drawn boundary ring + vertex handles. */
    violet: '#6600FF',
} as const;

/** CartoDB Positron raster tile template (light, cream-ish cartographic base). */
export const CARTO_POSITRON_TILES = [
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
] as const;

/** Attribution required by the CartoDB / OSM terms. */
export const CARTO_ATTRIBUTION =
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';

/**
 * The pixel offset of the building drop-shadow duplicate (x, y). Drawn beneath the
 * near-white fill so the building appears to float over the page.
 */
export const SHADOW_OFFSET: readonly [number, number] = [3, 4];

export interface SiteMap2DStyleOptions {
    /**
     * Optional keyless MVT (vector) buildings endpoint, e.g. a self-hosted or a
     * public `…/{z}/{x}/{y}.pbf` tile URL with a `building` source-layer. When
     * provided, the near-white fill + offset drop-shadow layers are added on top
     * of the cream raster basemap. When omitted, the style is the raster basemap
     * alone (still the correct cream aesthetic). The source-layer name defaults to
     * `building`; override with `buildingsSourceLayer`.
     */
    readonly buildingsSourceUrl?: string;
    /** The MVT source-layer that carries building polygons (default `building`). */
    readonly buildingsSourceLayer?: string;
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

/**
 * Build the Hektar-style cream/shadow MapLibre style. PURE — returns a plain
 * JSON style object (no maplibre import). See module header for the aesthetic +
 * source rationale.
 */
export function buildSiteMap2DStyle(
    opts: SiteMap2DStyleOptions = {},
): Map2DStyleSpec {
    const sources: Record<string, unknown> = {
        'carto-positron': {
            type: 'raster',
            tiles: [...CARTO_POSITRON_TILES],
            tileSize: 256,
            attribution: CARTO_ATTRIBUTION,
            minzoom: 0,
            maxzoom: 20,
        },
    };

    const layers: Array<Record<string, unknown>> = [
        // Cream page colour shows at map edges + before tiles load.
        {
            id: 'cream-background',
            type: 'background',
            paint: { 'background-color': HEKTAR_PALETTE.cream },
        },
        // The light cartographic raster basemap (streets, labels, muted greys).
        {
            id: 'carto-positron',
            type: 'raster',
            source: 'carto-positron',
            paint: {
                // Nudge the raster toward warm cream for the Hektar feel.
                'raster-saturation': -0.25,
                'raster-brightness-min': 0.05,
                'raster-opacity': 0.96,
            },
        },
    ];

    // Optional building footprints (near-white fill + offset drop-shadow). Only
    // added when a keyless MVT endpoint is supplied — see header.
    if (opts.buildingsSourceUrl) {
        const sourceLayer = opts.buildingsSourceLayer ?? 'building';
        sources['buildings'] = {
            type: 'vector',
            tiles: [opts.buildingsSourceUrl],
            minzoom: 12,
            maxzoom: 16,
        };
        // Shadow FIRST (drawn beneath the fill) — translucent dark duplicate,
        // pixel-offset so the building reads as floating over the page.
        layers.push({
            id: 'buildings-shadow',
            type: 'fill',
            source: 'buildings',
            'source-layer': sourceLayer,
            minzoom: 13,
            paint: {
                'fill-color': HEKTAR_PALETTE.shadow,
                'fill-translate': [...SHADOW_OFFSET],
                'fill-translate-anchor': 'viewport',
            },
        });
        // Near-white building fill on top of its own shadow.
        layers.push({
            id: 'buildings-fill',
            type: 'fill',
            source: 'buildings',
            'source-layer': sourceLayer,
            minzoom: 13,
            paint: {
                'fill-color': HEKTAR_PALETTE.buildingFill,
                'fill-outline-color': HEKTAR_PALETTE.buildingStroke,
                'fill-opacity': 0.95,
            },
        });
    }

    return {
        version: 8,
        name: 'PRYZM Hektar (cream/shadow)',
        sources,
        layers,
    };
}
