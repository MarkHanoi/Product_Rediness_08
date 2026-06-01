// C24 — Sheet composition engine (SHT-α-4).
//
// SheetWithContentToSvg: composed entry point that glues `sheetToSvg` (frame)
// and `viewportContentToSvg` (per-viewport content) into ONE ready-to-use SVG
// XML string. Callers who would otherwise splice strings themselves should
// use this composer.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM. Pure
// string concatenation. This module does NOT modify SheetToSvg or
// ViewportToSvg — it only composes their outputs.
//
// COMPOSITION STRATEGY: render the frame with `sheetToSvg`, then for each
// viewport look up content in `contentByViewportId` and append it inside the
// frame's architectural-coords wrapper group. The stable seam is the literal
// suffix `</g>\n</svg>\n` produced by `sheetToSvg`: the only `</g>` followed
// by `</svg>` is the arch-coords wrapper close.

import type { Sheet } from './Sheet.js';
import { sheetToSvg, type SheetToSvgOptions } from './SheetToSvg.js';
import type { ViewportContent } from './ViewportContent.js';
import { viewportContentToSvg, type ViewportToSvgOptions } from './ViewportToSvg.js';

/**
 * Combined options bag for {@link sheetToSvgWithContent}. All keys from
 * {@link SheetToSvgOptions} flow to the frame renderer; all keys from
 * {@link ViewportToSvgOptions} flow to the content renderer.
 */
export interface SheetWithContentToSvgOptions
  extends SheetToSvgOptions,
    ViewportToSvgOptions {}

/**
 * Stable seam emitted at the END of every `sheetToSvg` output:
 *   `</g>\n</svg>\n`
 *
 * The architectural-coords wrapper is opened ONCE near the top of the
 * document and is the LAST group closed before `</svg>`. So the only place
 * where `</g>\n` is followed by `</svg>\n` in `sheetToSvg`'s output is the
 * arch-coords close. We use that exact suffix as our insertion anchor — new
 * content is spliced in just BEFORE the closing `</g>\n</svg>\n` pair, which
 * puts it INSIDE the arch-coords wrapper at the topmost z-order position
 * (drawn last → on top).
 */
const ARCH_WRAPPER_CLOSE_ANCHOR = '</g>\n</svg>\n';

/**
 * Split a {@link SheetWithContentToSvgOptions} bag into the two narrower
 * options bags expected by `sheetToSvg` and `viewportContentToSvg`. Each
 * downstream renderer receives ONLY the keys it knows about — this keeps
 * the two surfaces independent in case either grows a key that collides.
 */
function splitOptions(
  opts: SheetWithContentToSvgOptions,
): { sheet: SheetToSvgOptions; viewport: ViewportToSvgOptions } {
  const sheetOpts: SheetToSvgOptions = {};
  if (opts.gridStrokeMm !== undefined) sheetOpts.gridStrokeMm = opts.gridStrokeMm;
  if (opts.gridColor !== undefined) sheetOpts.gridColor = opts.gridColor;
  if (opts.paperColor !== undefined) sheetOpts.paperColor = opts.paperColor;
  if (opts.paperBorderColor !== undefined) sheetOpts.paperBorderColor = opts.paperBorderColor;
  if (opts.paperBorderMm !== undefined) sheetOpts.paperBorderMm = opts.paperBorderMm;
  if (opts.titleBlockHeightMm !== undefined) sheetOpts.titleBlockHeightMm = opts.titleBlockHeightMm;
  if (opts.titleBlockWidthMm !== undefined) sheetOpts.titleBlockWidthMm = opts.titleBlockWidthMm;
  if (opts.fontSizeMm !== undefined) sheetOpts.fontSizeMm = opts.fontSizeMm;
  if (opts.includeViewportLabels !== undefined) {
    sheetOpts.includeViewportLabels = opts.includeViewportLabels;
  }

  const vpOpts: ViewportToSvgOptions = {};
  if (opts.defaultStroke !== undefined) vpOpts.defaultStroke = opts.defaultStroke;
  if (opts.defaultStrokeMm !== undefined) vpOpts.defaultStrokeMm = opts.defaultStrokeMm;
  if (opts.defaultFontSizeMm !== undefined) vpOpts.defaultFontSizeMm = opts.defaultFontSizeMm;
  if (opts.includeClipPath !== undefined) vpOpts.includeClipPath = opts.includeClipPath;

  return { sheet: sheetOpts, viewport: vpOpts };
}

/**
 * Render a {@link Sheet} together with per-viewport content as a single
 * SVG XML string.
 *
 * Output structure (after composition):
 *
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <svg xmlns="..." width=… height=… viewBox=…>
 *     <g transform="translate(0, H) scale(1, -1)">  <!-- arch coords -->
 *       <rect ... />            <!-- paper -->
 *       <g> ... </g>?           <!-- grid -->
 *       <g> ... </g>*           <!-- per-viewport frame: rect + label -->
 *       <g> ... </g>            <!-- title block -->
 *       <clipPath …>…</clipPath><g clip-path=…>…</g>*  <!-- content -->
 *     </g>
 *   </svg>
 *
 * Viewports without a matching entry in `contentByViewportId` contribute
 * NO content fragment — the empty frame rectangle from `sheetToSvg` is the
 * full output for that viewport.
 *
 * Viewport ids in `contentByViewportId` that do NOT correspond to a real
 * viewport on the sheet are silently ignored.
 *
 * The composer does NOT validate the sheet — it trusts the caller the same
 * way the underlying renderers do.
 */
export function sheetToSvgWithContent(
  sheet: Sheet,
  contentByViewportId: ReadonlyMap<string, ViewportContent>,
  opts: SheetWithContentToSvgOptions = {},
): string {
  const split = splitOptions(opts);
  const frame = sheetToSvg(sheet, split.sheet);

  // Emit content in the SAME ORDER as sheet.viewports so later-added
  // viewports render on top of earlier ones (the natural z-order).
  const fragments: string[] = [];
  for (const vp of sheet.viewports) {
    const content = contentByViewportId.get(vp.id);
    if (content === undefined) continue;
    fragments.push(viewportContentToSvg(vp, content, split.viewport));
  }

  if (fragments.length === 0) {
    return frame;
  }

  const anchor = frame.lastIndexOf(ARCH_WRAPPER_CLOSE_ANCHOR);
  if (anchor < 0) {
    // Frame output deviated from the expected shape. Rather than corrupt the
    // SVG by guessing, append the content as a sibling — still valid SVG,
    // just outside the arch-coords wrapper. In practice this path is not
    // taken: SheetToSvg always emits the anchor.
    return frame + fragments.join('');
  }

  const before = frame.slice(0, anchor);
  const after = frame.slice(anchor);
  return before + fragments.join('') + after;
}

/**
 * Build a default `contentByViewportId` map containing one empty
 * {@link ViewportContent} for every viewport on the sheet. Convenience for
 * callers who want exactly one entry per viewport without constructing the
 * shape themselves.
 *
 * The returned map is a plain `Map` so callers can `.set` entries on top of
 * the defaults if they want — the return type is the read-only view to keep
 * the function signature interchangeable with the composer input.
 */
export function defaultContentMap(sheet: Sheet): ReadonlyMap<string, ViewportContent> {
  const map = new Map<string, ViewportContent>();
  for (const vp of sheet.viewports) {
    map.set(vp.id, {
      viewportId: vp.id,
      polygons: [],
      lines: [],
      texts: [],
    });
  }
  return map;
}
