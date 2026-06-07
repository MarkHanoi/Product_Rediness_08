// A.21.D33(f) / A.21.D27 — Deterministic OFFLINE ClimateDataset builder.
//
// The single, tested, lat/lon-driven offline climatology that GUARANTEES a
// complete, schema-valid `ClimateDataset` whenever a site location exists —
// WITHOUT any network call, API key, or EPW upload. This is the production
// fallback for the same class of failure as the AI-relay 401 → demo fallback:
// prod has no NOAA/Open-Meteo access, so the Climate & Site Intelligence panel
// + the 3D Wind/Heat overlays must still get a real dataset to render instead
// of sitting on "NO DATASET".
//
// It composes the existing PURE pieces:
//   - `bundledMonthlyNormals(lat, lon)` → 12 lat-driven NOAANormal (offline).
//   - a 16-sector wind rose synthesised from those monthlies' prevailing
//     direction + mean speed (NOAA/bundled monthlies carry only a prevailing
//     direction, not a full 16×6 rose — same synth the L3 store command uses).
//   - ASHRAE-ish design temps + degree-days derived from the monthly extremes.
//
// Tagged `fallback-defaults` so workflows that demand measured climate can
// still refuse the tier per [C21 §1.2], and so the UI can badge it "estimated".
//
// DETERMINISTIC: same inputs (incl. `nowIso`) → byte-identical output. The two
// schema-required timestamps are injectable so tests are reproducible; when the
// caller omits `nowIso` the current time is used (honest provenance in prod).
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.2 + §2.1 + §7.4
//   - packages/climate-host/src/bundledNormals.ts (the lat-driven normals)
//   - packages/stores/src/climate-commands/climateEnsureForLocation.ts (consumer)

import {
    ClimateDatasetSchema,
    type ClimateDataset,
    type NOAANormal,
    type WindRoseAggregate,
} from '@pryzm/schemas';
import {
    bundledMonthlyNormals,
    BUNDLED_NORMALS_VERSION,
} from './bundledNormals.js';

/** Inputs for `buildFallbackClimateDataset`. */
export interface FallbackClimateParams {
    /** Stable dataset id (caller-minted so the store can key/cache it). */
    readonly id: string;
    /** The Site this dataset is anchored to (per [C21 §1.1]). */
    readonly siteRef: string;
    readonly lat: number;
    readonly lon: number;
    /** Site elevation (m ASL). Defaults to 0 when unknown. */
    readonly elevationM?: number;
    /** IANA-ish timezone string for provenance. Defaults to 'UTC'. */
    readonly timezone?: string;
    /**
     * UTC ISO timestamp stamped on `fetchedAtUtcIso` + `ingestedAtUtcIso`.
     * Injectable so tests are deterministic; defaults to `now`.
     */
    readonly nowIso?: string;
}

/** Beaufort-ish speed-bin upper bounds (m/s); index 5 is the open-ended gust bin. */
const SPEED_BIN_UPPER_MPS = [1.5, 3.3, 5.4, 7.9, 10.7];

function speedBinIndex(mps: number): number {
    for (let i = 0; i < SPEED_BIN_UPPER_MPS.length; i += 1) {
        if (mps < SPEED_BIN_UPPER_MPS[i]!) return i;
    }
    return 5;
}

/**
 * Synthesise a 16-sector wind rose from per-month prevailing directions +
 * mean speeds. Each month contributes ~720 hours (≈30 days) to its prevailing
 * sector's speed bin, so the rose is ALWAYS non-empty for a non-zero-wind
 * climatology (this is what makes the wind rose + 3D wind streaks render).
 *
 * Exported because it is the single offline rose-from-monthlies synth — the L3
 * store command reuses it so there is exactly one offline source of truth.
 */
