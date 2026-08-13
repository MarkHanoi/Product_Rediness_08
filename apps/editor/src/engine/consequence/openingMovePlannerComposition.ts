// openingMovePlannerComposition — the COMPOSITION SITE for the opening.move planner
// (the THIRD row of the golden-operation matrix).
//
// Kept SEPARATE from OpeningMoveConsequencePlanner.ts for the same reason
// `wallMovePlannerComposition.ts` and `wallCreatePlannerComposition.ts` are separate: this
// file imports real production singletons. `constraintEngine`
// (constraint-solver/compliance) touches `window.*` at module scope — it wires
// `pryzm-sync-state-changed` listeners in its constructor — so importing it from a node-env
// unit test would throw at collection. The planner itself takes every collaborator by
// injection, so its tests stay window-free; only this file — invoked from the engine
// bootstrap (L7) — reaches for the singletons.
//
// apps/editor is L7, so every import here is a DOWNWARD edge (L2 collaborators, the L1
// contract) and adds nothing to check-layer-boundaries.
//
// NOTE on the two occupancy seams: `clamp` and `collision` are BOTH satisfied by the one
// `wallOccupancyStore` singleton, and they are still declared as two separate injection
// points on the planner. That is deliberate — they answer different questions (fit-against-
// host vs collide-with-sibling) with different refusal shapes and different pairs of numbers,
// and a planner that took them as one dependency could not report "the fit check ran but the
// occupancy check did not". The production wiring collapsing to one object is an
// implementation fact, not a reason to collapse the contract.
//
// NOTE on `wallOccupancyStore.canPlace`'s console output: it logs on success and on conflict.
// That is I/O, not MUTATION — it writes no store, emits no event, touches no undo stack — so
// it does not breach G-REASON-01 (preview purity), which is about authoritative state. The
// store already suppresses the success log during project load and building generation
// (§GEN-LOG-GATING); a consequence preview on hover is a third caller that could reasonably
// join that suppression list, but that is a change inside another lane's package and is
// recorded here rather than made silently.

import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { OpeningMoveConsequencePlanner } from './OpeningMoveConsequencePlanner.js';

/**
 * Build the production `opening.move` planner, wired to the host-fit clamp, the sibling
 * occupancy reader, and the constraint (violation) engine. All three are read-only from the
 * planner's view.
 */
export function createOpeningMoveConsequencePlanner(): OpeningMoveConsequencePlanner {
  return new OpeningMoveConsequencePlanner({
    clamp: wallOccupancyStore,
    collision: wallOccupancyStore,
    validator: constraintEngine,
  });
}
