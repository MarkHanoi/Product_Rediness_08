// Office furnish — workflow barrel (Phase-1 thin entry for SPEC-OFFICE-GENERATION-ENGINE §5/§6).
//
// SPEC §1 splits the office generator into TWO independent systems: Command 1 (architecture) and
// Command 2 (Furnish Office). Command 2's PLACEMENT currently runs editor-side (it stamps furniture
// on the built floors via the command bus — see apps/editor/src/ui/office-building/officeFurnish.ts),
// because Phase 1 MOVES the existing in-Build furniture into the command rather than rewriting it.
//
// This module is the L2 seam Phase 2 will grow into the MODULAR fit-out engine (SPEC §5/§6/§7/§8):
// a library of reusable office modules (single/linear/bench workstations · collaborative block ·
// meeting-room block · executive office · phone booth · kitchen block · breakout block), placed by
// occupancy-driven, circulation-clearance-respecting logic. Phase 1 exposes only the module TYPE
// vocabulary + an occupancy estimator so downstream code (and tests) can start referencing them; the
// concrete placement engine lands in Phase 2. Zero THREE, zero DOM, zero I/O (pure, L2).

export * from './officeModuleLibrary.js';
