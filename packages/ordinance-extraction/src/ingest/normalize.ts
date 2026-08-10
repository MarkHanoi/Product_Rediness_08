// @pryzm/ordinance-extraction — TEXT NORMALIZATION (WP4), the stage between a raw
// pdf.js text layer and any semantic parsing.
//
// WHY THIS IS A STAGE AND NOT A SET OF PATCHES
// -------------------------------------------
// The first real-corpus failure the grammar hit was `"(GRZ) von 0,3 …"`: an excerpt
// beginning mid-sentence, so the abbreviation arrived still wearing its closing
// parenthesis and the matcher died on `)`. That was fixed in the grammar with a
// `KEYWORD_TAIL` — a POINT FIX. It made one token work; it did nothing for the next
// token of the same shape (e.g. a Baugebiet code arriving as `…) WR`).
//
// The general truth behind both is typographic, not grammatical: **brackets around
// an abbreviation carry no meaning, and a bracket with no partner is debris from
// where the text was cut.** Handled once, here, every abbreviation in every
// jurisdiction's grammar stops caring — which is what "structurally" means. The
// grammar keeps `KEYWORD_TAIL` as belt-and-braces for callers who skip
// normalization, but it is no longer the thing holding the case up.
//
// Everything here is PURE and reversible in the sense that matters: each stage
// reports what it changed, so a normalized sentence can still be explained to the
// human who has to verify a value cited to it (L-449).
//
// ⚠ WHAT THIS DELIBERATELY DOES NOT DO: it does not touch digits, decimal commas,
// or the characters inside a number token. A normalizer that "tidied" `0,3` into
// `0.3` would silently re-introduce the 1000× locale trap that `localeGate` exists
// to catch. Number handling belongs to the locale layer, not here.

import { type PageText } from './types.js';

/** Which normalization stages to run. All default ON; each is independently testable. */
export interface NormalizationOptions {
    /** Unicode NFC + ligature expansion + soft-hyphen removal. Default true. */
    readonly unicode?: boolean;
    /** Re-join words split by a hyphen at a line break. Default true. */
    readonly dehyphenate?: boolean;
    /** Merge wrapped lines into paragraphs (blank lines stay paragraph breaks). Default true. */
    readonly mergeWrappedLines?: boolean;
    /** Drop page-number-only and running-head lines. Default true. */
    readonly dropPageFurniture?: boolean;
    /** Unwrap parenthesised abbreviation glosses and drop orphan brackets. Default true. */
    readonly normalizeBrackets?: boolean;
    /** Collapse whitespace runs and trim. Default true. */
    readonly collapseWhitespace?: boolean;
}

/** What normalization actually did — an audit trail, not a black box. */
export interface NormalizationStats {
    readonly ligaturesExpanded: number;
    readonly softHyphensRemoved: number;
    readonly wordsDehyphenated: number;
    readonly linesMerged: number;
    readonly furnitureLinesDropped: number;
    readonly bracketsUnwrapped: number;
    readonly orphanBracketsDropped: number;
}

export interface NormalizationResult {
    readonly text: string;
    readonly stats: NormalizationStats;
}

/** Typographic ligatures pdf.js hands back verbatim from the font's glyph set. */
const LIGATURES: ReadonlyArray<readonly [RegExp, string]> = [
    [/ﬀ/g, 'ff'],
    [/ﬁ/g, 'fi'],
    [/ﬂ/g, 'fl'],
    [/ﬃ/g, 'ffi'],
    [/ﬄ/g, 'ffl'],
    [/ﬅ/g, 'st'],
    [/ﬆ/g, 'st'],
];

/** Count matches without consuming a global regex's state. */
function countOf(text: string, re: RegExp): number {
    return text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))
        ?.length ?? 0;
}

/**
 * Unicode hygiene. NFC-normalises (so a combining-diaeresis `ä` and a precomposed
 * `ä` compare equal — they do NOT by default, and a grammar keyed on `Traufhöhe`
 * silently misses the decomposed form), expands ligatures, and removes soft
 * hyphens (U+00AD), which are invisible and split words mid-token.
 */
function applyUnicode(text: string): { text: string; ligatures: number; softHyphens: number } {
    let out = text.normalize('NFC');
    let ligatures = 0;
    for (const [re, replacement] of LIGATURES) {
        ligatures += countOf(out, re);
        out = out.replace(re, replacement);
    }
    const softHyphens = countOf(out, /\u00AD/g);
    out = out.replace(/\u00AD/g, '');
    // Normalise the several space-ish and dash-ish characters PDFs emit.
    out = out
        .replace(/[\u00A0\u2007\u202F\u2009\u200A\u2002\u2003]/g, ' ')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
        .replace(/[\u2010\u2011]/g, '-');
    return { text: out, ligatures, softHyphens };
}

