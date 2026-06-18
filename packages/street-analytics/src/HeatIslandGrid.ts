// PRYZM-STREET-MICROCLIMATE-PIPELINE §2 — HEAT island (UHI ΔT, no CFD).
//
// The urban-heat-island ΔT over the rural baseline rises with local built density
// (more heat-absorbing surface, less evapotranspiration) and FALLS with ventilation
// (wind carries heat away). Per cell: ΔT = MAX_UHI × density × (1 − ventilation).
// A deterministic planning proxy from the building footprints + the prevailing wind —
// pure, no CFD.

import type { GridCell, BuildingObstacle } from './StreetGrid.js';
import { polygonCentroid } from './StreetGrid.js';
import type { WindInput } from './WindComfortGrid.js';

/** Heat input: the rural baseline mean air temp (°C) for the analysis month. */
export interface HeatInput {
  readonly baselineTempC: number;
}

export interface HeatIslandCell extends GridCell {
  /** Urban-heat-island delta over the rural baseline, °C. */
  readonly uhiDeltaC: number;
  /** Local air temperature estimate, °C. */
  readonly tempC: number;
  /** 0 … 1 normalised (0 = baseline, 1 = MAX_UHI) for the warm ramp. */
  readonly intensity: number;
}

/** Peak UHI delta (°C) at fully built, fully sheltered — typical dense-city summer ~6 °C. */
const MAX_UHI_C = 6;
/** Radius (m) over which surrounding building mass contributes to a cell's density. */
const DENSITY_RADIUS_M = 40;

export function computeHeatIslandGrid(
  cells: readonly GridCell[],
  heat: HeatInput,
  wind: WindInput,
  buildings: readonly BuildingObstacle[],
): HeatIslandCell[] {
  const obstacles = buildings
    .filter((b) => b.polygon.length >= 3 && b.heightM > 0)
    .map((b) => ({ c: polygonCentroid(b.polygon), h: b.heightM }));

  // Ventilation: more wind ⇒ more heat carried away. Normalise around ~5 m/s.
  const ventilation = Math.min(0.85, Math.max(0, wind.meanMs) / 6);

  return cells.map((cell): HeatIslandCell => {
    // Local built density: sum of (height) of buildings within DENSITY_RADIUS_M,
    // distance-weighted, normalised. Under a building reads as maximum density.
    let massScore = cell.underBuilding ? 1.5 : 0;
    for (const o of obstacles) {
      const dist = Math.hypot(o.c.x - cell.x, o.c.z - cell.z);
      if (dist > DENSITY_RADIUS_M) continue;
      massScore += (o.h / 12) * (1 - dist / DENSITY_RADIUS_M);
    }
    const density = Math.min(1, massScore / 4);
    const uhiDeltaC = MAX_UHI_C * density * (1 - ventilation);
    return {
      ...cell,
      uhiDeltaC,
      tempC: heat.baselineTempC + uhiDeltaC,
      intensity: Math.min(1, uhiDeltaC / MAX_UHI_C),
    };
  });
}

/** UHI intensity (0..1) → warm hex ramp (cool yellow → orange → deep red). */
export function heatCellColour(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  const stops: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.0, 0xFD, 0xE0, 0x47], // #FDE047 — coolest (low UHI)
    [0.5, 0xFB, 0x92, 0x3C], // #FB923C
    [1.0, 0xB9, 0x1C, 0x1C], // #B91C1C — hottest
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i]![0]) {
      const [t0, r0, g0, b0] = stops[i - 1]!;
      const [t1, r1, g1, b1] = stops[i]!;
      const s = (t - t0) / (t1 - t0 || 1);
      const r = Math.round(r0 + s * (r1 - r0));
      const g = Math.round(g0 + s * (g1 - g0));
      const b = Math.round(b0 + s * (b1 - b0));
      return `rgb(${r},${g},${b})`;
    }
  }
  return '#B91C1C';
}
