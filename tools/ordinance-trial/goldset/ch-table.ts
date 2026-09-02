// E8-TRIAL — CH-TABLE gold rows: Bau- und Zonenreglement der Stadt Luzern,
// "Anhang 1 Zonen- und Dichtebestimmungen gemäss Art. 4 Abs. 4".
//
// ⭐ HOW THESE VALUES WERE READ (and why they are checkable)
// ---------------------------------------------------------
// NOT from the flattened text stream. The flattened stream is exactly where the
// error lives: `130 WO 0.15 21 offen` reads as "21 Vollgeschosse" and is really
// "Fassadenhöhe 21 m" — a 7x overstatement with a correct citation attached
// (E8-SCOUT §3.2). Every value below was read from the pdf.js POSITIONED TEXT
// ITEMS by COLUMN X, via `tools/ordinance-trial/dump-items.ts`, against the table's
// own header row on PDF page 26:
//
//   y=643.5 | 31:Nr. | 60:Zonenart | 125:A / B | 177:ÜZ | 240:GL | 300:VG | 348:FH | 401:g / o | 476:Weitere
//   y=662.0 | 139:Ortsbild-schutzzone | 191:Überbauungsziffer | 253:Gebäude-länge m
//           | 314:Vollgeschosse | 362:Fassaden-höhe m | 430:Bauweise
//
// So: x≈177 = ÜZ (Überbauungsziffer) · x≈240 = GL (Gebäudelänge, metres)
//     x≈300 = VG (Vollgeschosse)     · x≈348 = FH (Fassadenhöhe, metres)
//
// A reviewer re-runs that command and re-reads the same lines. No trust in this
// lane is required.
//
// ⚠ TWO MAPPINGS ARE INTERPRETATIONS, NOT FACTS — flagged, not hidden:
//  1. ÜZ → `maxCoverage`. Überbauungsziffer is a footprint ratio, but THIS DOCUMENT
//     NEVER DEFINES IT — the definition sits in the cantonal PBG/PBV. The mapping is
//     an interpretation a Swiss planner must confirm.
//  2. FH (Fassadenhöhe) → `maxHeight_m` with NO DATUM SEAT. `HeightMeasurement` is
//     `eaves | ridge | building | unknown`; Swiss *Fassadenhöhe* is none of them, and
//     Art. 26 of this very reglement proves the distinction is load-bearing:
//     Fassadenhöhe 21 m AND Firsthöhe 27 m in one sentence. Recorded as a
//     vocabulary GAP (control 10) — NOT minted (control 2).
//
// GL (Gebäudelänge) has NO `ExtractableField` seat at all. Its values are recorded
// as NOT-A-PARCEL-RULE traps: emitting a Gebäudelänge as a floor count or a height
// is the exact failure the flattened stream invites.

import type { GoldRow } from './types.js';

/** One transcribed table row. `null` = the cell is EMPTY on the page (control 9). */
interface RawZoneRow {
    readonly page: number;
    readonly nr: string;
    readonly zonenart: string;
    /** Ortsbildschutzzone A/B (x≈125) — context, no field seat. */
    readonly ab: string | null;
    /** Überbauungsziffer (x≈177). */
    readonly uz: number | null;
    /** Gebäudelänge in metres (x≈240) — NO FIELD SEAT. */
    readonly gl: number | null;
    /** Vollgeschosse (x≈300). */
    readonly vg: number | null;
    /** Fassadenhöhe in metres (x≈348). */
    readonly fh: number | null;
    /** Bauweise (x≈401). */
    readonly bauweise: string;
    /** Weitere Bestimmungen (x≈476) — carried verbatim as a control-8 qualifier. */
    readonly weitere: string | null;
}

/**
 * PDF page 26 — the FIRST page of Anhang 1 (chosen by POSITION, not content) and
 * PDF page 31 — the sixth of the eleven Anhang-1 pages 26–36 (chosen by POSITION).
 * Neither page was chosen because it parsed, or because it was rich.
 */
