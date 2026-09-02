// @pryzm/ordinance-extraction — the DOCUMENT INGESTION vocabulary (Layers 1–4).
//
// The parser was never the first missing component; the ingestion pipeline was.
// These are the types for the four layers that stand between a plan id and the
// running German text the grammar parses:
//
//   Layer 1  Acquisition           document link → local PDF (fetch, checksum, cache)
//   Layer 2  Text extraction       PDF → per-page text (or an honest non-result)
//   Layer 3  Layout reconstruction page geometry → lines → blocks
//   Layer 4  Canonical document    STRUCTURE, not a flat string
//
// ⚠ THE RULE THIS FILE EXISTS TO ENFORCE: **failure ≠ absence.** Along this path a
// plan can produce "no text" for at least seven completely different reasons, and
// they demand different responses:
//
//   1. the plan record carries NO document link            → nothing to fetch
//   2. the link is present but 404s                        → a broken register
//   3. the host timed out / refused                        → retry later
//   4. the bytes came back but are not a PDF               → wrong resource
//   5. the PDF is encrypted / password-protected           → needs credentials
//   6. the PDF is structurally corrupt                     → needs re-fetch
//   7. the PDF opened perfectly and contains ZERO text     → it is a SCAN; this is
//                                                            a SUCCESS, and it is
//                                                            the OCR queue's input
//
// (7) is the one that matters most and the one a naive pipeline gets wrong. A
// scanned Begründung is not an extraction failure — it is a correct measurement of
// a document that has no text layer. Collapsing it into the same bucket as a 404
// destroys the very statistic the corpus characterisation exists to produce
// (L-422/457/467/469, §CONTEXT-DATA-HONESTY).
//
// Pure data + types: no I/O, no THREE, no DOM (P5-consistent; L2 leaf). The actual
// HTTP and pdf.js calls are PORTS implemented outside this package — the same
// pattern `DualPassExtractor` already uses.

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — acquisition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WHY an acquisition produced no PDF. Each is a distinct operational response:
 *   - `no-document-link`  — the plan record has no URL at all (German legacy plans
 *                           routinely have `grund_www = null`). NOT an error: the
 *                           register is telling the truth. Nothing to retry.
 *   - `http-not-found`    — a link EXISTS but 404s. This IS a defect, in the
 *                           register rather than in us, and it is worth reporting
 *                           upstream. Never conflate with `no-document-link`.
 *   - `rate-limited`      — HTTP 429. ⚠ THE DOCUMENT IS FINE AND WE WERE RUDE.
 *                           Measured on this corpus: an early Berlin run recorded
 *                           284 "errors" against www.berlin.de that were **all
 *                           429s**, i.e. a statement about our request rate, not
 *                           about the corpus. Counting those as unavailable
 *                           documents would have understated Begründung coverage
 *                           by a third. A rate-limited document is NOT examined —
 *                           it is UNKNOWN, and the only correct response is to
 *                           slow down and come back.
 *   - `http-error`        — any other non-2xx (500, 403, …).
 *   - `timeout`           — the host did not answer in time. Retryable.
 *   - `network-error`     — DNS/TLS/socket failure. Retryable.
 *   - `not-a-pdf`         — 200 OK, but the body is not a PDF (a portal HTML error
 *                           page returned with status 200 is the classic case).
 *   - `empty-body`        — 200 OK with zero bytes.
 */
export type AcquisitionFailureReason =
    | 'no-document-link'
    | 'http-not-found'
    | 'rate-limited'
    | 'http-error'
    | 'timeout'
    | 'network-error'
    | 'not-a-pdf'
    | 'empty-body';

/** An acquisition that produced no PDF, with the reason kept distinct. */
export interface AcquisitionFailure {
    readonly ok: false;
    readonly reason: AcquisitionFailureReason;
    /** The URL attempted, or null when there was none to attempt. */
    readonly url: string | null;
    /** HTTP status when one was received, else null. */
    readonly status: number | null;
    readonly detail: string;
}

