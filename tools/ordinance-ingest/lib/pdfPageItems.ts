// Layer 3 ADAPTER — PDF bytes → per-page POSITIONED ITEMS, via pdf.js.
//
// The sibling of `pdfText.ts`. That one answers "what does this page SAY" and
// throws the geometry away; this one keeps the geometry, which is the only thing
// that can tell a Fassadenhöhe column from a Vollgeschosse column
// (`packages/ordinance-extraction/src/structure/types.ts`).
//
// Kept OUTSIDE the package, like every other I/O adapter here, so
// `@pryzm/ordinance-extraction` stays a pure L2 leaf.

import { toPositionedItems } from '../../../packages/ordinance-extraction/src/structure/lines.js';
import type { PageItems } from '../../../packages/ordinance-extraction/src/structure/types.js';
import type { PageText } from '../../../packages/ordinance-extraction/src/ingest/types.js';
import { joinPdfTextItems } from '../../../packages/ordinance-extraction/src/ingest/pdfItems.js';

export interface PageGeometry {
    readonly pages: readonly PageItems[];
    /** The same pages as Layer-2 TEXT, so citations name the string a human greps for. */
    readonly texts: readonly PageText[];
    readonly producer: string | null;
    readonly pageCount: number;
}

/** Read positioned items (and the matching page text) from PDF bytes. */
export async function extractPageGeometry(
    bytes: Uint8Array,
    options: { readonly fromPage?: number; readonly toPage?: number } = {},
): Promise<PageGeometry> {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
        getDocument: (src: unknown) => { promise: Promise<PdfDocumentLike> };
    };
    const doc = await pdfjs.getDocument({
        data: bytes,
        useSystemFonts: false,
        isEvalSupported: false,
        disableFontFace: true,
        verbosity: 0,
    }).promise;

    try {
        let producer: string | null = null;
        try {
            const meta = (await doc.getMetadata()) as { info?: { Producer?: string } };
            producer = meta?.info?.Producer ?? null;
        } catch {
            producer = null;
        }

        const from = Math.max(1, options.fromPage ?? 1);
        const to = Math.min(doc.numPages, options.toPage ?? doc.numPages);
        const pages: PageItems[] = [];
        const texts: PageText[] = [];
        for (let n = from; n <= to; n++) {
            const page = await doc.getPage(n);
            let items: unknown[] = [];
            try {
                items = (await page.getTextContent()).items ?? [];
            } catch {
                // One unreadable page is a zero-item page, not a document failure.
                items = [];
            }
            page.cleanup?.();
            pages.push({ pageNumber: n, items: toPositionedItems(items as never[]) });
            const text = joinPdfTextItems(items as never[]);
            texts.push({ pageNumber: n, text, chars: text.length });
        }
        return { pages, texts, producer, pageCount: doc.numPages };
    } finally {
        await doc.destroy().catch(() => undefined);
    }
}

interface PdfDocumentLike {
    numPages: number;
    getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
        cleanup?: () => void;
    }>;
    getMetadata: () => Promise<unknown>;
    destroy: () => Promise<void>;
}
