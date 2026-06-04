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

// ── Bundled monthly normals (A.10.c — offline default) ──────────────────
// Pure lat/lon → 12 NOAANormal from bundled climate-zone templates. The
// `fallback-defaults` data source per [C21 §1.2] when no EPW + no live
// NOAA fetch are available (headless / offline / no key).
export {
    bundledMonthlyNormals,
    nearestZoneTemplate,
    BUNDLED_NORMALS_VERSION,
    type BundledNormalsResult,
} from './bundledNormals.js';

// ── NOAA normals reader + cache (A.10.c / A.10.d) ───────────────────────
// `resolveNormals(lat, lon, {fetchImpl?})` — prefers a wired live fetch,
// falls back to bundled, caches by quantised lat/lon. Headless-safe: no
// network I/O unless the caller injects a `fetchImpl`.
export {
    resolveNormals,
    clearNormalsCache,
    normalsCacheSize,
    type NormalsTier,
    type ResolvedNormals,
    type ResolveNormalsOptions,
    type NoaaFetchImpl,
    type LiveNormalsResult,
} from './noaaNormalsReader.js';

// ── Live KEYLESS normals adapter (CLIMATE-LIVE-DATA) ─────────────────────
// Open-Meteo (primary, temp + wind) + PVGIS (secondary, GHI) → 12 NOAANormal.
// PURE: caller injects a `fetch`-like; returns null on any failure (→ the
// reader's bundled fallback). The L5 editor wires the browser `fetch`.
export {
    fetchLiveNormals,
    mapOpenMeteoToNormals,
    mapPvgisMonthlyGhi,
    buildOpenMeteoUrl,
    buildPvgisUrl,
    OPEN_METEO_CLIMATE_ENDPOINT,
    PVGIS_MRCALC_ENDPOINT,
    OPEN_METEO_ORIGIN,
    PVGIS_ORIGIN,
    type FetchLike,
    type LiveNormalsAdapterOptions,
} from './liveNormalsAdapter.js';
