// @pryzm/ordinance-extraction — LAYER 3, step 2: lines → RECONSTRUCTED GRID.
//
// The one component `ingest/types.ts` declared and nothing implemented, and the
// one place the Luzern 7x overstatement (see `structure/types.ts` header) can be
// stopped. Country-agnostic: it recovers a grid and the header TEXT and never
// interprets either.
//
// ── THE COLUMN MODEL COMES FROM THE HEADER, NOT FROM THE PAGE ────────────────
// The first cut of this file discovered column anchors by clustering x positions
// PER PAGE. Run against the real Luzern BZR it produced eight different anchor
// sets across three pages of ONE table (p26 found `125.4` and not `177.3`; p27
// found `177.3` and not `125.4`), because a page only shows the columns its rows
// happen to fill. A table's column model is a property of the TABLE. So the
// header line defines the anchors, and it earns that role by LOOKAHEAD: a line is
// a header only if the lines below it actually snap to its x positions. Prose
// cannot fake that — its word positions do not repeat down the page.
//
// ⛔ THE CONTRACT `CanonicalTable` ALREADY DECLARED, HONOURED LITERALLY:
// "A table we could not confidently reconstruct is reported as such rather than
// emitted as plausible-looking rows." So `confident: false` ⇒ `rows: []`, always.
// A caller cannot accidentally consume an unreconstructed grid, because there is
// nothing there to consume — the diagnostics carry the withheld rows for a HUMAN,
// and `TableDiagnostics.candidateRows` says so in its own doc comment.

import { type CanonicalTable } from '../ingest/types.js';
import {
    DEFAULT_LAYOUT_OPTIONS,
    type LayoutLine,
    type LayoutOptions,
    type PositionedItem,
    type TableDiagnostics,
    type TableRejectReason,
} from './types.js';
import { joinItemsOnLine } from './lines.js';

/**
 * Extra Layer-3 knobs that only the grid step needs. Split from
 * {@link LayoutOptions} so the section builder is not asked to carry them.
 */
export interface TableOptions extends LayoutOptions {
    /**
     * A line qualifies as a header only if at least {@link headerMinConfirmations}
     * of the next this-many lines snap cleanly to its x positions. Default 8.
     */
    readonly headerLookahead: number;
    /** How many of those lookahead lines must confirm. Default 2. */
    readonly headerMinConfirmations: number;
    /**
     * A line whose items only PARTLY snap is skipped rather than forced into the
     * grid — unless at least this fraction snap AND it fills enough columns to
     * look like a row, in which case it is kept AND the table is reported
     * unconfident. Default 0.6. ⭐ This is the branch that makes "a number in a
     * table we cannot parse" an HONEST FAILURE instead of a guess.
     */
    readonly minSnapFraction: number;
}

/** The published grid defaults (see the warning on {@link LayoutOptions}). */
export const DEFAULT_TABLE_OPTIONS: TableOptions = Object.freeze({
    ...DEFAULT_LAYOUT_OPTIONS,
    headerLookahead: 8,
    headerMinConfirmations: 2,
    minSnapFraction: 0.6,
});

/** A reconstructed table plus the evidence for its verdict. */
export interface TableReconstruction {
    readonly table: CanonicalTable;
    readonly diagnostics: TableDiagnostics;
}

/** Numeric-looking cell (either decimal convention, optional sign/percent). */
const NUMERIC_CELL = /^[+-]?\d[\d.,\s]*%?$/;

/**
 * Index of the column an x belongs to, or -1 for "fits no column".
 *
 * An item snaps when it sits on an anchor within `tolerance` — OR when it lies to
 * the RIGHT of the LAST anchor. The right-overflow rule is not a fudge: the last
 * column of a table is the only one with no right neighbour, so it is the only one
 * whose extent is unbounded, and free-text remarks columns routinely wrap and
 * indent inside it.
 *
 * ⭐ MEASURED, and this rule was ADDED because its absence LOST A QUALIFIER.
 * Luzern BZR p27 row 16 carries ", Art. 7" at x=507.8 in the "Weitere
 * Bestimmungen" column (anchor 476.4). Nearest-anchor snapping dropped that item,
 * dropped the whole line with it, and still reported the table `confident: true` —
 * emitting "Gestaltungsplan- Abs. 3, Art. 43 Abs. 3" where the ordinance says
 * "Gestaltungsplanpflicht, Art. 7 Abs. 3, Art. 43 Abs. 3". Losing "Art. 7" from a
 * planning qualifier is a CONTROL-8 breach (qualifiers must survive normalization)
 * and it was silent, which is worse.
 *
 * Widening every column to a band would readmit the footnotes this reconstruction
 * exists to keep out (a footnote at x=70.9 would fall in the band of the anchor at
 * 59.6 and be merged into a real row). Only the last column is widened.
 */
function snapIndex(x: number, anchors: readonly number[], tolerance: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < anchors.length; i++) {
        const d = Math.abs(anchors[i]! - x);
        if (d <= tolerance && d < bestD) {
            bestD = d;
            best = i;
        }
    }
    if (best >= 0) return best;
    const last = anchors.length - 1;
    if (last >= 0 && x > anchors[last]! + tolerance) return last;
    return -1;
}

