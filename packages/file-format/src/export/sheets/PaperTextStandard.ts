/**
 * PaperTextStandard — §SHEET-TEXT-IS-PAPER-LETTERING (L-10680)
 *
 * THE ONE DEFINITION of how tall annotation lettering is on an issued sheet,
 * and how it is painted.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * The founder, 2026-08-24: *"Exporting sheets to PDF — the text of the rooms,
 * labels, is not readable."* Every room label in his A1 export came out as a
 * dense dark smudge while the linework beside it was clean.
 *
 * ⭐ THE MEASUREMENT, taken from the emitted SVG rather than from the symptom
 * (`packages/file-format/__tests__/sheet-paper-text-standard.test.ts` pins all
 * of it):
 *
 *   · The room name was emitted at `font-size="2.500"` in a document whose user
 *     unit IS one paper millimetre — so a **2.500 mm em**, i.e. a **1.79 mm CAP
 *     HEIGHT** (Arial capHeight = 1467/2048 = 0.7163 em). The room number came
 *     out at 1.61 mm and the area at 1.43 mm. **All three are at or below the
 *     1.8 mm floor of the ISO 3098 nominal size series** — the smallest height
 *     the standard admits, because below it reproduction closes the counters.
 *   · ⭐ **AND EVERY `<text>` INHERITED A 1.00 mm STROKE.** The annotation layer
 *     opens `<g id="annotations" fill="#1a2035" stroke="#1a2035">` and no `<text>`
 *     under it set `stroke-width`, so each glyph was painted with SVG's initial
 *     `stroke-width: 1` — one user unit — **one paper millimetre**. svg2pdf.js
 *     honours that exactly (`getTextRenderingMode` → `fillThenStroke`, then
 *     `setLineWidth(1.0)`), so the PDF stroked a 0.22 mm Arial stem with a 1 mm
 *     pen: every stem became ~1.2 mm, every counter filled, and adjacent rows —
 *     2.5 mm apart with ±0.5 mm of bleed each — merged into one blob.
 *     **ISO 3098-0 type B puts the lettering line width at d = 0.1 h.** One
 *     millimetre on a 1.79 mm cap height is **5.6 × the standard**, and it was
 *     applied ON TOP of a solid fill.
 *
 * ⭐ THE STANDARD DID NOT EXIST TO CHECK AGAINST. `SPEC-AUTODIMENSION` §12 is
 * the repo's GA drafting standard and §12.11 fixes a LINEWEIGHT hierarchy, but
 * neither it nor C34/C101/C102 stated a text height in millimetres. The only
 * number anywhere was `ANNOTATION_TEXT_HEIGHT_MAX_MM = 100` — a ceiling with no
 * floor. The floor is now written down: SPEC-AUTODIMENSION §12.14.
 *
 * ─── THE UNIT CONFUSION THAT CAUSED THE UNDERSIZE ──────────────────────────
 * `AnnotationStyle.textSizeMm` is DECLARED as *"paper-space text height in mm"*.
 * In every CAD lineage — DXF group 40, Revit text type, ISO 3098's `h` — "text
 * height" means the CAP HEIGHT. In SVG and PDF, `font-size` means the EM. The
 * renderer passed one straight into the other, so a style asking for 2.5 mm
 * lettering was emitted as 2.5 mm of em and drew 1.79 mm of letter: **every
 * annotation on every sheet was 28 % short of its declared height.** The two
 * units are converted here, in one place, and nowhere else.
 *
 * Pure module: no DOM, no THREE, no I/O.
 */

/**
 * Cap height ÷ em for the Helvetica/Arial metric family every sheet annotation
 * is emitted in (`Arial, Helvetica, sans-serif`). Arial's `capHeight` is
 * 1467/2048 = 0.71631; Helvetica's is 0.717. One constant serves both, and a
 * different family would need its own — which is why the font stack is fixed at
 * the annotation layer rather than chosen per element.
 */
export const CAP_HEIGHT_RATIO = 0.716;

/**
 * ISO 3098 nominal lettering-height series (mm). 1.8 is the smallest member and
 * therefore the floor: below it the standard makes no claim that the lettering
 * survives reproduction, and in practice the counters close.
 */
export const ISO_3098_HEIGHT_SERIES_MM = [1.8, 2.5, 3.5, 5, 7, 10, 14, 20] as const;

/** ⛔ No annotation may be emitted to paper below this cap height (mm). */
export const MIN_PAPER_TEXT_HEIGHT_MM = 1.8;

/**
 * Default cap height for PRIMARY annotation lettering (room names, dimension
 * values, tag marks) — the second member of the ISO series, and the value
 * `DEFAULT_ANNOTATION_STYLE.textSizeMm` already carries.
 */
export const DEFAULT_PAPER_TEXT_HEIGHT_MM = 2.5;

/**
 * Baseline-to-baseline advance, as a multiple of the row's own cap height.
 *
 * ISO 3098-0 type B sets the MINIMUM line spacing at b = 1.4 h. PRYZM emits
 * 1.5 h so that a compliant drawing is not sitting exactly on the limit — the
 * room tag previously advanced 1.00 em, which is 1.40 h *to three figures*: it
 * satisfied the minimum with zero margin, and once each glyph carried ±0.5 mm
 * of stroke bleed the rows overlapped by 0.29 mm.
 */
export const LINE_ADVANCE_RATIO = 1.5;

/** ISO 3098-0 type B lettering line width: d = 0.1 h. Sheet text is FILLED, so
 *  this is the ceiling for any deliberate stroke, never a value to add on top of
 *  a fill. The renderer emits `stroke="none"` on every `<text>`. */
export const ISO_LETTERING_STROKE_RATIO = 0.1;

/**
 * The cap height a style asks for, clamped to the standard.
 *
 * `undefined` is the common case — `RoomTagAutoPopulator` and friends build
 * annotations with `style: {}` — and must land on the default, not on zero.
 */
export function letteringHeightMm(styleTextSizeMm?: number): number {
    const h = Number.isFinite(styleTextSizeMm) && (styleTextSizeMm as number) > 0
        ? (styleTextSizeMm as number)
        : DEFAULT_PAPER_TEXT_HEIGHT_MM;
    return Math.max(MIN_PAPER_TEXT_HEIGHT_MM, h);
}

/** The SVG/PDF `font-size` (mm) that renders `h` mm of cap height. */
export function emFromLetteringHeight(h: number): number {
    return h / CAP_HEIGHT_RATIO;
}

/** The cap height (mm) an SVG/PDF `font-size` of `em` mm actually draws. */
export function letteringHeightFromEm(em: number): number {
    return em * CAP_HEIGHT_RATIO;
}

/** ⛔ The smallest `font-size` (mm) that clears `MIN_PAPER_TEXT_HEIGHT_MM`. */
export const MIN_PAPER_TEXT_EM_MM = emFromLetteringHeight(MIN_PAPER_TEXT_HEIGHT_MM);

/**
 * A SUBORDINATE row's `font-size` (mm): `ratio` of the primary em, but never
 * below the floor. The room tag's area line was 0.8 × 2.5 mm = 2.0 mm of em =
 * **1.43 mm of cap height** — the single worst reading in the export.
 */
export function subordinateEmMm(primaryEmMm: number, ratio: number): number {
    return Math.max(MIN_PAPER_TEXT_EM_MM, primaryEmMm * ratio);
}

/** Baseline-to-baseline advance (mm) for a stack whose primary em is `em` mm. */
export function lineAdvanceFromEm(em: number): number {
    return LINE_ADVANCE_RATIO * letteringHeightFromEm(em);
}
