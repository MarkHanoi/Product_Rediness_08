// A.10.b (Phase A · Sprint 2) — EPW header parser.
//
// EPW (EnergyPlus Weather) files begin with 8 header lines before the
// 8760-hour data block:
//
//   1.  LOCATION,<city>,<state>,<country>,<WMO>,<lat>,<lon>,<tzGmtOffset>,<elevM>
//   2.  DESIGN CONDITIONS,…
//   3.  TYPICAL/EXTREME PERIODS,…
//   4.  GROUND TEMPERATURES,…
//   5.  HOLIDAYS/DAYLIGHT SAVINGS,…
//   6.  COMMENTS 1,…
//   7.  COMMENTS 2,…
//   8.  DATA PERIODS,<count>,<step>,<name>,<start_day>,<start_date>,<end_date>
//
// Pure parser — no I/O. Caller supplies the file text as a string.
// Returns the parsed header OR a typed ClimateIngestionError.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §2.2 + §4.1
//   - docs/03-execution/plans/master-execution-tracker.md A.10.b

import type { ClimateIngestionError } from '@pryzm/schemas';

/**
 * The portion of the EPW header A.10.b needs to drive ingestion. The
 * header has more (design-conditions ASHRAE values, ground-temperature
 * series, holiday tables) — A.10.b PARSES those for compliance but
 * does NOT yet surface them; later slices add accessors.
 */
export interface EpwHeader {
    readonly location: {
        readonly city: string;
        readonly state: string;
        readonly country: string;
        /** WMO station number (5-6 chars, sometimes alpha-numeric). */
        readonly wmoStation: string;
        /** Latitude (decimal degrees, +N / -S). */
        readonly lat: number;
        /** Longitude (decimal degrees, +E / -W). */
        readonly lon: number;
        /** Timezone GMT offset in hours (eg 0, -5, +5.5). */
        readonly tzGmtOffsetHours: number;
        /** Elevation above sea level in metres. */
        readonly elevationM: number;
    };
    /** Number of data periods declared on the DATA PERIODS line; usually 1. */
    readonly dataPeriodCount: number;
    /** Records per hour (almost always 1). */
    readonly recordsPerHour: number;
}

export type EpwHeaderParseResult =
    | { readonly ok: true; readonly header: EpwHeader; readonly nextLineIndex: number }
    | { readonly ok: false; readonly error: ClimateIngestionError };

/**
 * Parse the 8 EPW header lines. Returns the parsed shape + the index
 * of the next line to consume (the first hourly record). On failure,
 * returns a typed ClimateIngestionError carrying the offending line
 * number (1-based).
 */
