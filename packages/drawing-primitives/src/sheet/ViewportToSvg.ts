// C24 — Sheet composition engine (SHT-α-3).
//
// ViewportToSvg: pure data → SVG XML FRAGMENT renderer for a single
// {@link Viewport} + its {@link ViewportContent}. Returns the inner SVG
// fragment (clipPath + content group) — NOT a full SVG document. Callers
// composite the fragment into a sheet SVG produced by `sheetToSvg`, by
// splicing the fragment into the architectural-coords wrapper group.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM. Pure
// string concatenation.
//
// COORDINATE CONVENTION: the parent sheet wraps content in a
// `<g transform="translate(0, H) scale(1, -1)">` so we receive a +y-up
// architectural coordinate frame. Polygons and polylines render naturally
// in this frame; text glyphs need an extra `scale(1, -1)` so they stay
// upright (matching the pattern in `SheetToSvg.ts`).

import type { Viewport } from './Viewport.js';
import {
  applyViewportTransform,
  viewportClipPathSvg,
  type LineShape,
  type PolygonShape,
  type TextShape,
  type ViewportContent,
} from './ViewportContent.js';

/**
 * Visual knobs for {@link viewportContentToSvg}. All defaults match the
 * sheet-frame renderer (`SheetToSvg.ts`) so frame and content render
 * consistently when composited.
 */
export interface ViewportToSvgOptions {
  /** Default stroke colour when a shape omits `stroke`. Default `'#0f172a'`. */
  defaultStroke?: string;
  /** Default stroke width in MODEL units (mm). Default `50`. */
  defaultStrokeMm?: number;
  /** Default text size in MODEL units (mm). Default `200`. */
  defaultFontSizeMm?: number;
  /** Whether to emit the `<clipPath>` element. Default `true`. */
  includeClipPath?: boolean;
}

const DEFAULTS = {
  defaultStroke: '#0f172a',
  defaultStrokeMm: 50,
  defaultFontSizeMm: 200,
  includeClipPath: true,
} as const;

/**
 * XML escape for any caller-supplied string interpolated into the output.
 * Escapes the five XML predefined entities. Must be applied to EVERY
 * caller-supplied label/text — failing to escape is a script-injection bug.
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
 * Render a viewport's content as an SVG XML fragment ready to splice into
 * the sheet's architectural-coordinate wrapper group.
 *
 * Output structure (single string, no leading/trailing whitespace):
 *
 *   <clipPath id="vp-clip-{id}">…</clipPath>                 (optional)
 *   <g clip-path="url(#vp-clip-{id})">
 *     <path d="M x y L x y … Z" fill="…" stroke="…" />*      polygons
 *     <polyline points="x,y x,y …" stroke="…" fill="none" />* lines
 *     <g transform="translate(x,y) scale(1,-1)">
 *       <text x="0" y="0" font-size="…" text-anchor="…">…</text>
 *     </g>*                                                  texts
 *   </g>
 *
 * The renderer trusts the caller — it does NOT validate the content nor
 * check that the viewport actually exists on a sheet.
 */
export function viewportContentToSvg(
  viewport: Viewport,
  content: ViewportContent,
  opts: ViewportToSvgOptions = {},
): string {
  const o: Required<ViewportToSvgOptions> = { ...DEFAULTS, ...opts };
  const out: string[] = [];

  if (o.includeClipPath) {
    out.push(viewportClipPathSvg(viewport.id, viewport));
  }

  out.push(`<g clip-path="url(#vp-clip-${viewport.id})">`);

  for (const poly of content.polygons ?? []) {
    out.push(renderPolygon(poly, viewport, content, o));
  }
  for (const line of content.lines ?? []) {
    out.push(renderLine(line, viewport, content, o));
  }
  for (const text of content.texts ?? []) {
    out.push(renderText(text, viewport, content, o));
  }

  out.push('</g>');
  return out.join('');
}