const RAW_ROWS: readonly RawZoneRow[] = [
    // ── PDF page 26 — Wohn- und Arbeitszone (WA), Ordnungsnummern 1–8 ──
    { page: 26, nr: '1', zonenart: 'WA', ab: 'A', uz: null, gl: null, vg: null, fh: null, bauweise: 'geschlossen', weitere: null },
    { page: 26, nr: '2', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: null, fh: null, bauweise: 'offen', weitere: null },
    { page: 26, nr: '3', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: null, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht' },
    { page: 26, nr: '4', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: null, fh: null, bauweise: 'geschlossen', weitere: null },
    { page: 26, nr: '5', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: null, fh: null, bauweise: 'geschlossen', weitere: 'Gestaltungsplanpflicht' },
    { page: 26, nr: '6', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: null, fh: 35, bauweise: 'geschlossen', weitere: '(höchstens); Gestaltungsplanpflicht, Art. 43 Abs. 3' },
    { page: 26, nr: '7', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: null, fh: null, bauweise: 'geschlossen', weitere: 'publikumsorientierte Nutzung gemäss Art. 10 Abs. 5' },
    { page: 26, nr: '8', zonenart: 'WA', ab: 'B', uz: null, gl: null, vg: 7, fh: 26, bauweise: 'geschlossen', weitere: 'Konkurrenzverfahren fuer Aufstockung; Art. 26 Abs. 2 gilt nicht; ueber dem 7. VG Dachaufbauten fuer Technik max. 3 m Hoehe, min. 6 m zurueckversetzt' },

    // ── PDF page 31 — Wohnzone (WO), Ordnungsnummern 128–153 ──
    { page: 31, nr: '128', zonenart: 'WO', ab: null, uz: 0.15, gl: 40, vg: 5, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '129', zonenart: 'WO', ab: null, uz: 0.15, gl: 45, vg: 5, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '130', zonenart: 'WO', ab: null, uz: 0.15, gl: null, vg: null, fh: 21, bauweise: 'offen', weitere: null },
    { page: 31, nr: '131', zonenart: 'WO', ab: null, uz: 0.15, gl: 25, vg: null, fh: 21, bauweise: 'offen', weitere: null },
    { page: 31, nr: '132', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 2, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '133', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 2, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht' },
    { page: 31, nr: '134', zonenart: 'WO', ab: null, uz: 0.2, gl: 20, vg: 2, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '135', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 2, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht, Art. 43 Abs. 3' },
    { page: 31, nr: '136', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 3, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '137', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 3, fh: null, bauweise: 'geschlossen', weitere: null },
    { page: 31, nr: '138', zonenart: 'WO', ab: null, uz: 0.2, gl: 20, vg: 3, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '139', zonenart: 'WO', ab: null, uz: 0.2, gl: 25, vg: 3, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '140', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 4, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '141', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 4, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht' },
    { page: 31, nr: '142', zonenart: 'WO', ab: null, uz: 0.2, gl: 25, vg: 4, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '143', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 5, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '144', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: 5, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht' },
    { page: 31, nr: '145', zonenart: 'WO', ab: null, uz: 0.2, gl: null, vg: null, fh: 21, bauweise: 'offen', weitere: null },
    { page: 31, nr: '146', zonenart: 'WO', ab: null, uz: 0.25, gl: null, vg: 2, fh: null, bauweise: 'geschlossen', weitere: null },
    { page: 31, nr: '147', zonenart: 'WO', ab: null, uz: 0.25, gl: null, vg: 2, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht' },
    { page: 31, nr: '148', zonenart: 'WO', ab: null, uz: 0.25, gl: 20, vg: 2, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '149', zonenart: 'WO', ab: null, uz: 0.25, gl: null, vg: 3, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '150', zonenart: 'WO', ab: null, uz: 0.25, gl: null, vg: 3, fh: null, bauweise: 'offen', weitere: 'Gestaltungsplanpflicht; Grundstuecke Nrn. 1521, 2726, 2882, 4076 (Reussmatt)' },
    { page: 31, nr: '151', zonenart: 'WO', ab: null, uz: 0.25, gl: 20, vg: 3, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '152', zonenart: 'WO', ab: null, uz: 0.25, gl: 25, vg: 3, fh: null, bauweise: 'offen', weitere: null },
    { page: 31, nr: '153', zonenart: 'WO', ab: null, uz: 0.25, gl: 40, vg: 3, fh: null, bauweise: 'offen', weitere: null },
];

function commonQualifiers(r: RawZoneRow): string[] {
    const q = [`applicability: Ordnungsnummer ${r.nr} (${r.zonenart}) only, per the Zonenplan`];
    if (r.ab !== null) q.push(`Ortsbildschutzzone ${r.ab}`);
    if (r.bauweise) q.push(`Bauweise: ${r.bauweise}`);
    if (r.weitere !== null) q.push(`Weitere Bestimmungen: ${r.weitere}`);
    return q;
}

/**
 * FOUR claim slots per zone row — `maxCoverage`, `maxFloors`, `maxHeight_m`,
 * `maxFAR`. The scope rule is stated so the denominator is not arbitrary: those are
 * the four `ExtractableField`s a Swiss Zonen- und Dichtebestimmungen row could
 * plausibly populate. `maxFAR` is included precisely BECAUSE the table has no FAR
 * column: a reader that maps ÜZ → FAR fabricates a floor-area ratio out of a
 * footprint ratio, and that must be countable.
 */
export const CH_TABLE_ROWS: readonly GoldRow[] = RAW_ROWS.flatMap((r): GoldRow[] => {
    const loc = `p${r.page}/row-${r.nr}`;
    const quote =
        `Anhang 1 row Nr. ${r.nr}: ${r.zonenart}${r.ab === null ? '' : ` | A/B ${r.ab}`}` +
        ` | ÜZ ${r.uz ?? '—'} | GL ${r.gl ?? '—'} | VG ${r.vg ?? '—'} | FH ${r.fh ?? '—'} | ${r.bauweise}`;
    const quals = commonQualifiers(r);
    const rows: GoldRow[] = [
        {
            id: `${loc}/maxCoverage`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxCoverage',
            label: r.uz === null ? 'UNKNOWN' : 'NUMBER',
            value: r.uz,
            unit: r.uz === null ? null : 'ratio',
            evidence: { page: r.page, quote, columnX: 177, columnHeader: 'ÜZ (Überbauungsziffer)', anchor: null },
            qualifiers:
                r.uz === null
                    ? quals
                    : [...quals, 'denominator NOT DEFINED IN THIS DOCUMENT (cantonal PBG/PBV defines ÜZ)'],
            reviewerNote:
                r.uz === null
                    ? 'The ÜZ column (x≈177) is EMPTY for this row. UNKNOWN — not zero, not unlimited (control 9).'
                    : `ÜZ = ${r.uz} read at x≈177. Mapping ÜZ → maxCoverage is an INTERPRETATION: this reglement never defines Überbauungsziffer.`,
            humanConfirmed: false,
        },
        {
            id: `${loc}/maxFloors`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxFloors',
            label: r.vg === null ? 'UNKNOWN' : 'NUMBER',
            value: r.vg,
            unit: r.vg === null ? null : 'storeys',
            evidence: { page: r.page, quote, columnX: 300, columnHeader: 'VG (Vollgeschosse)', anchor: null },
            qualifiers: quals,
            reviewerNote:
                r.vg === null
                    ? 'The VG column (x≈300) is EMPTY for this row.' +
                      (r.fh === null ? '' : ` The number ${r.fh} on this line sits at x≈348 and is a Fassadenhöhe in METRES, not a storey count.`) +
                      (r.gl === null ? '' : ` The number ${r.gl} sits at x≈240 and is a Gebäudelänge in METRES.`)
                    : `VG = ${r.vg} read at x≈300.`,
            humanConfirmed: false,
        },
        {
            id: `${loc}/maxHeight_m`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxHeight_m',
            label: r.fh === null ? 'UNKNOWN' : 'NUMBER',
            value: r.fh,
            unit: r.fh === null ? null : 'm',
            evidence: { page: r.page, quote, columnX: 348, columnHeader: 'FH (Fassaden-höhe m)', anchor: null },
            qualifiers:
                r.fh === null
                    ? quals
                    : [...quals, 'datum: Fassadenhöhe — NO SEAT in HeightMeasurement (eaves|ridge|building|unknown)'],
            reviewerNote:
                r.fh === null
                    ? 'The FH column (x≈348) is EMPTY for this row.'
                    : `FH = ${r.fh} m read at x≈348. Its DATUM is Fassadenhöhe — not Traufhöhe, not Firsthöhe. Art. 26 of this reglement sets Fassadenhöhe 21 m AND Firsthöhe 27 m in one sentence, so the distinction is load-bearing.`,
            humanConfirmed: false,
        },
        {
            id: `${loc}/maxFAR`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxFAR',
            label: 'UNKNOWN',
            value: null,
            unit: null,
            evidence: { page: r.page, quote, anchor: null },
            qualifiers: quals,
            reviewerNote:
                'Anhang 1 has NO floor-area-ratio column. Any maxFAR emitted from this row is fabricated — most plausibly by mis-reading ÜZ (a footprint ratio) as a FAR.',
            humanConfirmed: false,
        },
    ];

    // ── The out-of-vocabulary TRAPS. ──
    if (r.gl !== null) {
        rows.push({
            id: `${loc}/trap-GL-as-floors`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxFloors',
            label: 'NOT-A-PARCEL-RULE',
            value: r.gl,
            unit: null,
            evidence: { page: r.page, quote, columnX: 240, columnHeader: 'GL (Gebäude-länge m)', anchor: null },
            qualifiers: quals,
            reviewerNote: `${r.gl} sits at x≈240 = Gebäudelänge in METRES, a column with NO ExtractableField seat. Emitting it as maxFloors is the flattened-stream failure.`,
            humanConfirmed: false,
        });
        rows.push({
            id: `${loc}/trap-GL-as-height`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxHeight_m',
            label: 'NOT-A-PARCEL-RULE',
            value: r.gl,
            unit: null,
            evidence: { page: r.page, quote, columnX: 240, columnHeader: 'GL (Gebäude-länge m)', anchor: null },
            qualifiers: quals,
            reviewerNote: `${r.gl} m is a building LENGTH, not a height.`,
            humanConfirmed: false,
        });
    }
    if (r.fh !== null) {
        rows.push({
            id: `${loc}/trap-FH-as-floors`,
            stratum: 'CH-TABLE',
            locator: loc,
            field: 'maxFloors',
            label: 'NOT-A-PARCEL-RULE',
            value: r.fh,
            unit: null,
            evidence: { page: r.page, quote, columnX: 348, columnHeader: 'FH (Fassaden-höhe m)', anchor: null },
            qualifiers: quals,
            reviewerNote: `${r.fh} sits at x≈348 = Fassadenhöhe in METRES. Read as a storey count it overstates this row by roughly 7x — the E8-SCOUT §3.2 case, now pinned to a checkable coordinate.`,
            humanConfirmed: false,
        });
    }
    return rows;
});
