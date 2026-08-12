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
import type { WallMoveCommand } from './WallMoveConsequencePlanner.js';
import type { ConsequencePlanner } from '@pryzm/command-bus';
import { createWallMoveConsequencePlanner } from './wallMovePlannerComposition.js';
import { ConsequencePreviewService } from './ConsequencePreviewService.js';

/**
 * Materialise the read-only `PlanningContext` from the live `storeRegistry` at the moment
 * of preview. The view is a THIN adapter over `BimStore` — `getAll`/`getById` only, no
 * write surface exposed — so the planner physically cannot mutate through it (purity is
 * structural, not a promise).
 */
function buildPlanningContext(): PlanningContext {
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
 * Build the production preview service, wired to the live `wall.move` planner and a
 * `PlanningContext` over the live stores. Registered under the CANONICAL `'wall.move'` key;
 * the service normalises the live `wall.updateBaseline` verb onto it (L-49).
 */
export function createConsequencePreviewService(): ConsequencePreviewService {
  const planners = new Map<string, ConsequencePlanner<WallMoveCommand>>();
  planners.set('wall.move', createWallMoveConsequencePlanner());
  return new ConsequencePreviewService(planners, buildPlanningContext);
}
