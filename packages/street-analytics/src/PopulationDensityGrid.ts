// PRYZM-STREET-MICROCLIMATE-PIPELINE §5 — POPULATION density (keyless OSM proxy).
//
// A planning-grade density proxy from the EXISTING OSM context buildings — no API key,
// no tile server, fully offline. Per cell: Σ over overlapping buildings of
// (floors × footprint-overlap-area × persons-per-m²-GFA), divided by the cell area →
// persons/m². (A real WorldPop/GHS-POP imagery layer is the P4 upgrade.) Pure +
// deterministic.

import type { GridCell, Pt, BuildingObstacle } from './StreetGrid.js';
import { pointInPolygon } from './StreetGrid.js';

/** Residents per m² of gross floor area (planning rule of thumb ~0.035). */
const PERSONS_PER_GFA = 0.035;
/** Default storey height (m) when a building only carries a height, not a floor count. */
const STOREY_HEIGHT_M = 3;

export interface PopulationDensityCell extends GridCell {
  /** Estimated residents per m² of ground in this cell. */
  readonly density: number;
  /** 0 … 1 normalised against `maxDensity` for the colour ramp. */
  readonly intensity: number;
}

/** Fraction of a cell covered by a polygon, sampled at the 4 cell corners (0, .25, .5, .75, 1). */
function cellOverlapFraction(cell: GridCell, polygon: readonly Pt[]): number {
  const h = cell.size / 2;
  const corners: Pt[] = [
    { x: cell.x - h, z: cell.z - h },
    { x: cell.x + h, z: cell.z - h },
    { x: cell.x + h, z: cell.z + h },
    { x: cell.x - h, z: cell.z + h },
  ];
  let hits = 0;
  for (const c of corners) if (pointInPolygon(c, polygon)) hits++;
  return hits / 4;
}

/** Cheap AABB reject before the per-corner test — cell-AABB vs polygon-AABB overlap.
 *  (A vertex-distance test would WRONGLY reject a cell in the MIDDLE of a large
 *  building, which is far from every vertex yet fully inside the footprint.) */
function roughlyOverlaps(cell: GridCell, polygon: readonly Pt[]): boolean {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const h = cell.size / 2;
  return cell.x + h >= minX && cell.x - h <= maxX && cell.z + h >= minZ && cell.z - h <= maxZ;
}

/**
 * Compute a population-density proxy per grid cell from OSM building footprints.
 * Returns the cells PLUS the `maxDensity` used to normalise `intensity` (so the
 * renderer + legend share one scale). Pure + deterministic.
 */
export function computePopulationDensityGrid(
  cells: readonly GridCell[],
  buildings: readonly BuildingObstacle[],
): { cells: PopulationDensityCell[]; maxDensity: number } {
  const raw = cells.map((cell) => {
    const cellArea = cell.size * cell.size;
    let gfa = 0;
    for (const b of buildings) {
      if (b.polygon.length < 3) continue;
      if (!roughlyOverlaps(cell, b.polygon)) continue;
      const overlap = cellOverlapFraction(cell, b.polygon) * cellArea;
      if (overlap <= 0) continue;
      const floors = b.floors && b.floors > 0 ? b.floors : Math.max(1, Math.round(b.heightM / STOREY_HEIGHT_M));
      gfa += overlap * floors;
    }
    return { cell, density: cellArea > 0 ? (gfa * PERSONS_PER_GFA) / cellArea : 0 };
  });

  // Normalise against the 95th-percentile-ish max (use the true max but floor it so a
  // single outlier doesn't wash everything pale; a typical dense block ≈ 0.04 p/m²).
  const maxDensity = Math.max(0.04, ...raw.map((r) => r.density));
  return {
    cells: raw.map(({ cell, density }) => ({
      ...cell,
      density,
      intensity: Math.min(1, density / maxDensity),
    })),
    maxDensity,
  };
}

/** Density intensity (0..1) → light→dark-red hex ramp. */
export function densityCellColour(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  if (t < 0.25) return '#FFFFC8';
  if (t < 0.50) return '#FFB864';
  if (t < 0.75) return '#FF7832';
  return '#B41E14';
}
