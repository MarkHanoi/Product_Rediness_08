// A.10.e (Phase A · Sprint 2) — `climate.ingestEPW` command handler.
//
// Per [C21 §4.1]: parses an EPW file string + builds all aggregates
// (monthlyNormals · windRose · designTemps · degreeDays) + ingests the
// resulting ClimateDataset into the ClimateStore.
//
// Pure handler — no I/O. The L5 adapter (apps/editor) reads the file
// from disk / upload and passes the text in. The EPW parser + builders
// come from @pryzm/climate-host (L2 pure).

import {
    parseEpwHeader,
    parseEpwHourlyRecords,
    buildMonthlyNormals,
    buildWindRose,
    buildDesignTemperatures,
    buildDegreeDays,
} from '@pryzm/climate-host';
import {
    ClimateDatasetSchema,
    type ClimateDataset,
} from '@pryzm/schemas';
import type { ClimateStore } from '../ClimateStore.js';
import {
    ClimateIngestEpwPayloadSchema,
    type ClimateCommandResult,
    type ClimateIngestedEvent,
} from './types.js';

let ingestCounter = 0;

/** Generate a deterministic-ish ClimateDatasetId. Per [C21 §2.1] the
 *  format is `climate:<ulid>` — we use a monotonic counter + timestamp
 *  for predictable test output. Real ULIDs would be the canonical
 *  production implementation; this is sufficient for the dataset ID's
 *  job (uniqueness within the runtime). */
function mintDatasetId(): string {
    ingestCounter += 1;
    // Pad to a 16+ char ulid-like suffix (the L0 schema requires ≥16
    // chars after `climate:`).
    const ms = Date.now().toString(36).toUpperCase().padStart(10, '0');
    const seq = ingestCounter.toString(36).toUpperCase().padStart(6, '0');
    return `climate:${ms}${seq}`;
}

/**
 * Execute `climate.ingestEPW`. Per [C21 §4.1].
 *
 *   - Validates payload (Zod).
 *   - Parses the EPW header + hourly records via @pryzm/climate-host.
 *     Returns `epw-parse-failed` with the typed ingestion error on any
 *     parse failure.
 *   - Builds the 4 aggregates from the records.
 *   - Synthesises the ClimateDataset.
 *   - Calls `store.ingest(dataset)` — the active entry per-site is
 *     replaced; prior entry retained in the archive per §1.5.
 *   - Returns the `climate.ingested` event with the cache key.
 */
export function climateIngestEpw(
    rawPayload: unknown,
    store: ClimateStore,
): ClimateCommandResult<ClimateIngestedEvent> {
    let payload;
    try {
        payload = ClimateIngestEpwPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.ingestEPW payload invalid: ${(err as Error).message}`,
        };
    }

    // ── Stage 1 — parse header ──────────────────────────────────────────
    const headerResult = parseEpwHeader(payload.rawEpwText);
    if (!headerResult.ok) {
        return {
            ok: false,
            reason: 'epw-parse-failed',
            message: `EPW header parse failed`,
            ingestionError: headerResult.error,
        };
    }

    // ── Stage 2 — parse hourly records ──────────────────────────────────
    const hourlyResult = parseEpwHourlyRecords(
        payload.rawEpwText,
        headerResult.header,
        headerResult.nextLineIndex,
    );
    if (!hourlyResult.ok) {
        return {
            ok: false,
            reason: 'epw-parse-failed',
            message: `EPW hourly-record parse failed`,
            ingestionError: hourlyResult.error,
        };
    }
    const records = hourlyResult.records;

    // ── Stage 3 — build aggregates ──────────────────────────────────────
    const monthlyNormals = buildMonthlyNormals(records);
    const windRose = buildWindRose(records);
    const designTemps = buildDesignTemperatures(records);
    const degreeDays = buildDegreeDays(records);

    // ── Stage 4 — synthesise the ClimateDataset ─────────────────────────
    const dataset: ClimateDataset = ClimateDatasetSchema.parse({
        id: mintDatasetId(),
        siteRef: payload.siteId,
        lat: payload.lat,
        lon: payload.lon,
        elevationM: payload.elevationM,
        timezone: payload.timezone,
        source: 'epw',
        hourly: records,
        monthlyNormals,
        windRose,
        designTemps,
        degreeDays,
        provenance: {
            source: 'epw',
            vendor: payload.vendor,
            datasetVersion: payload.datasetVersion,
            fetchedAtUtcIso: new Date().toISOString(),
            license: payload.license,
            ...(payload.filename ? { filename: payload.filename } : {}),
            ...(payload.fileSha256 ? { fileSha256: payload.fileSha256 } : {}),
        },
        ingestedAtUtcIso: new Date().toISOString(),
    });

    // ── Stage 5 — commit + emit ─────────────────────────────────────────
    const cacheKey = store.ingest(dataset);

    return {
        ok: true,
        event: {
            type: 'climate.ingested',
            siteId: payload.siteId,
            datasetId: dataset.id,
            source: 'epw',
            cacheKey,
        },
    };
}
