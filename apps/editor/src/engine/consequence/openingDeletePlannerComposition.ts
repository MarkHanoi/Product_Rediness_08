// openingDeletePlannerComposition — the COMPOSITION SITE for the opening.delete planner
// (the hosted-opening DELETE family).
//
// Kept SEPARATE from OpeningDeleteConsequencePlanner.ts for the same reason the other four
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
// ── WHY `semanticGraphManager` AND NOT A DEPENDENCY RESOLVER ─────────────────────────
// C78 §5.1 requires delete-family discovery to come from RECORDED relationships, never a
// re-scan. `semanticGraphManager.getRelationships` is exactly that record — it is the
// index DeleteElementCommand captures verbatim BEFORE purging and restores verbatim on
// undo (§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES, 3ee632f6), so the planner and the commit path
// read ONE index rather than two rival notions of "related".
//
// `DependencyResolver.getAffected` is deliberately NOT wired, on the same two
// source-verified grounds the other four rows cite: its non-delete branch answers
// DETERMINED unconditionally, and it MUTATES its own capture map on every query, which a
// planner may not do (ADR-0322 §2). That blind spot is declared in the plan as
// NO_DEPENDENCY_INDEX rather than silently skipped.
//
// ── WHY THERE IS NO OCCUPANCY SEAM (the create row has exactly one) ──────────────────
// A delete cannot collide: it strictly REMOVES an interval from the host's occupancy, so
// no sibling's span moves and no commit path refuses on geometric grounds. Declaring a
// `canPlace` seam here would advertise a question this family never asks and would leave a
// production injection point whose verdict is never consulted.

import { semanticGraphManager } from '@pryzm/core-app-model';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { OpeningDeleteConsequencePlanner } from './OpeningDeleteConsequencePlanner.js';

/**
 * Build the production `opening.delete` planner, wired to the recorded-relationship index
 * (the SAME one the commit path purges and restores) and the constraint (violation)
 * engine. Both are read-only from the planner's view: it calls `getRelationships` and
 * `validateAll` and nothing else.
 */
export function createOpeningDeleteConsequencePlanner(): OpeningDeleteConsequencePlanner {
  return new OpeningDeleteConsequencePlanner({
    relationships: semanticGraphManager,
    validator: constraintEngine,
  });
}
