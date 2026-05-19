// PDF export for schedules (S42 / Phase 2C).
//
// Spec source: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S42
// "Schedule-PDF export (via export worker, same pipeline as S40)
// functional" (line 1025).
//
// PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
// Schedules are TABULAR documents; rasterising the live HTML
// `ScheduleView` table at 300 DPI (the S40 `node-canvas` strategy) is
// wasteful for plain text.  Instead, we generate a vector PDF
// directly with `pdf-lib` — text strings get the
// `Helvetica` standard font, lines are vector strokes, and the
// resulting file is < 50 KB even for 500-row schedules.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Returns `Uint8Array` (PDF bytes).
// • Multi-page: one A4 page (default) per chunk of rows that fits
//   below the title block.  Header row repeats on every page.
// • Footer: "PRYZM 2 — {scheduleName} — page X of Y" centred.
// • No images, no external fonts (Helvetica is built-in to all PDF
//   readers — no font subsetting, no embed step).
// • Pure: no DOM, no `node-canvas`, no Cairo.  Runs identically in
//   Node and the browser bundle.
// • Performance budget: 500-row schedule in < 10 s (S42 bench gate).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ScheduleData, ScheduleRow } from '@pryzm/plugin-sdk';
import { withScheduleSpan } from '../tracing.js';

export type PaperSize = 'A4' | 'A3' | 'A2' | 'Letter' | 'Legal';
export type PaperOrientation = 'portrait' | 'landscape';

export interface PdfExportOptions {
  readonly paper?: PaperSize;
  readonly orientation?: PaperOrientation;
  /** Page margin in PDF points.  Default 36 pt = 0.5 in = 12.7 mm. */
  readonly marginPt?: number;
  readonly title?: string;
  /** Subtitle line below the title (e.g. "Issued for tender —
   *  2026-04-28").  Empty string ⇒ omit the line. */
  readonly subtitle?: string;
  readonly fontSizePt?: number;
  readonly headerFontSizePt?: number;
  readonly titleFontSizePt?: number;
  readonly author?: string;
}

// Paper sizes in PDF points (1 pt = 1/72 in).  ISO sizes follow ISO 216.
const PAPER_SIZES_PT: Record<PaperSize, [number, number]> = {
  A4:     [595.28, 841.89],
  A3:     [841.89, 1190.55],
  A2:     [1190.55, 1684.0],
  Letter: [612, 792],
  Legal:  [612, 1008],
};

function pageDimensions(paper: PaperSize, orientation: PaperOrientation): [number, number] {
  const [w, h] = PAPER_SIZES_PT[paper];
  return orientation === 'landscape' ? [h, w] : [w, h];
}

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    if (Number.isFinite(v)) {
      // Trim trailing zeros for display.
      const fixed = Math.abs(v) < 1e-6 ? 0 : v;
      return Number.isInteger(fixed) ? String(fixed) : fixed.toFixed(2);
    }
    return Number.isNaN(v) ? 'NaN' : (v > 0 ? 'Inf' : '-Inf');
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function headerText(c: { header: string; unit?: string }): string {
  return c.unit ? `${c.header} (${c.unit})` : c.header;
}

/** Truncate `text` to fit within `maxWidthPt` using `font.widthOfTextAtSize`.
 *  Appends "…" when truncated. */
function sanitiseForWinAnsi(s: string): string {
  // Helvetica is a built-in Type1 font that only supports the WinAnsi
  // codepage.  Replace common non-WinAnsi characters with safe ASCII
  // equivalents so user data containing °, ², ³, →, ✓, … etc. does
  // not crash the embedder.  Anything else becomes "?".
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7e || (cp >= 0xa0 && cp <= 0xff)) {
      out += ch;
      continue;
    }
    switch (cp) {
      case 0x2019: out += "'"; break; // right single quote
      case 0x2018: out += "'"; break; // left single quote
      case 0x201c: out += '"'; break; // left double quote
      case 0x201d: out += '"'; break; // right double quote
      case 0x2013: out += '-'; break; // en dash
      case 0x2014: out += '-'; break; // em dash
      case 0x2026: out += '...'; break; // ellipsis (rebuilt below if needed)
      case 0x00b2: out += '2'; break; // ²
      case 0x00b3: out += '3'; break; // ³
      case 0x2192: out += '->'; break; // →
      case 0x2190: out += '<-'; break; // ←
      case 0x2713: out += 'Y'; break; // ✓
      case 0x2717: out += 'N'; break; // ✗
      case 0x221e: out += 'Inf'; break; // ∞
      default: out += '?';
    }
  }
  return out;
}