/**
 * Re-join a word broken across a line break by a hyphen — `Grundflä-\nchenzahl`
 * becomes `Grundflächenzahl`. German compounds are long and get broken constantly;
 * left alone, the grammar's keyword never matches.
 *
 * Only joins when the next line starts LOWER-CASE. A hyphen before a capitalised
 * line is far more likely a genuine compound across a list item than a break.
 */
function applyDehyphenation(text: string): { text: string; joined: number } {
    let joined = 0;
    const out = text.replace(/(\p{Ll})-\r?\n[ \t]*(\p{Ll})/gu, (_m, a: string, b: string) => {
        joined += 1;
        return `${a}${b}`;
    });
    return { text: out, joined };
}

/** A line that is page furniture rather than content. */
function isPageFurniture(line: string): boolean {
    const t = line.trim();
    if (t === '') return false; // blank lines are paragraph structure, not furniture
    // Bare page numbers: "7", "- 7 -", "– 7 –", "[7]"
    if (/^[[(\-–—\s]*\d{1,4}[\])\-–—\s]*$/.test(t)) return true;
    // "Seite 7", "Seite 7 von 215", "S. 7"
    if (/^(?:Seite|S\.)\s*\d{1,4}(?:\s*(?:von|\/)\s*\d{1,4})?$/i.test(t)) return true;
    // "Internetversion S. 3" — a real Berlin running head seen in the corpus.
    if (/^Internetversion\s+S\.?\s*\d{1,4}$/i.test(t)) return true;
    return false;
}

/** Drop page-furniture lines. */
function applyDropFurniture(text: string): { text: string; dropped: number } {
    let dropped = 0;
    const kept = text.split(/\r?\n/).filter((line) => {
        if (isPageFurniture(line)) {
            dropped += 1;
            return false;
        }
        return true;
    });
    return { text: kept.join('\n'), dropped };
}

/**
 * Merge wrapped lines into paragraphs while PRESERVING paragraph boundaries.
 *
 * A line joins the next when it does not end a sentence and the next line is not
 * itself a new structural element (a §, a numbered/lettered item, a heading-ish
 * ALL-CAPS run). A blank line is always a paragraph break — that is the boundary
 * the whole downstream citation model depends on, because the extractor cites a
 * SENTENCE and needs to know where one stops.
 */
function applyMergeWrapped(text: string): { text: string; merged: number } {
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let merged = 0;

    const startsNewBlock = (line: string): boolean => {
        const t = line.trim();
        if (t === '') return true;
        if (/^§/.test(t)) return true; // a new paragraph of the ordinance
        if (/^\(?\d+[.)]/.test(t)) return true; // "1." / "(1)" numbered item
        if (/^[a-z][.)]\s/.test(t)) return true; // "a)" lettered item
        if (/^[-–—•*]\s/.test(t)) return true; // bullet
        return false;
    };

    for (const line of lines) {
        const prev = out[out.length - 1];
        const endsSentence = prev !== undefined && /[.!?:;]["')\]]?$/.test(prev.trim());
        if (
            prev === undefined ||
            prev.trim() === '' ||
            endsSentence ||
            startsNewBlock(line)
        ) {
            out.push(line);
        } else {
            out[out.length - 1] = `${prev.replace(/\s+$/, '')} ${line.trim()}`;
            merged += 1;
        }
    }
    return { text: out.join('\n'), merged };
}

/**
 * Bracket normalization — the structural fix for the whole GRZ/WR class.
 *
 * Two independent operations, both purely typographic:
 *
 *  1. **Unwrap abbreviation glosses.** `(GRZ)`, `(TH)`, `(WA 1)` are parenthetical
 *     restatements of the term beside them, never semantic content. Unwrapping
 *     turns `Grundflächenzahl (GRZ) von 0,3` into `Grundflächenzahl GRZ von 0,3`
 *     and, crucially, `(GRZ) von 0,3` into `GRZ von 0,3` — so an excerpt that
 *     begins mid-sentence parses exactly like one that does not. Restricted to
 *     SHORT, mostly-upper-case tokens so real parenthetical prose is untouched.
 *
 *  2. **Drop orphan brackets.** A `)` with no `(` before it (or the reverse) is
 *     debris from where the excerpt was cut — `…) WR` becomes `WR`. This is the
 *     same defect as case 1 arriving from the other side, and it is why both live
 *     here rather than in any one grammar.
 */
