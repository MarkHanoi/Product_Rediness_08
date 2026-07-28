// §TERRAIN-RENDER (Phase 3 of the Context Scene-Compiler + Terrain North Star, §6.3) — the CLIENT
// side of the terrain wiring. `tools/context-bake/terrain.mjs` compiles a national DTM → Cesium
// quantized-mesh tiles under `<R2 tiles base>/terrain/<city>/`; this module resolves a site's
// lon/lat to that `<city>` slug and builds the tileset URL so `CesiumViewport` can attach a
// `CesiumTerrainProvider`.
//
// GUARD / NO-REGRESSION CONTRACT
// ------------------------------
// Only cities whose country has an OPEN, commercial-OK DTM that we actually bake appear here. A
// site outside every listed bbox resolves to `null`, and the viewport keeps today's flat
// EllipsoidTerrainProvider (base 0) — un-baked jurisdictions are NOT regressed. Even for a listed
// city the viewport still guards on the tileset actually existing (its `layer.json` must load);
// a city listed here but not yet baked in R2 simply 404s and stays flat, then lights up with no
// code change the moment CI publishes it — the same self-correcting philosophy as the PMTiles
// context reader (`contextTiles.ts`).
//
// DELIBERATELY OMITTED (kept flat — no baked terrain source): Lisbon/Porto (PT — no open national
// bare-earth DTM), Brussels (BE — regional-split, no keyless national WCS; Brussels-Capital DTM
// unsourced), Berlin/Munich (DE — per-Land; only NRW is sourced, so Köln IS covered but Berlin/
// Munich are not in NRW), Riyadh/Jeddah (SA — no open national DTM).
// See docs/04-reference/CONTEXT-TERRAIN-COVERAGE.md.
import { contextTilesBaseUrl } from './contextTiles';

/** A lon/lat bounding box `[west, south, east, north]`. */
export type TerrainBbox = readonly [number, number, number, number];

/**
 * The cities with a baked (or bake-scheduled) terrain tileset — slug + city-centre bbox. Slugs
 * MATCH `tools/context-bake/terrain.mjs` REGIONS `name` and the R2 path `terrain/<slug>/`. Bboxes
 * mirror `tools/context-bake/bake.mjs` REGIONS (the Spanish city clips are defined here + in
 * terrain.mjs, since the building bake uses one national `spain` region).
 */
export const TERRAIN_CITY_BBOXES: ReadonlyArray<{ readonly city: string; readonly bbox: TerrainBbox }> = [
    // NL — AHN (keyless, CC0). §NL-NATIONWIDE — per-city terrain (whole-country AHN is a heavy
    // follow-up); buildings/envelope/parcel are already nationwide.
    { city: 'amsterdam', bbox: [4.83, 52.34, 4.97, 52.42] },
    { city: 'rotterdam', bbox: [4.42, 51.88, 4.55, 51.96] },
    { city: 'utrecht', bbox: [5.06, 52.06, 5.16, 52.12] },
    { city: 'thehague', bbox: [4.25, 52.04, 4.35, 52.10] },
    { city: 'eindhoven', bbox: [5.42, 51.40, 5.52, 51.48] },
    // FR — RGE ALTI / IGN (keyless)
    { city: 'paris', bbox: [2.22, 48.80, 2.47, 48.91] },
    { city: 'lyon', bbox: [4.78, 45.70, 4.92, 45.80] },
    // IT — Tinitaly 10 m (keyless, CC-BY)
    { city: 'rome', bbox: [12.40, 41.83, 12.60, 41.99] },
    { city: 'milan', bbox: [9.10, 45.40, 9.28, 45.55] },
    // GB — Environment Agency LIDAR Composite DTM 1 m (keyless, OGL)
    { city: 'london', bbox: [-0.20, 51.44, 0.02, 51.55] },
    // DK — DHM/Terræn (Datafordeler apikey)
    { city: 'copenhagen', bbox: [12.50, 55.63, 12.65, 55.72] },
    // NO — NDH / Kartverket (keyless)
    { city: 'oslo', bbox: [10.66, 59.88, 10.83, 59.96] },
    // SE — Lantmäteriet höjddata (free-key, CC0)
    { city: 'stockholm', bbox: [17.98, 59.28, 18.14, 59.37] },
    // FI — NLS/Maanmittauslaitos (free-key, CC-BY)
    { city: 'helsinki', bbox: [24.88, 60.14, 25.02, 60.20] },
    // CH — swissALTI3D (keyless)
    { city: 'zurich', bbox: [8.45, 47.34, 8.62, 47.43] },
    { city: 'geneva', bbox: [6.09, 46.17, 6.18, 46.25] },
    { city: 'bern', bbox: [7.40, 46.93, 7.48, 46.99] },
    // DE — Geobasis NRW DGM1 (keyless). Köln is the NRW-covered city; Berlin/Munich stay omitted.
    { city: 'koln', bbox: [6.85, 50.88, 7.02, 50.99] },
    // ES — PNOA MDT (keyless, CC-BY)
    { city: 'barcelona', bbox: [2.09, 41.32, 2.23, 41.47] },
    { city: 'valencia', bbox: [-0.43, 39.40, -0.30, 39.52] },
    { city: 'madrid', bbox: [-3.80, 40.33, -3.58, 40.52] },
    { city: 'cordoba', bbox: [-4.85, 37.84, -4.72, 37.94] },
    { city: 'toledo', bbox: [-4.08, 39.82, -3.95, 39.91] },
    // Costa del Sol (Málaga→Marbella) — big desnivel under the Sierra de Mijas / Sierra Blanca
    { city: 'malaga', bbox: [-4.52, 36.66, -4.38, 36.78] },
    { city: 'benalmadena', bbox: [-4.62, 36.56, -4.48, 36.66] },
    { city: 'fuengirola', bbox: [-4.70, 36.49, -4.56, 36.63] },
    { city: 'marbella', bbox: [-4.95, 36.47, -4.82, 36.59] },
    // US — 3DEP 1 m (public domain)
    { city: 'newyork', bbox: [-74.03, 40.70, -73.91, 40.82] },
    { city: 'sanfrancisco', bbox: [-122.52, 37.70, -122.36, 37.83] },
];

