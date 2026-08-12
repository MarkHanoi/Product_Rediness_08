// wallCreatePlannerComposition — the COMPOSITION SITE for the Phase 6c wall.create planner.
//
// Kept SEPARATE from WallCreateConsequencePlanner.ts on purpose, for the same reason
// `wallMovePlannerComposition.ts` is separate: this file imports real production singletons.
// `constraintEngine` (constraint-solver/compliance) touches `window.*` at module scope — it
// wires `pryzm-sync-state-changed` listeners in its constructor — so importing it from a
// node-env unit test would throw at collection. The planner itself takes every collaborator
// by injection, so its tests stay window-free; only this file — invoked from the engine
// bootstrap (L7) — reaches for the singletons.
//
// apps/editor is L7, so every import here is a DOWNWARD edge (L2 collaborators, the L1
// contract) and adds nothing to check-layer-boundaries.
//
// NOTE on `resolveJunctionsWithRecords`: it is a PURE function (no stores, no window, no
// clock) and would be safe to import directly inside the planner. It is injected anyway, so
// that the planner keeps its "absent collaborator ⇒ typed UNDETERMINED" property UNIFORM
// across all three deps — a planner where two deps are optional and one is secretly mandatory
// has a refusal path nobody can test. Same rationale as `predictRoomGeometry` on the move
// planner.

import { wallOccupancyStore, resolveJunctionsWithRecords } from '@pryzm/geometry-wall';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { WallCreateConsequencePlanner } from './WallCreateConsequencePlanner.js';

/**
 * Build the production `wall.create` planner, wired to the pure junction resolver (the
 * before/after solve that predicts joins for a wall with no id yet), the opening-refit seed,
 * and the constraint (violation) engine. All three are read-only from the planner's view.
 */
export function createWallCreateConsequencePlanner(): WallCreateConsequencePlanner {
  return new WallCreateConsequencePlanner({
    resolveJunctions: resolveJunctionsWithRecords,
    occupancy: wallOccupancyStore,
    validator: constraintEngine,
  });
}
