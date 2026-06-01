// C29 — PDF Vector Export (PDF-α-1).
//
// SheetToPdf: pure async function that emits a print-ready vector PDF from a
// composed Sheet + per-viewport content map. The shape of the API mirrors
// `sheetToSvgWithContent` from `@pryzm/drawing-primitives`: callers pass the
// Sheet and a `ReadonlyMap<string, ViewportContent>` keyed by viewport id.
//
// LAYER PURITY: L4 engine layer. Imports `@pryzm/drawing-primitives` (L2) and
// `pdf-lib` (external). No DOM, no THREE, no `window`. Node-friendly.
//
// COORDINATE SYSTEM: PDF user-space origin is the BOTTOM-LEFT corner with +y
// pointing UP — identical to the architectural sheet convention used by
// `Viewport`. No coordinate flip is required (unlike the SVG composer, which
// has to invert y).
//
// STRATEGY: pdf-lib does not render SVG natively. This α-1 slice ships the
// minimal native PDF emission path that mirrors the architectural primitives
// of `SheetWithContentToSvg`:
//   - paper border rectangle
//   - optional grid lines
//   - viewport rectangle outlines
//   - title block rectangle + text rows
//   - per-viewport content (polygons, lines, texts) drawn in SHEET-mm
//     coordinates after `applyViewportTransform` projects model → sheet
//
// A later slice (PDF-α-2) will wire this into an editor Test (dev) modal that
// downloads the bytes via Blob + URL.createObjectURL.

import {
  applyViewportTransform,
  type LineShape,
  type PolygonShape,
  type Sheet,
  type TextShape,
  type TitleBlock,
  type Viewport,
  type ViewportContent,
} from '@pryzm/drawing-primitives';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

/**
 * Options bag for {@link sheetToPdfBytes}. All keys are optional. Metadata
 * (`title`, `author`, `subject`, `keywords`) flows into the PDF info
 * dictionary. The remaining keys mirror the visual options of
 * `SheetWithContentToSvg` so the PDF + SVG outputs stay visually aligned.
 */
export interface SheetToPdfOptions {
  /** PDF metadata: document title. */
  readonly title?: string;
  /** PDF metadata: author. */
  readonly author?: string;
  /** PDF metadata: subject. */
  readonly subject?: string;
  /** PDF metadata: keywords (comma- or space-separated string). */
  readonly keywords?: string;

  /** Grid stroke width in mm. Default 0.1 mm. */
  readonly gridStrokeMm?: number;
  /** Grid color (hex `#rrggbb` or CSS named — only `#rrggbb` parsed exactly). */
  readonly gridColor?: string;
  /** Paper background color (drawn as a filled rectangle). */
  readonly paperColor?: string;
  /** Paper border stroke color. Default `'#000000'`. */
  readonly paperBorderColor?: string;
  /** Paper border stroke width in mm. Default 0.5 mm. */
  readonly paperBorderMm?: number;
  /** Title block height in mm. Default 35 mm. */
  readonly titleBlockHeightMm?: number;
  /** Title block width in mm. Default 180 mm. */
  readonly titleBlockWidthMm?: number;
  /** Title block + viewport label font size in mm. Default 3 mm. */
  readonly fontSizeMm?: number;
  /** Whether to draw a viewport label near the top-left of each viewport. */
  readonly includeViewportLabels?: boolean;

  /** Default stroke color for viewport content. Default `'#0f172a'`. */
  readonly defaultStroke?: string;
  /** Default stroke width in MODEL mm for viewport content. Default 50. */
  readonly defaultStrokeMm?: number;
  /** Default font size in MODEL mm for viewport text. Default 200. */
  readonly defaultFontSizeMm?: number;
}

// -----------------------------------------------------------------------------
// Constants + helpers
// -----------------------------------------------------------------------------

/** Conversion factor: 1 mm = 72 / 25.4 ≈ 2.8346456692913 pt. */
const MM_TO_PT = 72 / 25.4;

/** Default visual constants — kept in sync with `sheetToSvg` where applicable. */
const DEFAULTS = {
  gridStrokeMm: 0.1,
  gridColor: '#e2e8f0',
  paperColor: '#ffffff',
  paperBorderColor: '#000000',
  paperBorderMm: 0.5,
  titleBlockHeightMm: 35,
  titleBlockWidthMm: 180,
  fontSizeMm: 3,
  includeViewportLabels: true,
  defaultStroke: '#0f172a',
  defaultStrokeMm: 50,
  defaultFontSizeMm: 200,
} as const;

/** Convert millimetres to PDF user-space points. */
export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/**
 * Parse a `#rgb` or `#rrggbb` hex color string into a pdf-lib `Color` (RGB
 * components in [0, 1]). Unknown / unparseable inputs fall back to black so
 * the function NEVER throws — PDF emission must be tolerant of caller typos.
 */
