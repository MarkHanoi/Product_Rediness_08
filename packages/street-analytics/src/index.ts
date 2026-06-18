// @pryzm/street-analytics — PRYZM-STREET-MICROCLIMATE-PIPELINE (P1 L2 core).
//
// PURE, THREE/Cesium/DOM-free street-level microclimate math: one shared ground-plane
// grid, mapped per-layer to a colour. P1 ships WIND comfort, HEAT island, and
// POPULATION density; UTCI + Shade (need sun position) are the P2 slice. The
// Cesium/THREE renderers (apps/editor) consume these colour-per-cell results.

export type { Pt, GridCell, GridOptions, BuildingObstacle } from './StreetGrid.js';
export { buildStreetGrid, pointInPolygon, polygonCentroid } from './StreetGrid.js';

export type { WindInput, LawsonClass, WindComfortCell } from './WindComfortGrid.js';
export { computeWindComfortGrid, classifyLawson, LAWSON_COLOURS } from './WindComfortGrid.js';

export type { HeatInput, HeatIslandCell } from './HeatIslandGrid.js';
export { computeHeatIslandGrid, heatCellColour } from './HeatIslandGrid.js';

export type { PopulationDensityCell } from './PopulationDensityGrid.js';
export { computePopulationDensityGrid, densityCellColour } from './PopulationDensityGrid.js';