// ── shape renderers ───────────────────────────────────────────────────────

function renderPolygon(
  poly: PolygonShape,
  vp: Viewport,
  content: ViewportContent,
  o: Required<ViewportToSvgOptions>,
): string {
  if (poly.points.length === 0) return '';

  const sheetPts = poly.points.map((p) => applyViewportTransform(p, vp, content));
  let d = '';
  for (let i = 0; i < sheetPts.length; i++) {
    const sp = sheetPts[i]!;
    d += (i === 0 ? 'M ' : ' L ') + fmt(sp.x) + ' ' + fmt(sp.y);
  }
  d += ' Z';

  const attrs: string[] = [`d="${d}"`];
  if (poly.fill !== undefined) {
    attrs.push(`fill="${escXml(poly.fill)}"`);
    if (poly.fillOpacity !== undefined) {
      attrs.push(`fill-opacity="${fmt(poly.fillOpacity)}"`);
    }
  } else {
    attrs.push('fill="none"');
  }
  attrs.push(`stroke="${escXml(poly.stroke ?? o.defaultStroke)}"`);
  const strokeModelMm = poly.strokeMm ?? o.defaultStrokeMm;
  attrs.push(`stroke-width="${fmt(strokeModelMm / vp.scale)}"`);

  let frag = `<path ${attrs.join(' ')} />`;

  if (poly.label !== undefined) {
    // Render the label at the polygon centroid using a synthetic TextShape so
    // the text path matches the explicit-text rendering exactly.
    const cx = poly.points.reduce((s, p) => s + p.x, 0) / poly.points.length;
    const cy = poly.points.reduce((s, p) => s + p.y, 0) / poly.points.length;
    frag += renderText(
      {
        position: { x: cx, y: cy },
        text: poly.label,
        anchor: 'middle',
      },
      vp,
      content,
      o,
    );
  }

  return frag;
}

function renderLine(
  line: LineShape,
  vp: Viewport,
  content: ViewportContent,
  o: Required<ViewportToSvgOptions>,
): string {
  if (line.points.length === 0) return '';

  const sheetPts = line.points.map((p) => applyViewportTransform(p, vp, content));
  const pointsAttr = sheetPts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');

  const attrs: string[] = [
    `points="${pointsAttr}"`,
    'fill="none"',
    `stroke="${escXml(line.stroke ?? o.defaultStroke)}"`,
  ];
  const strokeModelMm = line.strokeMm ?? o.defaultStrokeMm;
  const sheetStroke = strokeModelMm / vp.scale;
  attrs.push(`stroke-width="${fmt(sheetStroke)}"`);
  if (line.dashed) {
    // Dash pattern keyed off the stroke width — readable at 1:50/1:100.
    const dash = sheetStroke * 4;
    const gap = sheetStroke * 2;
    attrs.push(`stroke-dasharray="${fmt(dash)} ${fmt(gap)}"`);
  }

  return `<polyline ${attrs.join(' ')} />`;
}

function renderText(
  text: TextShape,
  vp: Viewport,
  content: ViewportContent,
  o: Required<ViewportToSvgOptions>,
): string {
  const sp = applyViewportTransform(text.position, vp, content);
  const fontModelMm = text.fontSizeMm ?? o.defaultFontSizeMm;
  const sheetFont = fontModelMm / vp.scale;
  const anchor = text.anchor ?? 'middle';

  // The outer sheet wraps in scale(1, -1) to give us +y-up arch coords. Text
  // glyphs need a counter-flip so they render upright — same trick as
  // `SheetToSvg.ts`.
  return (
    `<g transform="translate(${fmt(sp.x)}, ${fmt(sp.y)}) scale(1, -1)">` +
    `<text x="0" y="0" font-family="sans-serif" font-size="${fmt(sheetFont)}" ` +
    `text-anchor="${anchor}" fill="${escXml(o.defaultStroke)}">${escXml(text.text)}</text>` +
    `</g>`
  );
}