function parseColor(input: string | undefined): ReturnType<typeof rgb> {
  if (typeof input !== 'string' || input.length === 0) return rgb(0, 0, 0);
  const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(input);
  if (m3) {
    const r = parseInt(m3[1]! + m3[1]!, 16) / 255;
    const g = parseInt(m3[2]! + m3[2]!, 16) / 255;
    const b = parseInt(m3[3]! + m3[3]!, 16) / 255;
    return rgb(r, g, b);
  }
  const m6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(input);
  if (m6) {
    const r = parseInt(m6[1]!, 16) / 255;
    const g = parseInt(m6[2]!, 16) / 255;
    const b = parseInt(m6[3]!, 16) / 255;
    return rgb(r, g, b);
  }
  // CSS named colors — minimal table for the values used in DEFAULTS.
  switch (input.toLowerCase()) {
    case 'white':
      return rgb(1, 1, 1);
    case 'black':
      return rgb(0, 0, 0);
    case 'red':
      return rgb(1, 0, 0);
    case 'green':
      return rgb(0, 0.5, 0);
    case 'blue':
      return rgb(0, 0, 1);
    default:
      return rgb(0, 0, 0);
  }
}

/** Pull the effective option value for `key`, applying the DEFAULTS table. */
function opt<K extends keyof typeof DEFAULTS>(
  opts: SheetToPdfOptions,
  key: K,
): (typeof DEFAULTS)[K] {
  const v = (opts as Record<string, unknown>)[key];
  return (v === undefined ? DEFAULTS[key] : v) as (typeof DEFAULTS)[K];
}

// -----------------------------------------------------------------------------
// Frame rendering (paper, grid, viewport rectangles, title block)
// -----------------------------------------------------------------------------

function drawPaperBorder(page: PDFPage, sheet: Sheet, opts: SheetToPdfOptions): void {
  const w = mmToPt(sheet.paper.widthMm);
  const h = mmToPt(sheet.paper.heightMm);

  const paperColor = opt(opts, 'paperColor');
  const borderColor = opt(opts, 'paperBorderColor');
  const borderMm = opt(opts, 'paperBorderMm');

  // Paper background fill (kept above PDF's default white so callers see the
  // intended fill in PDF readers that show a gray canvas behind the page).
  page.drawRectangle({
    x: 0,
    y: 0,
    width: w,
    height: h,
    color: parseColor(paperColor),
    borderWidth: 0,
  });

  // Paper border.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: w,
    height: h,
    borderColor: parseColor(borderColor),
    borderWidth: mmToPt(borderMm),
  });
}

function drawGrid(page: PDFPage, sheet: Sheet, opts: SheetToPdfOptions): void {
  const spacing = sheet.gridSpacingMm;
  if (spacing === undefined || !(spacing > 0)) return;

  const wMm = sheet.paper.widthMm;
  const hMm = sheet.paper.heightMm;
  const color = parseColor(opt(opts, 'gridColor'));
  const thickness = mmToPt(opt(opts, 'gridStrokeMm'));

  // Vertical lines.
  for (let x = spacing; x < wMm; x += spacing) {
    page.drawLine({
      start: { x: mmToPt(x), y: 0 },
      end: { x: mmToPt(x), y: mmToPt(hMm) },
      thickness,
      color,
    });
  }
  // Horizontal lines.
  for (let y = spacing; y < hMm; y += spacing) {
    page.drawLine({
      start: { x: 0, y: mmToPt(y) },
      end: { x: mmToPt(wMm), y: mmToPt(y) },
      thickness,
      color,
    });
  }
}

function drawViewportFrames(
  page: PDFPage,
  sheet: Sheet,
  font: PDFFont,
  opts: SheetToPdfOptions,
): void {
  const includeLabel = opt(opts, 'includeViewportLabels');
  const fontMm = opt(opts, 'fontSizeMm');
  const borderMm = opt(opts, 'paperBorderMm');
  const stroke = parseColor(opt(opts, 'paperBorderColor'));

  for (const vp of sheet.viewports) {
    page.drawRectangle({
      x: mmToPt(vp.bounds.xMm),
      y: mmToPt(vp.bounds.yMm),
      width: mmToPt(vp.bounds.widthMm),
      height: mmToPt(vp.bounds.heightMm),
      borderColor: stroke,
      borderWidth: mmToPt(borderMm * 0.5),
    });

    if (includeLabel && vp.label) {
      page.drawText(vp.label, {
        x: mmToPt(vp.bounds.xMm + 2),
        y: mmToPt(vp.bounds.yMm + vp.bounds.heightMm - fontMm - 2),
        size: mmToPt(fontMm),
        font,
        color: parseColor(opt(opts, 'defaultStroke')),
      });
    }
  }
}

