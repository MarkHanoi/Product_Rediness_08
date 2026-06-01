// Curtain-wall intent helpers — S12-T5 baseline; S13-T2 adds the
// CurtainWallIntentResolver per `code-level ADR docs/02-decisions/adrs/0013-intent-resolver.md`.
//
// The resolver answers three questions from the tool / interaction
// layer without ever touching THREE.js:
//
//   • resolvePanelCell      — which (row,col) does this point fall in?
//   • resolveSegmentIntent  — panel vs mullion vs transom (with a
//                             configurable edge tolerance, default 8 px).
//   • validateGridCoordinate — is (row,col) a legal target for AddPanel?
//
// Inputs are *grid-local* points (i.e. already projected from screen
// to the curtain-wall surface plane and expressed in the wall's
// (along-baseline, height) coordinates, in metres).  The resolver is
// pure DTO + grid math — no raycasting.

import type { CurtainWall as CurtainWallSchemaInfer } from '@pryzm/plugin-sdk';

export type CurtainWallData = CurtainWallSchemaInfer;

interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

export function isFiniteVec3(p: Vec3Like | undefined | null): p is Vec3Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export function isNonZeroBaseLine(a: Vec3Like, b: Vec3Like): boolean {
  return a.x !== b.x || a.y !== b.y || a.z !== b.z;
}

