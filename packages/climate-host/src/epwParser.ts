// A.10.b (Phase A · Sprint 2) — EPW hourly-record parser.
//
// Each post-header line is one comma-separated record with ~35 fields
// per the EPW TMY3 spec. We map the subset PRYZM uses (per the L0
// EPWRecord schema, A.10.a) into validated SI units and a UTC ISO
// timestamp.
//
// Pure: caller supplies the text; we return a typed result. No I/O.
//
// EPW field index (1-based as per the DOE EPW spec):
//   1  year
//   2  month        (1..12)
//   3  day          (1..31)
//   4  hour         (1..24, where 24 means "end of day 24:00")
//   5  minute
//   6  data-source flags  (skipped)
//   7  dry-bulb temperature (°C)
//   8  dew-point temperature (°C)
//   9  relative humidity (%)
//  10  station pressure (Pa)
//  11  extraterrestrial horizontal radiation (Wh/m²) — skipped
//  12  extraterrestrial direct normal radiation (Wh/m²) — skipped
//  13  horizontal IR radiation intensity (Wh/m²) — skipped
//  14  global horizontal radiation (Wh/m²) → globalHorizontalWm2
//  15  direct normal radiation (Wh/m²)    → directNormalWm2
//  16  diffuse horizontal radiation (Wh/m²) → diffuseHorizontalWm2
//  17-20 illuminance / luminance         — skipped
//  21  wind direction (°)
//  22  wind speed (m/s)
//  23  total sky cover (tenths)
//  24  opaque sky cover (tenths)
//  25  visibility (km)
//  26-33 other                            — skipped
//  34  liquid precipitation depth (mm)    → precipMm

import type { EPWRecord, ClimateIngestionError } from '@pryzm/schemas';
import type { EpwHeader } from './epwHeader.js';

export type EpwHourlyParseResult =
    | { readonly ok: true; readonly records: readonly EPWRecord[] }
    | { readonly ok: false; readonly error: ClimateIngestionError };

/**
 * Parse the hourly-data block of an EPW file. `lines` is the FULL set
 * of file lines (including the header); `nextLineIndex` is the first
 * data-line index (returned by `parseEpwHeader`). `header` supplies the
 * GMT offset for the local-hour → UTC conversion.
 *
 * Returns at most 8784 records (leap-year max). On any per-record
 * failure, returns a typed `epw-parse-failed` error carrying the
 * absolute line number (1-based).
 */
