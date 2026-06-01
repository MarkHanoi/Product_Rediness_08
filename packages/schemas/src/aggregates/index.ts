// A.23.a (Phase A · Sprint 2) — Public surface for the C20 aggregate
// substrate.
//
// Re-exported through the root barrel (`@pryzm/schemas`).
//
// Slice contents (A.23.a):
//   - types:       branded ids (LevelId · ApartmentId · RoomId) +
//                  re-exports `BuildingId` from site/types
//   - Building:    aggregate root, links forward to C19 Site
//   - Level:       per-Building floor level (signed levelNumber)
//   - Apartment:   composes ApartmentParameters (single Level today
//                  per [C20 §1.3]; multi-Level deferred to C20.2)
//   - Room:        composes RoomParameters (apartmentId nullable for
//                  public corridors / plant rooms)
//
// Deferred to later slices (A.23.b/c/d/e/f):
//   - L3 BuildingStore + LevelStore + ApartmentStore + RoomStore
//   - building.* / level.* / apartment.* / room.* commands
//   - Cross-store invariants (active-Level uniqueness, unit-number
//     uniqueness, apartment↔room levelId consistency)
//   - composeRuntime wiring
//   - Inspect-tree wiring (per C27 §3)
//
// Strategic context: docs/02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md.

export * from './types.js';
export * from './Building.js';
export * from './Level.js';
export * from './Apartment.js';
export * from './Room.js';
