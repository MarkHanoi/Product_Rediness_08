// C24 — Sheet composition engine (SHT-α-5).
//
// buildSheetFromRooms: pure helper that turns a project's room polygons into
// a composed {@link Sheet} plus a {@link ViewportContent} ready for the
// `sheetToSvgWithContent` composer. ONE viewport per sheet, all rooms drawn
// inside it at a fitted architectural scale.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM. Pure
// data → pure data. The function is callable from any layer L2+ — typical
// use is from a dev modal or the editor's sheet generator UI.
//
// SCALE PICKER: tries common architectural ratios (1:50, 1:100, 1:200,
// 1:500, 1:1000) and picks the FIRST whose paper footprint fits the
// available drawing region inside the page margins (with title-block
// space carved out). The result is exposed on the viewport's `scale`
// field — i.e. `vp.scale` is model-mm per sheet-mm (so a 1:100 scale
// drawing has `vp.scale === 100`).

import type { PaperSizeName } from './PaperSize.js';
import { paperSize } from './PaperSize.js';
import type { Sheet } from './Sheet.js';
import type { TitleBlock } from './TitleBlock.js';
import { defaultTitleBlock, formatScale } from './TitleBlock.js';
import type { Viewport, ViewportBounds } from './Viewport.js';
import type { PolygonShape, ViewportContent } from './ViewportContent.js';

/**
 * A single room ready to be drawn on a sheet. Polygon vertices are in MODEL
 * coordinates (mm) and follow the same convention as
 * {@link PolygonShape.points}: the polygon is implicitly closed — callers
 * SHOULD NOT repeat the first vertex.
 */
export interface RoomForSheet {
  readonly id: string;
  readonly name?: string;
  /** Closed polygon, MODEL coordinates (mm). */
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Optional per-room fill color (CSS hex or named). Overrides the default. */
  readonly fill?: string;
}

/**
 * Options bag for {@link buildSheetFromRooms}. All fields are optional;
 * sensible defaults are documented inline.
 */
export interface BuildSheetFromRoomsOptions {
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
  /** Sheet name stamped into the title block (default `'GA Floor Plan'`). */
  sheetName?: string;
  /** Author stamped into the title block. Default omitted. */
  author?: string;
  /** Padding around the model on the sheet in mm (default `25`). */
  marginMm?: number;
  /** Default room fill color when a room has no per-room `fill` (default `'#e2e8f0'`). */
  defaultRoomFill?: string;
  /**
   * Architectural scale candidates, model-mm per sheet-mm. The picker tries
   * each in order and returns the first that fits the available region.
   * Default `[50, 100, 200, 500, 1000]`.
   */
  allowedScales?: ReadonlyArray<number>;
  /**
   * Optional clock injector for {@link defaultTitleBlock}. Defaults to a
   * real-time read; tests should pass a deterministic stub.
   */
  now?: () => Date;
}

/**
 * Result tuple for {@link buildSheetFromRooms}.
 */
export interface BuildSheetFromRoomsResult {
  readonly sheet: Sheet;
  readonly contentByViewportId: Map<string, ViewportContent>;
}

const DEFAULTS = {
  sheetId: 'sheet-1',
  paperName: 'A3' as PaperSizeName,
  orientation: 'landscape' as const,
  projectName: 'Untitled Project',
  sheetNumber: 'A-101',
  sheetName: 'GA Floor Plan',
  marginMm: 25,
  defaultRoomFill: '#e2e8f0',
  allowedScales: [50, 100, 200, 500, 1000] as ReadonlyArray<number>,
  /** Mirror of SheetToSvgOptions.titleBlockHeightMm default. */
  titleBlockHeightMm: 60,
} as const;

