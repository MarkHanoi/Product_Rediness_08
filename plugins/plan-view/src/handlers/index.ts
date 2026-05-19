/**
 * plan-view handler set (Wave 11 recipe completion).
 *
 * Bridges the existing plan-view interaction modules (drag.ts, selection.ts)
 * to the commandBus handler pattern so plan-view can be registered
 * as a compliant L7 plugin.
 *
 * Spec: PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 G9/G10.
 * Recipe status: [S H . . .] — store (LevelStore) + handlers now present.
 */

import type { CommandBus } from '@pryzm/plugin-sdk';
import { PLAN_VIEW_COMMANDS } from '../intent.js';

export type { PlanViewCommandId } from '../intent.js';
export { PLAN_VIEW_COMMANDS };

/** Dependencies the plan-view handler set needs from its host. */
export interface PlanViewHandlerDeps {
  /** Provides access to the levelStore for activation commands. */
  readonly levelStore?: {
    setActive(id: string): void;
    getActiveLevel(): { id: string } | undefined;
  };
}

export const PLAN_VIEW_HANDLER_TYPES = [
  PLAN_VIEW_COMMANDS.LEVEL_ACTIVATE,
  PLAN_VIEW_COMMANDS.ELEMENT_SELECT,
  PLAN_VIEW_COMMANDS.SELECTION_CLEAR,
  PLAN_VIEW_COMMANDS.ELEMENT_MOVE,
] as const;

export type PlanViewHandlerType = typeof PLAN_VIEW_HANDLER_TYPES[number];

/**
 * Register plan-view commandBus handlers.
 * Called at plugin bootstrap time by apps/editor.
 *
 * Note: G9 (selection) and G10 (drag-move) are handled by
 * `plan-view/src/selection.ts` and `plan-view/src/drag.ts` respectively —
 * those modules operate on canvas events and dispatch these same command ids.
 * The handlers below are the RECEIVING end that mutates LevelStore state.
 */
export function registerPlanViewHandlers(
  bus: CommandBus,
  deps: PlanViewHandlerDeps = {},
): void {
  const { levelStore } = deps;

  bus.register(PLAN_VIEW_COMMANDS.LEVEL_ACTIVATE, async (cmd) => {
    const payload = cmd.payload as { levelId: string };
    if (levelStore && payload?.levelId) {
      levelStore.setActive(payload.levelId);
    }
  });

  bus.register(PLAN_VIEW_COMMANDS.ELEMENT_SELECT, async (_cmd) => {
    // Selection state is managed by @pryzm/stores SelectionStore.
    // This handler is a no-op at the plan-view layer; the host wires
    // the selection.ts module directly to SelectionStore.
  });

  bus.register(PLAN_VIEW_COMMANDS.SELECTION_CLEAR, async (_cmd) => {
    // See ELEMENT_SELECT note above.
  });

  bus.register(PLAN_VIEW_COMMANDS.ELEMENT_MOVE, async (_cmd) => {
    // Forwarded to the element's own plugin handler (e.g. wall.move).
    // plan-view/drag.ts re-dispatches the canonical element move command.
  });
}
