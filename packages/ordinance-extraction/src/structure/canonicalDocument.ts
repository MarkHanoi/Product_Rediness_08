// @pryzm/ordinance-extraction — LAYER 3/4 ENTRY POINT: the `CanonicalDocument`
// PRODUCER. `ingest/types.ts` declared this shape on 2026-08-09 and a repo-wide
// grep for `CanonicalDocument` outside its own declaration returned nothing.
// This is the producer.
//
// Input is page GEOMETRY (positioned items), not a flat string, because the flat
// string is exactly where the information a grid needs has already been destroyed.
// The pdf.js call that produces the items is an ADAPTER outside this package —
// same port pattern as `DualPassExtractor` — so this file stays pure and offline-
// testable (P5-consistent L2 leaf: no I/O, no THREE, no DOM).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { classifyDigitisation } from '../ingest/classify.js';
import {
    DEFAULT_CLASSIFICATION_THRESHOLDS,
    type CanonicalDocument,
    type CanonicalTable,
    type ClassificationThresholds,
    type PageText,
} from '../ingest/types.js';
import { buildLines, joinItemsOnLine } from './lines.js';
import {
    DEFAULT_TABLE_OPTIONS,
    reconstructDocumentTables,
    type TableOptions,
    type TableReconstruction,
} from './tables.js';
import { DEFAULT_SECTION_OPTIONS, buildSections, type SectionOptions } from './sections.js';
import { type LayoutLine, type PageItems } from './types.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

/** Everything Layer 3/4 needs, all defaulted, none of it country-specific. */
export interface CanonicalDocumentOptions {
    readonly table?: Partial<TableOptions>;
    readonly section?: Partial<SectionOptions>;
    readonly classification?: Partial<ClassificationThresholds>;
}

/** The producer's output — the canonical document plus the grid EVIDENCE. */
export interface CanonicalDocumentBuild {
    readonly document: CanonicalDocument;
    /**
     * Every candidate grid with its verdict and diagnostics, INCLUDING the
     * unconfident ones. `document.tables` carries the same tables; this parallel
     * array carries why each one was or was not trusted.
     */
    readonly tables: readonly TableReconstruction[];
    /** Lines per page, retained so a caller can locate a span without re-parsing. */
    readonly lines: readonly LayoutLine[];
}

/** Was this line consumed by a confident table on this page? */
function inTable(line: LayoutLine, tables: readonly TableReconstruction[]): boolean {
    for (const t of tables) {
        if (t.table.page !== line.pageNumber) continue;
        // A line belongs to the grid when EVERY item sits on one of its anchors.
        const anchors = t.table.columnAnchors;
        if (anchors.length === 0) continue;
        const tol = t.diagnostics.options.columnTolerance;
        const all = line.items.every((it) => anchors.some((a) => Math.abs(a - it.x) <= tol));
        if (all && line.items.length > 0) return true;
    }
    return false;
}

/**
 * Build a `CanonicalDocument` from per-page positioned items.
 *
 * `pageTexts` is optional: when the caller already has Layer-2 page text (from
 * `joinPdfTextItems`, i.e. the SAME text every existing grammar pass reads) it is
 * carried verbatim, so a citation resolved against `document.pages` names exactly
 * the string a human will `Ctrl-F` for. When it is omitted the page text is
 * rebuilt from the lines, which is equivalent but not byte-identical, and that
 * difference is worth not hiding.
 */
export function buildCanonicalDocument(
    documentId: string,
    pages: readonly PageItems[],
    pageTexts?: readonly PageText[],
    options: CanonicalDocumentOptions = {},
): CanonicalDocumentBuild {
    const span = tracer.startSpan('pryzm.ordinance-extraction.buildCanonicalDocument');
    try {
        span.setAttribute('pryzm.documentId', documentId);
        span.setAttribute('pryzm.pages', pages.length);

        const tableOptions: TableOptions = { ...DEFAULT_TABLE_OPTIONS, ...options.table };
        const sectionOptions: SectionOptions = { ...DEFAULT_SECTION_OPTIONS, ...options.section };

        const allLines: LayoutLine[] = [];
        for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
            allLines.push(...buildLines(page.pageNumber, page.items, tableOptions));
        }
        // Document-wide, because a table's COLUMN MODEL is a property of the table
        // and not of a page (see the `tables.ts` header).
        const recs: TableReconstruction[] = reconstructDocumentTables(allLines, tableOptions);

        const prose = allLines.filter((l) => !inTable(l, recs));
        const sections = buildSections(prose, sectionOptions);

        const resolvedPages: PageText[] =
            pageTexts !== undefined
                ? [...pageTexts]
                : pages.map((p) => {
                      const text = buildLines(p.pageNumber, p.items, tableOptions)
                          .map((l) => joinItemsOnLine(l.items, tableOptions.spaceGapRatio))
                          .join('\n');
                      return { pageNumber: p.pageNumber, text, chars: text.length };
                  });

        const tables: CanonicalTable[] = recs.map((r) => r.table);
        const document: CanonicalDocument = {
            document: documentId,
            pageCount: pages.length,
            sections,
            tables,
            pages: resolvedPages,
            digitisation: classifyDigitisation(resolvedPages, {
                ...DEFAULT_CLASSIFICATION_THRESHOLDS,
                ...options.classification,
            }),
        };

        span.setAttribute('pryzm.tables', tables.length);
        span.setAttribute('pryzm.tablesConfident', tables.filter((t) => t.confident).length);
        span.setAttribute('pryzm.sections', sections.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return { document, tables: recs, lines: allLines };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
