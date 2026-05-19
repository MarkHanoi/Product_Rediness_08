// @pryzm/plugin-floor — floor finish element plugin (§P3.2-FL).
//
// Promotion from empty F-prereq.0 scaffold to a typed handler package.
// CreateFloorHandler registers under command type 'floor.create' and stores
// floor entities in an Immer `floor` store slice.  The initTools.ts §P3.2-FL
// bridge mirrors to the legacy FloorStore for FloorFragmentBuilder mesh rendering.

export const PLUGIN_ID = 'floor' as const;
export const PLUGIN_NAME = '@pryzm/plugin-floor' as const;

export type { FloorsState, FloorId } from './store.js';
export { INITIAL_FLOORS_STATE, FloorStore } from './store.js';

export {
  FLOOR_HANDLER_TYPES,
  buildFloorHandlerSet,
  registerFloorHandlers,
  type FloorHandlerType,
} from './handlers/index.js';

export { CreateFloorHandler, type CreateFloorPayload } from './handlers/CreateFloor.js';
