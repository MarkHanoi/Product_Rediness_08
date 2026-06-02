// A.10.b (Phase A · Sprint 2) — EPW header parser tests.

import { describe, expect, it } from 'vitest';
import { parseEpwHeader } from '../src/epwHeader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const LONDON_HEADER = [
    'LOCATION,London Gatwick,,GBR,IWEC Data 037760,51.15,-0.18,0.0,62',
    'DESIGN CONDITIONS,1,Climate Design Data 2009 ASHRAE Handbook,,Heating,1,-3.5,...',
    'TYPICAL/EXTREME PERIODS,2,Summer - Week Nearest Max Temperature For Period...',
    'GROUND TEMPERATURES,3,.5,,,,9.2,7.5,6.4,6.0,6.9,9.0,11.4,13.7...',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,IWEC- WMO#037760 - Europe -- Asia Region',
    'COMMENTS 2,COMPRESSED VERSION OF THE STANDARD FILE',
    'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
].join('\n');

const NYC_HEADER = [
    'LOCATION,New York JFK,NY,USA,TMY3-744860,40.65,-73.78,-5.0,4',
    'DESIGN CONDITIONS,1,...',
    'TYPICAL/EXTREME PERIODS,...',
    'GROUND TEMPERATURES,...',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,TMY3',
    'COMMENTS 2,...',
    'DATA PERIODS,1,1,Data,Sunday, 1/1,12/31',
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('parseEpwHeader — happy path', () => {
    it('parses London Gatwick header', () => {
        const r = parseEpwHeader(LONDON_HEADER);
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.header.location.city).toBe('London Gatwick');
        expect(r.header.location.country).toBe('GBR');
        expect(r.header.location.wmoStation).toBe('IWEC Data 037760');
        expect(r.header.location.lat).toBeCloseTo(51.15);
        expect(r.header.location.lon).toBeCloseTo(-0.18);
        expect(r.header.location.tzGmtOffsetHours).toBe(0);
        expect(r.header.location.elevationM).toBe(62);
        expect(r.header.dataPeriodCount).toBe(1);
        expect(r.header.recordsPerHour).toBe(1);
        expect(r.nextLineIndex).toBe(8);
    });

    it('parses NYC JFK header (negative timezone, positive elevation)', () => {
        const r = parseEpwHeader(NYC_HEADER);
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.header.location.lat).toBeCloseTo(40.65);
        expect(r.header.location.lon).toBeCloseTo(-73.78);
        expect(r.header.location.tzGmtOffsetHours).toBe(-5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error paths
// ─────────────────────────────────────────────────────────────────────────────

describe('parseEpwHeader — errors', () => {
    it('rejects file with < 8 header lines', () => {
        const r = parseEpwHeader('LOCATION,city,,GBR,WMO,51.15,-0.18,0,62');
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.error.kind).toBe('epw-parse-failed');
    });

    it('rejects when line 1 does not start with LOCATION', () => {
        const broken = LONDON_HEADER.replace('LOCATION,', 'PLACE,');
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.error.kind).toBe('epw-parse-failed');
        expect((r.error as { line: number }).line).toBe(1);
    });

    it('rejects when LOCATION line has fewer than 9 fields', () => {
        const broken = LONDON_HEADER.replace(
            /^LOCATION,.*$/m,
            'LOCATION,city,GBR,WMO,51.15',  // only 5 fields
        );
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
    });

    it('rejects non-numeric lat', () => {
        const broken = LONDON_HEADER.replace(',51.15,', ',NORTH,');
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.error.kind).toBe('unit-conversion-failed');
    });

    it('rejects lat outside [-90, 90]', () => {
        const broken = LONDON_HEADER.replace(',51.15,', ',95,');
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.error.kind).toBe('epw-parse-failed');
    });

    it('rejects lon outside [-180, 180]', () => {
        const broken = LONDON_HEADER.replace(',-0.18,', ',200,');
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
    });

    it('rejects timezone outside [-14, +14]', () => {
        const broken = LONDON_HEADER.replace(',0.0,62', ',20.0,62');
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
    });

    it('rejects when line 8 does not start with DATA PERIODS', () => {
        const broken = LONDON_HEADER.replace('DATA PERIODS,', 'PERIODS,');
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
    });

    it('rejects non-positive recordsPerHour', () => {
        const broken = LONDON_HEADER.replace(
            'DATA PERIODS,1,1,',
            'DATA PERIODS,1,0,',
        );
        const r = parseEpwHeader(broken);
        expect(r.ok).toBe(false);
    });
});