/** True when `lon,lat` falls inside `bbox` (inclusive). */
function inBbox(lon: number, lat: number, bbox: TerrainBbox): boolean {
    const [w, s, e, n] = bbox;
    return lon >= Math.min(w, e) && lon <= Math.max(w, e)
        && lat >= Math.min(s, n) && lat <= Math.max(s, n);
}

/**
 * Resolve a site's `lon,lat` to a baked-terrain city slug, or `null` when the point is outside
 * every listed city (→ the viewport keeps flat ground). PURE + testable.
 */
export function cityForLonLat(lon: number, lat: number): string | null {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    for (const { city, bbox } of TERRAIN_CITY_BBOXES) {
        if (inBbox(lon, lat, bbox)) return city;
    }
    return null;
}

/**
 * §TERRAIN-TOGGLE (founder 2026-07-27) — the PURE decision "should the baked quantized-mesh
 * terrain provider attach for this site right now?", factored out of `CesiumViewport.
 * maybeAttachTerrainProvider` so the gate is unit-testable with no Cesium/DOM dependency.
 *
 * Ordered gates (first hit wins):
 *   • toggle-off      — the user turned the 3D-Site terrain OFF (the founder escape hatch).
 *   • photoreal       — the paid Google-3D-tiles path (non-Forma) already carries its own
 *                       ground; draping our mesh under it double-grounds / z-fights.
 *   • no-baked-city   — the site is outside every baked-terrain bbox → keep flat (no regression).
 *   • attach          — a baked city applies; caller still guards on the tileset actually loading.
 */
export interface TerrainAttachInputs {
    /** The user TERRAIN ON/OFF toggle (default ON). When false → never attach → flat ground. */
    readonly terrainEnabled: boolean;
    /** True when the paid Google photoreal 3D tileset is the live ground. */
    readonly photorealActive: boolean;
    /** True on the free Forma flat/massing study path (where our terrain IS drawn). */
    readonly formaMode: boolean;
    readonly lon: number;
    readonly lat: number;
}

export type TerrainAttachDecision =
    | { readonly attach: false; readonly reason: 'toggle-off' | 'photoreal' | 'no-baked-city' }
    | { readonly attach: true; readonly city: string };

export function decideBakedTerrainAttach(inp: TerrainAttachInputs): TerrainAttachDecision {
    if (!inp.terrainEnabled) return { attach: false, reason: 'toggle-off' };
    // Skip our terrain ONLY on the true photoreal (non-Forma) path; in Forma the photoreal
    // tileset is hidden and the globe is shown, so draping baked terrain is correct.
    if (inp.photorealActive && !inp.formaMode) return { attach: false, reason: 'photoreal' };
    const city = cityForLonLat(inp.lon, inp.lat);
    if (!city) return { attach: false, reason: 'no-baked-city' };
    return { attach: true, city };
}

/**
 * The quantized-mesh tileset URL for a city, mirroring the PMTiles layout: the terrain lives at
 * `<tiles base>/terrain/<city>/{layer.json,{z}/{x}/{y}.terrain}`. `CesiumTerrainProvider.fromUrl`
 * appends `/layer.json`, so this returns the tileset DIRECTORY with no trailing slash. Returns
 * `null` when no tiles base is configured (local/dev Overpass path).
 */
export function terrainTilesetUrl(city: string): string | null {
    const base = contextTilesBaseUrl();
    if (!base) return null;
    return `${base}terrain/${city}`;
}
