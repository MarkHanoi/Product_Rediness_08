// wallOpeningCreatePlannerComposition — the COMPOSITION SITE for the wall.opening.create
// planner (the hosted-opening CREATE family).
//
// Kept SEPARATE from WallOpeningCreateConsequencePlanner.ts for the same reason the other
// three composition files are separate: this file imports real production singletons.
// `constraintEngine` (constraint-solver/compliance) touches `window.*` at module scope —
// it wires `pryzm-sync-state-changed` listeners in its constructor — so importing it from
// a node-env unit test would throw at collection. The planner itself takes every
// collaborator by injection, so its tests stay window-free; only this file — invoked from
// the engine bootstrap (L7) — reaches for the singletons.
//
// apps/editor is L7, so every import here is a DOWNWARD edge (L2 collaborators, the L1
// contract) and adds nothing to check-layer-boundaries.
//
// NOTE on the ONE occupancy seam (vs the move row's two): the move planner declares
// `clamp` and `collision` as separate injection points because the offset handlers CLAMP
// at commit (C15 §5) and the two questions refuse with different pairs of numbers. The
// CREATE commit path (`CreateWallOpening.canExecute` + its race-defensive execute
// re-check) has exactly ONE rule — `wallOccupancyStore.canPlace`, whose closed
// `CanPlaceRefusalCode` union already spans both the bounds arms and the overlap arm —
// and it never clamps. One commit rule, one seam: declaring a clamp seam here would
// advertise a refit this family's handlers do not perform.

import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { WallOpeningCreateConsequencePlanner } from './WallOpeningCreateConsequencePlanner.js';

/**
 * Build the production `wall.opening.create` planner, wired to the occupancy authority
 * (the SAME `canPlace` the commit path runs) and the constraint (violation) engine. Both
 * are read-only from the planner's view.
 */
export function createWallOpeningCreateConsequencePlanner(): WallOpeningCreateConsequencePlanner {
  return new WallOpeningCreateConsequencePlanner({
    occupancy: wallOccupancyStore,
    validator: constraintEngine,
  });
}
