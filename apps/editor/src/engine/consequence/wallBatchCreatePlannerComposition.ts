// wallBatchCreatePlannerComposition — the COMPOSITION SITE for the `wall.batch.create` planner.
//
// Kept SEPARATE from WallBatchCreateConsequencePlanner.ts for the same reason
// `wallCreatePlannerComposition.ts` is separate from its planner: this file imports real
// production singletons. `constraintEngine` (constraint-solver/compliance) touches `window.*`
// at module scope — it wires `pryzm-sync-state-changed` listeners in its constructor — so
// importing it from a node-env unit test would throw at collection. The planner itself takes
// every collaborator by injection, so its tests stay window-free; only this file — invoked
// from the engine bootstrap (L7) — reaches for the singletons.
//
// apps/editor is L7, so every import here is a DOWNWARD edge (L2 collaborators, the L1
// contract) and adds nothing to check-layer-boundaries.
//
// ── THE SAME THREE SINGLETONS AS THE SINGLE-CREATE ROW, DELIBERATELY ─────────────────
// `createWallCreateConsequencePlanner()` wires exactly `resolveJunctionsWithRecords`,
// `wallOccupancyStore` and `constraintEngine`. This row wires the SAME THREE, by the same
// names, because `wall.create` and `wall.batch.create` must never answer the same geometric
// question two ways: a wall built by the plan tool and the same wall built by a generator go
// through one mitre solve, one occupancy seed and one violation core in production, so they
// must go through one of each in the plan too. If these two composition functions ever
// diverge, that divergence is the bug.
//
// ── THE FOURTH SEAM, AND WHY IT IS LEFT UNWIRED ──────────────────────────────────────
// The planner also accepts `systemTypes` — the `WallSystemTypeStore.has` catalogue that
// `CreateWallBatchHandler` consults to refuse `walls[i]: unknown systemTypeId: <id>`. It is
// NOT wired here, and that is a MEASURED decision, not an oversight:
//
//   • The handler's own catalogue is OPTIONAL (`constructor(private readonly
//     systemTypeStore?: WallSystemTypeStore)`), and every check it guards is wrapped in
//     `this.systemTypeStore !== undefined`. A handler constructed without one validates
//     nothing and accepts any id — documented S07 behaviour.
//   • The instance the running plugin holds is the one the PluginRegistry handed
//     `CreateWallBatchHandler` at registration. Reaching for a *different* catalogue here —
//     a second singleton, a runtime lookup, a rebuilt adapter — would let the planner refuse
//     a batch the executing handler accepts, or accept one it refuses. That is the
//     G-REASON-03 divergence class: preview and execute disagreeing about the same dispatch.
//
// So the planner DECLARES the uncertainty instead (`ENGINE_NOT_AVAILABLE`, naming both
// branches of the handler's own conditional) rather than resolving it by guesswork. Wiring
// this seam correctly means threading the handler's OWN store instance to the composition
// root, which is a registry change outside this family's scope. NAMED, not silently absorbed.

import { wallOccupancyStore, resolveJunctionsWithRecords } from '@pryzm/geometry-wall';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { WallBatchCreateConsequencePlanner } from './WallBatchCreateConsequencePlanner.js';

/**
 * Build the production `wall.batch.create` planner, wired to the pure junction resolver (the
 * before/after solve, run ONCE PER LEVEL over the WHOLE candidate set), the opening-refit
 * seed, and the constraint (violation) engine. All three are read-only from the planner's
 * view.
 */
export function createWallBatchCreateConsequencePlanner(): WallBatchCreateConsequencePlanner {
  return new WallBatchCreateConsequencePlanner({
    resolveJunctions: resolveJunctionsWithRecords,
    occupancy: wallOccupancyStore,
    validator: constraintEngine,
  });
}
