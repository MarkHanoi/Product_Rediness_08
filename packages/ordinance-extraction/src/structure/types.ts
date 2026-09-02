// @pryzm/ordinance-extraction — LAYER 3 vocabulary: page GEOMETRY → lines → grid.
//
// ── WHY THIS LAYER EXISTS AT ALL (measured, 2026-09-01, lane E8-SPINE) ────────
// `ingest/types.ts` declared `CanonicalDocument` / `CanonicalSection` /
// `CanonicalTable` on 2026-08-09 and NOTHING produced one. That hole is not
// cosmetic; it is where a whole class of confidently-wrong values enters.
//
// Luzern's Bau- und Zonenreglement, Anhang 1 "Zonen- und Dichtebestimmungen",
// fetched and measured today (46 pp · 69,714 chars · born-digital). Flattened to a
// text stream by ANY item joiner, two of its rows read:
//
//     10 WA 0.15 21 geschlossen        ← 21 is FASSADENHÖHE, 21 metres
//     11 WA 0.2  3  offen              ← 3  is VOLLGESCHOSSE, 3 storeys
//
// A line-based grammar reads "21 Vollgeschosse" and overstates a 3-storey zone by
// 7x, WITH A CORRECT CITATION ATTACHED. Every guard the package already owns says
// PASS: the locale gate (21 is a clean number), the range gate (maxFloors ∈ [1,40]),
// dual-pass agreement (both passes read the same flattened stream) and n-gram
// containment (the 21 really is in the source). The error is in the GEOMETRY of the
// page, not in the reading of the token — so only geometry can catch it.
//
// The geometry is right there and is exact (probed on the real PDF today):
//
//     header p26  Nr.=31.1  Zonenart=59.6  A/B=125.4  ÜZ=177.3  GL=240.2
//                 VG=300.4  FH=348.3  g/o=400.5  Weitere Bestimmungen=476.4
//     row 10 p27  "10"@31.1  "WA"@59.6  "0.15"@177.3  "21"@348.3  …
//     row 11 p27  "11"@31.1  "WA"@59.6  "0.2"@177.3   "3"@300.4   …
//
// x=348.3 IS the FH column and x=300.4 IS the VG column. Reconstruct the grid and
// the 7x overstatement is not "caught" — it is UNREPRESENTABLE.
//
// COUNTRY-AGNOSTIC (control 5). Nothing here knows what "FH" means; it recovers a
// GRID and the header TEXT. Mapping a heading to an envelope parameter is a
// per-country adapter's job (`adapters/swissZoneTable.ts` is the first).
//
// Pure data + types: no I/O, no THREE, no DOM (P5-consistent; L2 leaf).

/**
 * One positioned glyph run, in PDF user-space points, origin bottom-left (so a
 * LARGER `y` is HIGHER on the page). This is `PdfTextItemLike` with its transform
 * already resolved — see {@link toPositionedItems}.
 */
export interface PositionedItem {
    readonly text: string;
    /** Left edge. */
    readonly x: number;
    /** Baseline y (bottom-left origin: larger = higher up the page). */
    readonly y: number;
    /** Advance width of the run. */
    readonly width: number;
    /** Glyph height, or 0 when the source reported none. */
    readonly height: number;
}

/** One page's positioned items, 1-based page number (as a citation names it). */
export interface PageItems {
    readonly pageNumber: number;
    readonly items: readonly PositionedItem[];
}

/**
 * A run of items sharing a baseline — the unit both the table reconstructor and
 * the section builder work in.
 */
export interface LayoutLine {
    readonly pageNumber: number;
    /** The representative baseline y of the line. */
    readonly y: number;
    /** Items left-to-right. */
    readonly items: readonly PositionedItem[];
    /** The line's text, spaced by the same geometric rule the page joiner uses. */
    readonly text: string;
    readonly minX: number;
    readonly maxX: number;
    /** The tallest glyph height on the line (0 when unknown) — the heading signal. */
    readonly maxHeight: number;
}

/**
 * Layer-3 tuning. ⚠ EVERY DEFAULT IS A CHOICE, NOT A LAW — same discipline as
 * `ClassificationThresholds`: stated as data, defaulted explicitly, and carried on
 * every result so a reconstruction can be re-run under different values without
 * re-reading a single PDF.
 */
