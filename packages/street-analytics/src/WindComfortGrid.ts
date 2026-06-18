// PRYZM-STREET-MICROCLIMATE-PIPELINE §2 — WIND comfort (Lawson LDC, no CFD).
//
// For each ground cell, estimate a SHELTER factor from nearby buildings (Σ height/dist
// × upwind-alignment), reduce the freestream speed by it, then classify by the Lawson
// LDC thresholds. Deterministic + pure — a planning-grade proxy, not CFD.

import type { GridCell, BuildingObstacle } from './StreetGrid.js';
import { polygonCentroid } from './StreetGrid.js';

/** Minimal wind input (map a ClimateDataset.windRose → this at the call site). */
export interface WindInput {
  /** Mean wind speed, m/s. */
  readonly meanMs: number;
  /** Prevailing direction the wind comes FROM, degrees (0 = N, 90 = E). */
  readonly prevailingFromDeg: number;
}

export type LawsonClass =
  | 'comfortable'   // < 2.5 m/s — sitting/standing
  | 'acceptable'    // < 5.0 m/s — strolling
  | 'uncomfortable' // < 7.5 m/s — walking
  | 'dangerous'     // ≥ 7.5 m/s
  | 'sheltered';    // under a building

export interface WindComfortCell extends GridCell {
  readonly effectiveSpeedMs: number;
  readonly lawsonClass: LawsonClass;
  /** 0 (calm) … 1 (10 m/s) — for continuous ramps. */
  readonly intensity: number;
}

export function classifyLawson(speedMs: number): LawsonClass {
  if (speedMs < 2.5) return 'comfortable';
  if (speedMs < 5.0) return 'acceptable';
  if (speedMs < 7.5) return 'uncomfortable';
  return 'dangerous';
}

/** Lawson class → hex colour (calm-blue → green → amber → red; matches Henning Larsen). */
export const LAWSON_COLOURS: Record<LawsonClass, string> = {
  comfortable:   '#3B82F6',
  acceptable:    '#22C55E',
  uncomfortable: '#F59E0B',
  dangerous:     '#EF4444',
  sheltered:     '#94A3B8',
};

/**
 * Compute Lawson wind comfort for every grid cell. Pure + deterministic.
 *
 * @param cells     grid cells
 * @param wind      prevailing wind (speed + from-direction)
 * @param buildings obstacles (footprint + height)
 */
export function computeWindComfortGrid(
  cells: readonly GridCell[],
  wind: WindInput,
  buildings: readonly BuildingObstacle[],
): WindComfortCell[] {
  const freestream = Math.max(0, wind.meanMs);
  // Wind FROM direction → unit vector the wind flows TOWARD.
  const fromRad = (wind.prevailingFromDeg * Math.PI) / 180;
  const windDx = -Math.sin(fromRad);
  const windDz = -Math.cos(fromRad);

  // Pre-centroid the obstacles once.
  const obstacles = buildings
    .filter((b) => b.polygon.length >= 3 && b.heightM > 0)
    .map((b) => ({ c: polygonCentroid(b.polygon), h: b.heightM }));

  return cells.map((cell): WindComfortCell => {
    if (cell.underBuilding) {
      return { ...cell, effectiveSpeedMs: 0, lawsonClass: 'sheltered', intensity: 0 };
    }
    let shelter = 0;
    for (const o of obstacles) {
      const dx = o.c.x - cell.x;
      const dz = o.c.z - cell.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1) continue;
      // Is the obstacle UPWIND of this cell? (cell→obstacle aligned against the flow.)
      const align = (-dx / dist) * windDx + (-dz / dist) * windDz;
      if (align < 0.1) continue;           // downwind / crosswind → no shelter
      shelter += (o.h / dist) * align;     // taller + closer + aligned ⇒ more shelter
    }
    const shelterFactor = Math.min(1, shelter / 1.5);   // full shelter at dense-urban ≥1.5
    const effectiveSpeedMs = freestream * (1 - shelterFactor * 0.75);
    return {
      ...cell,
      effectiveSpeedMs,
      lawsonClass: classifyLawson(effectiveSpeedMs),
      intensity: Math.min(1, effectiveSpeedMs / 10),
    };
  });
}
