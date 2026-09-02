// E8-TRIAL — corpus loader.
//
// Loads ONE trial document through the repo's OWN Layer-1/Layer-2 instruments
// (`tools/ordinance-ingest/lib/httpCache.ts` + `pdfText.ts`) and the package's own
// normalizer, so the trial measures the SHIPPING reader, not a private one.
//
// ⭐ THE HASH IS CHECKED, NOT ASSUMED (§verification-artifact-can-predate-subject).
// A gold row cites a page of a document; if the bytes behind that URL change, every
// citation in the gold set is potentially stale. The loader REFUSES rather than
// scoring against a document the gold set never saw.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from '../../ordinance-ingest/lib/httpCache.js';
import { extractPdfText } from '../../ordinance-ingest/lib/pdfText.js';
import { classifyDigitisation } from '../../../packages/ordinance-extraction/src/ingest/classify.js';
import { normalizePages } from '../../../packages/ordinance-extraction/src/ingest/normalize.js';
import type { PageText } from '../../../packages/ordinance-extraction/src/ingest/types.js';

export interface LoadedDocument {
    readonly url: string;
    readonly sha256: string;
    readonly pageCount: number;
    readonly totalChars: number;
    readonly producer: string | null;
    readonly digitisation: string;
    /** Raw per-page text (post geometric item-join, pre-normalize). */
    readonly rawPages: readonly PageText[];
    /** Normalized per-page text — what the extractor is fed. */
    readonly pages: readonly PageText[];
}

export interface LoadFailure {
    readonly ok: false;
    readonly detail: string;
}

export async function loadDocument(
    url: string,
    expectedSha256: string,
): Promise<LoadedDocument | LoadFailure> {
    const cacheDir = join('.cache', 'ordinance-ingest', 'pdf');
    const acq = await acquirePdf(url, { cacheDir });
    if (!acq.ok) return { ok: false, detail: `acquire failed: ${acq.reason} — ${acq.detail}` };
    if (acq.sha256 !== expectedSha256) {
        return {
            ok: false,
            detail:
                `DOCUMENT HASH MISMATCH for ${url}\n` +
                `  gold set was labelled against sha256 ${expectedSha256}\n` +
                `  the bytes on disk/at the URL are  sha256 ${acq.sha256}\n` +
                `  REFUSING to score — every citation in the gold set may be stale.`,
        };
    }
    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, url)));
    const text = await extractPdfText(bytes);
    if (!text.ok) return { ok: false, detail: `read failed: ${text.reason} — ${text.detail}` };
    const profile = classifyDigitisation(text.pages);
    const norm = normalizePages(text.pages);
    return {
        url,
        sha256: acq.sha256,
        pageCount: text.pageCount,
        totalChars: text.totalChars,
        producer: text.producer,
        digitisation: profile.digitisation,
        rawPages: text.pages,
        pages: norm.pages,
    };
}

/** Concatenate the selected 1-based pages into the text the extractor is fed. */
export function selectPages(doc: LoadedDocument, pages: readonly number[]): string {
    return pages
        .map((n) => doc.pages.find((p) => p.pageNumber === n)?.text ?? '')
        .join('\n');
}
