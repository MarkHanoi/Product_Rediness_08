// A.10.b (Phase A · Sprint 2) — EPW hourly-record parser tests.

import { describe, expect, it } from 'vitest';
import { parseEpwHeader } from '../src/epwHeader.js';
import { parseEpwHourlyRecords } from '../src/epwParser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — synthetic 3-hour mini-EPW for London (UTC, tz=0)
// ─────────────────────────────────────────────────────────────────────────────

const MINI_EPW_LONDON = [
    'LOCATION,London Gatwick,,GBR,037760,51.15,-0.18,0.0,62',
    'DESIGN CONDITIONS,1,...',
    'TYPICAL/EXTREME PERIODS,...',
    'GROUND TEMPERATURES,...',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,test',
    'COMMENTS 2,...',
    'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
    // year, month, day, hour, minute, flags, dryBulb, dewPoint, RH, pressure,
    // ext_horiz, ext_dirn, horiz_IR, glob_horiz, dir_norm, diff_horiz,
    // gli_illum, dni_illum, dhi_illum, zen_lum, wind_dir, wind_speed,
    // total_cloud, opaque_cloud, vis, ceil, weather_obs, weather_codes,
    // precip_water, aerosol, snow_depth, days_since_snow, albedo,
    // liquid_precip_mm, liquid_precip_hr
    '1991,1,1,1,60,*,5.0,2.0,75,101300,0,0,0,0,0,0,0,0,0,0,180,3.5,5,5,30,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
    '1991,1,1,2,60,*,4.5,1.8,76,101290,0,0,0,0,0,0,0,0,0,0,200,4.0,6,6,28,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
    '1991,1,1,3,60,*,4.0,1.5,78,101280,0,0,0,0,0,0,0,0,0,0,210,3.8,7,7,25,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
].join('\n');

// London at noon in summer, with sun.
const NOON_RECORD = [
    '1991,6,21,12,60,*,22.5,12.0,53,101325,1100,1200,400,870,850,120,90000,80000,15000,8000,225,4.2,3,2,30,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
].join('\n');

// NYC EPW with tz=-5 → local hour 1 (00:00..00:59 EST) = 05:00..05:59 UTC
const MINI_EPW_NYC_HOUR1 = [
    'LOCATION,New York JFK,NY,USA,744860,40.65,-73.78,-5.0,4',
    'DESIGN CONDITIONS,1,...',
    'TYPICAL/EXTREME PERIODS,...',
    'GROUND TEMPERATURES,...',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,TMY3',
    'COMMENTS 2,...',
    'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
    '1991,1,1,1,60,*,-2.0,-5.0,80,101325,0,0,0,0,0,0,0,0,0,0,270,5.5,5,5,20,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseEpwHourlyRecords — happy path', () => {
    it('parses 3 London hourly records', () => {
        const hr = parseEpwHeader(MINI_EPW_LONDON);
        if (!hr.ok) throw new Error('header parse failed');
        const result = parseEpwHourlyRecords(
            MINI_EPW_LONDON,
            hr.header,
            hr.nextLineIndex,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.records).toHaveLength(3);
        const first = result.records[0]!;
        expect(first.dryBulbC).toBeCloseTo(5.0);
        expect(first.dewPointC).toBeCloseTo(2.0);
        expect(first.relHumidityPct).toBe(75);
        expect(first.stationPressurePa).toBe(101300);
        expect(first.windSpeedMps).toBeCloseTo(3.5);
        expect(first.windDirDeg).toBe(180);
        expect(first.localHourOfYear).toBe(1);
    });

    it('converts UTC timestamp from local-time + GMT offset (London tz=0)', () => {
        const hr = parseEpwHeader(MINI_EPW_LONDON);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(
            MINI_EPW_LONDON,
            hr.header,
            hr.nextLineIndex,
        );
        if (!result.ok) throw new Error('unreachable');
        // EPW hour 1 means END of hour 01:00 local. Start-of-hour
        // convention shifts to 00:00 local = 00:00 UTC.
        expect(result.records[0]!.utcIso).toBe('1991-01-01T00:00:00.000Z');
        expect(result.records[1]!.utcIso).toBe('1991-01-01T01:00:00.000Z');
        expect(result.records[2]!.utcIso).toBe('1991-01-01T02:00:00.000Z');
    });

    it('converts UTC timestamp for NYC (tz=-5 → +5h shift)', () => {
        const hr = parseEpwHeader(MINI_EPW_NYC_HOUR1);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(
            MINI_EPW_NYC_HOUR1,
            hr.header,
            hr.nextLineIndex,
        );
        if (!result.ok) throw new Error('unreachable');
        // Local 00:00 EST (UTC-5) = 05:00 UTC.
        expect(result.records[0]!.utcIso).toBe('1991-01-01T05:00:00.000Z');
    });

    it('skips empty trailing lines', () => {
        const withTrailing = MINI_EPW_LONDON + '\n\n\n';
        const hr = parseEpwHeader(withTrailing);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(
            withTrailing,
            hr.header,
            hr.nextLineIndex,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.records).toHaveLength(3);
    });

    it('reads noon record with sun + wind', () => {
        const full = [
            'LOCATION,London Gatwick,,GBR,037760,51.15,-0.18,0.0,62',
            'DESIGN CONDITIONS,1,...',
            'TYPICAL/EXTREME PERIODS,...',
            'GROUND TEMPERATURES,...',
            'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
            'COMMENTS 1,test',
            'COMMENTS 2,...',
            'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
            NOON_RECORD,
        ].join('\n');
        const hr = parseEpwHeader(full);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(
            full,
            hr.header,
            hr.nextLineIndex,
        );
        if (!result.ok) throw new Error('unreachable');
        const r = result.records[0]!;
        expect(r.dryBulbC).toBeCloseTo(22.5);
        expect(r.directNormalWm2).toBe(850);
        expect(r.globalHorizontalWm2).toBe(870);
        expect(r.diffuseHorizontalWm2).toBe(120);
        expect(r.windDirDeg).toBe(225);
        expect(r.windSpeedMps).toBeCloseTo(4.2);
    });
});

