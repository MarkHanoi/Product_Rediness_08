// Residential building (multi-family) — workflow barrel.
//
// L2 pure planners for the multi-family typology. P6.2 ships the plate-partition
// stub; P6.1 the apartment packer; P3 the building orchestrator skeleton. The
// corridor spine (P8) + per-cell D-TGL (P7) land in later slices.
export * from './platePartition.js';
export * from './apartmentPacker.js';
export * from './residentialBuildingOrchestrator.js';
