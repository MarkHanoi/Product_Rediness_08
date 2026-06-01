// A.10.a (Phase A · Sprint 2) — Wind sample + WindRose aggregate (C21 §2.5).
//
// 16 directional sectors × 6 speed bins per [C21 §2.5]. The speed bins
// approximate the Beaufort scale (calm / light air / light breeze /
// gentle / moderate / fresh+ thresholds).

import { z } from 'zod';

/**
 * One raw wind observation. Used by the L2 wind-rose builder; the
 * built aggregate is what ClimateDataset stores.
 */
export const WindSampleSchema = z.object({
    /** Wind direction (degrees, 0=N clockwise). */
    windDirDeg: z.number().min(0).max(360),
    /** Wind speed (m/s). */
    windSpeedMps: z.number().min(0).max(90),
});
export type WindSample = z.infer<typeof WindSampleSchema>;

/**
 * One directional sector — 22.5° wide, indexed by `sectorDeg` centre.
 * Six speed bins (Beaufort-ish):
 *   bin 0: 0    – 1.5  m/s  (calm)
 *   bin 1: 1.5  – 3.3  m/s  (light air)
 *   bin 2: 3.3  – 5.4  m/s  (light breeze)
 *   bin 3: 5.4  – 7.9  m/s  (gentle breeze)
 *   bin 4: 7.9  – 10.7 m/s  (moderate)
 *   bin 5: > 10.7      m/s  (fresh+)
 */
export const WIND_ROSE_SECTOR_COUNT = 16;
export const WIND_ROSE_BIN_COUNT = 6;

export const WindRoseSectorSchema = z.object({
    /** Sector centre direction (0, 22.5, 45, …, 337.5). */
    sectorDeg: z.number().min(0).max(337.5),
    /** Frequency-of-occurrence in each speed bin (hours per year). */
    speedBinHours: z
        .tuple([
            z.number().min(0),
            z.number().min(0),
            z.number().min(0),
            z.number().min(0),
            z.number().min(0),
            z.number().min(0),
        ])
        .describe('6 speed bins (Beaufort-ish)'),
});
export type WindRoseSector = z.infer<typeof WindRoseSectorSchema>;

/**
 * The 16-sector wind rose for a site. Per [C21 §2.5] — built at
 * ingestion from `hourly[]` (EPW) or estimated from monthly normals
 * + prevailing-direction (NOAA fallback).
 */
export const WindRoseAggregateSchema = z.object({
    /** Exactly 16 sectors per WIND_ROSE_SECTOR_COUNT. Sectors MUST be
     *  ordered by sectorDeg ascending (0, 22.5, …, 337.5). */
    sectors: z
        .array(WindRoseSectorSchema)
        .length(WIND_ROSE_SECTOR_COUNT),
    /** Annual mean wind speed (m/s). */
    meanSpeedMps: z.number().min(0).max(90),
    /** 99-th percentile gust (m/s). Useful for facade pressure design. */
    p99SpeedMps: z.number().min(0).max(90),
});
export type WindRoseAggregate = z.infer<typeof WindRoseAggregateSchema>;
