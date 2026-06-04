// A.10.e (Phase A · Sprint 2) — climate.* command payloads + result shapes.
//
// Pattern parallels site-commands (A.7.c): pure handler functions
// `(payload, deps) → ClimateCommandResult<Event>`. Discriminated-union
// result. Programmer errors throw; pack/invariant errors fail-soft.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §4
//   - docs/03-execution/plans/master-execution-tracker.md A.10.e

import { z } from 'zod';
import {
    SiteIdSchema,
    ClimateDatasetIdSchema,
    NOAANormalSchema,
    type ClimateCacheKey,
    type ClimateDataset,
    type ClimateIngestionError,
    type SolarSample,
    type WindRoseAggregate,
} from '@pryzm/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Payload schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `climate.ingestEPW` payload — per [C21 §4.1].
 * Caller supplies the EPW file as a string + the resolved site
 * coordinates (from C19 SiteModel). The handler parses + builds all
 * aggregates + ingests into the store.
 */
export const ClimateIngestEpwPayloadSchema = z.object({
    siteId: SiteIdSchema,
    /** Raw EPW file text (8 header lines + N hourly records). */
    rawEpwText: z.string().min(100),       // a minimal EPW is ~9 lines, >100 chars
    /** Defensive copy of the Site coordinates per [C21 §1.1]. */
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    elevationM: z.number().min(-500).max(9000),
    /** IANA timezone resolved from lat/lon at ingest time. */
    timezone: z.string().min(1).max(80),
    /** Provenance fields per [C21 §1.12]. */
    vendor: z.string().min(1).max(200),
    datasetVersion: z.string().min(1).max(120),
    license: z.string().min(1).max(200),
    filename: z.string().min(1).max(500).optional(),
    fileSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .optional(),
});
export type ClimateIngestEpwPayload = z.infer<
    typeof ClimateIngestEpwPayloadSchema
>;

/**
 * `climate.refreshNOAA` payload — per [C21 §4.1].
 * The actual HTTP fetch lives in apps/editor (L5 — has the auth +
 * networking substrate); this handler accepts the pre-fetched 12
 * monthly normals and builds the ClimateDataset.
 */
export const ClimateRefreshNoaaPayloadSchema = z.object({
    siteId: SiteIdSchema,
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    elevationM: z.number().min(-500).max(9000),
    timezone: z.string().min(1).max(80),
    /** The 12 monthly normals returned by the NOAA NCEI API. */
    monthlyNormals: z.array(NOAANormalSchema).length(12),
    vendor: z.string().min(1).max(200),
    datasetVersion: z.string().min(1).max(120),
    license: z.string().min(1).max(200),
});
export type ClimateRefreshNoaaPayload = z.infer<
    typeof ClimateRefreshNoaaPayloadSchema
>;

/**
 * `climate.ensureForLocation` payload — A.10.f.
 *
 * The HEADLESS ingestion entry point: given a Site + its resolved
 * coordinates, the handler resolves the 12 monthly normals via
 * `@pryzm/climate-host` (`resolveNormals` — guarded live fetch with a
 * bundled offline fallback + in-memory cache) and ingests a
 * ClimateDataset so `resolveSite` returns real data.
 *
 * Unlike `climate.refreshNOAA` (which requires the caller to already
 * have the 12 normals), this command OWNS the normals acquisition. The
 * optional live fetch is injected by the L5 adapter as `deps.fetchImpl`
 * — absent it, the bundled `fallback-defaults` tier is used.
 */
export const ClimateEnsureForLocationPayloadSchema = z.object({
    siteId: SiteIdSchema,
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    elevationM: z.number().min(-500).max(9000),
    timezone: z.string().min(1).max(80),
    /** Skip if a dataset already exists for this site. Default true. */
    skipIfPresent: z.boolean().optional(),
});
export type ClimateEnsureForLocationPayload = z.infer<
    typeof ClimateEnsureForLocationPayloadSchema
>;

/**
 * `climate.resolveSite` payload — per [C21 §4.1]. Read-only lookup.
 */
export const ClimateResolveSitePayloadSchema = z.object({
    siteId: SiteIdSchema,
});
export type ClimateResolveSitePayload = z.infer<
    typeof ClimateResolveSitePayloadSchema
>;

/**
 * `climate.invalidateCache` payload — per [C21 §4.1] + §1.5.
 * Marks the active entry stale; the archive retains it for audit.
 */
export const ClimateInvalidateCachePayloadSchema = z.object({
    siteId: SiteIdSchema,
});
export type ClimateInvalidateCachePayload = z.infer<
    typeof ClimateInvalidateCachePayloadSchema
>;

/**
 * `climate.solarSample` payload — per [C21 §4.1] + §1.3. Pure compute.
 */
export const ClimateSolarSamplePayloadSchema = z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    /** UTC ISO 8601 timestamp at the sample instant. */
    utcIso: z.string().datetime(),
});
export type ClimateSolarSamplePayload = z.infer<
    typeof ClimateSolarSamplePayloadSchema
>;

/**
 * `climate.windRose` payload — per [C21 §4.1]. Read-only lookup.
 */
export const ClimateWindRosePayloadSchema = z.object({
    siteId: SiteIdSchema,
});
export type ClimateWindRosePayload = z.infer<
    typeof ClimateWindRosePayloadSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Rejection reasons + result shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft rejection reasons for climate commands. Programmer errors
 * (missing deps, malformed payloads) throw; everything else returns
 * one of these.
 */
export type ClimateCommandRejection =
    | 'no-site'
    | 'no-climate-data'
    | 'epw-parse-failed'
    | 'invalid-payload';

export type ClimateCommandResult<TEvent extends { type: string }> =
    | { readonly ok: true; readonly event: TEvent }
    | {
          readonly ok: false;
          readonly reason: ClimateCommandRejection;
          readonly message: string;
          /** When the rejection came from the EPW parser, the typed
           *  error from `@pryzm/climate-host` is included so the UI
           *  can render a precise message. */
          readonly ingestionError?: ClimateIngestionError;
      };

// ─────────────────────────────────────────────────────────────────────────────
// Domain events per [C21 §4.2]
// ─────────────────────────────────────────────────────────────────────────────

export interface ClimateIngestedEvent {
    readonly type: 'climate.ingested';
    readonly siteId: string;
    readonly datasetId: ClimateDataset['id'];
    readonly source: 'epw' | 'noaa-normals' | 'fallback-defaults';
    readonly cacheKey: ClimateCacheKey;
    /** Set when the dataset already existed and ingest was skipped. */
    readonly skipped?: boolean;
}

export interface ClimateCacheInvalidatedEvent {
    readonly type: 'climate.cache-invalidated';
    readonly siteId: string;
}

export interface ClimateResolvedEvent {
    readonly type: 'climate.resolved';
    readonly siteId: string;
    readonly dataset: ClimateDataset | null;
}

export interface ClimateSolarSampledEvent {
    readonly type: 'climate.solar-sampled';
    readonly sample: SolarSample;
}

export interface ClimateWindRoseEvent {
    readonly type: 'climate.wind-rose';
    readonly siteId: string;
    readonly windRose: WindRoseAggregate | null;
}

// Re-export the L0 schema IDs so callers can branded-type their inputs
// without a separate import dance.
export { ClimateDatasetIdSchema };
