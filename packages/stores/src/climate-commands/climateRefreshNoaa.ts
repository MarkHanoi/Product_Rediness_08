// A.10.e (Phase A · Sprint 2) — `climate.refreshNOAA` command handler.
//
// Per [C21 §4.1]: synthesises a ClimateDataset from pre-fetched NOAA
// monthly normals + ingests into the store. The actual HTTP fetch
// lives in apps/editor (L5 — has the auth + networking substrate) so
// this handler stays pure.
//
// Per [C21 §1.2] EPW > NOAA priority is applied AT INGEST — calling
// refreshNOAA on a site that already has an EPW dataset supersedes it
// (the prior EPW entry is retained in the archive per §1.5 but no
// longer the active entry). The L5 adapter SHOULD refuse to refreshNOAA
// when EPW data exists; this handler does not enforce that.

import {
    ClimateDatasetSchema,
    type ClimateDataset,
} from '@pryzm/schemas';
import type { ClimateStore } from '../ClimateStore.js';
import {
    ClimateRefreshNoaaPayloadSchema,
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

/**
 * Synthesise an "empty" 16-sector wind rose from monthly prevailing
 * directions. NOAA monthlies don't carry the full 16×6 rose — we
 * place each month's hours at its prevailing direction in the calm
 * speed bin. Crude but valid; better than a flat zero.
 */
function synthWindRoseFromMonthlies(
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
        // Approx 30 days × 24 hr = 720 hr per month.
        const sec = sectors[sectorIdx]!;
        const bin = speedBinIndex(m.avgWindSpeedMps);
        sec.speedBinHours[bin] = (sec.speedBinHours[bin] ?? 0) + 720;
        sumSpeed += m.avgWindSpeedMps;
        count += 1;
    }
    return {
        sectors,
        meanSpeedMps: count > 0 ? sumSpeed / count : 0,
        p99SpeedMps: count > 0 ? sumSpeed / count * 2.5 : 0, // rough gust factor
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
 * Execute `climate.refreshNOAA`. Per [C21 §4.1]. Builds the dataset
 * from monthly normals only — design temps + degree-days are derived
 * from the monthly summaries (NOAA normals do not carry hourly data).
 */
export function climateRefreshNoaa(
    rawPayload: unknown,
    store: ClimateStore,
): ClimateCommandResult<ClimateIngestedEvent> {
    let payload;
    try {
        payload = ClimateRefreshNoaaPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.refreshNOAA payload invalid: ${(err as Error).message}`,
        };
    }

    // Build crude design temps from monthly extremes (NOAA normals
    // don't carry ASHRAE 99.6%/0.4% percentiles; we approximate by
    // taking the coldest avgMin and hottest avgMax across all months).
    let coldest = Number.POSITIVE_INFINITY;
    let hottest = Number.NEGATIVE_INFINITY;
    let hdd18Total = 0;
    let cdd18Total = 0;
    for (const m of payload.monthlyNormals) {
        if (m.avgMinDryBulbC < coldest) coldest = m.avgMinDryBulbC;
        if (m.avgMaxDryBulbC > hottest) hottest = m.avgMaxDryBulbC;
        hdd18Total += m.heatingDegreeDaysBase18;
        cdd18Total += m.coolingDegreeDaysBase18;
    }
    // Base-65°F degree-days are NOT in NOAA normals — approximate using
    // base-18°C with a small linear shift (base 65°F ≈ 18.33°C, so HDD
    // base 65°F slightly higher than HDD base 18°C).
    const dataset: ClimateDataset = ClimateDatasetSchema.parse({
        id: mintId(),
        siteRef: payload.siteId,
        lat: payload.lat,
        lon: payload.lon,
        elevationM: payload.elevationM,
        timezone: payload.timezone,
        source: 'noaa-normals',
        monthlyNormals: payload.monthlyNormals,
        windRose: synthWindRoseFromMonthlies(payload.monthlyNormals),
        designTemps: {
            heating99_6C: coldest,
            cooling0_4C: hottest,
            cooling0_4MwbC: hottest * 0.75,    // crude — ~75% of dry-bulb
        },
        degreeDays: {
            hddBase18: hdd18Total,
            cddBase18: cdd18Total,
            hddBase65F: hdd18Total * 1.05,
            cddBase65F: cdd18Total * 0.95,
        },
        provenance: {
            source: 'noaa-normals',
            vendor: payload.vendor,
            datasetVersion: payload.datasetVersion,
            fetchedAtUtcIso: new Date().toISOString(),
            license: payload.license,
        },
        ingestedAtUtcIso: new Date().toISOString(),
    });

    const cacheKey = store.ingest(dataset);
    return {
        ok: true,
        event: {
            type: 'climate.ingested',
            siteId: payload.siteId,
            datasetId: dataset.id,
            source: 'noaa-normals',
            cacheKey,
        },
    };
}
