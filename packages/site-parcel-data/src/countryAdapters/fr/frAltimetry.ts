// LANE FR-STEP4 — FRANCE (FR) · TERRAIN slice source: the Géoplateforme altimetry REST
// service (RGE ALTI), point elevation for the no-extraction record (brief §4.3 row
// "Terrain (datum values) → RGE ALTI / Géoplateforme altimetry API").
//
// MEASURED SHAPE (probed live 2026-09-02, FR-STEP4 lane — re-run before "fixing"):
//   GET https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json
//       ?lon=2.3785&lat=48.8585&resource=ign_rge_alti_wld&zonly=false&measures=false
//   → HTTP 200 {"elevations":[{"lon":2.3785,"lat":48.8585,"z":37.54,
//                              "acc":"Variable suivant la source de mesure"}]}
//   Keyless. `acc` arrived as a STRING on both probes (it is a number on some resources —
//   both shapes are accepted). Sea control (42.90, 3.60 Golfe du Lion):
//   → HTTP 200 z = -99999.0 — the NO-DATA SENTINEL, classified `absent` BY NAME, never
//   served as an elevation (corpus lesson: sentinel ≠ unknown ≠ 0).
//
// The datum HONESTY LINE (brief §7): this is the terrain elevation AT the query point —
// the règlement's datum DEFINITION (terrain naturel avant travaux / rasant at the façade,
// L-584) is a legal fact this module does not resolve and its output must not be read as.
//
// Licence: Licence Ouverte / Etalab 2.0 (IGN Géoplateforme) — GREEN, attribution.
// FetchOutcome end-to-end (C57 §1.5); transient tokens from the L0 table only (L-12874).

import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { frGpuGetJson, type FrFetchDeps } from './frGpuClient.js';

/** Géoplateforme altimetry REST endpoint (keyless; probed live 2026-09-02). */
export const FR_ALTIMETRY_ENDPOINT =
    'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';

/** The national elevation resource queried (RGE ALTI world blend — the keyless default). */
export const FR_ALTIMETRY_RESOURCE = 'ign_rge_alti_wld';

/** The service's no-data sentinel (measured -99999.0 at the Golfe du Lion sea control). */
export const FR_ALTIMETRY_NODATA_SENTINEL = -99999;

/** One resolved point elevation — a MEASURED terrain value, never a legal datum. */
export interface FrElevation {
    /** Elevation in metres at the query point (RGE ALTI). */
    readonly elevationM: number;
    /** The service's accuracy statement, verbatim (string on the probed resource), or null. */
    readonly accuracy: string | number | null;
    /** The altimetry resource that answered (provenance). */
    readonly resource: string;
}

/** Build the altimetry point-elevation URL (measured shape above). */
export function buildFrAltimetryUrl(lat: number, lon: number): string {
    const params = new URLSearchParams({
        lon: String(lon),
        lat: String(lat),
        resource: FR_ALTIMETRY_RESOURCE,
        zonly: 'false',
        measures: 'false',
    });
    return `${FR_ALTIMETRY_ENDPOINT}?${params.toString()}`;
}

/**
 * Fetch the RGE ALTI point elevation.
 *   • found     → { elevationM, accuracy, resource }
 *   • absent    → the -99999 no-data sentinel (sea / uncovered) — named, never a value
 *   • transient → network / HTTP / shapeless body (names the endpoint)
 */
export async function frElevationAtPoint(
    lat: number,
    lon: number,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<FrElevation>> {
    const url = buildFrAltimetryUrl(lat, lon);
    const got = await frGpuGetJson(url, `altimetrie @ ${lat},${lon}`, deps);
    if (got.status !== 'found') return got as FetchOutcome<FrElevation>;
    const elevations = (got.value as { elevations?: unknown }).elevations;
    if (!Array.isArray(elevations) || elevations.length === 0) {
        return fetchTransient(`upstream-failed: no elevations array from ${url}`);
    }
    const first = elevations[0] as { z?: unknown; acc?: unknown };
    const z = typeof first.z === 'number' ? first.z : Number(first.z);
    if (!Number.isFinite(z)) {
        return fetchTransient(`upstream-failed: non-numeric z from ${url}`);
    }
    if (z <= FR_ALTIMETRY_NODATA_SENTINEL + 1) {
        // The measured no-data sentinel — a durable "no elevation published here" (sea).
        return fetchAbsent(
            `no-feature: altimetrie ${FR_ALTIMETRY_RESOURCE} @ ${lat},${lon} returned the no-data sentinel z=${z}`,
        );
    }
    const acc = first.acc;
    return fetchFound({
        elevationM: z,
        accuracy: typeof acc === 'string' || typeof acc === 'number' ? acc : null,
        resource: FR_ALTIMETRY_RESOURCE,
    });
}