function drawTitleBlock(
  page: PDFPage,
  sheet: Sheet,
  font: PDFFont,
  opts: SheetToPdfOptions,
): void {
  const tb: TitleBlock = sheet.titleBlock;
  const tbWidth = opt(opts, 'titleBlockWidthMm');
  const tbHeight = opt(opts, 'titleBlockHeightMm');
  const fontMm = opt(opts, 'fontSizeMm');

  // Lower-right anchored: paper width - tb width, y = 0 + paperBorder margin.
  const xMm = Math.max(0, sheet.paper.widthMm - tbWidth);
  const yMm = 0;

  page.drawRectangle({
    x: mmToPt(xMm),
    y: mmToPt(yMm),
    width: mmToPt(tbWidth),
    height: mmToPt(tbHeight),
    borderColor: parseColor(opt(opts, 'paperBorderColor')),
    borderWidth: mmToPt(opt(opts, 'paperBorderMm') * 0.5),
  });

  // Text rows from top to bottom inside the title block.
  const rows: ReadonlyArray<readonly [string, string | undefined]> = [
    ['Project', tb.projectName],
    ['Sheet', `${tb.sheetNumber} — ${tb.sheetName}`],
    ['Scale', tb.scale],
    ['Author', tb.author],
    ['Client', tb.client],
    ['Revision', tb.revision],
    ['Date', tb.date],
  ];

  const padMm = 2;
  let cursorYMm = yMm + tbHeight - fontMm - padMm;
  const textColor = parseColor(opt(opts, 'defaultStroke'));

  for (const [label, value] of rows) {
    if (value === undefined || value === '') continue;
    const line = `${label}: ${value}`;
    page.drawText(line, {
      x: mmToPt(xMm + padMm),
      y: mmToPt(cursorYMm),
      size: mmToPt(fontMm),
      font,
      color: textColor,
    });
    cursorYMm -= fontMm + 1;
    if (cursorYMm < yMm + padMm) break;
  }
}

// -----------------------------------------------------------------------------
// Per-viewport content rendering
// -----------------------------------------------------------------------------

function drawPolygon(
  page: PDFPage,
  vp: Viewport,
  content: ViewportContent,
  shape: PolygonShape,
  opts: SheetToPdfOptions,
): void {
  const pts = shape.points;
  if (pts.length < 2) return;

  const strokeMm = shape.strokeMm ?? opt(opts, 'defaultStrokeMm');
  const strokeColor = parseColor(shape.stroke ?? opt(opts, 'defaultStroke'));
  // strokeMm is expressed in MODEL units (mm). Convert to sheet mm via the
  // viewport scale factor (1 / vp.scale = model→sheet), then to pt.
  const strokePt = mmToPt(strokeMm / vp.scale);

  // Project every point model→sheet, then sheet-mm→pt.
  const sheetPts = pts.map((p) => {
    const s = applyViewportTransform(p, vp, content);
    return { x: mmToPt(s.x), y: mmToPt(s.y) };
  });

  // Optional fill via drawSvgPath (the only easy way to fill a polygon in
  // pdf-lib). We build a tiny `M x y L x y L x y Z` SVG path.
  if (shape.fill !== undefined) {
    const first = sheetPts[0]!;
    let d = `M ${first.x} ${first.y}`;
    for (let i = 1; i < sheetPts.length; i++) {
      const q = sheetPts[i]!;
      d += ` L ${q.x} ${q.y}`;
    }
    d += ' Z';
    page.drawSvgPath(d, {
      x: 0,
      y: 0,
      color: parseColor(shape.fill),
      opacity: shape.fillOpacity ?? 1,
      borderWidth: 0,
    });
  }

  // Edges drawn as N separate lines (closed by an explicit last→first edge).
  for (let i = 0; i < sheetPts.length; i++) {
    const a = sheetPts[i]!;
    const b = sheetPts[(i + 1) % sheetPts.length]!;
    page.drawLine({ start: a, end: b, thickness: strokePt, color: strokeColor });
  }

  // Optional polygon label at the arithmetic centroid.
  if (shape.label !== undefined && shape.label.length > 0) {
    let cx = 0;
    let cy = 0;
    for (const q of sheetPts) {
      cx += q.x;
      cy += q.y;
    }
    cx /= sheetPts.length;
    cy /= sheetPts.length;
    const fontMm = opt(opts, 'defaultFontSizeMm') / vp.scale;
    page.drawText(shape.label, {
      x: cx,
      y: cy,
      size: mmToPt(fontMm),
      color: strokeColor,
    });
  }
}

