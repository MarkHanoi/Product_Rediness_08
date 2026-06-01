// C24 — Sheet composition engine (SHT-α-2).
//
// SheetToSvg: pure data → SVG XML string renderer for a {@link Sheet}.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM. Pure
// string concatenation. The renderer accepts a `Sheet` plus visual options
// and emits a valid, self-contained SVG XML document.
//
// COORDINATE CONVENTION: the input sheet uses architectural coordinates
// (origin bottom-left, +y up). SVG y is top-down. The renderer wraps the
// body in a single `<g transform="translate(0, H) scale(1, -1)">` so the
// rest of the renderer can write in architectural mm directly. Text is
// emitted inside a counter-flip group so glyphs remain upright.
//
// This slice renders the sheet FRAME only: paper outline, optional grid,
// title block, and EMPTY viewport placeholders. Actual viewport content
// (plan geometry, elevations, …) is α-3 / α-4 work, NOT this slice.

import type { Sheet } from './Sheet.js';
import type { Viewport } from './Viewport.js';
import { formatScale } from './TitleBlock.js';

/**
 * Visual / layout knobs for {@link sheetToSvg}. All dimensions are in
 * millimetres; colours are CSS color strings. Sensible defaults are used
 * when fields are omitted.
 */
export interface SheetToSvgOptions {
  /** Stroke width for the optional grid lines (default 0.1 mm). */
  gridStrokeMm?: number;
  /** Colour for the optional grid lines (default `'#e2e8f0'`). */
  gridColor?: string;
  /** Paper background fill (default `'#ffffff'`). */
  paperColor?: string;
  /** Paper border stroke colour (default `'#0f172a'`). */
  paperBorderColor?: string;
  /** Paper border stroke width in mm (default 0.4). */
  paperBorderMm?: number;
  /** Title-block slot height in mm, anchored bottom-right (default 60). */
  titleBlockHeightMm?: number;
  /** Title-block slot width in mm, anchored bottom-right (default 180). */
  titleBlockWidthMm?: number;
  /** Text height in mm (default 3.5, ≈10pt at 72dpi). */
  fontSizeMm?: number;
  /** Whether to print viewport labels (default `true`). */
  includeViewportLabels?: boolean;
}

const DEFAULTS = {
  gridStrokeMm: 0.1,
  gridColor: '#e2e8f0',
  paperColor: '#ffffff',
  paperBorderColor: '#0f172a',
  paperBorderMm: 0.4,
  titleBlockHeightMm: 60,
  titleBlockWidthMm: 180,
  fontSizeMm: 3.5,
  includeViewportLabels: true,
} as const;

/**
 * XML / HTML escape for any user-supplied string interpolated into the
 * SVG output. Escapes the five XML predefined entities. Must be applied
 * to EVERY caller-supplied label, project name, etc — failing to escape
 * is a security bug (script injection via project name).
 */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a number for SVG attribute output: trim trailing zeroes, max 4 dp. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10000) / 10000;
  return Number.isInteger(r) ? r.toString() : r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Render a {@link Sheet} to an SVG XML string.
 *
 * Output structure:
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <svg xmlns="..." width="WmM" height="Hmm" viewBox="0 0 W H">
 *     <g transform="translate(0, H) scale(1, -1)">  <!-- arch coords -->
 *       <rect ... />               <!-- paper -->
 *       <line ... />*              <!-- optional grid -->
 *       <g> ... </g>*              <!-- per-viewport: rect + label -->
 *       <g> ... </g>               <!-- title block -->
 *     </g>
 *   </svg>
 *
 * The renderer trusts the caller — it does NOT run validateSheet() and
 * will happily render a sheet with out-of-paper viewports.
 */
