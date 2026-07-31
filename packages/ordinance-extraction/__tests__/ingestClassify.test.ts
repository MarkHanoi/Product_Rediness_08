// The digitisation classifier — the engine behind the WP3 corpus statistic.
//
// This is the number that decides whether Berlin's climb path is "parse text" or
// "build OCR", so its edge cases are worth pinning precisely. The single most
// important behaviour: a PDF that opens and yields ZERO characters is a
// SUCCESSFUL measurement of a scan, never an error.

import { describe, expect, it } from 'vitest';
import {
    classifyDigitisation,
    tallyCorpus,
} from '../src/ingest/classify.js';
import {
    DEFAULT_CLASSIFICATION_THRESHOLDS,
    type PageText,
} from '../src/ingest/types.js';

/** Build n pages each carrying `chars` characters. */
function pages(specs: readonly number[]): PageText[] {
    return specs.map((chars, i) => ({
        pageNumber: i + 1,
        text: 'x'.repeat(chars),
        chars,
    }));
}

describe('classifyDigitisation — the three real corpus shapes', () => {
    it('all pages carrying text → born-digital-text', () => {
        const p = classifyDigitisation(pages([2900, 3100, 2800, 2600]));
        expect(p.digitisation).toBe('born-digital-text');
        expect(p.textPageRatio).toBe(1);
    });

    it('ZERO characters across every page → scanned, and it is a SUCCESS not an error', () => {
        // Measured shape: all 21 sampled Berlin Planzeichnungen returned exactly this.
        const p = classifyDigitisation(pages([0, 0]));
        expect(p.digitisation).toBe('scanned');
        expect(p.totalChars).toBe(0);
        // The classifier returns a profile — there is no error channel here at all.
        expect(p.pageCount).toBe(2);
    });

    it('a mix of text pages and inserted scans → hybrid', () => {
        // Real shape: a born-digital Begründung with scanned Anlagen bound in.
        const p = classifyDigitisation(pages([3000, 3000, 0, 0, 3000, 0]));
        expect(p.digitisation).toBe('hybrid');
        expect(p.textPages).toBe(3);
        expect(p.textPageRatio).toBeCloseTo(0.5, 10);
    });

    it('zero pages → empty, distinct from scanned', () => {
        // "No pages" and "pages with no text" are different defects.
        expect(classifyDigitisation([]).digitisation).toBe('empty');
        expect(classifyDigitisation(pages([0])).digitisation).toBe('scanned');
    });
});

describe('classifyDigitisation — thresholds are data, and the raw counts survive', () => {
    it('carries every number the verdict was derived from', () => {
        const p = classifyDigitisation(pages([500, 0, 500, 0]));
        expect(p.pageCount).toBe(4);
        expect(p.textPages).toBe(2);
        expect(p.totalChars).toBe(1000);
        expect(p.charsPerPage).toBe(250);
        // …so the whole corpus can be reclassified without re-downloading.
        expect(p.thresholds).toEqual(DEFAULT_CLASSIFICATION_THRESHOLDS);
    });

    it('honours a caller-supplied threshold set', () => {
        const sparse = pages([50, 50, 50, 50]); // below the default 100-char bar
        expect(classifyDigitisation(sparse).digitisation).toBe('scanned');
        // A corpus of sparse-but-real text pages reclassifies without re-fetching.
        const relaxed = classifyDigitisation(sparse, {
            ...DEFAULT_CLASSIFICATION_THRESHOLDS,
            minCharsPerTextPage: 10,
        });
        expect(relaxed.digitisation).toBe('born-digital-text');
    });

    it('a page exactly ON the threshold counts as text (>=, not >)', () => {
        const p = classifyDigitisation(pages([100, 100]));
        expect(p.textPages).toBe(2);
    });
});

describe('tallyCorpus — the honest denominator', () => {
    it('counts unclassified SEPARATELY from scanned', () => {
        // ⚠ The bug this prevents: folding download failures into `scanned` would
        // inflate the OCR estimate with documents nobody ever looked at. Measured
        // relevance — one Berlin run produced 284 rate-limit failures.
        const profiles = [
            classifyDigitisation(pages([3000, 3000])),
            classifyDigitisation(pages([0, 0])),
        ];
        const tally = tallyCorpus(profiles, 284);
        expect(tally.bornDigitalText).toBe(1);
        expect(tally.scanned).toBe(1);
        expect(tally.unclassified).toBe(284);
    });

    it('`examined` counts everything ATTEMPTED, so a percentage names a real n', () => {
        const tally = tallyCorpus([classifyDigitisation(pages([3000]))], 4);
        expect(tally.examined).toBe(5);
    });

    it('an all-failed run reports zero classified, not an empty success', () => {
        const tally = tallyCorpus([], 12);
        expect(tally.examined).toBe(12);
        expect(tally.bornDigitalText + tally.scanned + tally.hybrid).toBe(0);
    });
});
