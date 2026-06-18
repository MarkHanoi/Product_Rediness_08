import { describe, it, expect } from 'vitest';
import {
  buildStreetGrid,
  computeWindComfortGrid,
  computeHeatIslandGrid,
  computePopulationDensityGrid,
  classifyLawson,
  type Pt,
  type BuildingObstacle,
} from '../src/index.js';

// A 20 m × 20 m square site centred on the origin.
const SITE: Pt[] = [
  { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
];
// One building filling the east half (x ∈ [0,10]).
const BLDG: BuildingObstacle = {
  polygon: [{ x: 0, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
  heightM: 30, floors: 10,
};

describe('StreetGrid', () => {
  it('builds a grid covering boundary + margin and classifies cells', () => {
    const cells = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 2, margin: 10 });
    expect(cells.length).toBeGreaterThan(0);
    // Some cells inside the boundary, some outside (margin), some under the building.
    expect(cells.some((c) => c.inBoundary)).toBe(true);
    expect(cells.some((c) => !c.inBoundary)).toBe(true);
    expect(cells.some((c) => c.underBuilding)).toBe(true);
    // A cell in the WEST half (x<0) is NOT under the (east-half) building.
    const west = cells.find((c) => c.x < -2 && c.z > -2 && c.z < 2 && c.inBoundary)!;
    expect(west.underBuilding).toBe(false);
  });

  it('is deterministic — same inputs → identical grid', () => {
    const a = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 3 });
    const b = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 3 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('PERF-GUARD coarsens the cell size so a huge boundary never explodes', () => {
    const huge: Pt[] = [{ x: -1000, z: -1000 }, { x: 1000, z: -1000 }, { x: 1000, z: 1000 }, { x: -1000, z: 1000 }];
    const cells = buildStreetGrid(huge, [], { cellSize: 1, maxCells: 5000 });
    expect(cells.length).toBeLessThanOrEqual(5000);
    expect(cells[0]!.size).toBeGreaterThan(1); // coarsened above the requested 1 m
  });
});

describe('WindComfortGrid (Lawson)', () => {
  it('classifies by speed thresholds', () => {
    expect(classifyLawson(1)).toBe('comfortable');
    expect(classifyLawson(4)).toBe('acceptable');
    expect(classifyLawson(6)).toBe('uncomfortable');
    expect(classifyLawson(9)).toBe('dangerous');
  });

  it('cells under a building are sheltered; cells behind a tall building are calmer than the open freestream', () => {
    const cells = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 2, margin: 6 });
    // Wind from the EAST (90°) → flows toward −x (west); the building (east) shelters the west.
    const wind = { meanMs: 8, prevailingFromDeg: 90 };
    const out = computeWindComfortGrid(cells, wind, [BLDG]);
    const under = out.find((c) => c.underBuilding)!;
    expect(under.lawsonClass).toBe('sheltered');
    expect(under.effectiveSpeedMs).toBe(0);
    // A west cell (downwind of the east building) should be slowed below the 8 m/s freestream.
    const west = out.find((c) => c.x < -3 && !c.underBuilding && c.inBoundary)!;
    expect(west.effectiveSpeedMs).toBeLessThan(8);
    expect(west.effectiveSpeedMs).toBeGreaterThanOrEqual(2);
  });
});

describe('HeatIslandGrid', () => {
  it('UHI delta is higher near dense mass and lower with strong wind', () => {
    const cells = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 2, margin: 6 });
    const calm = computeHeatIslandGrid(cells, { baselineTempC: 20 }, { meanMs: 0.5, prevailingFromDeg: 90 }, [BLDG]);
    const windy = computeHeatIslandGrid(cells, { baselineTempC: 20 }, { meanMs: 9, prevailingFromDeg: 90 }, [BLDG]);
    const idxNearBldg = cells.findIndex((c) => c.x > 1 && c.x < 9 && c.inBoundary && c.underBuilding);
    expect(idxNearBldg).toBeGreaterThanOrEqual(0);
    // Wind ventilates → lower UHI than the calm case at the same cell.
    expect(windy[idxNearBldg]!.uhiDeltaC).toBeLessThan(calm[idxNearBldg]!.uhiDeltaC);
    // Local temp is at or above the baseline.
    expect(calm[idxNearBldg]!.tempC).toBeGreaterThanOrEqual(20);
  });
});

describe('PopulationDensityGrid', () => {
  it('density is non-zero under the building and zero in the empty west', () => {
    const cells = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 2, margin: 0 });
    const { cells: dens, maxDensity } = computePopulationDensityGrid(cells, [BLDG]);
    expect(maxDensity).toBeGreaterThan(0);
    const under = dens.find((c) => c.x > 2 && c.x < 8 && c.underBuilding)!;
    expect(under.density).toBeGreaterThan(0);
    expect(under.intensity).toBeGreaterThan(0);
    const west = dens.find((c) => c.x < -4 && c.inBoundary)!;
    expect(west.density).toBe(0);
  });

  it('a 10-storey building yields more density than a 2-storey one', () => {
    const cells = buildStreetGrid(SITE, [BLDG.polygon], { cellSize: 2, margin: 0 });
    const tall = computePopulationDensityGrid(cells, [BLDG]);
    const low = computePopulationDensityGrid(cells, [{ ...BLDG, floors: 2 }]);
    const cellIdx = cells.findIndex((c) => c.x > 2 && c.x < 8 && c.underBuilding);
    expect(tall.cells[cellIdx]!.density).toBeGreaterThan(low.cells[cellIdx]!.density);
  });
});
