// BookExporter — pure orchestrator that turns a Book into a PDF / DXF
// stream (S40 / Phase 2C / ADR-026).
//
// This module is INTENTIONALLY library-agnostic.  It accepts a per-
// sheet renderer callback (the orchestrator wires it to the existing
// PdfExportService / DxfExportService, the new headless export
// worker, or a node-canvas-based test harness).  The exporter only
// owns:
//
//   • iteration order (book.sheetIds page order)
//   • progress reporting (callback per page)
//   • error policy (default: abort on first failure; opt-in:
//     continue-and-collect-errors so a single bad sheet doesn't kill a
//     50-page export)
//   • assembly call (combines per-page byte arrays into one document)
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure: no DOM, no node-only modules, no `pdf-lib` / `jsPDF` / OBC
//   dependency.  All side effects flow through the supplied callbacks.
// • Async: every callback may be async.  The exporter awaits each one
//   sequentially (so a 50-page export does not blow up RAM by
//   rendering all pages in parallel).  A future S40+ pass can swap to
//   a worker-pool concurrency limit; the contract is forward-compatible.
// • Cancellation: the supplied AbortSignal aborts mid-export; the
//   in-flight page is cancelled (the renderer is expected to honour
//   the signal too) and `export()` rejects with `AbortError`.

import type { BookData } from './book.js';

export type SheetExportFormat = 'pdf' | 'dxf';

export interface SheetRenderRequest {
  /** Sheet id to render. */
  readonly sheetId: string;
  /** 1-based page index in the book.  Pages are emitted in
   *  `book.sheetIds` order. */
  readonly pageIndex: number;
  /** Total pages in the book — useful for status footers. */
  readonly pageCount: number;
  /** Output format. */
  readonly format: SheetExportFormat;
  /** Honour cancellation. */
  readonly signal: AbortSignal;
}

/** A rendered page — `bytes` is the format-native byte stream
 *  (PDF page or DXF document). */
export interface SheetRenderResult {
  readonly sheetId: string;
  readonly bytes: Uint8Array;
  /** Optional MIME hint for downstream packaging. */
  readonly mime?: string;
}

/** The orchestrator's per-sheet renderer.  Implementations wrap the
 *  legacy `PdfExportService` / `DxfExportService` or the future
 *  headless export worker. */
export type SheetPageRenderer = (req: SheetRenderRequest) => Promise<SheetRenderResult>;

/** Combines multiple page byte streams into a single output document.
 *  For PDF: a `pdf-lib` / `jsPDF` consumer concatenating pages.
 *  For DXF: a zip writer (since DXF is one-file-per-sheet). */
export type DocumentAssembler = (
  pages: readonly SheetRenderResult[],
  format: SheetExportFormat,
) => Promise<Uint8Array>;

export interface ExportProgress {
  readonly sheetId: string;
  readonly pageIndex: number;
  readonly pageCount: number;
  /** 0..1 fraction of pages rendered (post-rendering). */
  readonly fraction: number;
}

export interface BookExportOptions {
  readonly book: BookData;
  readonly format: SheetExportFormat;
  readonly renderer: SheetPageRenderer;
  readonly assembler: DocumentAssembler;
  /** Optional progress sink — fired AFTER each page renders. */
  readonly onProgress?: (p: ExportProgress) => void;
  /** Abort the in-flight export. */
  readonly signal?: AbortSignal;
  /** Default `'abort'`.  When `'collect'`, page failures are skipped
   *  (logged into the result's `errors` array); the assembler runs
   *  with the surviving pages. */
  readonly errorPolicy?: 'abort' | 'collect';
}

export interface BookExportResult {
  /** Combined document bytes from `assembler`. */
  readonly bytes: Uint8Array;
  /** Sheets that successfully rendered, in book page order. */
  readonly rendered: readonly { sheetId: string; pageIndex: number }[];
  /** Sheets that failed (only populated when `errorPolicy='collect'`). */
  readonly errors: readonly { sheetId: string; pageIndex: number; error: unknown }[];
}

/** Pure: render every sheet in `book.sheetIds` and assemble the
 *  result.  Throws on the first error when `errorPolicy='abort'` (the
 *  default), so callers can treat success === all-sheets-rendered. */
export async function exportBook(opts: BookExportOptions): Promise<BookExportResult> {
  const { book, format, renderer, assembler } = opts;
  const policy = opts.errorPolicy ?? 'abort';
  const signal = opts.signal ?? new AbortController().signal;
  const total = book.sheetIds.length;
  if (total === 0) {
    throw new Error('[exportBook] book has no sheets');
  }

  const pages: SheetRenderResult[] = [];
  const rendered: { sheetId: string; pageIndex: number }[] = [];
  const errors: { sheetId: string; pageIndex: number; error: unknown }[] = [];

  for (let i = 0; i < total; i++) {
    if (signal.aborted) {
      throw new DOMException('Book export aborted', 'AbortError');
    }
    const sheetId = book.sheetIds[i]!;
    const pageIndex = i + 1;
    try {
      const result = await renderer({
        sheetId, pageIndex, pageCount: total, format, signal,
      });
      pages.push(result);
      rendered.push({ sheetId, pageIndex });
    } catch (err) {
      if (policy === 'abort') throw err;
      errors.push({ sheetId, pageIndex, error: err });
    }
    opts.onProgress?.({
      sheetId, pageIndex, pageCount: total, fraction: pageIndex / total,
    });
  }

  if (pages.length === 0) {
    throw new Error('[exportBook] every sheet failed to render — refusing to assemble empty document');
  }
  const bytes = await assembler(pages, format);
  return { bytes, rendered, errors };
}
