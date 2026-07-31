// Layer 2 — TEXT EXTRACTION adapter: PDF bytes → per-page text, via pdf.js.
//
// Maps every outcome onto the pure `PdfTextOutcome` taxonomy in
// `@pryzm/ordinance-extraction`. The single most important behaviour here:
//
//   A PDF THAT OPENS PERFECTLY AND YIELDS ZERO CHARACTERS IS A **SUCCESS**.
//
// It is a scan, and measuring that is the entire point of corpus characterisation.
// It returns `ok: true, totalChars: 0`, never a failure — folding it into the error
// path would silently understate the OCR requirement.
//
// ── THE SPACING PROBLEM (found on the real corpus, not in theory) ──
// pdf.js hands back positioned text ITEMS, not words. Concatenating `item.str`
// naively produces `"Begründunggemäß § 9 Abs. 8 Baugesetzbuchzum Bebauungsplan1-14"`
// — observed verbatim on Berlin plan 1-14, page 1. Every word boundary that the PDF
// encoded as a horizontal jump rather than a space character is destroyed, and with
// it every grammar keyword that spans one ("Grundflächenzahl" glued to the previous
// word matches nothing). So items are joined GEOMETRICALLY: a new line when the
// baseline moves, a space when the horizontal gap exceeds a fraction of the glyph
// width. This is Layer 2's job, not the normalizer's — the information needed to do
// it (positions) exists only here and is gone by the time text is a string.

import type {
    PageText,
    PdfTextOutcome,
} from '../../../packages/ordinance-extraction/src/ingest/types.js';
import {
    joinPdfTextItems,
    type PdfTextItemLike,
} from '../../../packages/ordinance-extraction/src/ingest/pdfItems.js';

export interface PdfTextOptions {
    /** Read at most this many pages (sampling mode). Default: all pages. */
    readonly maxPages?: number;
    /**
     * Horizontal gap, as a multiple of the item's mean glyph width, above which a
     * space is inserted between two items on the same line. Default 0.28 — tuned
     * on the Berlin corpus: high enough not to split letter-spaced headings into
     * single characters, low enough to catch real word gaps.
     */
    readonly spaceGapRatio?: number;
}

/** Classify a pdf.js open/parse error into the typed failure taxonomy. */
function failureFor(err: Error): PdfTextOutcome {
    const name = err.name ?? '';
    const msg = err.message ?? String(err);
    if (name === 'PasswordException' || /password/i.test(msg)) {
        return {
            ok: false,
            reason: 'encrypted',
            detail: `PDF is password-protected or encrypted: ${msg}`,
        };
    }
    if (name === 'InvalidPDFException' || /invalid pdf|corrupt|structure/i.test(msg)) {
        return { ok: false, reason: 'corrupt-pdf', detail: `PDF does not parse: ${msg}` };
    }
    return { ok: false, reason: 'extractor-error', detail: `${name || 'Error'}: ${msg}` };
}

/**
 * Extract per-page text from PDF bytes. Never throws — every failure mode is a
 * typed `PdfTextOutcome`.
 */
export async function extractPdfText(
    bytes: Uint8Array,
    options: PdfTextOptions = {},
): Promise<PdfTextOutcome> {
    const { maxPages, spaceGapRatio = 0.28 } = options;
    let doc: { numPages: number; getPage: (n: number) => Promise<unknown>; getMetadata: () => Promise<unknown>; destroy: () => Promise<void> } | null =
        null;
    try {
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
            getDocument: (src: unknown) => { promise: Promise<typeof doc> };
        };
        doc = await pdfjs.getDocument({
            data: bytes,
            useSystemFonts: false,
            isEvalSupported: false,
            // Keep the reader quiet and self-contained: no font/CMap network fetches.
            disableFontFace: true,
            verbosity: 0,
        }).promise;
    } catch (err) {
        return failureFor(err as Error);
    }

    if (doc === null) {
        return { ok: false, reason: 'extractor-error', detail: 'pdf.js returned no document.' };
    }

    try {
        const pageCount = doc.numPages;
        if (pageCount === 0) {
            return { ok: false, reason: 'no-pages', detail: 'PDF parsed but reports zero pages.' };
        }

        let producer: string | null = null;
        try {
            const meta = (await doc.getMetadata()) as { info?: { Producer?: string } };
            producer = meta?.info?.Producer ?? null;
        } catch {
            producer = null; // metadata is a nice-to-have, never a failure
        }

        const limit = maxPages === undefined ? pageCount : Math.min(pageCount, maxPages);
        const pages: PageText[] = [];
        for (let n = 1; n <= limit; n++) {
            const page = (await doc.getPage(n)) as {
                getTextContent: () => Promise<{ items: PdfTextItemLike[] }>;
                cleanup?: () => void;
            };
            let text = '';
            try {
                const content = await page.getTextContent();
                text = joinPdfTextItems(content.items ?? [], spaceGapRatio);
            } catch {
                // A single unreadable page must not fail the document — it is
                // reported as a zero-char page, which is exactly what it is.
                text = '';
            }
            page.cleanup?.();
            pages.push({ pageNumber: n, text, chars: text.length });
        }

        const totalChars = pages.reduce((s, p) => s + p.chars, 0);
        return {
            ok: true,
            pageCount,
            pages,
            totalChars,
            producer,
            truncated: limit < pageCount,
        };
    } catch (err) {
        return failureFor(err as Error);
    } finally {
        await doc.destroy().catch(() => undefined);
    }
}
