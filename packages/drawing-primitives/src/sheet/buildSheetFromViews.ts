// C24 — Sheet composition engine (DOC-AUTO DS1).
//
// buildSheetFromViews: pure helper that lays out N pre-projected "views" on a
// single documentation sheet (PDF-ready). The sibling of
// {@link buildSheetFromRooms} — where that helper draws ONE viewport of room
// polygons, this one arranges MANY views (each already carrying its own model
// bounds + optional drawable content) in a deterministic GRID, one
// {@link Viewport} per view, each at its own fitted architectural scale.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM, no RNG.
// Pure data → pure data. Deterministic: identical input → identical output.
//
// GRID LAYOUT: the available drawing region (paper minus margins minus the
// title-block strip) is divided into a near-square grid of equal cells. The
// column count is chosen to best match the region's aspect ratio. Views fill
// the grid row-major (left→right, top→bottom). Each view is centred in its
// cell, sized to its scaled model bounds.
//
// SCALE PICKER (per view): tries `preferredScale` first (if it fits the cell),
// then the largest `allowedScale` whose scaled content fits the cell — falling
// back to the smallest-footprint (largest) candidate so a too-big view clips
// rather than crashes. Reuses {@link _pickScale}'s fit semantics.

import type { PaperSizeName } from './PaperSize.js';
import { paperSize } from './PaperSize.js';
import type { Sheet } from './Sheet.js';
import type { TitleBlock } from './TitleBlock.js';
import { defaultTitleBlock, formatScale } from './TitleBlock.js';
import type { Viewport, ViewportBounds } from './Viewport.js';
import type { ViewportContent } from './ViewportContent.js';
import { _pickScale } from './buildSheetFromRooms.js';

/**
 * Axis-aligned model bounding box in MODEL coordinates (mm).
 */
export interface ContentBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * A single pre-projected view ready to be placed on a sheet. `contentBounds`
 * is the model-space bbox (mm) used to size + scale the view's viewport.
 * `content`, if given, is the drawable payload (polygons / lines / texts) in
 * MODEL coordinates — its `viewportId` is REWRITTEN by the factory to match
 * the emitted viewport, so callers may leave it as any placeholder.
 */
export interface PlacedView {
  readonly id: string;
  readonly label?: string;
  /** Model-space bounding box (mm) used to size + scale the viewport. */
  readonly contentBounds: ContentBounds;
  /** Optional drawable content (MODEL coords). `viewportId` is rewritten. */
  readonly content?: ViewportContent;
  /**
   * Preferred architectural scale (model-mm per sheet-mm). Used when it fits
   * the grid cell; otherwise the picker falls back to `allowedScales`.
   */
  readonly preferredScale?: number;
  /**
   * View kind stamped onto the emitted {@link Viewport}. Default `'plan'`.
   */
  readonly viewType?: Viewport['viewType'];
}

/**
 * Options bag for {@link buildSheetFromViews}. All fields are optional;
 * sensible defaults are documented inline.
 */
export interface BuildSheetFromViewsOptions {
  /** Sheet id (default `'sheet-1'`). */
  sheetId?: string;
  /** Paper size name (default `'A3'`). */
  paperName?: PaperSizeName;
  /** Page orientation (default `'landscape'`). */
  orientation?: 'portrait' | 'landscape';
  /** Project name stamped into the title block (default `'Untitled Project'`). */
  projectName?: string;
  /** Sheet number stamped into the title block (default `'A-101'`). */
  sheetNumber?: string;
  /** Sheet name stamped into the title block (default `'Views'`). */
  sheetName?: string;
  /** Author stamped into the title block. Default omitted. */
  author?: string;
  /** Padding around the model on the sheet in mm (default `25`). */
  marginMm?: number;
  /**
   * Architectural scale candidates, model-mm per sheet-mm. The per-view picker
   * tries each in order and returns the first that fits its grid cell.
   * Default `[50, 100, 200, 500, 1000]`.
   */
  allowedScales?: ReadonlyArray<number>;
  /** Gap between grid cells in mm (default `10`). */
  gapMm?: number;
  /**
   * Optional clock injector for {@link defaultTitleBlock}. Defaults to a
   * real-time read; tests should pass a deterministic stub.
   */
  now?: () => Date;
}

/**
 * Result tuple for {@link buildSheetFromViews}.
 */
export interface BuildSheetFromViewsResult {
  readonly sheet: Sheet;
  readonly contentByViewportId: Map<string, ViewportContent>;
}