/**
 * Pick a uniform architectural scale that fits a model bbox into an
 * available rectangular region on a sheet. Tries each candidate in `allowed`
 * (in order) and returns the FIRST that fits — i.e. for which
 * `modelWidthMm / scale <= availWidthMm` AND
 * `modelHeightMm / scale <= availHeightMm`.
 *
 * If NO candidate fits, returns the LAST (largest) candidate — the caller
 * gets a viewport that clips, which is preferable to crashing or returning
 * a zero scale. The picker NEVER returns a non-positive scale.
 *
 * Exported for direct unit-testing.
 *
 * @param modelWidthMm   model bbox width  in mm.
 * @param modelHeightMm  model bbox height in mm.
 * @param availWidthMm   available paper region width  in mm.
 * @param availHeightMm  available paper region height in mm.
 * @param allowed        ascending list of scale candidates (model mm per
 *                       paper mm). Default `[50, 100, 200, 500, 1000]`.
 */
export function _pickScale(
  modelWidthMm: number,
  modelHeightMm: number,
  availWidthMm: number,
  availHeightMm: number,
  allowed: ReadonlyArray<number> = DEFAULTS.allowedScales,
): number {
  // Guard against pathological inputs — the caller is responsible for
  // passing positive dimensions, but we degrade gracefully.
  if (!Number.isFinite(modelWidthMm) || !Number.isFinite(modelHeightMm)) {
    return allowed[allowed.length - 1] ?? 100;
  }
  if (allowed.length === 0) return 100;
  if (modelWidthMm <= 0 && modelHeightMm <= 0) return allowed[0]!;

  for (const candidate of allowed) {
    if (candidate <= 0) continue;
    const paperW = modelWidthMm / candidate;
    const paperH = modelHeightMm / candidate;
    if (paperW <= availWidthMm && paperH <= availHeightMm) return candidate;
  }
  // No candidate fits — return the largest (= most permissive) so the user
  // still gets a result. The viewport may clip, but the SVG is valid.
  return allowed[allowed.length - 1]!;
}

/**
 * Bounding box of every point across every room. Returns `null` when no
 * room contributes any point (used by the caller to emit a degenerate
 * viewport without crashing).
 */