/** One line's items distributed into anchor columns. */
interface SnappedLine {
    readonly cells: readonly string[];
    /** Distinct columns this line writes into. */
    readonly usedColumns: number;
    /** Items that snapped to nothing. */
    readonly unsnapped: number;
    /** Fraction of the line's items that snapped (1 when the line is empty). */
    readonly snapFraction: number;
    /** True when the line writes in column 0 — a table's ROW KEY column. */
    readonly writesKeyColumn: boolean;
}

function snapLine(
    line: LayoutLine,
    anchors: readonly number[],
    options: TableOptions,
): SnappedLine {
    const buckets: PositionedItem[][] = anchors.map(() => []);
    let unsnapped = 0;
    for (const item of line.items) {
        const i = snapIndex(item.x, anchors, options.columnTolerance);
        if (i < 0) {
            unsnapped += 1;
            continue;
        }
        buckets[i]!.push(item);
    }
    const cells = buckets.map((b) => joinItemsOnLine(b, options.spaceGapRatio));
    const total = line.items.length;
    return {
        cells,
        usedColumns: cells.filter((c) => c !== '').length,
        unsnapped,
        snapFraction: total === 0 ? 1 : (total - unsnapped) / total,
        writesKeyColumn: cells[0] !== undefined && cells[0] !== '',
    };
}

/**
 * Append a continuation fragment to a cell, undoing a soft hyphen the way the
 * Layer-2 normalizer does ("Gestaltungsplan-" + "pflicht" → "Gestaltungsplanpflicht").
 * ⚠ This matters for CONTROL 8: `Gestaltungsplanpflicht` is a QUALIFIER, and a
 * reconstruction that drops the wrapped half drops the qualifier.
 */
function appendCell(existing: string, fragment: string): string {
    if (existing === '') return fragment;
    if (fragment === '') return existing;
    if (/[\p{L}]-$/u.test(existing) && /^[\p{Ll}]/u.test(fragment)) {
        return existing.slice(0, -1) + fragment;
    }
    return existing + ' ' + fragment;
}

/** Candidate anchors from one line's item positions, left to right. */
function anchorsOf(line: LayoutLine): number[] {
    return line.items.map((i) => i.x).sort((a, b) => a - b);
}

/** No two anchors closer than `minColumnSeparation` — else the banding is ambiguous. */
function anchorsSeparated(anchors: readonly number[], options: TableOptions): boolean {
    for (let i = 1; i < anchors.length; i++) {
        if (anchors[i]! - anchors[i - 1]! < options.minColumnSeparation) return false;
    }
    return true;
}

/**
 * Is `line` a table HEADER? Two conditions, both structural:
 *   1. it is header-SHAPED — enough cells, none of them numeric, well separated;
 *   2. it is CONFIRMED — enough of the following lines snap cleanly to its x
 *      positions and fill enough columns. Prose fails (2) reliably, because the
 *      word positions of one paragraph line do not recur on the next.
 */
function isHeaderLine(
    lines: readonly LayoutLine[],
    index: number,
    options: TableOptions,
): boolean {
    const line = lines[index]!;
    if (line.items.length < options.minColumns) return false;
    if (line.items.some((i) => NUMERIC_CELL.test(i.text.trim()))) return false;
    const anchors = anchorsOf(line);
    if (!anchorsSeparated(anchors, options)) return false;

    let confirmations = 0;
    for (let j = index + 1; j < Math.min(lines.length, index + 1 + options.headerLookahead); j++) {
        const s = snapLine(lines[j]!, anchors, options);
        if (s.unsnapped === 0 && s.usedColumns >= options.minColumns) confirmations += 1;
        if (confirmations >= options.headerMinConfirmations) return true;
    }
    return false;
}

/** One accumulated row, with the page it was read from. */
interface AccumulatedRow {
    readonly page: number;
    cells: string[];
    /** Items on this row that snapped to no column — the ragged-grid signal. */
    unsnapped: number;
}

/** A table being accumulated across lines and pages. */
interface OpenTable {
    readonly anchors: readonly number[];
    header: string[];
    readonly headerPage: number;
    readonly rows: AccumulatedRow[];
    /** Lines inside the table's span that fit no column at all (footnotes, furniture). */
    skipped: number;
}

