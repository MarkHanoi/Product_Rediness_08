// LANE FR-STEP4 — FRANCE (FR) · NEIGHBOURS slice source: adjacent building heights from
// IGN BD TOPO® batiment, REUSING the proven context-bake machinery's measured contract
// (tools/context-bake/heightSources.mjs `fetchBdTopo` — the client the Paris/Lyon context
// rows fetch through; sourceRegistry/fr.ts row `fr-ign-bdtopo-batiment-wfs`). This module
// mirrors that contract into the typed FetchOutcome world; it does NOT rival the bake tool
// (bake = bulk city clips for tiles; this = a per-point neighbour sample for the record).
//
// MEASURED FACTS INHERITED + RE-VERIFIED (FR-STEP4 probe 2026-09-02, Paris 11e):
//   • Endpoint `data.geopf.fr/wfs/ows`, TYPENAMES=BDTOPO_V3:batiment, WFS 2.0 → GeoJSON in
//     EPSG:4326 directly. ⚠ BBOX param axis order is LON,LAT (minX,minY,maxX,maxY) —
//     heightSources.mjs live-verified 2026-07-24; re-verified here (49 buildings in a
//     ±0.0008° box). NOTE this is the OPPOSITE of the CQL INTERSECTS literal order
//     (lat lon) — both are measured, neither is a typo.
//   • `hauteur` (m) + `nombre_d_etages` + `usage_1` + `date_modification` per feature;
//     hauteur is sometimes null → counted separately, never invented (§BDTOPO honesty).
//   • A response with `features.length >= COUNT` is a TRUNCATED slice (§BDTOPO-CAP-TRUNCATE)
//     — flagged, so a consumer never mistakes a cap for a census.
//
// THE HONESTY CAVEAT travels ON the value (brief §4.3 row "heights are photogrammetric,
// quality varies by vintage") — a consumer that drops it overstates survey quality.

import { fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { frGpuGetJson, type FrFetchDeps } from './frGpuClient.js';

/** The Géoplateforme WFS endpoint (same transport as the GPU fallback + the bake tool). */
export const FR_BDTOPO_WFS_ENDPOINT = 'https://data.geopf.fr/wfs/ows';

/** The BD TOPO buildings layer (heightSources.mjs contract, verbatim). */
export const FR_BDTOPO_LAYER = 'BDTOPO_V3:batiment';

/** The neighbour sample half-width in degrees (≈ 60–90 m — a block, not a district). */
export const FR_NEIGHBOUR_RADIUS_DEG = 0.0008;

/** The per-point feature cap (a tiny box; 60 is generous — truncation still flagged). */
export const FR_NEIGHBOUR_COUNT_CAP = 60;

/** The caveat every neighbours slice carries VERBATIM (brief §4.3; do not soften). */
export const FR_BDTOPO_HONESTY_CAVEAT =
    'BD TOPO LoD1 heights are photogrammetric and vintage varies per building ' +
    '(date_modification is per-feature) — context, never survey.';

/** One adjacent building with a served height. */
export interface FrNeighbourBuilding {
    /** BD TOPO `hauteur` (m) — photogrammetric LoD1, see the slice caveat. */
    readonly heightM: number;
    /** BD TOPO `nombre_d_etages`, or null when not served. */
    readonly storeys: number | null;
    /** BD TOPO `usage_1` verbatim, or null. */
    readonly use: string | null;
    /** BD TOPO stable id (`cleabs`), or null — the determinism sort key. */
    readonly cleabs: string | null;
    /** BD TOPO `date_modification` verbatim, or null — the per-building vintage. */
    readonly vintage: string | null;
}

/** The neighbours answer — heights PLUS the honest frame around them. */
export interface FrNeighbourBuildings {
    /** Height-carrying buildings, sorted by `cleabs` (deterministic). */
    readonly buildings: readonly FrNeighbourBuilding[];
    /** How many features the WFS served in the box (superset of `buildings`). */
    readonly served: number;
    /** Served features with NO usable hauteur — counted, never invented. */
    readonly withoutHeight: number;
    /** True when the response hit the COUNT cap — a truncated slice, not a census. */
    readonly truncated: boolean;
    /** The half-width (deg) of the sample box. */
    readonly radiusDeg: number;
    /** FR_BDTOPO_HONESTY_CAVEAT, verbatim. */
    readonly caveat: string;
}

/** Build the BD TOPO bbox query (BBOX axis order LON,LAT — measured; see header). */
export function buildFrBdTopoBboxUrl(
    lat: number,
    lon: number,
    radiusDeg: number = FR_NEIGHBOUR_RADIUS_DEG,
): string {
    const params = new URLSearchParams({
        SERVICE: 'WFS',
        VERSION: '2.0.0',
        REQUEST: 'GetFeature',
        TYPENAMES: FR_BDTOPO_LAYER,
        SRSNAME: 'EPSG:4326',
        BBOX: `${lon - radiusDeg},${lat - radiusDeg},${lon + radiusDeg},${lat + radiusDeg},EPSG:4326`,
        COUNT: String(FR_NEIGHBOUR_COUNT_CAP),
        OUTPUTFORMAT: 'application/json',
    });
    return `${FR_BDTOPO_WFS_ENDPOINT}?${params.toString()}`;
}

/**
 * Fetch the adjacent-building heights around a point.
 *   • found     → FrNeighbourBuildings (POSSIBLY with zero buildings — an answered "no
 *                 neighbours here" is a FOUND empty list, not an absence: the WFS answered)
 *   • transient → network / HTTP / shapeless body (names the endpoint)
 */
export async function frNeighbourBuildingsAtPoint(
    lat: number,
    lon: number,
    deps: FrFetchDeps = {},
    radiusDeg: number = FR_NEIGHBOUR_RADIUS_DEG,
): Promise<FetchOutcome<FrNeighbourBuildings>> {
    const url = buildFrBdTopoBboxUrl(lat, lon, radiusDeg);
    const got = await frGpuGetJson(url, `bdtopo/batiment @ ${lat},${lon}`, deps);
    if (got.status !== 'found') return got as FetchOutcome<FrNeighbourBuildings>;
    const features = (got.value as { features?: unknown }).features;
    if (!Array.isArray(features)) {
        return fetchTransient(`upstream-failed: no features array from ${url}`);
    }
    const buildings: FrNeighbourBuilding[] = [];
    let withoutHeight = 0;
    for (const f of features) {
        const props = (f as { properties?: unknown })?.properties;
        if (props === null || typeof props !== 'object' || Array.isArray(props)) continue;
        const p = props as Record<string, unknown>;
        const h = Number(p['hauteur']);
        if (!Number.isFinite(h) || h <= 0) {
            withoutHeight += 1; // null hauteur is COUNTED, never invented (bake-tool rule)
            continue;
        }
        const storeysRaw = Number(p['nombre_d_etages']);
        buildings.push({
            heightM: h,
            storeys: Number.isFinite(storeysRaw) && storeysRaw > 0 ? Math.round(storeysRaw) : null,
            use: typeof p['usage_1'] === 'string' && p['usage_1'] !== '' ? p['usage_1'] : null,
            cleabs: typeof p['cleabs'] === 'string' && p['cleabs'] !== '' ? p['cleabs'] : null,
            vintage:
                typeof p['date_modification'] === 'string' && p['date_modification'] !== ''
                    ? p['date_modification']
                    : null,
        });
    }
    buildings.sort((a, b) => (a.cleabs ?? '').localeCompare(b.cleabs ?? ''));
    return fetchFound({
        buildings,
        served: features.length,
        withoutHeight,
        truncated: features.length >= FR_NEIGHBOUR_COUNT_CAP,
        radiusDeg,
        caveat: FR_BDTOPO_HONESTY_CAVEAT,
    });
}
