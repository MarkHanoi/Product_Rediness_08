// C24 — Sheet composition engine (SHT-α-3).
//
// ViewportContent: pure DATA types describing what fills a viewport — a list
// of polygons (rooms / floor regions), polylines (wall lines, dimension
// strings) and texts (room labels, dimension values). The data is expressed
// in MODEL coordinates (mm); the renderer (ViewportToSvg) is responsible for
// projecting model → sheet via the viewport's scale + pan and clipping to
// the viewport rectangle.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM, no clock.

import type { Viewport } from './Viewport.js';

/**
 * A closed polygon in MODEL coordinates (mm). The polygon is implicitly
 * closed by the renderer — callers should NOT repeat the first vertex.
 */
export interface PolygonShape {
  /** Closed polygon in MODEL coordinates (mm). */
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Fill color (CSS named or hex). `undefined` = no fill. */
  readonly fill?: string;
  /** Fill opacity in [0, 1]. Default `1`. */
  readonly fillOpacity?: number;
  /** Stroke color. Default `'#0f172a'`. */
  readonly stroke?: string;
  /** Stroke width in MODEL units (mm). Default `50` (= 0.05 m of model). */
  readonly strokeMm?: number;
  /** Optional label drawn near the polygon centroid. */
  readonly label?: string;
}

/**
 * An open polyline in MODEL coordinates (mm) — typically wall centre-lines
 * or dimension strings.
 */
export interface LineShape {
  /** Vertices of the polyline (not implicitly closed). */
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Stroke color. Default `'#0f172a'`. */
  readonly stroke?: string;
  /** Stroke width in MODEL units (mm). Default `50`. */
  readonly strokeMm?: number;
  /** If true the polyline is rendered with a stroke-dasharray. Default `false`. */
  readonly dashed?: boolean;
}

/**
 * Free-standing text in MODEL coordinates (mm).
 */
export interface TextShape {
  /** Text anchor position in MODEL coordinates (mm). */
  readonly position: { readonly x: number; readonly y: number };
  /** Text content (XML-escaped at render time). */
  readonly text: string;
  /** Font size in MODEL units (mm). Default `200` (= 0.2 m of model). */
  readonly fontSizeMm?: number;
  /** SVG `text-anchor`. Default `'middle'`. */
  readonly anchor?: 'start' | 'middle' | 'end';
}

/**
 * Content payload for a single viewport: the polygons, lines, and texts that
 * should be composited into the viewport rectangle, clipped by the viewport's
 * bounds and transformed by the viewport's scale.
 */
export interface ViewportContent {
  /** The id of the {@link Viewport} this content fills. */
  readonly viewportId: string;
  /** Optional pan applied AFTER the model→viewport scaling, in SHEET mm. */
  readonly panMm?: { readonly x: number; readonly y: number };
  /**
   * Optional model bounds used to centre the content in the viewport. When
   * absent the renderer computes the bounds from `polygons` + `lines`.
   */
  readonly modelBounds?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly polygons?: ReadonlyArray<PolygonShape>;
  readonly lines?: ReadonlyArray<LineShape>;
  readonly texts?: ReadonlyArray<TextShape>;
}

/**
 * Arithmetic mean of a polygon's vertices. NOT the true centroid of the
 * enclosed area — but a fast, label-anchor-friendly approximation that is
 * exact for parallelograms and good enough for room labels.
 *
 * Returns `{ x: 0, y: 0 }` for an empty point list.
 */
export function centroidOf(
  points: ReadonlyArray<{ readonly x: number; readonly y: number }>,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Axis-aligned bounding box over a list of point-bearing items. Returns
 * `null` when the input is empty OR when no item has any points.
 */
export function boundsOf(
  items: ReadonlyArray<{ readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }> }>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const item of items) {
    for (const p of item.points) {
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

/**
 * Options bag for {@link applyViewportTransform}. Currently empty — kept as
 * an extension point for future transform variants (e.g. rotation).
 */
export interface ApplyViewportTransformOptions {
  /** Reserved for future use. */
  readonly _reserved?: never;
}

/**
 * Map a MODEL point (mm) to a SHEET (mm) point inside a viewport rectangle.
 *
 * Steps:
 *   1. Determine the model-space centre — `content.modelBounds` if provided,
 *      otherwise the bounds over `content.polygons + content.lines`.
 *   2. Translate so the model centre lands at the viewport rectangle centre
 *      after applying the model→sheet scale factor `1 / vp.scale`.
 *   3. Add `content.panMm` (a sheet-mm offset) if set.
 *
 * If neither `modelBounds` nor any polygon/line points are available the
 * function falls back to centring the point on the viewport directly
 * (i.e. it treats the supplied point itself as the model centre).
 */
export function applyViewportTransform(
  point: { readonly x: number; readonly y: number },
  vp: Viewport,
  content: ViewportContent,
  _opts: ApplyViewportTransformOptions = {},
): { x: number; y: number } {
  const cx = vp.bounds.xMm + vp.bounds.widthMm / 2;
  const cy = vp.bounds.yMm + vp.bounds.heightMm / 2;

  let modelCenterX: number;
  let modelCenterY: number;
  if (content.modelBounds) {
    modelCenterX = (content.modelBounds.minX + content.modelBounds.maxX) / 2;
    modelCenterY = (content.modelBounds.minY + content.modelBounds.maxY) / 2;
  } else {
    const computed = boundsOf([
      ...(content.polygons ?? []),
      ...(content.lines ?? []),
    ]);
    if (computed) {
      modelCenterX = (computed.minX + computed.maxX) / 2;
      modelCenterY = (computed.minY + computed.maxY) / 2;
    } else {
      modelCenterX = point.x;
      modelCenterY = point.y;
    }
  }

  const s = 1 / vp.scale;
  const sx = cx + (point.x - modelCenterX) * s;
  const sy = cy + (point.y - modelCenterY) * s;

  if (content.panMm) {
    return { x: sx + content.panMm.x, y: sy + content.panMm.y };
  }
  return { x: sx, y: sy };
}

/** Format a number for SVG attribute output: trim trailing zeroes, max 4 dp. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10000) / 10000;
  return Number.isInteger(r) ? r.toString() : r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Emit a `<clipPath id="vp-clip-{id}">…</clipPath>` SVG fragment whose path
 * is the viewport rectangle in sheet (architectural) coordinates. The
 * caller wraps content in `<g clip-path="url(#vp-clip-{id})">` to restrict
 * rendering to the viewport rectangle.
 */
export function viewportClipPathSvg(viewportId: string, vp: Viewport): string {
  const { xMm, yMm, widthMm, heightMm } = vp.bounds;
  return (
    `<clipPath id="vp-clip-${viewportId}">` +
    `<rect x="${fmt(xMm)}" y="${fmt(yMm)}" width="${fmt(widthMm)}" height="${fmt(heightMm)}" />` +
    `</clipPath>`
  );
}