function applyBrackets(text: string): {
    text: string;
    unwrapped: number;
    orphans: number;
} {
    let unwrapped = 0;
    // An abbreviation gloss: 1–6 chars, at least one letter, no lower-case-only
    // words, optionally followed by a short number ("WA 1", "GRZ", "TH", "O 1.2").
    const GLOSS = /\((\p{Lu}{1,6}(?:[ .]?\d{1,3}(?:\.\d{1,3})?)?)\)/gu;
    let out = text.replace(GLOSS, (_m, inner: string) => {
        unwrapped += 1;
        return inner;
    });

    // Orphan brackets: scan and drop any bracket without a partner.
    const chars = [...out];
    const drop = new Set<number>();
    const openStack: number[] = [];
    for (let i = 0; i < chars.length; i++) {
        if (chars[i] === '(') openStack.push(i);
        else if (chars[i] === ')') {
            if (openStack.length === 0) drop.add(i);
            else openStack.pop();
        }
    }
    for (const i of openStack) drop.add(i);

    const orphans = drop.size;
    if (orphans > 0) out = chars.filter((_c, i) => !drop.has(i)).join('');

    return { text: out, unwrapped, orphans };
}

/** Collapse whitespace runs, trim lines, cap blank runs at one. */
function applyCollapseWhitespace(text: string): string {
    return text
        .split(/\r?\n/)
        .map((l) => l.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Normalize raw ordinance text for semantic parsing.
 *
 * Order matters: Unicode first (so later patterns see canonical characters),
 * de-hyphenation before line merging (a hyphen break is not a wrap), furniture
 * removal before merging (so a stray page number cannot glue two paragraphs
 * together), brackets after merging (so a gloss split across a line break is
 * whole by the time it is unwrapped), whitespace last.
 */
export function normalizeOrdinanceText(
    raw: string,
    options: NormalizationOptions = {},
): NormalizationResult {
    const opt = {
        unicode: true,
        dehyphenate: true,
        mergeWrappedLines: true,
        dropPageFurniture: true,
        normalizeBrackets: true,
        collapseWhitespace: true,
        ...options,
    };

    let text = raw;
    let ligaturesExpanded = 0;
    let softHyphensRemoved = 0;
    let wordsDehyphenated = 0;
    let linesMerged = 0;
    let furnitureLinesDropped = 0;
    let bracketsUnwrapped = 0;
    let orphanBracketsDropped = 0;

    if (opt.unicode) {
        const r = applyUnicode(text);
        text = r.text;
        ligaturesExpanded = r.ligatures;
        softHyphensRemoved = r.softHyphens;
    }
    if (opt.dehyphenate) {
        const r = applyDehyphenation(text);
        text = r.text;
        wordsDehyphenated = r.joined;
    }
    if (opt.dropPageFurniture) {
        const r = applyDropFurniture(text);
        text = r.text;
        furnitureLinesDropped = r.dropped;
    }
    if (opt.mergeWrappedLines) {
        const r = applyMergeWrapped(text);
        text = r.text;
        linesMerged = r.merged;
    }
    if (opt.normalizeBrackets) {
        const r = applyBrackets(text);
        text = r.text;
        bracketsUnwrapped = r.unwrapped;
        orphanBracketsDropped = r.orphans;
    }
    if (opt.collapseWhitespace) {
        text = applyCollapseWhitespace(text);
    }

    return {
        text,
        stats: {
            ligaturesExpanded,
            softHyphensRemoved,
            wordsDehyphenated,
            linesMerged,
            furnitureLinesDropped,
            bracketsUnwrapped,
            orphanBracketsDropped,
        },
    };
}

/**
 * Find lines that repeat across many pages at the same position — running heads and
 * footers. Returns the offending lines so a caller can strip them.
 *
 * Threshold is a RATIO of pages, not a count, so it behaves the same on a 12-page
 * and a 356-page document. A line must appear on at least `minPages` pages too, so
 * a two-page document does not declare its only heading a running head.
 */
export function detectRunningHeads(
    pages: readonly PageText[],
    ratio = 0.5,
    minPages = 3,
): string[] {
    if (pages.length < minPages) return [];
    const counts = new Map<string, number>();
    for (const page of pages) {
        // Only the first and last few lines can be furniture.
        const lines = page.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
        const candidates = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
        for (const c of candidates) {
            if (c.length < 4 || c.length > 120) continue;
            if (isPageFurniture(c)) continue; // already handled, and page-specific
            counts.set(c, (counts.get(c) ?? 0) + 1);
        }
    }
    const threshold = Math.max(minPages, Math.ceil(pages.length * ratio));
    return [...counts.entries()]
        .filter(([, n]) => n >= threshold)
        .map(([line]) => line);
}

/** Remove known running-head lines from every page, then normalize each page. */
export function normalizePages(
    pages: readonly PageText[],
    options: NormalizationOptions = {},
): { pages: PageText[]; runningHeads: string[] } {
    const runningHeads = detectRunningHeads(pages);
    const heads = new Set(runningHeads);
    const out = pages.map((page) => {
        const stripped = page.text
            .split(/\r?\n/)
            .filter((l) => !heads.has(l.trim()))
            .join('\n');
        const text = normalizeOrdinanceText(stripped, options).text;
        return { pageNumber: page.pageNumber, text, chars: text.length };
    });
    return { pages: out, runningHeads };
}
