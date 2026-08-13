// PRYZM-STREET-MICROCLIMATE-PIPELINE §1 — the shared ground-plane grid.
//
// Every street-level overlay (wind / heat / population density / UTCI / shade) is a
// PURE map over the SAME grid of cells → a colour. Building the grid ONCE and only
// recolouring per layer is what gives the instant Henning-Larsen "flip between
// metrics" UX. Pure: no I/O, no THREE/Cesium/DOM, no RNG, no Date.now.

/** A point in scene-XZ metres (ENU east = +x, north = −z) from the site origin. */
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

export interface Pt {
  readonly x: number;
  readonly z: number;
}

export interface GridCell {
  /** Cell centre in scene-XZ metres. */
  readonly x: number;
  readonly z: number;
  /** Cell edge length in metres. */
  readonly size: number;
  /** Centre inside the site boundary polygon? */
  readonly inBoundary: boolean;
  /** Centre under any building footprint? */
  readonly underBuilding: boolean;
}

export interface GridOptions {
  /** Cell size in metres. 2 = detailed, 3 = standard, 5 = fast. */
  readonly cellSize?: number;
  /** How far OUTSIDE the boundary to extend, in metres. */
  readonly margin?: number;
  /**
   * Hard cap on total cells (perf guard). When the boundary + margin at `cellSize`
   * would exceed this, `cellSize` is auto-coarsened so the grid never explodes.
   * Default 20000 (≈ a 400 m² site at 3 m is ~4000; a huge site won't lock the tab).
   */
  readonly maxCells?: number;
}

/** Ray-casting point-in-polygon on the XZ plane — §C73-PIP-CANONICAL:
 *  delegates to THE kernel ray cast. */
export function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  return pointInPolygonXZ(pt.x, pt.z, poly);
}

/**
 * Build a regular grid covering the site boundary + margin, classifying each cell as
 * inBoundary / underBuilding. The grid is the SINGLE source of cell geometry every
 * overlay layer maps over. Deterministic — same inputs → identical cells.
 *
 * @param boundary   Site boundary polygon in scene-XZ metres (≥3 verts).
 * @param footprints Building footprint polygons in scene-XZ metres.
 */
export function buildStreetGrid(
  boundary: readonly Pt[],
  footprints: readonly (readonly Pt[])[],
  opts: GridOptions = {},
): GridCell[] {
  if (boundary.length < 3) return [];
  const { margin = 20, maxCells = 20000 } = opts;
  let cellSize = opts.cellSize ?? 3;

  const xs = boundary.map((p) => p.x);
  const zs = boundary.map((p) => p.z);
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minZ = Math.min(...zs) - margin;
  const maxZ = Math.max(...zs) + margin;
  const w = maxX - minX;
  const d = maxZ - minZ;

  // §PERF-GUARD — coarsen the cell size if the grid would exceed maxCells, so a huge
  // boundary never produces millions of cells (deterministic: derived from the area).
  // The exact cell count is ceil(w/cs)·ceil(d/cs); coarsen until that is ≤ maxCells
  // (the closed-form sqrt under-shoots because of the ceil rounding + half-cell start).
  if (!(cellSize > 0) || w <= 0 || d <= 0) return [];
  if (Math.ceil(w / cellSize) * Math.ceil(d / cellSize) > maxCells) {
    cellSize = Math.sqrt((w * d) / maxCells);
    while (Math.ceil(w / cellSize) * Math.ceil(d / cellSize) > maxCells) cellSize *= 1.04;
  }

  const cells: GridCell[] = [];
  for (let x = minX + cellSize / 2; x < maxX; x += cellSize) {
    for (let z = minZ + cellSize / 2; z < maxZ; z += cellSize) {
      const pt = { x, z };
      cells.push({
        x, z, size: cellSize,
        inBoundary: pointInPolygon(pt, boundary),
        underBuilding: footprints.some((fp) => fp.length >= 3 && pointInPolygon(pt, fp)),
      });
    }
  }
  return cells;
}

/** A building obstacle: footprint polygon + height (+ optional explicit floor count). */
export interface BuildingObstacle {
  readonly polygon: readonly Pt[];
  readonly heightM: number;
  readonly floors?: number;
}

/** Centroid of a polygon (simple vertex average — fine for shelter/overlap heuristics). */
export function polygonCentroid(poly: readonly Pt[]): Pt {
  let sx = 0, sz = 0;
  for (const p of poly) { sx += p.x; sz += p.z; }
  const n = poly.length || 1;
  return { x: sx / n, z: sz / n };
}