export function sheetToSvg(sheet: Sheet, opts: SheetToSvgOptions = {}): string {
  const o: Required<SheetToSvgOptions> = { ...DEFAULTS, ...opts };
  const W = sheet.paper.widthMm;
  const H = sheet.paper.heightMm;

  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}mm" height="${fmt(H)}mm" ` +
      `viewBox="0 0 ${fmt(W)} ${fmt(H)}" version="1.1">\n`,
  );

  // Architectural-coords wrapper: flip y so callers can write +y-up.
  out.push(`<g transform="translate(0, ${fmt(H)}) scale(1, -1)">\n`);

  // ── Paper background ──────────────────────────────────────────────────
  out.push(
    `<rect x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" ` +
      `fill="${escXml(o.paperColor)}" stroke="${escXml(o.paperBorderColor)}" ` +
      `stroke-width="${fmt(o.paperBorderMm)}" />\n`,
  );

  // ── Optional grid ─────────────────────────────────────────────────────
  if (sheet.gridSpacingMm && sheet.gridSpacingMm > 0) {
    const step = sheet.gridSpacingMm;
    out.push(
      `<g stroke="${escXml(o.gridColor)}" stroke-width="${fmt(o.gridStrokeMm)}" ` +
        `stroke-dasharray="${fmt(step / 20)} ${fmt(step / 20)}">\n`,
    );
    // Vertical lines, exclusive of x=0 and x=W (already drawn by the border).
    for (let x = step; x < W; x += step) {
      out.push(`<line x1="${fmt(x)}" y1="0" x2="${fmt(x)}" y2="${fmt(H)}" />\n`);
    }
    for (let y = step; y < H; y += step) {
      out.push(`<line x1="0" y1="${fmt(y)}" x2="${fmt(W)}" y2="${fmt(y)}" />\n`);
    }
    out.push('</g>\n');
  }

  // ── Viewports ─────────────────────────────────────────────────────────
  for (const vp of sheet.viewports) {
    out.push(renderViewport(vp, o));
  }

  // ── Title block (bottom-right) ────────────────────────────────────────
  out.push(renderTitleBlock(sheet, o));

  out.push('</g>\n');
  out.push('</svg>\n');
  return out.join('');
}

/**
 * Render a single viewport: its bordered rectangle + a label in the
 * top-left corner (architectural coords). The label is drawn inside a
 * counter-flipped group so glyphs render upright.
 */
function renderViewport(vp: Viewport, o: Required<SheetToSvgOptions>): string {
  const { xMm, yMm, widthMm, heightMm } = vp.bounds;
  const parts: string[] = [];
  parts.push('<g>\n');
  parts.push(
    `<rect x="${fmt(xMm)}" y="${fmt(yMm)}" width="${fmt(widthMm)}" height="${fmt(heightMm)}" ` +
      `fill="none" stroke="#1e293b" stroke-width="0.3" />\n`,
  );

  if (o.includeViewportLabels) {
    const label = vp.label ?? vp.id;
    const scaleStr = formatScale(1 / vp.scale);
    const text = `${label} (${scaleStr})`;
    // Anchor label slightly inside the top-left of the viewport (top-left in
    // architectural coords = high y). The counter-flip group renders the
    // glyphs upright while staying positioned in arch coords.
    const tx = xMm + o.fontSizeMm * 0.5;
    const ty = yMm + heightMm - o.fontSizeMm * 0.4;
    parts.push(
      `<g transform="translate(${fmt(tx)}, ${fmt(ty)}) scale(1, -1)">` +
        `<text x="0" y="0" font-family="sans-serif" font-size="${fmt(o.fontSizeMm)}" ` +
        `fill="#0f172a">${escXml(text)}</text>` +
        `</g>\n`,
    );
  }
  parts.push('</g>\n');
  return parts.join('');
}

/**
 * Render the title block: a bordered rectangle anchored at
 * (paperW - titleBlockWidth, 0), with the metadata stacked top-to-bottom.
 * Rows: project, sheet number + name, scale, author?, revision, date?.
 */
function renderTitleBlock(sheet: Sheet, o: Required<SheetToSvgOptions>): string {
  const tb = sheet.titleBlock;
  const w = o.titleBlockWidthMm;
  const h = o.titleBlockHeightMm;
  const x = sheet.paper.widthMm - w;
  const y = 0;
  const fs = o.fontSizeMm;
  const pad = fs * 0.8;
  const rowH = fs * 1.6;

  const rows: string[] = [];
  rows.push(`PROJECT: ${tb.projectName}`);
  rows.push(`SHEET ${tb.sheetNumber} - ${tb.sheetName}`);
  if (tb.scale) rows.push(`SCALE: ${tb.scale}`);
  if (tb.author) rows.push(`AUTHOR: ${tb.author}`);
  if (tb.revision) rows.push(`REVISION: ${tb.revision}`);
  if (tb.date) rows.push(`DATE: ${tb.date}`);
  if (tb.client) rows.push(`CLIENT: ${tb.client}`);

  const parts: string[] = [];
  parts.push('<g>\n');
  parts.push(
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" ` +
      `fill="none" stroke="#0f172a" stroke-width="0.3" />\n`,
  );

  // Stack rows from the TOP of the title block downward. Top of block in
  // architectural coords = y + h.
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i]!;
    // Architectural y for this row's baseline.
    const ay = y + h - pad - rowH * i - fs * 0.2;
    const ax = x + pad;
    parts.push(
      `<g transform="translate(${fmt(ax)}, ${fmt(ay)}) scale(1, -1)">` +
        `<text x="0" y="0" font-family="sans-serif" font-size="${fmt(fs)}" ` +
        `fill="#0f172a">${escXml(rowText)}</text>` +
        `</g>\n`,
    );
  }

  parts.push('</g>\n');
  return parts.join('');
}