function fitText(text: string, font: PDFFont, fontSize: number, maxWidthPt: number): string {
  const safe = sanitiseForWinAnsi(text);
  if (font.widthOfTextAtSize(safe, fontSize) <= maxWidthPt) return safe;
  const text2 = safe;
  let lo = 0;
  let hi = text2.length;
  // Binary search the longest prefix that still fits with "..." suffix.
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    const candidate = `${text2.slice(0, mid)}...`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidthPt) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '...' : `${text2.slice(0, lo)}...`;
}

interface ColumnLayout {
  readonly id: string;
  readonly headerText: string;
  readonly xPt: number;
  readonly widthPt: number;
}

/** Allocate column widths proportionally to `widthMm` from
 *  `ScheduleColumnSchema`. */
function layoutColumns(
  columns: ScheduleData['columns'],
  innerWidthPt: number,
  marginPt: number,
): ColumnLayout[] {
  const totalMm = columns.reduce((s, c) => s + Math.max(c.widthMm, 1), 0);
  const out: ColumnLayout[] = [];
  let x = marginPt;
  for (const c of columns) {
    const mm = Math.max(c.widthMm, 1);
    const wPt = (mm / totalMm) * innerWidthPt;
    out.push({ id: c.id, headerText: headerText(c), xPt: x, widthPt: wPt });
    x += wPt;
  }
  return out;
}

interface PageBuilder {
  readonly pdf: PDFDocument;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  readonly pageW: number;
  readonly pageH: number;
  readonly marginPt: number;
  readonly titleFontSizePt: number;
  readonly headerFontSizePt: number;
  readonly fontSizePt: number;
  readonly title: string;
  readonly subtitle: string;
  readonly columns: readonly ColumnLayout[];
  readonly innerWidthPt: number;
}

