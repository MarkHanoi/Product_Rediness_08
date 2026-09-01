// E1b — SOURCE REGISTRY NOW-THIN · the proof suite (E1 gate decision §F item 5 ·
// supplement §7). Three claims, each falsifiable:
//
//   1. BUILD-TIME VALIDATION IS REAL: a corrupted row (broken licence colour enum) fails at
//      module load NAMING the row — asserted here permanently via defineSources, and proven
//      once by the lane's live sever transcript (a GREEN→GREEN-ISH corruption of pt.ts).
//   2. THE 30-COUNTRY COVERAGE MATCHES REPORT §F ROW-FOR-ROW: every §F country appears
//      exactly once, in §F order and §F spelling; seeded counts are asserted per country;
//      zero-row countries carry an HONEST lane-file absence reason, never an invented row.
//   3. THE §F DO-NOT-ADD GUARDS HOLD: no OME2 rows (verdict §F item 15), EE rows are REUSED
//      from the E1d exemplar (non-rivalry), and every seeded row carries a licence colour,
//      a dated probe, and its lane-file adapter status.

import { describe, it, expect } from 'vitest';
import {
    ALL_SOURCES,
    REPORT_F_COUNTRIES,
    REPORT_F_TO_ISO,
    SOURCE_ABSENCE_REASONS,
    SOURCE_REGISTRY,
    coverageByCountry,
    defineSources,
} from '../src/sourceRegistry/index.js';
import { EE_SOURCES } from '../src/countryAdapters/ee/eeSources.js';

/**
 * REPORT §F row-for-row expectation. The §F matrix carries all 30 countries; where the four
 * prose registries hold endpoint-level rows the count is > 0, elsewhere it is an HONEST 0.
 * This table is the test's own transcription of what the modules seed — a row-count drift in
 * either direction is a finding, not noise.
 */
const EXPECTED_ROWS: Readonly<Record<string, number>> = {
    DE: 2, DK: 4, CH: 2, ES: 3, FR: 2, PT: 1, NL: 5, PL: 3, LT: 3, EE: 4,
    AT: 0, BE: 2, BG: 0, HR: 0, CY: 0, CZ: 0, FI: 2, GR: 0, HU: 0, IE: 0,
    IT: 1, LV: 0, LU: 0, MT: 0, NO: 1, RO: 0, SI: 0, SK: 0, SE: 0, UK: 1,
};

describe('source registry — 30-country coverage vs REPORT §F', () => {
    it('prints the coverage table and matches §F row-for-row (honest zeros included)', () => {
        const coverage = coverageByCountry();

        // Every §F country exactly once, §F order, §F spelling (UK, not GB).
        expect(coverage.map((c) => c.reportFCode)).toEqual([...REPORT_F_COUNTRIES]);
        expect(coverage).toHaveLength(30);

        const lines = coverage.map(
            (c) =>
                `${c.reportFCode.padEnd(2)} rows=${String(c.rows).padStart(2)}` +
                (c.rows === 0 ? '  (absent: ' + (c.absenceReason ?? 'NO REASON RECORDED') + ')' : ''),
        );
        // The printed proof the lane brief asks for — 30 rows, seeded counts + honest absences.
        // eslint-disable-next-line no-console
        console.log('[source-registry] REPORT §F coverage (30 countries):\n' + lines.join('\n'));
        // eslint-disable-next-line no-console
        console.log(
            `[source-registry] totals: ${ALL_SOURCES.length} rows across ` +
                `${coverage.filter((c) => c.rows > 0).length} countries; ` +
                `${coverage.filter((c) => c.rows === 0).length} honest absences`,
        );

        for (const c of coverage) {
            expect(c.rows, `${c.reportFCode} row count`).toBe(EXPECTED_ROWS[c.reportFCode]);
        }
        // 35 -> 36: LANE DK 2026-09-01 seeded `dk-dawa-jordstykker`, the KEYLESS parcel
        // side-door that is the other half of the DK critical path (probed anonymously at
        // both baseline parcels). The DK country adapter RESOLVES this row rather than
        // minting its own copy — see countryAdapters/dk/dkSources.ts.
        expect(ALL_SOURCES).toHaveLength(36);
    });

    it('every zero-row §F country carries an honest lane-file absence reason — absence is a finding, not a blank', () => {
        for (const c of coverageByCountry()) {
            if (c.rows === 0) {
                expect(c.absenceReason, `${c.reportFCode} absence reason`).toBeTruthy();
                expect(SOURCE_ABSENCE_REASONS[c.reportFCode]).toBe(c.absenceReason);
            } else {
                expect(c.absenceReason).toBeNull();
            }
        }
    });

    it('every registry country is inside the §F census frame — no invented countries', () => {
        const isoFrame = new Set(REPORT_F_COUNTRIES.map((cc) => REPORT_F_TO_ISO[cc] ?? cc));
        for (const iso of Object.keys(SOURCE_REGISTRY)) {
            expect(isoFrame.has(iso), `country ${iso} must be in REPORT §F`).toBe(true);
        }
    });
});

