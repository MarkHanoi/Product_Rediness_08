// A.10.e (Phase A · Sprint 2) — Public surface for `climate.*` command
// handlers.
//
// Pure functions: `(payload, store) → ClimateCommandResult<Event>`.
// The L5 adapter (command-bus wiring + OTel span + L5 file-read +
// HTTP fetch for NOAA) lives elsewhere and composes against these.
//
// Slice contents (A.10.e — full 6-command set per C21 §4.1):
//   - climateIngestEpw         §4.1 EPW file → ClimateDataset ingest
//   - climateRefreshNoaa       §4.1 NOAA normals → ClimateDataset ingest
//   - climateResolveSite       §4.1 siteRef → ClimateDataset | null
//   - climateInvalidateCache   §4.1 + §1.5 mark stale, archive retains
//   - climateSolarSample       §4.1 + §1.3 pure (lat, lon, utcIso)
//   - climateWindRose          §4.1 read-only WindRoseAggregate
//
// Strategic context: docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §4.

export { climateIngestEpw } from './climateIngestEpw.js';
export { climateRefreshNoaa } from './climateRefreshNoaa.js';
export {
    climateEnsureForLocation,
    type ClimateEnsureDeps,
} from './climateEnsureForLocation.js';
export { climateResolveSite } from './climateResolveSite.js';
export { climateInvalidateCache } from './climateInvalidateCache.js';
export { climateSolarSample } from './climateSolarSample.js';
export { climateWindRose } from './climateWindRose.js';

export {
    ClimateIngestEpwPayloadSchema,
    ClimateRefreshNoaaPayloadSchema,
    ClimateEnsureForLocationPayloadSchema,
    type ClimateEnsureForLocationPayload,
    ClimateResolveSitePayloadSchema,
    ClimateInvalidateCachePayloadSchema,
    ClimateSolarSamplePayloadSchema,
    ClimateWindRosePayloadSchema,
    type ClimateIngestEpwPayload,
    type ClimateRefreshNoaaPayload,
    type ClimateResolveSitePayload,
    type ClimateInvalidateCachePayload,
    type ClimateSolarSamplePayload,
    type ClimateWindRosePayload,
    type ClimateCommandResult,
    type ClimateCommandRejection,
    type ClimateIngestedEvent,
    type ClimateCacheInvalidatedEvent,
    type ClimateResolvedEvent,
    type ClimateSolarSampledEvent,
    type ClimateWindRoseEvent,
} from './types.js';