const DEFAULTS = {
  sheetId: 'sheet-1',
  paperName: 'A3' as PaperSizeName,
  orientation: 'landscape' as const,
  projectName: 'Untitled Project',
  sheetNumber: 'A-101',
  sheetName: 'Views',
  marginMm: 25,
  allowedScales: [50, 100, 200, 500, 1000] as ReadonlyArray<number>,
  gapMm: 10,
  /** Mirror of SheetToSvgOptions.titleBlockHeightMm default. */
  titleBlockHeightMm: 60,
} as const;

/**
 * Choose a column count for `n` cells that best matches a region of the given
 * aspect ratio. Tries each column count `1..n` and picks the layout whose cell
 * aspect ratio is closest to 1 (squarest cells) — ties broken toward FEWER
 * columns (deterministic). Returns at least 1.
 *
 * Exported for direct unit-testing.
 *
 * @param n               number of cells to place (≥ 1).
 * @param regionWidthMm   available region width  in mm.
 * @param regionHeightMm  available region height in mm.
 * @param gapMm           inter-cell gap in mm.
 */
export function _pickGridColumns(
  n: number,
  regionWidthMm: number,
  regionHeightMm: number,
  gapMm: number,
): number {
  if (n <= 1) return 1;
  const w = Math.max(0, regionWidthMm);
  const h = Math.max(0, regionHeightMm);

  let bestCols = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (w - gapMm * (cols - 1)) / cols;
    const cellH = (h - gapMm * (rows - 1)) / rows;
    // Skip degenerate layouts where a cell would have non-positive size; they
    // are always worse than any viable layout.
    if (cellW <= 0 || cellH <= 0) continue;
    const aspect = cellW / cellH;
    const score = Math.abs(Math.log(aspect)); // 0 == perfectly square cells.
    if (score < bestScore - 1e-9) {
      bestScore = score;
      bestCols = cols;
    }
  }
  return bestCols;
}

/**
 * Build a composed {@link Sheet} plus a per-viewport {@link ViewportContent}
 * map from an ordered list of pre-projected views, arranged in a deterministic
 * grid.
 *
 * Pipeline:
 *   1. Subtract the page margin + title-block strip from the paper to find the
 *      available drawing region.
 *   2. Choose a column count via {@link _pickGridColumns} (squarest cells).
 *   3. Lay views out row-major into equal grid cells (gaps between).
 *   4. For each view: pick a per-view scale (`preferredScale` if it fits the
 *      cell, else the largest fitting `allowedScale`), size the viewport to the
 *      scaled model bounds, and centre it in its cell.
 *   5. Emit ONE {@link ViewportContent} per view whose `viewportId` is rewritten
 *      to the emitted viewport's id, carrying the view's drawable shapes and a
 *      `modelBounds` derived from `contentBounds`.
 *
 * @param views source views (ordered). May be empty — the result is a valid
 *              sheet with NO viewports (the SVG renderer handles it gracefully).
 * @param opts  {@link BuildSheetFromViewsOptions}; see field docs.
 */
