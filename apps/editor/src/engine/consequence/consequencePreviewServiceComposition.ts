// consequencePreviewServiceComposition — the COMPOSITION SITE for the R3 preview service.
//
// Kept SEPARATE from ConsequencePreviewService.ts for the same reason
// wallMovePlannerComposition.ts is separate from the planner: this file imports the real
// production singletons (`storeRegistry` from core-app-model, and — transitively via the
// wall.move planner composition — `constraintEngine`, which touches `window.*` at module
// scope). The service itself takes its collaborators by injection, so its unit tests stay
// window-free; only this file, invoked from the engine bootstrap (L7), reaches for globals.
//
// apps/editor is L7, so every import here is a DOWNWARD edge — nothing added to
// check-layer-boundaries.

import { storeRegistry } from '@pryzm/core-app-model';
import type { PlanningContext, ReadonlyStoreView, ElementId } from '@pryzm/command-bus';
import type { ConsequencePlanner } from '@pryzm/command-bus';
import { createWallMoveConsequencePlanner } from './wallMovePlannerComposition.js';
import { createWallCreateConsequencePlanner } from './wallCreatePlannerComposition.js';
import { createOpeningMoveConsequencePlanner } from './openingMovePlannerComposition.js';
import { ConsequencePreviewService } from './ConsequencePreviewService.js';

/**
 * Materialise the read-only `PlanningContext` from the live `storeRegistry` at the moment
 * of preview. The view is a THIN adapter over `BimStore` — `getAll`/`getById` only, no
 * write surface exposed — so the planner physically cannot mutate through it (purity is
 * structural, not a promise).
 */
export function buildPlanningContext(): PlanningContext {
  return {
    getStore(storeId: string): ReadonlyStoreView | undefined {
      const store = storeRegistry.getStoreForType(storeId);
      if (!store) return undefined;
      return {
        getAll: () => store.getAll() as readonly unknown[],
        getById: (id: ElementId): unknown | null => {
          if (typeof store.getById === 'function') return store.getById(id) ?? null;
          if (typeof store.get === 'function') return store.get(id) ?? null;
          return (store.getAll() as { id?: string }[]).find((i) => i?.id === id) ?? null;
        },
      };
    },
  };
}

/**
 * THE planner registry — the ONE place a consequence planner is named, shared by all three
 * composition roots (preview / execution / confirmation).
 *
 * §PLANNER-REGISTRY-GENERIC (2026-08-13). Before this, each of the three roots built its own
 * `new Map()` and set `'wall.move'` into it by hand. Three hand-built maps is how the Phase 6c
 * `wall.create` planner came to exist with ZERO callers: registering it meant remembering three
 * separate files, and the commit that authored it registered none of them. A second family
 * could not be "added" — it had to be added three times, and partial registration was silent.
 *
 * One factory makes the failure impossible: a planner registered here is registered on every
 * surface that can reason, or on none. The services themselves hard-code no verb (they take
 * both this map and the normaliser registry), so the third matrix row is an entry here plus a
 * normaliser rule — no service edit, which is what C78 §5 / U-INV-5 asks for.
 *
 * Keys are the CANONICAL SEMANTIC types. The live bus verbs that map onto them
 * (`wall.updateBaseline` → `wall.move`, L-49) are the normaliser registry's business, not
 * this map's.
 */
export function createConsequencePlanners(): ReadonlyMap<string, ConsequencePlanner<never>> {
  const planners = new Map<string, ConsequencePlanner<never>>();
  planners.set(
    'wall.move',
    createWallMoveConsequencePlanner() as unknown as ConsequencePlanner<never>,
  );
  // Phase 6c, wired 2026-08-13. The planner was authored and proven standalone (38/38) but
  // registered nowhere — the exact authored-but-unwired hazard C70 §4.2 names.
  planners.set(
    'wall.create',
    createWallCreateConsequencePlanner() as unknown as ConsequencePlanner<never>,
  );
  // THE THIRD MATRIX ROW, 2026-08-13 — and the GENERICITY TEST the §PLANNER-REGISTRY-GENERIC
  // note above predicted. Opening `opening.move` required exactly what that note said it
  // should: this ONE entry, plus normaliser rules for the two live bus verbs
  // (`door.setOffset` / `window.setOffset`, ConsequencePreviewService.ts). NO edit to
  // ConsequencePreviewService, ConsequenceExecutionService or ConfirmationFlow — the three
  // services still hard-code no verb name, and all three surfaces inherit this family by
  // consuming this factory. The centralisation is load-bearing, not nominal.
  planners.set(
    'opening.move',
    createOpeningMoveConsequencePlanner() as unknown as ConsequencePlanner<never>,
  );
  return planners;
}

/**
 * Build the production preview service, wired to the shared planner registry and a
 * `PlanningContext` over the live stores. Registered under the CANONICAL `'wall.move'` key;
 * the service normalises the live `wall.updateBaseline` verb onto it (L-49).
 */
export function createConsequencePreviewService(): ConsequencePreviewService {
  return new ConsequencePreviewService(createConsequencePlanners(), buildPlanningContext);
}
