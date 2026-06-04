// A.10.f (Phase A · Sprint 2) — `climate.ensureForLocation` command.
//
// The HEADLESS ingestion path A.10.c–.f delivers: given a Site + its
// resolved (lat, lon), make `ClimateStore.resolveSite` return a real
// `ClimateDataset` so the FORMA.5 climate card + ClimatePanel show real
// values instead of "no data".
//
// Pipeline:
//   1. Resolve the 12 monthly normals via `@pryzm/climate-host`
//      `resolveNormals(lat, lon, {fetchImpl?})`:
//        - a wired live NOAA fetch (injected by the L5 adapter) wins;
//        - otherwise the BUNDLED offline templates are used — the
//          `fallback-defaults` tier per [C21 §1.2];
//        - results are cached by quantised lat/lon (instant on repeat).
//      This step NEVER throws — bundled is always available [C21 §7.4].
//   2. Synthesise the full ClimateDataset (wind rose from prevailing
//      directions, design temps + degree-days from the monthly extremes
//      — same derivations as `climateRefreshNoaa`).
//   3. `store.ingest(dataset)` so `resolveSite(siteId)` returns it.
//
// The dataset `source` is honest: `noaa-normals` when the live fetch
// succeeded, `fallback-defaults` when the bundled templates were used —
// so workflows that require measured climate can still refuse the
// fallback tier per [C21 §1.2].
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.2 + §4.1
//   - docs/03-execution/plans/master-execution-tracker.md A.10.c–.f

import {
    resolveNormals,
    type NoaaFetchImpl,
    type ResolvedNormals,
} from '@pryzm/climate-host';
import {
    ClimateDatasetSchema,
    quantiseToCacheKey,
    type ClimateDataset,
} from '@pryzm/schemas';
import type { ClimateStore } from '../ClimateStore.js';
import {
    ClimateEnsureForLocationPayloadSchema,
    type ClimateCommandResult,
    type ClimateIngestedEvent,
} from './types.js';

let counter = 0;
function mintId(): string {
    counter += 1;
    const ms = Date.now().toString(36).toUpperCase().padStart(10, '0');
    const seq = counter.toString(36).toUpperCase().padStart(6, '0');
    return `climate:${ms}${seq}`;
}

/** Dependencies for `climateEnsureForLocation`. */
export interface ClimateEnsureDeps {
    readonly store: ClimateStore;
    /** Optional live NOAA fetch (injected by the L5 adapter). Absent →
     *  bundled offline default. */
    readonly fetchImpl?: NoaaFetchImpl;
    /** Force a fresh normals resolve (skip the climate-host cache). */
    readonly bypassCache?: boolean;
}

/** Build a 16-sector wind rose from per-month prevailing directions.
 *  Mirrors `climateRefreshNoaa`'s synth — NOAA / bundled monthlies carry
 *  only a prevailing direction, not the full 16×6 rose. */
function synthWindRose(
    monthlyNormals: ClimateDataset['monthlyNormals'],
): ClimateDataset['windRose'] {
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
    return {
        sectors,
        meanSpeedMps: count > 0 ? sumSpeed / count : 0,
        p99SpeedMps: count > 0 ? (sumSpeed / count) * 2.5 : 0,
    };
}

function speedBinIndex(mps: number): number {
    const upper = [1.5, 3.3, 5.4, 7.9, 10.7];
    for (let i = 0; i < upper.length; i++) {
        if (mps < upper[i]!) return i;
    }
    return 5;
}

/**
 * Execute `climate.ensureForLocation`. ASYNC (the normals resolve may
 * await a live fetch), but always settles — the bundled tier guarantees
 * a result.
 */
export async function climateEnsureForLocation(
    rawPayload: unknown,
    deps: ClimateEnsureDeps,
): Promise<ClimateCommandResult<ClimateIngestedEvent>> {
    let payload;
    try {
        payload = ClimateEnsureForLocationPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.ensureForLocation payload invalid: ${(err as Error).message}`,
        };
    }

    const { store } = deps;
    const skipIfPresent = payload.skipIfPresent ?? true;

    // Short-circuit when a dataset already exists for this site.
    if (skipIfPresent) {
        const existing = store.resolveSite(payload.siteId as Parameters<typeof store.resolveSite>[0]);
        if (existing) {
            return {
                ok: true,
                event: {
                    type: 'climate.ingested',
                    siteId: payload.siteId,
                    datasetId: existing.id,
                    source: existing.source,
                    cacheKey: quantiseToCacheKey(
                        existing.lat,
                        existing.lon,
                        existing.provenance.datasetVersion,
                    ),
                    skipped: true,
                },
            };
        }
    }

    // ── Stage 1 — resolve normals (guarded fetch + bundled fallback) ────
    const normals: ResolvedNormals = await resolveNormals(
        payload.lat,
        payload.lon,
        { fetchImpl: deps.fetchImpl, bypassCache: deps.bypassCache },
    );

    // ── Stage 2 — derive design temps + degree-days from the monthlies ──
    let coldest = Number.POSITIVE_INFINITY;
    let hottest = Number.NEGATIVE_INFINITY;
    let hdd18Total = 0;
    let cdd18Total = 0;
    for (const m of normals.monthlyNormals) {
        if (m.avgMinDryBulbC < coldest) coldest = m.avgMinDryBulbC;
        if (m.avgMaxDryBulbC > hottest) hottest = m.avgMaxDryBulbC;
        hdd18Total += m.heatingDegreeDaysBase18;
        cdd18Total += m.coolingDegreeDaysBase18;
    }

    const source: ClimateDataset['source'] =
        normals.tier === 'noaa-normals' ? 'noaa-normals' : 'fallback-defaults';

    // ── Stage 3 — synthesise + validate the ClimateDataset ──────────────
    const dataset: ClimateDataset = ClimateDatasetSchema.parse({
        id: mintId(),
        siteRef: payload.siteId,
        lat: payload.lat,
        lon: payload.lon,
        elevationM: payload.elevationM,
        timezone: payload.timezone,
        source,
        monthlyNormals: normals.monthlyNormals,
        windRose: synthWindRose([...normals.monthlyNormals]),
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
            source,
            vendor: normals.vendor,
            datasetVersion: normals.datasetVersion,
            fetchedAtUtcIso: new Date().toISOString(),
            license: normals.license,
            notes:
                normals.tier === 'bundled'
                    ? 'Bundled offline climate-zone template (PRYZM-builtin). ' +
                      'Replace with EPW or a live NOAA refresh for measured climate.'
                    : undefined,
        },
        ingestedAtUtcIso: new Date().toISOString(),
    });

    // ── Stage 4 — commit + emit ─────────────────────────────────────────
    const cacheKey = store.ingest(dataset);
    return {
        ok: true,
        event: {
            type: 'climate.ingested',
            siteId: payload.siteId,
            datasetId: dataset.id,
            source,
            cacheKey,
        },
    };
}
