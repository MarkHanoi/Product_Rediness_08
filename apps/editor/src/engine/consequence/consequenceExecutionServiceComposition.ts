// consequenceExecutionServiceComposition — the COMPOSITION SITE for the R4 executor.
//
// Same split as the R2/R3 composition files and for the same reason: the SERVICE
// (ConsequenceExecutionService.ts) takes every collaborator by injection and imports
// only types, so its tests and the certification gate run window-free; THIS file is
// the one that reaches for production singletons, invoked from the composition layer.
//
// The bus is a PARAMETER, not an import: the live CommandBus instance is owned by
// `composeRuntime` (P1 — another phase's territory), and the caller that wires the
// consequence-carrying execution surface (R6's confirmation flow) already holds the
// runtime. Taking it as an argument keeps this file free of any runtime-acquisition
// path that could rival the single composition root.
//
// R4 STATUS, stated honestly: no production surface calls this factory yet. That is
// DELIBERATE, not neglect — the R3 hover preview's plan is computed for a hover-time
// payload, so consuming it at drag-end would ALWAYS refuse binding (the payload —
// hence planHash — differs), and the plan-at-confirm-time flow that makes binding
// meaningful is R6's confirmation policy (BIM30 plan R6). R4's own exit condition is
// G-REASON-03 landing with its ledger (plan doc R4), which the certification gate
// (tools/rac-conformance/certification/gates/check-execution-plan-agreement.ts)
// satisfies by driving THIS service over the real bus + real wall.updateBaseline
// handler. Disposition per STR-06's ladder: AUTHORED ✓ / REACHABLE via this factory /
// COMPOSABLE+production-wired lands with R6.

import type { ConsequencePlanner } from '@pryzm/command-bus';
import type { WallMoveCommand } from './WallMoveConsequencePlanner.js';
import { createWallMoveConsequencePlanner } from './wallMovePlannerComposition.js';
import { buildPlanningContext } from './consequencePreviewServiceComposition.js';
import {
  ConsequenceExecutionService,
  type ConsequenceDispatcher,
} from './ConsequenceExecutionService.js';

/**
 * Build the production R4 executor over the live bus: the SAME `wall.move` planner
 * the preview composes (one planner, both surfaces — ADR-0322 §1), the SAME
 * PlanningContext factory over the live `storeRegistry`, and the default read-back
 * store set. No violation snapshotter yet: assembling the ConstraintContext outside
 * the planner is R5/R6 work, so reports carry `validationUndetermined` — a typed
 * blind spot, not a fabricated "no delta" (consequence.ts §5).
 */
export function createConsequenceExecutionService(bus: ConsequenceDispatcher): ConsequenceExecutionService {
  const planners = new Map<string, ConsequencePlanner<WallMoveCommand>>();
  planners.set('wall.move', createWallMoveConsequencePlanner());
  return new ConsequenceExecutionService({
    bus,
    planners,
    context: buildPlanningContext,
  });
}
