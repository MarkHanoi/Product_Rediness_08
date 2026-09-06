// Residential building (multi-family) — workflow barrel.
//
// L2 pure planners for the multi-family typology. P6.2 ships the plate-partition
// stub; P6.1 the apartment packer; P3 the building orchestrator skeleton; P7 runs the
// frozen D-TGL engine per apartment cell (rooms + windows + doors, blind party walls).
// P8 ships the corridor-spine GATE (`residentialCorridorQuality.ts`) — the MEASUREMENT of the
// already-shipped spine, not a rival solver.
export * from './platePartition.js';
export * from './apartmentPacker.js';
export * from './runApartmentCellLayout.js';
export * from './residentialBuildingOrchestrator.js';
// §RESI-CORE-REWORK — the clearance-derived core sizing (single source of truth for
// coreWidth/coreDepth, shared by the orchestrator + the editor executor).
export * from './coreSizing.js';
// §RESI-ENTRY-INTO-CORRIDOR — the front-door-into-circulation offset resolver (pure; mirrored
// locally in the editor executor, exported here so it is unit-testable).
export * from './apartmentEntryDoorOffset.js';
// §RESI-OPENING-IN-WALL — the emit-stage clamp that keeps a window/door opening within its STORED
// host-wall length (mitred walls are shorter than generation-time), used by the editor executor.
export * from './clampOpeningToWall.js';
// L-864 §RESI-UNIT-CONTAINMENT — the pure per-apartment UNIT plan (one hierarchy Unit per
// placed cell) the executor uses to mint units + stamp the authoritative `room.unitId`.
export * from './unitPlan.js';
// §RESI-SINGLE-CORE-LANDING (ADR-0372, L-11190) — the small-plate typology planner: one compact
// rear-corner core + a landing, no corridor, N ∈ {1,2} apartments per floor off the landing.
export * from './singleCoreLanding.js';
// P8 (tracker) — §DIAG-CORRIDOR-QUALITY. The corridor-spine GATE: measures R1 reached / R2 core-
// reachable / R3 servedThrough=0 / R4 orphaned=0 across a whole building, RE-DERIVING reachability
// from the shipped geometry with the partition's own BFS (never reading the cell's self-report).
// Pure, never throws, emission behind `__pryzmResidentialCorridorGate` (default OFF).
export * from './residentialCorridorQuality.js';