/** Split accumulated rows into one `CanonicalTable` per page. */
function emitTables(open: OpenTable, options: TableOptions): TableReconstruction[] {
    const byPage = new Map<number, AccumulatedRow[]>();
    for (const row of open.rows) {
        const list = byPage.get(row.page);
        if (list) list.push(row);
        else byPage.set(row.page, [row]);
    }

    const out: TableReconstruction[] = [];
    for (const [page, rows] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
        const body = rows.map((r) => r.cells);
        const unsnapped = rows.reduce((s, r) => s + r.unsnapped, 0);
        const dataColumns = new Set<number>();
        for (const row of body) {
            row.forEach((c, i) => {
                if (c !== '') dataColumns.add(i);
            });
        }

        const reasons: TableRejectReason[] = [];
        if (unsnapped > 0) reasons.push('unsnapped-cells');
        if (body.length < options.minRows) reasons.push('too-few-rows');
        if (dataColumns.size < options.minColumns) reasons.push('too-few-columns');
        if (!anchorsSeparated(open.anchors, options)) reasons.push('ambiguous-columns');
        for (const c of dataColumns) {
            if ((open.header[c] ?? '') === '') {
                reasons.push('unnamed-column');
                break;
            }
        }

        const continued = page !== open.headerPage;
        const confident = reasons.length === 0;
        const detail = confident
            ? 'Grid reconstructed on ' +
              open.anchors.length +
              ' column anchor(s) over ' +
              body.length +
              ' body row(s); header ' +
              (continued ? 'CONTINUED from page ' + open.headerPage : 'recognised on this page') +
              '; every retained item snapped to a column.'
            : 'NOT confidently reconstructed (' +
              reasons.join(', ') +
              ') — ' +
              open.anchors.length +
              ' anchor(s), ' +
              body.length +
              ' candidate body row(s), ' +
              unsnapped +
              ' item(s) fitting no column. Rows withheld: an unreconstructed grid is ' +
              'reported, never emitted as plausible rows.';

        out.push({
            table: {
                page,
                rows: confident ? body : [],
                confident,
                detail,
                header: [...open.header],
                headerSource: continued ? 'continued' : 'this-page',
                columnAnchors: open.anchors,
            },
            diagnostics: {
                page,
                confident,
                reasons,
                columnAnchors: open.anchors,
                bodyRowCount: body.length,
                candidateRows: body,
                unsnappedItems: unsnapped,
                skippedLines: open.skipped,
                options,
            },
        });
    }
    return out;
}

/**
 * Reconstruct every table in a DOCUMENT from its lines in document order
 * (page ascending, then top of page first — exactly what `buildLines` emits when
 * its pages are concatenated in order).
 *
 * A table opens at a confirmed header line and stays open until the next
 * confirmed header or the end of the document. Lines that fit no column
 * (footnotes, running heads, the page number at the foot of the page) are SKIPPED
 * and counted, never forced into a row — the Luzern BZR interleaves footnotes
 * between the rows of its Anhang 1 on nearly every page, and closing the table on
 * each one would throw away ten of its eleven pages.
 */
export function reconstructDocumentTables(
    lines: readonly LayoutLine[],
    options: TableOptions = DEFAULT_TABLE_OPTIONS,
): TableReconstruction[] {
    const out: TableReconstruction[] = [];
    let open: OpenTable | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.items.length === 0) continue;

        // A confirmed header always starts a new table (and closes the previous).
        if (isHeaderLine(lines, i, options)) {
            if (open !== null) out.push(...emitTables(open, options));
            open = {
                anchors: anchorsOf(line),
                header: [...line.items].sort((a, b) => a.x - b.x).map((it) => it.text.trim()),
                headerPage: line.pageNumber,
                rows: [],
                skipped: 0,
            };
            continue;
        }
        if (open === null) continue;

        const snapped = snapLine(line, open.anchors, options);
        const clean = snapped.unsnapped === 0;
        const rowShaped = snapped.usedColumns >= options.minColumns;

        if (clean && rowShaped) {
            open.rows.push({ page: line.pageNumber, cells: [...snapped.cells], unsnapped: 0 });
        } else if (clean && snapped.usedColumns > 0 && !snapped.writesKeyColumn) {
            // ── A WRAPPED CELL, not a new row. The rule is structural, not a
            // heuristic: a keyed table's FIRST column is its row key, so a line
            // that writes in column 0 always starts something new, and a line that
            // does not can only be continuing the row above (or the header, when
            // no row has been read yet — Luzern's "Weitere" / "Bestimmungen").
            const target = open.rows.length > 0 ? open.rows[open.rows.length - 1]!.cells : open.header;
            for (let c = 0; c < snapped.cells.length; c++) {
                const frag = snapped.cells[c]!;
                if (frag !== '') target[c] = appendCell(target[c] ?? '', frag);
            }
        } else if (clean && snapped.writesKeyColumn) {
            // Writes the key column but fills too few columns: a band label
            // ("Wohn- und Arbeitszone (WA)"). Kept as its own sparse row —
            // merging it upward would corrupt the previous row's key.
            open.rows.push({ page: line.pageNumber, cells: [...snapped.cells], unsnapped: 0 });
        } else if (snapped.snapFraction >= options.minSnapFraction && rowShaped) {
            // ⭐ RAGGED: it looks like a row, and the column model does not explain
            // it. Kept (so nothing is silently dropped) AND counted, which makes
            // the whole page unconfident and withholds its rows.
            open.rows.push({
                page: line.pageNumber,
                cells: [...snapped.cells],
                unsnapped: snapped.unsnapped,
            });
        } else {
            open.skipped += 1;
        }
    }

    if (open !== null) out.push(...emitTables(open, options));
    return out;
}