function _bboxOfRooms(
  rooms: ReadonlyArray<RoomForSheet>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const room of rooms) {
    for (const p of room.points) {
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
 * Build a composed {@link Sheet} plus a per-viewport {@link ViewportContent}
 * map from a list of room polygons.
 *
 * Pipeline:
 *   1. Compute the model bounding box across every room.
 *   2. Subtract the page margin + title-block strip from the paper to find
 *      the available drawing region.
 *   3. Pick a fitting architectural scale via {@link _pickScale}.
 *   4. Emit ONE viewport sized to the scaled model — placed top-left of the
 *      paper, above the title block.
 *   5. Emit ONE {@link ViewportContent} containing every room as a
 *      {@link PolygonShape}, with `fill` from `room.fill` ?? `defaultRoomFill`
 *      and `label` from `room.name`.
 *
 * The returned `sheet.titleBlock.scale` is the formatted scale string
 * (`"1:100"` etc) so downstream renderers don't need to re-derive it.
 *
 * @param rooms  source room polygons. May be empty — the result is still a
 *               valid sheet with a degenerate viewport (the SVG renderer
 *               handles empty content gracefully).
 * @param opts   {@link BuildSheetFromRoomsOptions}; see field docs.
 */
export function buildSheetFromRooms(
  rooms: ReadonlyArray<RoomForSheet>,
  opts: BuildSheetFromRoomsOptions = {},
): BuildSheetFromRoomsResult {
  const sheetId = opts.sheetId ?? DEFAULTS.sheetId;
  const paperName: PaperSizeName = opts.paperName ?? DEFAULTS.paperName;
  const orientation = opts.orientation ?? DEFAULTS.orientation;
  const projectName = opts.projectName ?? DEFAULTS.projectName;
  const sheetNumber = opts.sheetNumber ?? DEFAULTS.sheetNumber;
  const sheetName = opts.sheetName ?? DEFAULTS.sheetName;
  const marginMm = opts.marginMm ?? DEFAULTS.marginMm;
  const defaultRoomFill = opts.defaultRoomFill ?? DEFAULTS.defaultRoomFill;
  const allowed = opts.allowedScales ?? DEFAULTS.allowedScales;
  const titleBlockHeightMm = DEFAULTS.titleBlockHeightMm;

  const paper = paperSize(paperName, orientation);

  // Available drawing region = paper minus margin on all sides, minus the
  // title-block strip along the bottom. The strip width is the full paper
  // minus the right-margin (matching SheetToSvg's bottom-right title-block
  // convention).
  const availWidthMm = Math.max(0, paper.widthMm - marginMm * 2);
  const availHeightMm = Math.max(
    0,
    paper.heightMm - marginMm * 2 - titleBlockHeightMm,
  );

  // Compute model bbox — `null` when rooms is empty or every room has no
  // points. We still build a sheet so the caller can render the empty
  // frame.
  const bbox = _bboxOfRooms(rooms);

  const modelWidthMm = bbox ? bbox.maxX - bbox.minX : 0;
  const modelHeightMm = bbox ? bbox.maxY - bbox.minY : 0;

  const scale = bbox
    ? _pickScale(modelWidthMm, modelHeightMm, availWidthMm, availHeightMm, allowed)
    : (allowed[0] ?? 100);

  // Compose the title block — with a formatted scale string so downstream
  // renderers can display "1:100" without re-deriving it.
  const baseTitleBlock: TitleBlock = defaultTitleBlock(
    projectName,
    sheetNumber,
    sheetName,
    opts.now,
  );
  const titleBlock: TitleBlock = {
    ...baseTitleBlock,
    scale: formatScale(1 / scale),
    ...(opts.author !== undefined ? { author: opts.author } : {}),
  };

  // Viewport bounds — sized to the SCALED model, placed top-left of the
  // available region (above the title block, with the page margin around).
  // When the model is empty we emit a degenerate viewport (zero width/height)
  // positioned at the top-left corner of the drawing region.
  const vpWidthMm = bbox ? Math.min(modelWidthMm / scale, availWidthMm) : 0;
  const vpHeightMm = bbox ? Math.min(modelHeightMm / scale, availHeightMm) : 0;

  // Architectural coords: origin bottom-left, +y up. We want the viewport's
  // TOP edge to sit at `paper.heightMm - marginMm` — i.e. the viewport's
  // `yMm` is `paper.heightMm - marginMm - vpHeightMm`.
  const vpXMm = marginMm;
  const vpYMm = Math.max(0, paper.heightMm - marginMm - vpHeightMm);

  const vpBounds: ViewportBounds = {
    xMm: vpXMm,
    yMm: vpYMm,
    widthMm: vpWidthMm,
    heightMm: vpHeightMm,
  };

  const viewport: Viewport = {
    id: `${sheetId}-vp-1`,
    bounds: vpBounds,
    scale,
    viewType: 'plan',
    sourceRef: 'rooms-aggregate',
    label: `Plan ${formatScale(1 / scale)}`,
  };

  // Compose the polygons. Each room becomes ONE PolygonShape; we COPY the
  // points so a caller mutating the input array AFTER the call cannot
  // corrupt the produced content (defence in depth — TypeScript already
  // marks the inputs `readonly`).
  const polygons: PolygonShape[] = [];
  for (const room of rooms) {
    if (room.points.length === 0) continue; // skip degenerate rooms
    const points = room.points.map((p) => ({ x: p.x, y: p.y }));
    const polygon: PolygonShape = {
      points,
      fill: room.fill ?? defaultRoomFill,
      ...(room.name !== undefined && room.name !== '' ? { label: room.name } : {}),
    };
    polygons.push(polygon);
  }

  const content: ViewportContent = {
    viewportId: viewport.id,
    polygons,
    ...(bbox
      ? {
          modelBounds: {
            minX: bbox.minX,
            minY: bbox.minY,
            maxX: bbox.maxX,
            maxY: bbox.maxY,
          },
        }
      : {}),
  };

  const sheet: Sheet = {
    id: sheetId,
    paper,
    titleBlock,
    viewports: [viewport],
  };

  const contentByViewportId = new Map<string, ViewportContent>();
  contentByViewportId.set(viewport.id, content);

  return { sheet, contentByViewportId };
}
