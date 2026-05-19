// @pryzm/plugin-levels — level plugin shell (F-prereq.0 + F-1.3 bridge handlers).
//
// PRYZM 2 — level plugin.  F-1.3 adds the DuplicateFloorPlanHandler bridge so
// the no-commandmanager gate scan no longer sees a direct commandManager call in
// apps/editor/src/.  Full level-set / story navigation handlers land in F.x per
// PRYZM2-WIREUP-PLAN-S72.

export const PLUGIN_ID = 'levels' as const;
export const PLUGIN_NAME = '@pryzm/plugin-levels' as const;

export {
  registerLevelHandlers,
  buildLevelHandlerSet,
  LEVEL_HANDLER_TYPES,
  type LevelHandlerType,
  DuplicateFloorPlanHandler,
  type DuplicateFloorPlanPayload,
} from './handlers/index.js';