/** A PDF successfully acquired and persisted. */
export interface AcquisitionSuccess {
    readonly ok: true;
    readonly url: string;
    readonly status: number;
    /** Bytes on disk. */
    readonly byteLength: number;
    /** SHA-256 of the bytes — the identity that makes re-fetching unnecessary. */
    readonly sha256: string;
    readonly contentType: string | null;
    /** ISO timestamp of the fetch that produced the cached copy. */
    readonly fetchedAt: string;
    /** True when served from the local cache and no request was made. */
    readonly fromCache: boolean;
}

export type AcquisitionOutcome = AcquisitionSuccess | AcquisitionFailure;

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — text extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WHY a PDF yielded no per-page text. ⚠ NOTE WHAT IS **NOT** HERE: "the PDF had no
 * text layer" is deliberately absent, because that is a SUCCESS
 * (`PdfTextSuccess` with `totalChars: 0`), not a failure. These are the cases
 * where extraction could not even be attempted:
 *   - `corrupt-pdf`  — the file does not parse as a PDF.
 *   - `encrypted`    — content encryption blocks extraction.
 *   - `no-pages`     — parses, but reports zero pages.
 *   - `extractor-error` — an unexpected error, contained rather than thrown.
 */
export type PdfTextFailureReason =
    | 'corrupt-pdf'
    | 'encrypted'
    | 'no-pages'
    | 'extractor-error';

export interface PdfTextFailure {
    readonly ok: false;
    readonly reason: PdfTextFailureReason;
    readonly detail: string;
}

/** The text recovered from ONE page. `chars: 0` is a legitimate measurement. */
export interface PageText {
    /** 1-based page number, as a human and a citation would refer to it. */
    readonly pageNumber: number;
    /** The page's recovered text (may be empty — that is data, not a failure). */
    readonly text: string;
    /** `text.length` — kept explicitly so statistics never re-derive it wrongly. */
    readonly chars: number;
}

/**
 * A PDF that was successfully opened and read. `totalChars: 0` across every page
 * means the document is a SCAN — a correct, useful measurement that routes the
 * document to the OCR queue.
 */
export interface PdfTextSuccess {
    readonly ok: true;
    readonly pageCount: number;
    readonly pages: readonly PageText[];
    readonly totalChars: number;
    /** The PDF `Producer` metadata string, when present — a corroborating signal. */
    readonly producer: string | null;
    /** True when only a prefix of the pages was read (sampling mode). */
    readonly truncated: boolean;
}

export type PdfTextOutcome = PdfTextSuccess | PdfTextFailure;

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2b — digitisation classification (the corpus-characterisation output)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The digitisation bucket a document falls in. Refines the two-way
 * `PDF_TEXT` / `PDF_SCAN` split of the Berlin EXTRACTION-PIPELINE.md §4.2 table,
 * because the real corpus contains documents that are BOTH:
 *   - `born-digital-text` — effectively every page carries a text layer. The
 *                           deterministic grammar path works; no OCR.
 *   - `hybrid`            — some pages have text, others are inserted scans
 *                           (Anlagen, signed pages, plan excerpts). The text path
 *                           works but is INCOMPLETE — the scanned pages are
 *                           invisible to it, which is a silent-data-loss risk if
 *                           the class is not tracked.
 *   - `scanned`           — no meaningful text layer. OCR required.
 *   - `empty`             — opened, but zero pages. Structurally degenerate.
 */
export type DigitisationClass = 'born-digital-text' | 'hybrid' | 'scanned' | 'empty';

/**
 * The thresholds that turn per-page character counts into a class.
 *
 * ⚠ THESE ARE A CHOICE, NOT A LAW. They are stated here as data, defaulted
 * explicitly, and every classification result carries the raw counts it was
 * derived from, so the whole corpus can be reclassified under different thresholds
 * without re-downloading anything. A statistic whose thresholds are buried in a
 * function body cannot be audited.
 */
export interface ClassificationThresholds {
    /** Chars on a page for it to count as a TEXT page. Default 100. */
    readonly minCharsPerTextPage: number;
    /** Text-page ratio at/above which a document is born-digital. Default 0.90. */
    readonly bornDigitalRatio: number;
    /** Text-page ratio below which a document is scanned. Default 0.10. */
    readonly scannedRatio: number;
}

/** The published defaults (see the warning on {@link ClassificationThresholds}). */
export const DEFAULT_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = Object.freeze({
    minCharsPerTextPage: 100,
    bornDigitalRatio: 0.9,
    scannedRatio: 0.1,
});

