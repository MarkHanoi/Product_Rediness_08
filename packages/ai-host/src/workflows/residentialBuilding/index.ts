// Residential building (multi-family) — workflow barrel.
//
// L2 pure planners for the multi-family typology. P6.2 ships the plate-partition
// stub; P6.1 the apartment packer; P3 the building orchestrator skeleton; P7 runs the
// frozen D-TGL engine per apartment cell (rooms + windows + doors, blind party walls).
// The corridor spine (P8) lands in a later slice.
export * from './platePartition.js';
export * from './apartmentPacker.js';
export * from './runApartmentCellLayout.js';
export * from './residentialBuildingOrchestrator.js';
