// wallDeletePlannerComposition — the COMPOSITION SITE for the wall.delete planner
// (the WALL, host-side DELETE family).
//
// Kept SEPARATE from WallDeleteConsequencePlanner.ts for the same reason the other five
// composition files are separate: this file imports real production singletons.
// `constraintEngine` (constraint-solver/compliance) touches `window.*` at module scope —
// it wires `pryzm-sync-state-changed` listeners in its constructor — so importing it from
// a node-env unit test would throw at collection. The planner itself takes every
// collaborator by injection, so its tests stay window-free; only this file — invoked from
// the engine bootstrap (L7) — reaches for the singletons.
//
// apps/editor is L7, so every import here is a DOWNWARD edge (L2/L3 collaborators, the L1
// contract) and adds nothing to check-layer-boundaries.
//
// ── THREE READERS OFF ONE MANAGER, AND WHY EACH IS THE REFUSAL-BEARING ONE ───────────
// C78 §5.1 requires delete-family discovery to come from RECORDED relationships, never a
// re-scan. All three graph readers below are wired off the SAME `semanticGraphManager`
// the commit path uses, and in each case the TYPED surface is chosen over the raw one:
//
//   getRelationships   the recorded edge index DeleteElementCommand captures verbatim
//                      BEFORE purging and restores verbatim on undo
//                      (§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES, 3ee632f6), so the planner and
//                      the commit path read ONE index rather than two rival notions of
//                      "related".
//   getJoinedWalls     the refusal-bearing junction reader (ADR-0321). NOT the raw
//                      `getTargets(id, 'joinedTo')`: `{ok:false}` must stay distinguishable
//                      from `{ok:true, joinedWallIds:[]}`, or "no flush has covered this
//                      wall" becomes "it joins nothing" (C71 §4.4).
//   getBoundingWalls   the refusal-bearing `boundedBy` reader
//                      (§GR12-BOUNDARY-INVALIDATION). NOT the raw
//                      `getSources(wallId, 'boundedBy')`, which would answer the whole
//                      question in one call and return `[]` for both "no rooms name this
//                      wall" and "the boundary writers never covered it" — the exact
//                      same-value defect the determination gate flags as
//                      `relationship:*/cannot-refuse`. The planner pays a per-room loop to
//                      keep that distinction, and this is the wiring that makes it possible.
//
// ── WHAT IS DELIBERATELY NOT WIRED ──────────────────────────────────────────────────
// `DependencyResolver.getAffected` — on the same two source-verified grounds the other
// five rows cite: its non-delete branch answers DETERMINED unconditionally, and it MUTATES
// its own capture map on every query, which a planner may not do (ADR-0322 §2). That blind
// spot is declared in the plan as NO_DEPENDENCY_INDEX rather than silently skipped.
//
// `predictRoomGeometry` — wired on the wall.MOVE row, and deliberately absent here. It
// types a `ProposedWallMove`; a delete can leave a ring open, merge two rooms, or stop the
// region being a room at all, none of which that signature can express. The planner
// declares TOPOLOGY_CHANGE_POSSIBLE for each affected room instead — which is what the
// commit path's own §GR12-DELETE-INVALIDATION writer does too: it MARKS the boundary
// undetermined rather than recomputing it.
//
// `wallOccupancyStore` — wired on the move and create rows, absent here, and for the same
// reason the hosted-opening delete row has no occupancy seam: a delete cannot collide.
// Declaring one would advertise a question this family never asks and leave a production
// injection point whose verdict is never consulted.

import { semanticGraphManager } from '@pryzm/core-app-model';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { WallDeleteConsequencePlanner } from './WallDeleteConsequencePlanner.js';

/**
 * Build the production `wall.delete` planner, wired to the recorded-relationship index
 * (the SAME one the commit path purges and restores), the refusal-bearing junction and
 * `boundedBy` readers, and the constraint (violation) engine. All four are read-only from
 * the planner's view: it calls `getRelationships`, `getJoinedWalls`, `getBoundingWalls`
 * and `validateAll`, and nothing else.
 */
export function createWallDeleteConsequencePlanner(): WallDeleteConsequencePlanner {
  return new WallDeleteConsequencePlanner({
    relationships: semanticGraphManager,
    joinedWalls: semanticGraphManager,
    boundingWalls: semanticGraphManager,
    validator: constraintEngine,
  });
}