export function parseEpwHourlyRecords(
    rawText: string,
    header: EpwHeader,
    nextLineIndex: number,
): EpwHourlyParseResult {
    const lines = rawText.split(/\r?\n/);
    const records: EPWRecord[] = [];
    const tzOffsetHours = header.location.tzGmtOffsetHours;

    for (let i = nextLineIndex; i < lines.length; i++) {
        const raw = lines[i];
        if (raw === undefined) continue;
        // EPW files often have a trailing newline → empty last line. Skip.
        if (raw.trim().length === 0) continue;
        const lineNumber = i + 1;
        const parts = raw.split(',');
        if (parts.length < 35) {
            return {
                ok: false,
                error: {
                    kind: 'epw-parse-failed',
                    line: lineNumber,
                    message: `Expected ≥ 35 comma-separated fields; got ${parts.length}`,
                },
            };
        }

        const result = parseOneRecord(
            parts,
            lineNumber,
            records.length,
            tzOffsetHours,
        );
        if (!result.ok) return result;
        records.push(result.record);
        if (records.length > 8784) {
            return {
                ok: false,
                error: {
                    kind: 'epw-parse-failed',
                    line: lineNumber,
                    message: `Too many hourly records (> 8784); not a valid TMY file`,
                },
            };
        }
    }

    return { ok: true, records };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: parse one hourly line.
// ─────────────────────────────────────────────────────────────────────────────

function parseOneRecord(
    parts: readonly string[],
    line: number,
    indexZeroBased: number,
    tzGmtOffsetHours: number,
): { ok: true; record: EPWRecord } | { ok: false; error: ClimateIngestionError } {
    const year = parseNum(parts[0], line, 'year');
    if (typeof year !== 'number') return { ok: false, error: year };
    const month = parseNum(parts[1], line, 'month');
    if (typeof month !== 'number') return { ok: false, error: month };
    const day = parseNum(parts[2], line, 'day');
    if (typeof day !== 'number') return { ok: false, error: day };
    const hour = parseNum(parts[3], line, 'hour');
    if (typeof hour !== 'number') return { ok: false, error: hour };

    if (month < 1 || month > 12) {
        return errLine(line, `month out of range: ${month}`);
    }
    if (day < 1 || day > 31) {
        return errLine(line, `day out of range: ${day}`);
    }
    if (hour < 1 || hour > 24) {
        return errLine(line, `hour out of range: ${hour} (EPW uses 1..24)`);
    }

    // EPW hour `H` means END of that hour. Hour 24 of day D = midnight
    // of day D+1. UTC timestamp uses START-of-hour convention to match
    // the rest of PRYZM; we shift by (hour - 1) to get the hour start.
    const utcMs = computeUtcStartOfHour(
        year,
        month,
        day,
        hour - 1,
        tzGmtOffsetHours,
    );
    if (utcMs === null) {
        return errLine(line, `invalid date: ${year}-${month}-${day} ${hour}:00 local`);
    }

    const dryBulbC = parseNumOrSentinel(parts[6], line, 'dryBulbC', 99.9);
    if (typeof dryBulbC !== 'number') return { ok: false, error: dryBulbC };
    const dewPointC = parseNumOrSentinel(parts[7], line, 'dewPointC', 99.9);
    if (typeof dewPointC !== 'number') return { ok: false, error: dewPointC };
    const relHumidityPct = parseNumOrSentinel(parts[8], line, 'relHumidityPct', 999);
    if (typeof relHumidityPct !== 'number') return { ok: false, error: relHumidityPct };
    const stationPressurePa = parseNumOrSentinel(parts[9], line, 'stationPressurePa', 999999);
    if (typeof stationPressurePa !== 'number') return { ok: false, error: stationPressurePa };

    const globalHorizontalWm2 = parseNumOrSentinel(parts[13], line, 'globalHorizontalWm2', 9999);
    if (typeof globalHorizontalWm2 !== 'number') return { ok: false, error: globalHorizontalWm2 };
    const directNormalWm2 = parseNumOrSentinel(parts[14], line, 'directNormalWm2', 9999);
    if (typeof directNormalWm2 !== 'number') return { ok: false, error: directNormalWm2 };
    const diffuseHorizontalWm2 = parseNumOrSentinel(parts[15], line, 'diffuseHorizontalWm2', 9999);
    if (typeof diffuseHorizontalWm2 !== 'number') return { ok: false, error: diffuseHorizontalWm2 };

    const windDirDeg = parseNumOrSentinel(parts[20], line, 'windDirDeg', 999);
    if (typeof windDirDeg !== 'number') return { ok: false, error: windDirDeg };
    const windSpeedMps = parseNumOrSentinel(parts[21], line, 'windSpeedMps', 999);
    if (typeof windSpeedMps !== 'number') return { ok: false, error: windSpeedMps };

    const totalCloudTenths = parseNumOrSentinel(parts[22], line, 'totalCloudTenths', 99);
    if (typeof totalCloudTenths !== 'number') return { ok: false, error: totalCloudTenths };
    const opaqueCloudTenths = parseNumOrSentinel(parts[23], line, 'opaqueCloudTenths', 99);
    if (typeof opaqueCloudTenths !== 'number') return { ok: false, error: opaqueCloudTenths };

    const visibilityKm = parseNumOrSentinel(parts[24], line, 'visibilityKm', 9999);
    if (typeof visibilityKm !== 'number') return { ok: false, error: visibilityKm };

    const precipMm = parseNumOrSentinel(parts[33], line, 'precipMm', 999);
    if (typeof precipMm !== 'number') return { ok: false, error: precipMm };

    // EPW sentinel values mean "missing data" — clamp ranges so the L0
    // schema accepts them. We replace common sentinels with neutral
    // values rather than throwing — TMY files often have a handful of
    // sentinel hours per year and PRYZM does not yet drop them.
    const record: EPWRecord = {
        utcIso: new Date(utcMs).toISOString(),
        localHourOfYear: indexZeroBased + 1,
        dryBulbC: clamp(dryBulbC, -90, 70),
        dewPointC: clamp(dewPointC, -100, 70),
        relHumidityPct: clamp(relHumidityPct, 0, 110),
        stationPressurePa: clamp(stationPressurePa, 40000, 120000),
        directNormalWm2: clamp(directNormalWm2, 0, 1500),
        diffuseHorizontalWm2: clamp(diffuseHorizontalWm2, 0, 1200),
        globalHorizontalWm2: clamp(globalHorizontalWm2, 0, 1500),
        windSpeedMps: clamp(windSpeedMps, 0, 90),
        windDirDeg: clamp(windDirDeg, 0, 360),
        totalCloudTenths: clamp(totalCloudTenths, 0, 10),
        opaqueCloudTenths: clamp(opaqueCloudTenths, 0, 10),
        visibilityKm: clamp(visibilityKm, 0, 9999),
        precipMm: clamp(precipMm, 0, 2000),
    };
    return { ok: true, record };
}

function parseNum(
    raw: string | undefined,
    line: number,
    field: string,
): number | ClimateIngestionError {
    const trimmed = (raw ?? '').trim();
    if (trimmed.length === 0) {
        return {
            kind: 'epw-parse-failed',
            line,
            message: `Field '${field}' is empty`,
        };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
        return { kind: 'unit-conversion-failed', field, rawValue: trimmed };
    }
    return n;
}

/**
 * Like `parseNum` but returns the supplied `defaultIfSentinel` value
 * when EPW writes the sentinel value (eg 999, 9999) the spec uses for
 * "missing data". Pure data hygiene — keeps the parser permissive in
 * the face of common TMY3 files.
 */
function parseNumOrSentinel(
    raw: string | undefined,
    line: number,
    field: string,
    sentinel: number,
): number | ClimateIngestionError {
    const r = parseNum(raw, line, field);
    if (typeof r !== 'number') return r;
    return r === sentinel ? 0 : r;
}

function errLine(line: number, message: string): {
    ok: false;
    error: ClimateIngestionError;
} {
    return { ok: false, error: { kind: 'epw-parse-failed', line, message } };
}

function clamp(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

/**
 * Compute the UTC ms for the START of the EPW hour described by
 * (year, month, day, hourLocal, tzGmtOffsetHours). hourLocal is 0..23
 * (the caller has already shifted EPW's 1..24 into 0..23).
 *
 * EPW hour 24 of day 31 wraps to midnight of day 32 (= next month). We
 * use `Date.UTC` for the wrap arithmetic.
 *
 * Returns null when the input does not describe a valid civil date.
 */
function computeUtcStartOfHour(
    year: number,
    month: number,
    day: number,
    hourLocal: number,
    tzGmtOffsetHours: number,
): number | null {
    // Build local-time ms as if it were UTC, then subtract the GMT offset.
    // `Date.UTC` validates the date components (rolls month overflow into
    // the next year, etc.) — we re-check the round-trip below.
    const localAsUtc = Date.UTC(year, month - 1, day, hourLocal, 0, 0, 0);
    if (!Number.isFinite(localAsUtc)) return null;
    // Round-trip check: did Date.UTC silently roll over (eg Feb 30)?
    const d = new Date(localAsUtc);
    if (
        d.getUTCFullYear() !== year ||
        d.getUTCMonth() !== month - 1 ||
        d.getUTCDate() !== day ||
        d.getUTCHours() !== hourLocal
    ) {
        return null;
    }
    return localAsUtc - tzGmtOffsetHours * 60 * 60 * 1000;
}