/** Length of the baseLine (XZ — curtain walls are vertical surfaces). */
export function baseLineLength(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

// ───────────────────────── Grid math ─────────────────────────────

export interface CurtainWallGrid {
  /** Column boundary positions along the baseline, in metres.  Always
   *  starts at 0 and ends at baseline length. */
  readonly cols: readonly number[];
  /** Row boundary heights, in metres.  Always starts at 0 and ends at
   *  the curtain-wall height. */
  readonly rows: readonly number[];
}

/** Pure-data grid computation — duplicated from the kernel producer
 *  on purpose so the intent resolver does not depend on @pryzm/geometry-kernel.
 *  The two implementations MUST stay in sync; the property test
 *  `packages/geometry-kernel/__tests__/robustness/curtain-wall.spec.ts`
 *  cross-validates them. */
export function computeIntentGrid(cw: CurtainWallData): CurtainWallGrid {
  const length = baseLineLength(cw.baseLine[0], cw.baseLine[1]) || 1;
  const cols: number[] = [0];
  let x = cw.bayWidth;
  while (x < length - 1e-6) { cols.push(x); x += cw.bayWidth; }
  cols.push(length);

  const rows: number[] = [0];
  let y = cw.bayHeight;
  while (y < cw.height - 1e-6) { rows.push(y); y += cw.bayHeight; }
  rows.push(cw.height);

  return { cols, rows };
}

export interface Point2D { readonly x: number; readonly y: number }

export type SegmentIntent =
  | { kind: 'panel'; row: number; col: number }
  | { kind: 'mullion'; orientation: 'vertical'; index: number }
  | { kind: 'transom'; orientation: 'horizontal'; index: number };

export interface ValidGridResult { readonly ok: true }
export interface InvalidGridResult { readonly ok: false; readonly reason: 'out-of-range' | 'overlaps-existing' }
export type GridValidation = ValidGridResult | InvalidGridResult;

/** Default tolerance: a click within 8 px of a grid line resolves to
 *  mullion/transom rather than panel.  In grid-local metres the caller
 *  must pre-convert from pixels (typically: tolerancePx / pixelsPerMetre). */
export const DEFAULT_MULLION_EDGE_TOLERANCE_M = 0.04; // ≈ 8 px @ 200 px/m

export interface CurtainWallIntentResolverOptions {
  /** Grid-local tolerance, in metres, that decides mullion vs panel.
   *  Defaults to {@link DEFAULT_MULLION_EDGE_TOLERANCE_M}. */
  readonly mullionEdgeToleranceM?: number;
}

export class CurtainWallIntentResolver {
  private readonly cwById: ReadonlyMap<string, CurtainWallData>;
  private readonly tol: number;

  constructor(
    walls: ReadonlyMap<string, CurtainWallData> | Readonly<Record<string, CurtainWallData>>,
    opts: CurtainWallIntentResolverOptions = {},
  ) {
    this.cwById = walls instanceof Map ? walls : new Map(Object.entries(walls));
    this.tol = opts.mullionEdgeToleranceM ?? DEFAULT_MULLION_EDGE_TOLERANCE_M;
  }

  /** Returns the (row, col) cell containing `projected`, or null if out
   *  of grid range.  `projected.x` = distance along baseline, `projected.y`
   *  = height up from baseline.y. */
  resolvePanelCell(cwId: string, projected: Point2D): { row: number; col: number } | null {
    const cw = this.cwById.get(cwId);
    if (!cw) return null;
    const grid = computeIntentGrid(cw);
    const col = findCellIndex(grid.cols, projected.x);
    const row = findCellIndex(grid.rows, projected.y);
    if (col === -1 || row === -1) return null;
    return { row, col };
  }

  /** Disambiguates panel/mullion/transom intent for `projected`.  Mullion
   *  is preferred when `projected` is within `mullionEdgeToleranceM` of
   *  any vertical grid line; transom likewise for horizontal lines.
   *  When both edge tolerances overlap (an intersection point), the
   *  shorter Euclidean distance wins; ties resolve to mullion. */
  resolveSegmentIntent(cwId: string, projected: Point2D): SegmentIntent | null {
    const cw = this.cwById.get(cwId);
    if (!cw) return null;
    const grid = computeIntentGrid(cw);

    const mIdx = nearestLineWithin(grid.cols, projected.x, this.tol);
    const tIdx = nearestLineWithin(grid.rows, projected.y, this.tol);

    if (mIdx !== -1 && tIdx !== -1) {
      // Pick the closer of the two; ties to mullion.
      const dM = Math.abs(grid.cols[mIdx]! - projected.x);
      const dT = Math.abs(grid.rows[tIdx]! - projected.y);
      if (dT < dM) return { kind: 'transom', orientation: 'horizontal', index: tIdx };
      return { kind: 'mullion', orientation: 'vertical', index: mIdx };
    }
    if (mIdx !== -1) return { kind: 'mullion', orientation: 'vertical', index: mIdx };
    if (tIdx !== -1) return { kind: 'transom', orientation: 'horizontal', index: tIdx };

    const cell = this.resolvePanelCell(cwId, projected);
    if (!cell) return null;
    return { kind: 'panel', row: cell.row, col: cell.col };
  }

  /** Used by AddPanel handler entry point — ensures grid coords are valid
   *  (row/col are in-range integers) and not occupied by an existing panel. */
  validateGridCoordinate(cwId: string, row: number, col: number): GridValidation {
    const cw = this.cwById.get(cwId);
    if (!cw) return { ok: false, reason: 'out-of-range' };
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) {
      return { ok: false, reason: 'out-of-range' };
    }
    const grid = computeIntentGrid(cw);
    const maxRow = grid.rows.length - 1; // number of cells = lines - 1
    const maxCol = grid.cols.length - 1;
    if (row >= maxRow || col >= maxCol) return { ok: false, reason: 'out-of-range' };
    if (cw.panels.some((p) => p.row === row && p.col === col)) {
      return { ok: false, reason: 'overlaps-existing' };
    }
    return { ok: true };
  }

  /** Number of grid cells (rows × cols) for a curtain wall — convenience
   *  for tools that need to pre-allocate panel arrays. */
  cellCount(cwId: string): { rows: number; cols: number } | null {
    const cw = this.cwById.get(cwId);
    if (!cw) return null;
    const grid = computeIntentGrid(cw);
    return { rows: grid.rows.length - 1, cols: grid.cols.length - 1 };
  }
}

// ─────────────────────── helpers (private) ───────────────────────

/** Return the index of the cell containing `v` in a strictly increasing
 *  boundary array.  Returns -1 if v is < lines[0] or >= lines[last]. */
function findCellIndex(lines: readonly number[], v: number): number {
  if (v < lines[0]! || v >= lines[lines.length - 1]!) return -1;
  // Linear scan — typical CW has < 30 lines.  Sufficient for click intent.
  for (let i = 0; i < lines.length - 1; i++) {
    if (v >= lines[i]! && v < lines[i + 1]!) return i;
  }
  return -1;
}

/** Index of the line in `lines` that is within `tol` of `v`; -1 if none.
 *  Picks the closest when multiple are within tolerance. */
function nearestLineWithin(lines: readonly number[], v: number, tol: number): number {
  let best = -1;
  let bestDist = tol;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.abs(lines[i]! - v);
    if (d <= bestDist) { bestDist = d; best = i; }
  }
  return best;
}
