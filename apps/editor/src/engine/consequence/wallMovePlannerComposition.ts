// wallMovePlannerComposition — the COMPOSITION SITE for the R2 wall.move planner.
//
// Kept SEPARATE from WallMoveConsequencePlanner.ts on purpose: this file imports the
// real production singletons — `wallOccupancyStore` (geometry-wall), `semanticGraphManager`
// (core-app-model) and `constraintEngine` (constraint-solver/compliance). The last touches
// `window.*` at module scope (it wires `pryzm-sync-state-changed` listeners in its
// constructor), so importing it from a node-env unit test would throw at collection. The
// planner itself takes those collaborators by injection, so its tests stay window-free;
// only this file — invoked from the engine bootstrap (L7) — reaches for the singletons.
//
// apps/editor is L7, so every import here is a DOWNWARD edge (L2 collaborators, the L1
// contract) and adds nothing to check-layer-boundaries.

import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
// Phase 6b — a PURE function (no stores, no window, no clock). Safe to import as a value
// here AND it would be safe in the planner; it is injected only so the planner keeps its
// "absent collaborator ⇒ typed UNDETERMINED" property uniform across all four deps.
import { predictRoomGeometry } from '@pryzm/room-topology';
import { WallMoveConsequencePlanner } from './WallMoveConsequencePlanner.js';

/**
 * Build the production `wall.move` planner, wired to the live occupancy seed, the retained
 * joinedTo junction index, and the constraint (violation) engine. All three are read-only
 * collaborators from the planner's point of view.
 */
export function createWallMoveConsequencePlanner(): WallMoveConsequencePlanner {
  return new WallMoveConsequencePlanner({
    occupancy: wallOccupancyStore,
    joinedWalls: semanticGraphManager,
    validator: constraintEngine,
    predictRoomGeometry,
  });
}