function drawPageChrome(
  pb: PageBuilder,
  page: PDFPage,
  pageIndex: number,
  pageCount: number,
): number /* yCursor for first body row */ {
  const { marginPt, pageH, pageW, title, subtitle, titleFontSizePt, bold, font, headerFontSizePt, columns } = pb;
  let y = pageH - marginPt;

  // Title.
  page.drawText(title, {
    x: marginPt,
    y: y - titleFontSizePt,
    size: titleFontSizePt,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= titleFontSizePt + 4;

  // Subtitle.
  if (subtitle) {
    page.drawText(subtitle, {
      x: marginPt,
      y: y - 9,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 12;
  }

  // Horizontal rule.
  y -= 4;
  page.drawLine({
    start: { x: marginPt, y },
    end:   { x: pageW - marginPt, y },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  y -= 6;

  // Header row.
  const rowH = headerFontSizePt + 6;
  // Header background.
  page.drawRectangle({
    x: marginPt,
    y: y - rowH,
    width: pb.innerWidthPt,
    height: rowH,
    color: rgb(0.85, 0.85, 0.85),
  });
  for (const col of columns) {
    const text = fitText(col.headerText, bold, headerFontSizePt, col.widthPt - 4);
    page.drawText(text, {
      x: col.xPt + 2,
      y: y - headerFontSizePt - 2,
      size: headerFontSizePt,
      font: bold,
      color: rgb(0, 0, 0),
    });
  }
  y -= rowH;

  // Footer (page X of Y, centred).
  const footer = `PRYZM 2 — ${title} — page ${pageIndex} of ${pageCount}`;
  const footerW = font.widthOfTextAtSize(footer, 8);
  page.drawText(footer, {
    x: (pageW - footerW) / 2,
    y: marginPt - 12,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return y;
}

function drawBodyRow(
  pb: PageBuilder,
  page: PDFPage,
  schedule: ScheduleData,
  row: ScheduleRow,
  yTop: number,
): number {
  const rowH = pb.fontSizePt + 4;
  // Row baseline.
  page.drawLine({
    start: { x: pb.marginPt, y: yTop - rowH },
    end:   { x: pb.marginPt + pb.innerWidthPt, y: yTop - rowH },
    thickness: 0.25,
    color: rgb(0.7, 0.7, 0.7),
  });
  for (const col of pb.columns) {
    const raw = stringifyCell(row.cells[col.id]);
    if (!raw) continue;
    const text = fitText(raw, pb.font, pb.fontSizePt, col.widthPt - 4);
    page.drawText(text, {
      x: col.xPt + 2,
      y: yTop - pb.fontSizePt - 1,
      size: pb.fontSizePt,
      font: pb.font,
      color: rgb(0, 0, 0),
    });
  }
  return yTop - rowH;
}

/** Serialise a schedule + its evaluated rows to PDF bytes. */
export async function scheduleToPDF(
  schedule: ScheduleData,
  rows: readonly ScheduleRow[],
  options: PdfExportOptions = {},
): Promise<Uint8Array> {
  return withScheduleSpan(
    'pryzm.schedule.export.pdf',
    async () => scheduleToPDFInner(schedule, rows, options),
    { scheduleId: schedule.id, rowCount: rows.length },
  ) as Promise<Uint8Array>;
}

async function scheduleToPDFInner(
  schedule: ScheduleData,
  rows: readonly ScheduleRow[],
  options: PdfExportOptions,
): Promise<Uint8Array> {
  const paper = options.paper ?? 'A4';
  const orientation = options.orientation ?? 'landscape';
  const marginPt = options.marginPt ?? 36;
  const fontSizePt = options.fontSizePt ?? 9;
  const headerFontSizePt = options.headerFontSizePt ?? 10;
  const titleFontSizePt = options.titleFontSizePt ?? 14;
  const title = options.title ?? schedule.name;
  const subtitle = options.subtitle ?? '';

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor(options.author ?? 'PRYZM 2');
  pdf.setCreator('PRYZM 2 Schedule Export (S42)');
  pdf.setProducer('pdf-lib via @pryzm/plugin-schedules');

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [pageW, pageH] = pageDimensions(paper, orientation);
  const innerWidthPt = pageW - 2 * marginPt;
  const columnLayout = layoutColumns(schedule.columns, innerWidthPt, marginPt);

  const pb: PageBuilder = {
    pdf, font, bold, pageW, pageH, marginPt,
    titleFontSizePt, headerFontSizePt, fontSizePt,
    title, subtitle, columns: columnLayout, innerWidthPt,
  };

  // Two-pass: first compute page count by simulating layout (no draw),
  // then emit pages with the correct "page X of Y" footer.
  const rowH = fontSizePt + 4;
  // Compute usable height after chrome (title + subtitle + rule + header + footer).
  // Use a probe page to measure available rows-per-page.
  const probePage = pdf.addPage([pageW, pageH]);
  const probeY = drawPageChrome({ ...pb }, probePage, 1, 1);
  pdf.removePage(pdf.getPageCount() - 1);
  const usableHeight = probeY - (marginPt + 4); // reserve room for footer
  const rowsPerPage = Math.max(1, Math.floor(usableHeight / rowH));
  const pageCount = rows.length === 0 ? 1 : Math.ceil(rows.length / rowsPerPage);

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    const page = pdf.addPage([pageW, pageH]);
    let y = drawPageChrome(pb, page, pageIndex, pageCount);
    const start = (pageIndex - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, rows.length);
    for (let i = start; i < end; i += 1) {
      y = drawBodyRow(pb, page, schedule, rows[i]!, y);
    }
    if (rows.length === 0 && pageIndex === 1) {
      page.drawText('(no rows)', {
        x: marginPt + 2,
        y: y - fontSizePt - 2,
        size: fontSizePt,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  const bytes = await pdf.save();
  return bytes;
}