export function buildSheetFromViews(
  views: ReadonlyArray<PlacedView>,
  opts: BuildSheetFromViewsOptions = {},
): BuildSheetFromViewsResult {
  const sheetId = opts.sheetId ?? DEFAULTS.sheetId;
  const paperName: PaperSizeName = opts.paperName ?? DEFAULTS.paperName;
  const orientation = opts.orientation ?? DEFAULTS.orientation;
  const projectName = opts.projectName ?? DEFAULTS.projectName;
  const sheetNumber = opts.sheetNumber ?? DEFAULTS.sheetNumber;
  const sheetName = opts.sheetName ?? DEFAULTS.sheetName;
  const marginMm = opts.marginMm ?? DEFAULTS.marginMm;
  const allowed = opts.allowedScales ?? DEFAULTS.allowedScales;
  const gapMm = opts.gapMm ?? DEFAULTS.gapMm;
  const titleBlockHeightMm = DEFAULTS.titleBlockHeightMm;

  const paper = paperSize(paperName, orientation);

  // Available drawing region = paper minus margin on all sides, minus the
  // title-block strip along the bottom. Mirrors buildSheetFromRooms.
  const regionXMm = marginMm;
  const regionWidthMm = Math.max(0, paper.widthMm - marginMm * 2);
  const regionHeightMm = Math.max(
    0,
    paper.heightMm - marginMm * 2 - titleBlockHeightMm,
  );
  // The region's TOP edge sits at `paper.heightMm - marginMm`; its BOTTOM edge
  // sits just above the title-block strip.
  const regionTopMm = paper.heightMm - marginMm;

  // Title block — scale string is left blank because views may carry distinct
  // scales; downstream renderers stamp per-viewport scale labels instead.
  const baseTitleBlock: TitleBlock = defaultTitleBlock(
    projectName,
    sheetNumber,
    sheetName,
    opts.now,
  );
  const titleBlock: TitleBlock = {
    ...baseTitleBlock,
    ...(opts.author !== undefined ? { author: opts.author } : {}),
  };

  const contentByViewportId = new Map<string, ViewportContent>();

  // Empty input → a valid sheet with NO viewports.
  if (views.length === 0) {
    const sheet: Sheet = { id: sheetId, paper, titleBlock, viewports: [] };
    return { sheet, contentByViewportId };
  }

  const n = views.length;
  const cols = _pickGridColumns(n, regionWidthMm, regionHeightMm, gapMm);
  const rows = Math.ceil(n / cols);

  // Equal cells; gaps consume (cols-1)/(rows-1) gaps. Cells may degenerate to
  // zero size on a tiny region — the viewports then collapse but stay valid.
  const cellWidthMm = Math.max(0, (regionWidthMm - gapMm * (cols - 1)) / cols);
  const cellHeightMm = Math.max(0, (regionHeightMm - gapMm * (rows - 1)) / rows);

  const viewports: Viewport[] = [];

  for (let i = 0; i < n; i++) {
    const view = views[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Cell rectangle (architectural coords: origin bottom-left, +y up). Row 0
    // is the TOP row, so its top edge is `regionTopMm`.
    const cellXMm = regionXMm + col * (cellWidthMm + gapMm);
    const cellTopMm = regionTopMm - row * (cellHeightMm + gapMm);
    const cellBottomMm = cellTopMm - cellHeightMm;

    const cb = view.contentBounds;
    const modelWidthMm = Math.max(0, cb.maxX - cb.minX);
    const modelHeightMm = Math.max(0, cb.maxY - cb.minY);

    // Per-view scale: preferredScale wins iff its scaled footprint fits the
    // cell; otherwise the largest allowedScale that fits (clip-fallback inside).
    let scale: number;
    const preferred = view.preferredScale;
    const preferredFits =
      preferred !== undefined &&
      Number.isFinite(preferred) &&
      preferred > 0 &&
      modelWidthMm / preferred <= cellWidthMm &&
      modelHeightMm / preferred <= cellHeightMm;
    if (preferredFits) {
      scale = preferred!;
    } else {
      scale = _pickScale(modelWidthMm, modelHeightMm, cellWidthMm, cellHeightMm, allowed);
    }

    // Viewport sized to the scaled model, clamped to the cell, centred in it.
    const vpWidthMm = Math.min(modelWidthMm / scale, cellWidthMm);
    const vpHeightMm = Math.min(modelHeightMm / scale, cellHeightMm);
    const vpXMm = cellXMm + Math.max(0, (cellWidthMm - vpWidthMm) / 2);
    const vpYMm = cellBottomMm + Math.max(0, (cellHeightMm - vpHeightMm) / 2);

    const vpBounds: ViewportBounds = {
      xMm: vpXMm,
      yMm: vpYMm,
      widthMm: vpWidthMm,
      heightMm: vpHeightMm,
    };

    const viewportId = `${sheetId}-vp-${i + 1}`;
    const viewport: Viewport = {
      id: viewportId,
      bounds: vpBounds,
      scale,
      viewType: view.viewType ?? 'plan',
      sourceRef: view.id,
      label: view.label ?? `${view.id} ${formatScale(1 / scale)}`,
    };
    viewports.push(viewport);

    // Compose this view's content — rewrite viewportId to bind it to the
    // emitted viewport, and supply a modelBounds derived from contentBounds so
    // the renderer can centre the content without re-deriving from shapes.
    const src = view.content;
    const content: ViewportContent = {
      viewportId,
      ...(src?.panMm !== undefined ? { panMm: src.panMm } : {}),
      modelBounds: {
        minX: cb.minX,
        minY: cb.minY,
        maxX: cb.maxX,
        maxY: cb.maxY,
      },
      ...(src?.polygons !== undefined ? { polygons: src.polygons } : {}),
      ...(src?.lines !== undefined ? { lines: src.lines } : {}),
      ...(src?.texts !== undefined ? { texts: src.texts } : {}),
    };
    contentByViewportId.set(viewportId, content);
  }

  const sheet: Sheet = {
    id: sheetId,
    paper,
    titleBlock,
    viewports,
  };

  return { sheet, contentByViewportId };
}