describe('source registry — row discipline (every value from the lane files)', () => {
    it('every row carries a licence colour, at least one dated probe, a theme and an adapterStatus', () => {
        for (const row of ALL_SOURCES) {
            expect(['GREEN', 'YELLOW', 'RED']).toContain(row.licence.colour);
            expect(row.probes.length, `${row.id} probes`).toBeGreaterThan(0);
        }
        // The four NOW-thin columns are nullable in the SCHEMA (additive, zero migration —
        // supplement §7), but a row SEEDED BY THIS REGISTRY must state its theme and adapter
        // status — that is the sequencing instrument the column exists for. (coverage and
        // updateFrequency stay honestly null where the prose sources record nothing.)
        // EE is the pre-existing E1d exemplar module — its rows parse with honest nulls
        // until the E1d rework lane (which owns countryAdapters/ee/) states them; asserting
        // nulls there keeps the boundary honest instead of this lane editing another lane's
        // module.
        for (const [iso, rows] of Object.entries(SOURCE_REGISTRY)) {
            for (const row of rows) {
                if (iso === 'EE') {
                    expect(row.theme, `${row.id} theme (E1d exemplar, pre-columns)`).toBeNull();
                    expect(row.adapterStatus, `${row.id} adapterStatus (E1d exemplar, pre-columns)`).toBeNull();
                } else {
                    expect(row.theme, `${row.id} theme`).not.toBeNull();
                    expect(row.adapterStatus, `${row.id} adapterStatus`).not.toBeNull();
                }
            }
        }
    });

    it('NO OME2 rows — verdict §F item 15 (licence text un-fetched, founder item)', () => {
        for (const row of ALL_SOURCES) {
            const haystack = `${row.id} ${row.authority} ${row.dataset}`.toLowerCase();
            expect(haystack.includes('ome2'), `${row.id} must not seed OME2`).toBe(false);
            expect(haystack.includes('open cadastral map'), `${row.id} must not seed OME2`).toBe(false);
        }
    });

    it('source ids are UNIQUE across the whole registry — one id, one definition (C84 EI-9)', () => {
        // LANE DK 2026-09-01: a DK adapter draft minted a SECOND row with id `dk-plandata-wfs`
        // inside countryAdapters/dk/, divergent from the registry's and unreachable through
        // SOURCE_REGISTRY. Two definitions of one id is how one source grows two probe logs.
        const seen = new Map<string, number>();
        for (const row of ALL_SOURCES) seen.set(row.id, (seen.get(row.id) ?? 0) + 1);
        const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        expect(dupes, `duplicate source ids: ${dupes.join(', ')}`).toEqual([]);
    });

    it('EE rows are REUSED from the E1d exemplar module, never copied (non-rivalry, C84 EI-9)', () => {
        expect(SOURCE_REGISTRY.EE).toBe(EE_SOURCES);
        expect(EE_SOURCES).toHaveLength(4);
    });
});

describe('source registry — build-time validation catches a corrupted row NAMING it', () => {
    const validRow = {
        id: 'xx-valid-row',
        country: 'XX',
        authority: 'Test authority',
        dataset: 'test dataset',
        endpoint: 'https://example.invalid/wfs',
        protocol: 'WFS2',
        licence: { id: 'CC-BY-4.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [{ date: '2026-09-01', note: 'synthetic control row' }],
    };

    it('CONTROL: the valid row parses through defineSources', () => {
        const rows = defineSources('XX', [validRow]);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.adapterStatus).toBeNull(); // NOW-thin columns default to honest nulls
    });

    it('NEGATIVE: a broken licence colour fails naming country, row id and index', () => {
        const corrupted = {
            ...validRow,
            licence: { ...validRow.licence, colour: 'GREEN-ISH' },
        };
        expect(() => defineSources('XX', [corrupted])).toThrowError(
            /\[source-registry\] XX row 'xx-valid-row' \(index 0\) does not parse — licence\.colour/,
        );
    });

    it('NEGATIVE: a row pasted from another country module is rejected as a corruption', () => {
        expect(() => defineSources('YY', [validRow])).toThrowError(
            /YY row 'xx-valid-row' \(index 0\) carries country 'XX'/,
        );
    });

    it('NEGATIVE: an unprobed row is rejected — an unverified claim, not a source (verdict §F item 15)', () => {
        expect(() => defineSources('XX', [{ ...validRow, probes: [] }])).toThrowError(
            /XX row 'xx-valid-row' \(index 0\) has an empty probe log/,
        );
    });
});
