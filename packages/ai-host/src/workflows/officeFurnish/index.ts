// Office furnish — workflow barrel (Phase-1 thin entry for SPEC-OFFICE-GENERATION-ENGINE §5/§6).
//
// SPEC §1 splits the office generator into TWO independent systems: Command 1 (architecture) and
// Command 2 (Furnish Office). Command 2's PLACEMENT currently runs editor-side (it stamps furniture
// on the built floors via the command bus — see apps/editor/src/ui/office-building/officeFurnish.ts),
// because Phase 1 MOVES the existing in-Build furniture into the command rather than rewriting it.
//
// Phase 2 grows this into the full MODULAR fit-out engine (SPEC §5/§6/§7/§8/§9 steps 7–8): a library
// of reusable office modules (single/linear/bench workstations · collaborative block · meeting-room
// block · executive office · phone booth · kitchen block · breakout block — moduleRecipes.ts), placed
// by an occupancy-driven, circulation-clearance-respecting engine (occupancyPlan.ts + furnishPlanner.ts)
// with a final egress/clearance validation (clearanceValidation.ts). Zero THREE, zero DOM, zero I/O
// (pure, L2). The editor-side Command 2 (apps/editor/.../officeFurnish.ts) maps each PlacedItem to a
// CreateFurnitureCommand on the built floor — the ONLY mutation path (P6).

export * from './officeModuleLibrary.js';       // OfficeModuleKind vocabulary + estimateOccupancy (§8)
export * from './officeModuleTypes.js';         // PlacedItem / PlacedModule / bbox helpers
export * from './moduleRecipes.js';             // the 9 §5 module recipes
export * from './occupancyPlan.js';             // planModuleMix (§8 occupancy → module counts)
export * from './clearanceValidation.js';       // §7 clearances + §9-8 validateFurnish
export * from './furnishPlanner.js';            // planFloorfurnish — the placement engine
