// A.10.a (Phase A · Sprint 2) — Climate substrate branded ids + shared
// primitives.
//
// L0-pure: Zod-only. No I/O, no THREE, no DOM.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.4 + §2.1
//   - docs/03-execution/plans/master-execution-tracker.md A.10

import { z } from 'zod';

/**
 * Branded ClimateDatasetId — opaque string brand. Per [C21 §2.1] the
 * format is `climate:<ulid>` (the ClimateStore mints it at ingestion).
 */
export type ClimateDatasetId = string & {
    readonly __brand: 'ClimateDatasetId';
};

export const CLIMATE_DATASET_ID_PATTERN = /^climate:[A-Za-z0-9]{16,32}$/;
export const ClimateDatasetIdSchema = z
    .string()
    .regex(
        CLIMATE_DATASET_ID_PATTERN,
        'ClimateDatasetId must match `climate:<ulid>`',
    );

/**
 * Source tier per [C21 §1.2] — EPW is authoritative, NOAA fallback,
 * fallback-defaults the lowest tier (used only for ungeocoded concept
 * design). Workflows that require real climate refuse to run against
 * `fallback-defaults` and prompt the user to ingest EPW or refresh NOAA.
 */
export const ClimateSourceSchema = z.enum([
    'epw',
    'noaa-normals',
    'fallback-defaults',
]);
export type ClimateSource = z.infer<typeof ClimateSourceSchema>;

/**
 * Month index 1..12 (Jan = 1, Dec = 12). Used by NOAANormal.
 */
export const MonthIndexSchema = z
    .number()
    .int()
    .min(1)
    .max(12);
export type MonthIndex = z.infer<typeof MonthIndexSchema>;
