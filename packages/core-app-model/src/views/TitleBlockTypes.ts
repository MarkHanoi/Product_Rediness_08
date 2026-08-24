/**
 * TitleBlockTypes — Phase S3 (Sheet Integration)
 *
 * Pure data types for TitleBlock templates.
 * No imports, no circular dependencies, no DOM/Three.js.
 *
 * Contract compliance:
 *   §01 §3.3 — Follows ElementStore<T> schema conventions
 *   §03 §1.1 — Schema-stable; all additions are additive
 *   §05      — Pure data module; no UI, no rendering
 *
 * A TitleBlock template defines:
 *   - Paper size in millimetres
 *   - Named field zones for text content (project name, sheet number, etc.)
 *   - A reserved area for the revision table
 */

// ── Field Zone ─────────────────────────────────────────────────────────────────

/**
 * A labelled rectangular zone on the title block.
 * Position and size are in millimetres, relative to the bottom-left of the sheet.
 */
export interface TitleBlockFieldZone {
    /** Machine-readable field key, e.g. "projectName", "sheetNumber". */
    key:    string;
    /** Human-readable label shown in the UI. */
    label:  string;
    /** X position from the left of the sheet (mm). */
    x:      number;
    /** Y position from the bottom of the sheet (mm). */
    y:      number;
    /** Width of the zone (mm). */
    width:  number;
    /** Height of the zone (mm). */
    height: number;
    /** Font size in points (default 8). */
    fontSize?: number;
    /** Whether the zone text is bold (default false). */
    bold?: boolean;
}

// ── Revision Table Zone ────────────────────────────────────────────────────────

/**
 * The zone reserved for the revision history table.
 * Each revision entry occupies one row.
 */
export interface TitleBlockRevisionZone {
    x:           number;
    y:           number;
    width:       number;
    /** Height of a single revision row (mm). */
    rowHeight:   number;
    /** Maximum number of rows to display before overflow. */
    maxRows:     number;
}

// ── TitleBlock Template ────────────────────────────────────────────────────────

export interface TitleBlockTemplate {
    /** Stable unique ID, e.g. "a0-standard", "a1-standard", "a3-standard". */
    id:           string;
    /** Display name shown in the UI, e.g. "A0 Standard". */
    name:         string;
    /** Paper width in millimetres. */
    paperWidth:   number;
    /** Paper height in millimetres. */
    paperHeight:  number;
    /** Width of the title block strip (typically at the right or bottom). */
    borderWidth:  number;
    /**
     * Named field zones for text content.
     * Standard keys: projectName, projectAddress, sheetNumber, sheetName,
     *                drawnBy, checkedBy, approvedBy, date, scale, revision, contractNo
     */
    fields:       TitleBlockFieldZone[];
    /** Zone reserved for the revision history table (optional). */
    revisionZone?: TitleBlockRevisionZone;
}

// ── Standard paper sizes ───────────────────────────────────────────────────────

/**
 * Standard paper sizes in mm (LANDSCAPE — width ≥ height). Portrait is the same
 * pair swapped; `resolveSheetPaper` in `SheetPaperResolution.ts` does the swap
 * from the title block's orientation, so orientation is never tabulated twice.
 *
 * ⭐ THE ANSI ROWS ARE NOT DECORATION (L-10684). `SheetDefinition.paperSize`
 * has always admitted `'ANSI-A' | 'ANSI-B' | 'ANSI-C' | 'ANSI-D'` and the Paper
 * dropdown has always offered them, while this table stopped at A4 — so those
 * four entries named sizes the product could not express. Now that the sheet's
 * paper is the authority, an unlisted key silently falls back to the title
 * block's own paper, which is precisely the "picked A0, got A3" shape. Added
 * from ANSI/ASME Y14.1 (inches × 25.4, exact).
 */
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
    'A0':     { width: 1189,  height: 841   },
    'A1':     { width: 841,   height: 594   },
    'A2':     { width: 594,   height: 420   },
    'A3':     { width: 420,   height: 297   },
    'A4':     { width: 297,   height: 210   },
    'ANSI-A': { width: 279.4, height: 215.9 },   // 11    × 8.5 in
    'ANSI-B': { width: 431.8, height: 279.4 },   // 17    × 11  in
    'ANSI-C': { width: 558.8, height: 431.8 },   // 22    × 17  in
    'ANSI-D': { width: 863.6, height: 558.8 },   // 34    × 22  in
} as const;