describe('parseEpwHourlyRecords — error paths', () => {
    function makeHeader() {
        const r = parseEpwHeader(MINI_EPW_LONDON);
        if (!r.ok) throw new Error('unreachable');
        return r;
    }

    it('rejects record with < 35 fields', () => {
        const hr = makeHeader();
        const broken = [
            'LOCATION,X,,GBR,W,0,0,0,0',
            'DESIGN CONDITIONS,1,...',
            'TYPICAL/EXTREME PERIODS,...',
            'GROUND TEMPERATURES,...',
            'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
            'COMMENTS 1,test',
            'COMMENTS 2,...',
            'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
            '1991,1,1,1,60,*,5.0',          // truncated record
        ].join('\n');
        const result = parseEpwHourlyRecords(broken, hr.header, 8);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.error.kind).toBe('epw-parse-failed');
    });

    it('rejects record with non-numeric dry-bulb', () => {
        const broken = [
            'LOCATION,X,,GBR,W,037760,51.15,-0.18,0.0,62',
            'DESIGN CONDITIONS,1,...',
            'TYPICAL/EXTREME PERIODS,...',
            'GROUND TEMPERATURES,...',
            'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
            'COMMENTS 1,test',
            'COMMENTS 2,...',
            'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
            '1991,1,1,1,60,*,WARM,2,75,101300,0,0,0,0,0,0,0,0,0,0,180,3.5,5,5,30,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
        ].join('\n');
        const hr = parseEpwHeader(broken);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(broken, hr.header, 8);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.error.kind).toBe('unit-conversion-failed');
    });

    it('rejects month/day/hour out of range', () => {
        const broken = [
            'LOCATION,X,,GBR,W,037760,51.15,-0.18,0.0,62',
            'DESIGN CONDITIONS,1,...',
            'TYPICAL/EXTREME PERIODS,...',
            'GROUND TEMPERATURES,...',
            'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
            'COMMENTS 1,test',
            'COMMENTS 2,...',
            'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
            '1991,13,1,1,60,*,5,2,75,101300,0,0,0,0,0,0,0,0,0,0,180,3.5,5,5,30,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
        ].join('\n');
        const hr = parseEpwHeader(broken);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(broken, hr.header, 8);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.error.kind).toBe('epw-parse-failed');
    });

    it('replaces sentinel values with 0 (data hygiene)', () => {
        // 9999 in directNormalWm2 → mapped to 0.
        const epw = [
            'LOCATION,X,,GBR,W,037760,51.15,-0.18,0.0,62',
            'DESIGN CONDITIONS,1,...',
            'TYPICAL/EXTREME PERIODS,...',
            'GROUND TEMPERATURES,...',
            'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
            'COMMENTS 1,test',
            'COMMENTS 2,...',
            'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
            '1991,1,1,1,60,*,5.0,2.0,75,101300,0,0,0,0,9999,0,0,0,0,0,180,3.5,5,5,30,77777,9,999999999,30,0.06,999,99,0.16,0.0,1.0',
        ].join('\n');
        const hr = parseEpwHeader(epw);
        if (!hr.ok) throw new Error('unreachable');
        const result = parseEpwHourlyRecords(epw, hr.header, 8);
        if (!result.ok) throw new Error('unreachable');
        expect(result.records[0]!.directNormalWm2).toBe(0);
    });
});
