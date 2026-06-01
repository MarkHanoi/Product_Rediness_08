// A.10.a (Phase A · Sprint 2) — Public surface for the L0 Climate substrate.
//
// Re-exported through the root barrel (`@pryzm/schemas`).
//
// Slice contents (A.10.a):
//   - types:               branded ClimateDatasetId + ClimateSource enum + MonthIndex
//   - climateProvenance:   provenance block (mandatory per §1.12)
//   - epwRecord:           one EPW TMY hour record
//   - noaaNormal:          one NOAA monthly normal
//   - windRose:            WindSample + WindRoseSector + WindRoseAggregate
//   - designTemperatures:  ASHRAE design temps + degree-day aggregates
//   - solarSample:         computed-only shape (NOT persisted per §1.3)
//   - climateCacheKey:     cache-key tuple + serialise/quantise helpers
//   - climateDataset:      the root ClimateDataset schema
//   - climateIngestionError: typed 6-arm discriminated union
//
// Deferred to later slices:
//   - A.10.b L2 EPW parser (in @pryzm/climate-host)
//   - A.10.c L2 SolarPathReader (NOAA algorithm — already implemented in
//            core-app-model/src/rendering/RealSunService.ts; new package
//            extracts the pure helpers)
//   - A.10.d L3 ClimateStore (in @pryzm/stores)
//   - A.10.e L3 climate.* commands (ingestEPW · refreshNOAA · resolveSite ·
//            invalidateCache · solarSample · windRose)
//   - A.10.f Climate UI (sun-path · wind-rose · temperature/humidity profile
//            in apps/editor)
//
// Strategic context: docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md.

export * from './types.js';
export * from './climateProvenance.js';
export * from './epwRecord.js';
export * from './noaaNormal.js';
export * from './windRose.js';
export * from './designTemperatures.js';
export * from './solarSample.js';
export * from './climateCacheKey.js';
export * from './climateDataset.js';
export * from './climateIngestionError.js';
