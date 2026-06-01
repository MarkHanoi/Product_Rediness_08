// A.10.b (Phase A · Sprint 2) — @pryzm/climate-host public surface.
//
// L2 pure climate-data adapters. Zero I/O; caller supplies the EPW
// file as a string. The L3 ClimateStore (A.10.d) composes these.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §2 + §4
//   - docs/03-execution/plans/master-execution-tracker.md A.10

// ── EPW header parser (LOCATION + DATA PERIODS) ─────────────────────────
export {
    parseEpwHeader,
    type EpwHeader,
    type EpwHeaderParseResult,
} from './epwHeader.js';

// ── EPW hourly record parser ────────────────────────────────────────────
export {
    parseEpwHourlyRecords,
    type EpwHourlyParseResult,
} from './epwParser.js';

// ── Aggregate builders ──────────────────────────────────────────────────
export { buildMonthlyNormals } from './monthlyNormalsBuilder.js';
export { buildWindRose } from './windRoseBuilder.js';
export { buildDesignTemperatures } from './designTempsBuilder.js';
export { buildDegreeDays } from './degreeDaysBuilder.js';

// ── Solar-position calculator (A.10.c) ──────────────────────────────────
// Pure NOAA algorithm — `solarSample(lat, lon, utcIso) → SolarSample`.
// Per [C21 §1.3] solar samples are computed at query time, never stored.
export { solarSample, toJulianDay } from './solarPath.js';