/** A document's digitisation class, with every number it was derived from. */
export interface DigitisationProfile {
    readonly digitisation: DigitisationClass;
    readonly pageCount: number;
    /** Pages whose char count met `minCharsPerTextPage`. */
    readonly textPages: number;
    /** `textPages / pageCount`, or 0 when there are no pages. */
    readonly textPageRatio: number;
    readonly totalChars: number;
    readonly charsPerPage: number;
    /** The thresholds this verdict used — so it can be recomputed. */
    readonly thresholds: ClassificationThresholds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 4 — the canonical document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A contiguous run of text recognised as one paragraph, carrying the page it came
 * from so a citation resolved downstream can name a real page.
 */
export interface CanonicalParagraph {
    readonly text: string;
    /** 1-based page the paragraph starts on. */
    readonly page: number;
}

/**
 * A heading and the paragraphs beneath it. Headings are what make a citation
 * useful: "§ 13 Bauweise" beats "page 47" for a human verifying a value (L-449).
 */
export interface CanonicalSection {
    /** The heading text, or null for the document preamble before any heading. */
    readonly heading: string | null;
    readonly paragraphs: readonly CanonicalParagraph[];
}

/**
 * A reconstructed table. ⚠ `confident` is load-bearing: the German
 * Nutzungsschablone is a grid whose reconstruction is the HIGHEST-risk component
 * in the whole stack. A table we could not confidently reconstruct is reported as
 * such rather than emitted as plausible-looking rows — a wrong Nutzungsschablone
 * cell is a wrong GRZ, cited and confident.
 */
export interface CanonicalTable {
    readonly page: number;
    /**
     * The BODY rows (the header, when one was recognised, is {@link header} — it is
     * NOT row 0). ⚠ EMPTY when `confident` is false: the declared contract above is
     * that an unreconstructed table is REPORTED, never emitted as plausible rows,
     * and `detail` then carries the diagnostics instead.
     */
    readonly rows: readonly (readonly string[])[];
    /** False when the layout was not recognised; `rows` is then empty. */
    readonly confident: boolean;
    /** Why reconstruction was not confident, when it was not. */
    readonly detail: string;
    /**
     * ⭐ ADDED 2026-09-01 (lane E8-SPINE) FOR A MEASURED FAILURE, not for symmetry.
     *
     * The recognised column headings, or null when none was recognised. Without
     * them `rows` is an anonymous grid and a claim read from it cannot say WHICH
     * parameter a cell holds — which is precisely the Luzern BZR Anhang-1 trap
     * (`10 WA 0.15 21 geschlossen`: the `21` is Fassadenhöhe 21 m, not 21
     * Vollgeschosse — a 7x overstatement that the locale, range, dual-pass and
     * n-gram guards ALL pass, because the error is in the page GEOMETRY).
     * `header === null` therefore forces `confident: false`.
     */
    readonly header: readonly string[] | null;
    /**
     * WHERE the header came from — honesty about a header that is not physically
     * on this page:
     *   - `this-page`  — a header row was recognised on this page.
     *   - `continued`  — this page carries a CONTINUATION of a table whose header
     *                    is on an earlier page; the column anchors matched within
     *                    tolerance, which is objective geometric evidence, not a
     *                    guess. (Luzern BZR: header on p26, rows run to p36.)
     *   - `null`       — no header; `confident` is false.
     */
    readonly headerSource: 'this-page' | 'continued' | null;
    /**
     * The x anchor (PDF user-space points) of each column, in `header`/row order.
     * Retained because it is the EVIDENCE the reconstruction rests on and the key
     * that links a continuation page to its header page.
     */
    readonly columnAnchors: readonly number[];
}

/**
 * Layer 4's output — STRUCTURE, not a flat string. Every downstream parser gets
 * simpler because it can ask for sections and tables instead of re-deriving them
 * from a wall of text.
 */
export interface CanonicalDocument {
    /** The document id the citation will name. */
    readonly document: string;
    readonly pageCount: number;
    readonly sections: readonly CanonicalSection[];
    readonly tables: readonly CanonicalTable[];
    /** Normalised full text per page, retained for grammar passes and locators. */
    readonly pages: readonly PageText[];
    readonly digitisation: DigitisationProfile;
}
