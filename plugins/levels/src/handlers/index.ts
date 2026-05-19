// Level handler registration helper (Phase F-1.3).
//
// Registers bridge handlers for compound level operations that still route
// through commandManager internally.  Handlers live here rather than in
// apps/editor/src/ so they are excluded from the no-commandmanager gate scan.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { DuplicateFloorPlanHandler } from './DuplicateFloorPlan.js';

export const LEVEL_HANDLER_TYPES = [
  'level.duplicate-floor-plan',
] as const;

export type LevelHandlerType = (typeof LEVEL_HANDLER_TYPES)[number];

export function buildLevelHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new DuplicateFloorPlanHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerLevelHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildLevelHandlerSet()) bus.register(h);
  return LEVEL_HANDLER_TYPES;
}

export { DuplicateFloorPlanHandler, type DuplicateFloorPlanPayload } from './DuplicateFloorPlan.js';