export interface LayoutOptions {
    /**
     * Two items are on the SAME line when their baselines differ by at most this
     * many points. Default 2.0 — below the ~13 pt line pitch of the measured
     * corpora, above the sub-point baseline jitter within one line.
     */
    readonly lineTolerance: number;
    /**
     * An item's left edge snaps to a column anchor within this many points.
     * Default 3.0 — the measured Luzern columns are ≥ 28 pt apart, so this is
     * two orders of margin below the nearest ambiguity.
     */
    readonly columnTolerance: number;
    /**
     * An x position becomes a COLUMN ANCHOR only if at least this many lines start
     * an item there. Default 3 — one accidental alignment is not a column.
     */
    readonly minLinesPerColumn: number;
    /** A table block needs at least this many BODY rows. Default 3. */
    readonly minRows: number;
    /** A table block needs at least this many columns. Default 3. */
    readonly minColumns: number;
    /**
     * Two anchors closer than this are AMBIGUOUS banding — a cell could belong to
     * either, so the table is reported unconfident rather than split arbitrarily.
     * Default 8.0 pt.
     */
    readonly minColumnSeparation: number;
    /**
     * Horizontal gap, as a multiple of mean glyph width, that implies a space.
     * Default 0.28 — the value `joinPdfTextItems` was tuned to on the Berlin corpus.
     */
    readonly spaceGapRatio: number;
}

/** The published Layer-3 defaults (see the warning on {@link LayoutOptions}). */
export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = Object.freeze({
    lineTolerance: 2.0,
    columnTolerance: 3.0,
    minLinesPerColumn: 3,
    minRows: 3,
    minColumns: 3,
    minColumnSeparation: 8.0,
    spaceGapRatio: 0.28,
});

/**
 * WHY a candidate grid was not confidently reconstructed. Each is a distinct,
 * reportable state — collapsing them into one "failed" would repeat the
 * failure ≠ absence defect this package exists to avoid.
 *   - `no-header`             — a grid was found but no column headings; the cells
 *                               are anonymous and no claim may be attributed.
 *   - `unsnapped-cells`       — items sat between anchors: the column model does
 *                               not explain the page.
 *   - `ambiguous-columns`     — two anchors closer than `minColumnSeparation`.
 *   - `too-few-rows`          — fewer body rows than `minRows`.
 *   - `too-few-columns`       — fewer columns than `minColumns`.
 *   - `unnamed-column`        — a column CARRIES DATA but the header names it
 *                               nothing. A value in an unnamed column is exactly
 *                               the Luzern trap in a new costume, so the whole
 *                               grid is withheld rather than the column dropped.
 */
export type TableRejectReason =
    | 'no-header'
    | 'unsnapped-cells'
    | 'ambiguous-columns'
    | 'too-few-rows'
    | 'too-few-columns'
    | 'unnamed-column';

/**
 * The diagnostics behind one reconstruction verdict — kept beside the
 * `CanonicalTable` (whose `rows` are EMPTY when unconfident, by its own declared
 * contract) so an unconfident table is debuggable without being consumable.
 */
export interface TableDiagnostics {
    readonly page: number;
    readonly confident: boolean;
    readonly reasons: readonly TableRejectReason[];
    readonly columnAnchors: readonly number[];
    /** Body rows the grid produced (0 when the block was rejected outright). */
    readonly bodyRowCount: number;
    /**
     * The body rows the grid produced, INCLUDING when they were withheld from
     * `CanonicalTable.rows` because the verdict was unconfident.
     *
     * ⛔ NOT A CONSUMER SEAT. A claim producer MUST read `CanonicalTable.rows` and
     * nothing else — that is the field whose emptiness is the honesty guarantee.
     * These are here for exactly two callers: a human debugging a reconstruction,
     * and `linkTableContinuations`, which must be able to restore the rows of a
     * page whose ONLY defect was that its header lives on an earlier page.
     */
    readonly candidateRows: readonly (readonly string[])[];
    /** Items that snapped to no anchor — the direct evidence for `unsnapped-cells`. */
    readonly unsnappedItems: number;
    /**
     * Lines inside the table's span that fitted NO column and were skipped —
     * footnotes, running heads, the page number at the foot of the page. Counted
     * rather than silently dropped: a table whose skip count dwarfs its row count
     * is a reconstruction a human should look at, even when every retained row is
     * clean.
     */
    readonly skippedLines: number;
    readonly options: LayoutOptions;
}
