// Office building — workflow barrel.
//
// L2 pure planners for the office-tower typology (the FOURTH generative typology):
//   - officeFloorPlate.ts        — the circular floor-plate zone generator (centrepiece)
//   - officeBuildingOrchestrator.ts — the multi-storey stack with dept-preset variety
//
// Self-contained: does NOT import the residential workflow. Zero THREE, zero DOM.
export * from './officeFloorPlate.js';
export * from './officeBuildingOrchestrator.js';
