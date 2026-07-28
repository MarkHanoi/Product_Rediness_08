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
    // §ES-ALL-CAPITALS (L-636) — all Spanish provincial capitals + Balearics + Canaries + big non-capitals.
    { city: 'sevilla', bbox: [-6.0545, 37.3291, -5.9145, 37.4491] },
    { city: 'zaragoza', bbox: [-0.9591, 41.5888, -0.8191, 41.7088] },
    { city: 'murcia', bbox: [-1.2007, 37.9322, -1.0607, 38.0522] },
    { city: 'palma', bbox: [2.5802, 39.5096, 2.7202, 39.6296] },
    { city: 'laspalmas', bbox: [-15.5063, 28.0635, -15.3663, 28.1835] },
    { city: 'bilbao', bbox: [-3.005, 43.203, -2.865, 43.323] },
    { city: 'alicante', bbox: [-0.551, 38.2852, -0.411, 38.4052] },
    { city: 'valladolid', bbox: [-4.7945, 41.5923, -4.6545, 41.7123] },
    { city: 'vigo', bbox: [-8.7907, 42.1806, -8.6507, 42.3006] },
    { city: 'gijon', bbox: [-5.7311, 43.4722, -5.5911, 43.5922] },
    { city: 'acoruna', bbox: [-8.4815, 43.3023, -8.3415, 43.4223] },
    { city: 'vitoria', bbox: [-2.7416, 42.7867, -2.6016, 42.9067] },
    { city: 'granada', bbox: [-3.6686, 37.1173, -3.5286, 37.2373] },
    { city: 'elche', bbox: [-0.7826, 38.2099, -0.6426, 38.3299] },
    { city: 'oviedo', bbox: [-5.9194, 43.3019, -5.7794, 43.4219] },
    { city: 'santacruztenerife', bbox: [-16.3218, 28.4036, -16.1818, 28.5236] },
    { city: 'cartagena', bbox: [-1.0666, 37.5657, -0.9266, 37.6857] },
    { city: 'jerez', bbox: [-6.1961, 36.625, -6.0561, 36.745] },
    { city: 'alcaladehenares', bbox: [-3.4335, 40.422, -3.2935, 40.542] },
    { city: 'pamplona', bbox: [-1.7158, 42.7525, -1.5758, 42.8725] },
    { city: 'almeria', bbox: [-2.5337, 36.774, -2.3937, 36.894] },
    { city: 'sansebastian', bbox: [-2.0512, 43.2583, -1.9112, 43.3783] },
    { city: 'santander', bbox: [-3.88, 43.4023, -3.74, 43.5223] },
    { city: 'castellon', bbox: [-0.1213, 39.9264, 0.0187, 40.0464] },
    { city: 'burgos', bbox: [-3.7669, 42.2839, -3.6269, 42.4039] },
    { city: 'albacete', bbox: [-1.9285, 38.9343, -1.7885, 39.0543] },
    { city: 'logrono', bbox: [-2.5149, 42.4027, -2.3749, 42.5227] },
    { city: 'lalaguna', bbox: [-16.3859, 28.4274, -16.2459, 28.5474] },
    { city: 'badajoz', bbox: [-7.0407, 38.8194, -6.9007, 38.9394] },
    { city: 'salamanca', bbox: [-5.7335, 40.9101, -5.5935, 41.0301] },
    { city: 'huelva', bbox: [-7.0147, 37.2014, -6.8747, 37.3214] },
    { city: 'lleida', bbox: [0.55, 41.5576, 0.69, 41.6776] },
    { city: 'tarragona', bbox: [1.1745, 41.0589, 1.3145, 41.1789] },
    { city: 'leon', bbox: [-5.6371, 42.5387, -5.4971, 42.6587] },
    { city: 'cadiz', bbox: [-6.3586, 36.4671, -6.2186, 36.5871] },
    { city: 'jaen', bbox: [-3.8549, 37.7196, -3.7149, 37.8396] },
    { city: 'ourense', bbox: [-7.9339, 42.2758, -7.7939, 42.3958] },
    { city: 'girona', bbox: [2.7514, 41.9194, 2.8914, 42.0394] },
    { city: 'lugo', bbox: [-7.6259, 42.9521, -7.4859, 43.0721] },
    { city: 'caceres', bbox: [-6.4424, 39.4153, -6.3024, 39.5353] },
    { city: 'santiago', bbox: [-8.6148, 42.8182, -8.4748, 42.9382] },
    { city: 'guadalajara', bbox: [-3.2337, 40.5697, -3.0937, 40.6897] },
    { city: 'pontevedra', bbox: [-8.7144, 42.371, -8.5744, 42.491] },
    { city: 'palencia', bbox: [-4.5988, 41.9496, -4.4588, 42.0696] },
    { city: 'ciudadreal', bbox: [-3.9976, 38.9248, -3.8576, 39.0448] },
    { city: 'zamora', bbox: [-5.8146, 41.4433, -5.6746, 41.5633] },
    { city: 'avila', bbox: [-4.7512, 40.5965, -4.6112, 40.7165] },
    { city: 'cuenca', bbox: [-2.2074, 40.0104, -2.0674, 40.1304] },
    { city: 'segovia', bbox: [-4.1788, 40.8829, -4.0388, 41.0029] },
    { city: 'soria', bbox: [-2.549, 41.7066, -2.409, 41.8266] },
    { city: 'teruel', bbox: [-1.1765, 40.2856, -1.0365, 40.4056] },
    { city: 'huesca', bbox: [-0.4789, 42.0801, -0.3389, 42.2001] },
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