function drawLineShape(
  page: PDFPage,
  vp: Viewport,
  content: ViewportContent,
  shape: LineShape,
  opts: SheetToPdfOptions,
): void {
  const pts = shape.points;
  if (pts.length < 2) return;

  const strokeMm = shape.strokeMm ?? opt(opts, 'defaultStrokeMm');
  const strokeColor = parseColor(shape.stroke ?? opt(opts, 'defaultStroke'));
  const strokePt = mmToPt(strokeMm / vp.scale);

  let prev = applyViewportTransform(pts[0]!, vp, content);
  for (let i = 1; i < pts.length; i++) {
    const next = applyViewportTransform(pts[i]!, vp, content);
    page.drawLine({
      start: { x: mmToPt(prev.x), y: mmToPt(prev.y) },
      end: { x: mmToPt(next.x), y: mmToPt(next.y) },
      thickness: strokePt,
      color: strokeColor,
      // pdf-lib's drawLine doesn't expose a dash array; PDF-α-1 ignores
      // shape.dashed (documented limitation; future slice can use
      // pushOperators with setDashPattern).
    });
    prev = next;
  }
}

function drawTextShape(
  page: PDFPage,
  vp: Viewport,
  content: ViewportContent,
  shape: TextShape,
  font: PDFFont,
  opts: SheetToPdfOptions,
): void {
  const s = applyViewportTransform(shape.position, vp, content);
  const fontMm = (shape.fontSizeMm ?? opt(opts, 'defaultFontSizeMm')) / vp.scale;
  const sizePt = mmToPt(fontMm);
  const color = parseColor(opt(opts, 'defaultStroke'));

  // pdf-lib has no native text-anchor; approximate `middle` / `end` via the
  // font's text-width measurement.
  let xPt = mmToPt(s.x);
  if (shape.anchor === 'middle' || shape.anchor === 'end') {
    const w = font.widthOfTextAtSize(shape.text, sizePt);
    xPt -= shape.anchor === 'middle' ? w / 2 : w;
  }

  page.drawText(shape.text, {
    x: xPt,
    y: mmToPt(s.y),
    size: sizePt,
    font,
    color,
  });
}

function drawViewportContent(
  page: PDFPage,
  vp: Viewport,
  content: ViewportContent,
  font: PDFFont,
  opts: SheetToPdfOptions,
): void {
  for (const poly of content.polygons ?? []) drawPolygon(page, vp, content, poly, opts);
  for (const line of content.lines ?? []) drawLineShape(page, vp, content, line, opts);
  for (const txt of content.texts ?? []) drawTextShape(page, vp, content, txt, font, opts);
}

// -----------------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------------

/**
 * Render a {@link Sheet} + per-viewport content map to PDF bytes.
 *
 * The output is a single-page vector PDF sized to the sheet's paper
 * dimensions (PDF MediaBox = `widthMm × heightMm` converted to points). PDF
 * metadata (title / author / subject / keywords) is populated from `opts`.
 *
 * @param sheet              the composed sheet to emit.
 * @param contentByViewportId per-viewport content keyed by viewport id.
 *                             Viewports without an entry render an empty
 *                             frame; ids without a matching viewport are
 *                             silently ignored — same semantics as
 *                             `sheetToSvgWithContent`.
 * @param opts                optional visual + metadata configuration.
 * @returns                   PDF bytes as a `Uint8Array`.
 */
export async function sheetToPdfBytes(
  sheet: Sheet,
  contentByViewportId: ReadonlyMap<string, ViewportContent>,
  opts: SheetToPdfOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  if (opts.title !== undefined) doc.setTitle(opts.title);
  if (opts.author !== undefined) doc.setAuthor(opts.author);
  if (opts.subject !== undefined) doc.setSubject(opts.subject);
  if (opts.keywords !== undefined) doc.setKeywords([opts.keywords]);

  const pageWidthPt = mmToPt(sheet.paper.widthMm);
  const pageHeightPt = mmToPt(sheet.paper.heightMm);
  const page = doc.addPage([pageWidthPt, pageHeightPt]);

  // Embed Helvetica once; reused for title block, viewport labels, and any
  // viewport text shapes. pdf-lib's standard fonts are not subset-embedded —
  // a later slice (per C29 §1.2) can swap to a subset-embedded TTF.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);

  drawPaperBorder(page, sheet, opts);
  drawGrid(page, sheet, opts);
  drawViewportFrames(page, sheet, font, opts);
  drawTitleBlock(page, sheet, font, opts);

  // Per-viewport content in sheet z-order (last viewport drawn last → on top).
  for (const vp of sheet.viewports) {
    const content = contentByViewportId.get(vp.id);
    if (content === undefined) continue;
    drawViewportContent(page, vp, content, font, opts);
  }

  return await doc.save();
}
