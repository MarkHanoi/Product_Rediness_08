// A.10.a (Phase A · Sprint 2) — ClimateCacheKey (C21 §1.4 + §2.7).
//
// The (lat·100, lon·100, datasetVersion) tuple the ClimateStore uses
// for cache lookup. Coarsening lat/lon to 0.01° (~1.1 km) lets every
// site in a city share a single cache entry while preserving fidelity
// (EPW + NOAA datasets are typically constant across 10–100 km).

import { z } from 'zod';

/**
 * Per [C21 §2.7] — three fields, deep-equal compare. The cache uses
 * the canonical string `'${latE2}|${lonE2}|${datasetVersion}'` as the
 * hash-map key.
 */
export const ClimateCacheKeySchema = z.object({
    /** Round(lat * 100). Range matches WGS84 lat × 100 → [-9000, 9000]. */
    latE2: z.number().int().min(-9000).max(9000),
    /** Round(lon * 100). Range matches WGS84 lon × 100 → [-18000, 18000]. */
    lonE2: z.number().int().min(-18000).max(18000),
    /** SemVer or vintage string identifying the upstream dataset. */
    datasetVersion: z.string().min(1).max(120),
});
export type ClimateCacheKey = z.infer<typeof ClimateCacheKeySchema>;

/**
 * Canonical serialisation per [C21 §2.7]:
 * `'${latE2}|${lonE2}|${datasetVersion}'`. Pure helper.
 */
export function serialiseClimateCacheKey(key: ClimateCacheKey): string {
    return `${key.latE2}|${key.lonE2}|${key.datasetVersion}`;
}

/**
 * Round a raw lat/lon pair to the (latE2, lonE2) cache key axes
 * per [C21 §1.4]. Helper used by the L3 ClimateStore at lookup time.
 */
export function quantiseToCacheKey(
    lat: number,
    lon: number,
    datasetVersion: string,
): ClimateCacheKey {
    return {
        latE2: Math.round(lat * 100),
        lonE2: Math.round(lon * 100),
        datasetVersion,
    };
}
