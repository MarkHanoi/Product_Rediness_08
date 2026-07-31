// @pryzm/ordinance-extraction — joining positioned PDF text ITEMS into page text.
//
// PURE, and deliberately in the package rather than in the pdf.js adapter: this is
// where two measured, corpus-only defects are fixed, and both need regression tests
// that do not require a network or a PDF.
//
// pdf.js hands back positioned text ITEMS, not words or lines. Reconstructing text
// from them is a geometry problem, and getting it wrong is not cosmetic — it
// destroys the input every downstream layer depends on.

/** The subset of a pdf.js `TextItem` this joiner needs. Plain data — no pdf.js types. */
export interface PdfTextItemLike {
    readonly str?: string;
    readonly width?: number;
    readonly transform?: readonly number[];
    readonly hasEOL?: boolean;
}

/**
 * Join positioned PDF text items into page text, restoring word and line breaks
 * from geometry.
 *
 * ── DEFECT 1: words run together (measured, Berlin plan 1-14 p1) ──
 * Naive `items.map(i => i.str).join('')` yields
 *   "Begründunggemäß § 9 Abs. 8 Baugesetzbuchzum Bebauungsplan1-14"
 * because PDFs encode many word gaps as a horizontal JUMP rather than a space
 * character. Every grammar keyword glued to its neighbour then matches nothing. So
 * a space is inserted when the horizontal gap exceeds a fraction of the glyph width.
 *
 * ── DEFECT 2: double newlines (measured, Berlin plan 8-30 p8) ──
 * Most PDFs set `hasEOL` on a line's last item AND move the baseline for the next,
 * so a naive joiner emits TWO newlines per line break. Downstream that is
 * catastrophic: the normalizer reads a blank line as a PARAGRAPH boundary, so no
 * wrapped line merges, no hyphenated compound rejoins, and any sentence spanning a
 * line break becomes unparseable. On 8-30 it split
 *   "…GRZ von 0,3 sowie einer / Geschossflächenzahl … dargestellt."
 * in two, hiding the `dargestellt` attribution from the reject patterns and letting
 * a superseded instrument's value through as if it were the plan's. Every newline
 * therefore goes through a guard that refuses to double one.
 *
 * @param spaceGapRatio gap, as a multiple of mean glyph width, that implies a
 *   space. Default 0.28 — high enough not to split letter-spaced headings into
 *   single characters, low enough to catch real word gaps.
 */
export function joinPdfTextItems(
    items: readonly PdfTextItemLike[],
    spaceGapRatio = 0.28,
): string {
    let out = '';
    let prevEndX: number | null = null;
    let prevY: number | null = null;

    /** Emit a newline, never two in a row (DEFECT 2). */
    const newline = (): void => {
        if (!out.endsWith('\n')) out += '\n';
    };

    for (const item of items) {
        const str = item.str ?? '';
        const t = item.transform;
        const x = t && t.length >= 6 ? (t[4] as number) : null;
        const y = t && t.length >= 6 ? (t[5] as number) : null;
        const width = item.width ?? 0;

        if (str === '') {
            if (item.hasEOL) {
                newline();
                prevEndX = null;
                prevY = y;
            }
            continue;
        }

        if (out !== '') {
            const lineChanged = prevY !== null && y !== null && Math.abs(y - prevY) > 1;
            if (lineChanged) {
                newline();
            } else if (prevEndX !== null && x !== null) {
                const gap = x - prevEndX;
                const glyph = str.length > 0 && width > 0 ? width / str.length : 0;
                const threshold = glyph > 0 ? glyph * spaceGapRatio : 1;
                if (gap > threshold && !/\s$/.test(out) && !/^\s/.test(str)) out += ' ';
            }
        }

        out += str;
        if (x !== null) prevEndX = x + width;
        if (y !== null) prevY = y;
        if (item.hasEOL) {
            newline();
            prevEndX = null;
        }
    }
    return out;
}