export function synthWindRoseFromNormals(
    monthlyNormals: readonly NOAANormal[],
): WindRoseAggregate {
    const sectors = Array.from({ length: 16 }, (_, i) => ({
        sectorDeg: i * 22.5,
        speedBinHours: [0, 0, 0, 0, 0, 0] as [
            number, number, number, number, number, number,
        ],
    }));
    let sumSpeed = 0;
    let count = 0;
    for (const m of monthlyNormals) {
        const sectorIdx =
            Math.floor(((m.prevailingWindDirDeg + 11.25) % 360) / 22.5) % 16;
        const sec = sectors[sectorIdx]!;
        const bin = speedBinIndex(m.avgWindSpeedMps);
        sec.speedBinHours[bin] = (sec.speedBinHours[bin] ?? 0) + 720; // ~30 days × 24 h
        sumSpeed += m.avgWindSpeedMps;
        count += 1;
    }
    const mean = count > 0 ? sumSpeed / count : 0;
    return {
        sectors,
        meanSpeedMps: mean,
        // Coarse gust estimate (no hourly data offline). 2.5× the mean is a
        // reasonable temperate-climate ratio; capped to the schema's 90 m/s.
        p99SpeedMps: Math.min(90, mean * 2.5),
    };
}

/**
 * Build a complete, schema-valid OFFLINE `ClimateDataset` for a site from its
 * latitude/longitude alone. PURE + deterministic (given `nowIso`). NEVER throws
 * for in-range coordinates — the bundled climatology is always available
 * (the `fallback-defaults` guarantee per [C21 §7.4]).
 *
 * The result is `source: 'fallback-defaults'` so an imported EPW or a live NOAA
 * refresh still WINS at the store's resolve-priority (EPW > NOAA > fallback).
 */
export function buildFallbackClimateDataset(
    params: FallbackClimateParams,
): ClimateDataset {
    const { id, siteRef, lat, lon } = params;
    const elevationM = params.elevationM ?? 0;
    const timezone = params.timezone ?? 'UTC';
    const nowIso = params.nowIso ?? new Date().toISOString();

    const { monthlyNormals } = bundledMonthlyNormals(lat, lon);

    // Design temps + degree-days from the monthly extremes (mirrors the
    // measured-normals derivation so the offline + live shapes match).
    let coldest = Number.POSITIVE_INFINITY;
    let hottest = Number.NEGATIVE_INFINITY;
    let hdd18Total = 0;
    let cdd18Total = 0;
    for (const m of monthlyNormals) {
        if (m.avgMinDryBulbC < coldest) coldest = m.avgMinDryBulbC;
        if (m.avgMaxDryBulbC > hottest) hottest = m.avgMaxDryBulbC;
        hdd18Total += m.heatingDegreeDaysBase18;
        cdd18Total += m.coolingDegreeDaysBase18;
    }

    const dataset = {
        id,
        siteRef,
        lat,
        lon,
        elevationM,
        timezone,
        source: 'fallback-defaults' as const,
        monthlyNormals,
        windRose: synthWindRoseFromNormals(monthlyNormals),
        designTemps: {
            heating99_6C: coldest,
            cooling0_4C: hottest,
            cooling0_4MwbC: hottest * 0.75,
        },
        degreeDays: {
            hddBase18: hdd18Total,
            cddBase18: cdd18Total,
            hddBase65F: hdd18Total * 1.05,
            cddBase65F: cdd18Total * 0.95,
        },
        provenance: {
            source: 'fallback-defaults' as const,
            vendor: 'PRYZM-builtin',
            datasetVersion: BUNDLED_NORMALS_VERSION,
            fetchedAtUtcIso: nowIso,
            license: 'CC0-1.0',
            notes:
                'Estimated offline climatology from a bundled latitude-band ' +
                'template (no network / EPW). Import an EPW or refresh live ' +
                'normals for measured climate.',
        },
        ingestedAtUtcIso: nowIso,
    };

    // Validate so any drift from the L0 schema fails loudly in tests/CI rather
    // than producing a subtly-invalid dataset the UI silently can't render.
    return ClimateDatasetSchema.parse(dataset);
}