export function parseEpwHeader(rawText: string): EpwHeaderParseResult {
    const lines = rawText.split(/\r?\n/);
    if (lines.length < 8) {
        return {
            ok: false,
            error: {
                kind: 'epw-parse-failed',
                line: lines.length || 1,
                message: `EPW header MUST be 8 lines; only ${lines.length} provided`,
            },
        };
    }

    // ── Line 1: LOCATION ────────────────────────────────────────────
    const locParts = lines[0]!.split(',');
    if (locParts[0]?.toUpperCase() !== 'LOCATION') {
        return {
            ok: false,
            error: {
                kind: 'epw-parse-failed',
                line: 1,
                message: `EPW line 1 MUST start with 'LOCATION,' (got '${locParts[0] ?? ''}')`,
            },
        };
    }
    // EPW LOCATION line has two real-world shapes:
    //   10 fields: LOCATION,city,state,country,source,WMO,lat,lon,tz,elev
    //   9 fields:  LOCATION,city,state,country,sourceWmo,lat,lon,tz,elev
    //     (source + WMO merged into a single field — common in IWEC + TMY3
    //     files produced by older EPW vendors)
    // We detect by counting parts.
    if (locParts.length < 9) {
        return {
            ok: false,
            error: {
                kind: 'epw-parse-failed',
                line: 1,
                message: `LOCATION line MUST have ≥ 9 comma-separated fields; got ${locParts.length}`,
            },
        };
    }

    const city = locParts[1]?.trim() ?? '';
    const state = locParts[2]?.trim() ?? '';
    const country = locParts[3]?.trim() ?? '';

    const isTenFieldShape = locParts.length >= 10;
    const wmoStation = isTenFieldShape
        ? (locParts[5]?.trim() ?? '') || '000000'
        : (locParts[4]?.trim() ?? '') || '000000';

    const latIdx = isTenFieldShape ? 6 : 5;
    const lonIdx = isTenFieldShape ? 7 : 6;
    const tzIdx = isTenFieldShape ? 8 : 7;
    const elevIdx = isTenFieldShape ? 9 : 8;

    const latRes = parseLocationNumber(locParts[latIdx], 1, 'lat');
    if (typeof latRes !== 'number') return { ok: false, error: latRes };
    const lonRes = parseLocationNumber(locParts[lonIdx], 1, 'lon');
    if (typeof lonRes !== 'number') return { ok: false, error: lonRes };
    const tzRes = parseLocationNumber(locParts[tzIdx], 1, 'timezone');
    if (typeof tzRes !== 'number') return { ok: false, error: tzRes };
    const elevRes = parseLocationNumber(locParts[elevIdx] ?? '0', 1, 'elevation');
    if (typeof elevRes !== 'number') return { ok: false, error: elevRes };

    if (latRes < -90 || latRes > 90) {
        return locationRangeError(1, 'lat', latRes, '[-90, 90]');
    }
    if (lonRes < -180 || lonRes > 180) {
        return locationRangeError(1, 'lon', lonRes, '[-180, 180]');
    }
    if (tzRes < -14 || tzRes > 14) {
        return locationRangeError(1, 'timezone', tzRes, '[-14, +14] hours');
    }
    if (elevRes < -500 || elevRes > 9000) {
        return locationRangeError(1, 'elevation', elevRes, '[-500, 9000] metres');
    }
    const lat = latRes;
    const lon = lonRes;
    const tzGmtOffsetHours = tzRes;
    const elevationM = elevRes;

    // ── Lines 2–7: skipped for now (parsed for compliance only) ─────
    // Future slices will surface DESIGN CONDITIONS + GROUND TEMPS.

    // ── Line 8: DATA PERIODS ────────────────────────────────────────
    const dpParts = lines[7]!.split(',');
    if (dpParts[0]?.toUpperCase() !== 'DATA PERIODS') {
        return {
            ok: false,
            error: {
                kind: 'epw-parse-failed',
                line: 8,
                message:
                    `EPW line 8 MUST start with 'DATA PERIODS,' (got '${dpParts[0] ?? ''}')`,
            },
        };
    }
    const dpcRes = parsePositiveInt(dpParts[1], 8, 'dataPeriodCount');
    if (typeof dpcRes !== 'number') return { ok: false, error: dpcRes };
    const rphRes = parsePositiveInt(dpParts[2], 8, 'recordsPerHour');
    if (typeof rphRes !== 'number') return { ok: false, error: rphRes };
    const dataPeriodCount = dpcRes;
    const recordsPerHour = rphRes;

    return {
        ok: true,
        header: {
            location: {
                city,
                state,
                country,
                wmoStation,
                lat,
                lon,
                tzGmtOffsetHours,
                elevationM,
            },
            dataPeriodCount,
            recordsPerHour,
        },
        nextLineIndex: 8,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers.
// ─────────────────────────────────────────────────────────────────────────────

function parseLocationNumber(
    raw: string | undefined,
    line: number,
    field: string,
): number | ClimateIngestionError {
    const trimmed = (raw ?? '').trim();
    if (trimmed.length === 0) {
        return {
            kind: 'epw-parse-failed',
            line,
            message: `LOCATION field '${field}' is empty`,
        };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
        return {
            kind: 'unit-conversion-failed',
            field,
            rawValue: trimmed,
        };
    }
    return n;
}

function parsePositiveInt(
    raw: string | undefined,
    line: number,
    field: string,
): number | ClimateIngestionError {
    const trimmed = (raw ?? '').trim();
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return {
            kind: 'epw-parse-failed',
            line,
            message: `Expected positive integer for '${field}', got '${trimmed}'`,
        };
    }
    return n;
}

function locationRangeError(
    line: number,
    field: string,
    value: number,
    range: string,
): EpwHeaderParseResult {
    return {
        ok: false,
        error: {
            kind: 'epw-parse-failed',
            line,
            message: `LOCATION ${field} = ${value} outside ${range}`,
        },
    };
}
