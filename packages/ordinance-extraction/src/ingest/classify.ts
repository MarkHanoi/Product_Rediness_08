// @pryzm/ordinance-extraction — the DIGITISATION CLASSIFIER (Layer 2b).
//
// Turns per-page character counts into `born-digital-text` / `hybrid` / `scanned` /
// `empty`. This is the measurement the Berlin dossier calls "the key measurement —
// it decides Berlin's climb path" (EXTRACTION-PIPELINE.md §4.2), and the open
// question the PROBE VERDICT §5 left explicitly unanswered:
//
//   "The text-vs-scan mix-rate across the ~7,000 plans is an unrun sampling
//    question. Do not assert a percentage until sampled."
//
// Pure: counts in, verdict out. No I/O, no network. The downloading and pdf.js
// reading happen in an adapter outside this package; this file is the part that
// has to be right, and it is unit-testable without touching the network.

import {
    type ClassificationThresholds,
    type DigitisationProfile,
    type PageText,
    type PdfTextSuccess,
    DEFAULT_CLASSIFICATION_THRESHOLDS,
} from './types.js';

/**
 * Classify a document's digitisation from its per-page text.
 *
 * ⚠ A document with ZERO recovered characters is `scanned`, which is a SUCCESSFUL
 * measurement — it is how the OCR queue gets populated. It is never an error and
 * must never be counted as one; doing so would understate the OCR requirement,
 * which is precisely the number this classifier exists to produce.
 *
 * Every raw count is carried on the result, so the same corpus can be reclassified
 * under different thresholds without re-downloading a single PDF.
 */
export function classifyDigitisation(
    pages: readonly PageText[],
    thresholds: ClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS,
): DigitisationProfile {
    const pageCount = pages.length;
    const totalChars = pages.reduce((sum, p) => sum + p.chars, 0);

    if (pageCount === 0) {
        return {
            digitisation: 'empty',
            pageCount: 0,
            textPages: 0,
            textPageRatio: 0,
            totalChars: 0,
            charsPerPage: 0,
            thresholds,
        };
    }

    const textPages = pages.filter((p) => p.chars >= thresholds.minCharsPerTextPage).length;
    const textPageRatio = textPages / pageCount;
    const charsPerPage = totalChars / pageCount;

    const digitisation =
        textPageRatio >= thresholds.bornDigitalRatio
            ? 'born-digital-text'
            : textPageRatio < thresholds.scannedRatio
              ? 'scanned'
              : 'hybrid';

    return {
        digitisation,
        pageCount,
        textPages,
        textPageRatio,
        totalChars,
        charsPerPage,
        thresholds,
    };
}

/** Convenience: classify straight from a successful pdf.js read. */
export function classifyExtraction(
    extraction: PdfTextSuccess,
    thresholds: ClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS,
): DigitisationProfile {
    return classifyDigitisation(extraction.pages, thresholds);
}

/** One row of a corpus tally: a class and how many documents fell in it. */
export interface CorpusTally {
    readonly bornDigitalText: number;
    readonly hybrid: number;
    readonly scanned: number;
    readonly empty: number;
    /** Documents that could not be classified at all (fetch/parse failures). */
    readonly unclassified: number;
    /** The number of documents actually examined — the HONEST denominator. */
    readonly examined: number;
}

/**
 * Tally a set of profiles. `unclassified` is passed in separately because a
 * document that failed to download is NOT a scanned document — folding acquisition
 * failures into `scanned` would inflate the OCR estimate with documents nobody has
 * ever looked at.
 *
 * ⚠ `examined` counts profiles + unclassified, i.e. everything ATTEMPTED. Any
 * percentage reported from this tally must name that denominator; a percentage of
 * an unstated n is not a statistic.
 */
export function tallyCorpus(
    profiles: readonly DigitisationProfile[],
    unclassified: number,
): CorpusTally {
    const count = (c: DigitisationProfile['digitisation']): number =>
        profiles.filter((p) => p.digitisation === c).length;
    return {
        bornDigitalText: count('born-digital-text'),
        hybrid: count('hybrid'),
        scanned: count('scanned'),
        empty: count('empty'),
        unclassified,
        examined: profiles.length + unclassified,
    };
}
