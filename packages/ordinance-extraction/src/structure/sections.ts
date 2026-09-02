// @pryzm/ordinance-extraction — LAYER 4, step 1: lines → HEADED SECTIONS.
//
// "§ 13 Bauweise" beats "page 47" for a human verifying a value (L-449), so a
// citation that can name its heading is materially better evidence than one that
// can only name a page. This builds the heading→paragraph structure that lets it.
//
// COUNTRY-AGNOSTIC (control 5). The default heading test is TYPOGRAPHIC — a short
// line set in type taller than the body — plus an OPTIONAL caller-supplied
// predicate for jurisdictions whose headings are marked lexically ("Art. 27",
// "§ 9", "Article UA 10"). The lexical half is per-country and is therefore an
// argument, never a constant in here.

import { type CanonicalParagraph, type CanonicalSection } from '../ingest/types.js';
import { type LayoutLine } from './types.js';

/** How a line is judged to be a heading. */
export interface SectionOptions {
    /**
     * A line is a heading when its tallest glyph exceeds the document's median
     * body height by at least this factor. Default 1.12 — the measured Luzern BZR
     * sets headings at 14.0 pt against a 12.0/13.0 pt body.
     */
    readonly headingHeightFactor: number;
    /** A heading is short. Lines longer than this are body text. Default 120 chars. */
    readonly maxHeadingChars: number;
    /**
     * An OPTIONAL per-country lexical heading test, OR-ed with the typographic one
     * (e.g. `/^(Art\.|§|Anhang)\s/` for German-speaking cantons). Supplied by an
     * adapter; never hard-coded here.
     */
    readonly headingPattern?: RegExp;
}

/** The published section defaults (a choice, not a law — see `ClassificationThresholds`). */
export const DEFAULT_SECTION_OPTIONS: SectionOptions = Object.freeze({
    headingHeightFactor: 1.12,
    maxHeadingChars: 120,
});

/** Median of a numeric sample (0 for an empty sample). */
function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
}

/**
 * Group lines into headed sections. Lines already consumed by a reconstructed
 * table should be excluded by the caller — a table row is not a paragraph, and
 * letting it become one is how a flattened grid re-enters the text path through
 * the back door (which is the whole defect Layer 3 exists to close).
 */
export function buildSections(
    lines: readonly LayoutLine[],
    options: SectionOptions = DEFAULT_SECTION_OPTIONS,
): CanonicalSection[] {
    if (lines.length === 0) return [];
    const bodyHeight = median(lines.map((l) => l.maxHeight).filter((h) => h > 0));

    const isHeading = (line: LayoutLine): boolean => {
        if (line.text.length > options.maxHeadingChars) return false;
        if (options.headingPattern !== undefined) {
            const re = new RegExp(options.headingPattern.source, options.headingPattern.flags.replace('g', ''));
            if (re.test(line.text)) return true;
        }
        return bodyHeight > 0 && line.maxHeight >= bodyHeight * options.headingHeightFactor;
    };

    const sections: CanonicalSection[] = [];
    let heading: string | null = null;
    let paragraphs: CanonicalParagraph[] = [];

    const flush = (): void => {
        if (heading === null && paragraphs.length === 0) return;
        sections.push({ heading, paragraphs });
        heading = null;
        paragraphs = [];
    };

    for (const line of lines) {
        if (line.text.trim() === '') continue;
        if (isHeading(line)) {
            flush();
            heading = line.text;
            continue;
        }
        paragraphs.push({ text: line.text, page: line.pageNumber });
    }
    flush();
    return sections;
}
