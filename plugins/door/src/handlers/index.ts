// Door handler registration helper (S11-T1 + F-1.1).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateDoorHandler } from './CreateDoor.js';
import { CreateDoorBatchHandler } from './CreateDoorBatch.js';
import { DeleteDoorHandler } from './DeleteDoor.js';
import { MoveDoorHandler } from './MoveDoor.js';
import { SetDoorTypeHandler } from './SetDoorType.js';
import { SetDoorSwingHandler } from './SetDoorSwing.js';
// §FIX-DIMS-REACH-RECORD — SetDoorWidth/SetDoorHeight imports removed with their registration.
import { SetDoorFireRatingHandler } from './SetDoorFireRating.js';
import { SetDoorAccessibilityHandler } from './SetDoorAccessibility.js';
import { UpdateDoorsSystemTypeBatchHandler } from './UpdateDoorsSystemTypeBatch.js';

export const DOOR_HANDLER_TYPES = [
  'door.create',
  'door.batch.create',
  'door.delete',
  'door.move',
  'door.setType',
  'door.setSwing',
  // §FIX-DIMS-REACH-RECORD (ADR-0315 U1, L-815): 'door.setWidth' and
  // 'door.setHeight' LEFT this set — the plugin handlers wrote the DETACHED
  // plugin door store (silent no-op in production). The verbs are now owned
  // by same-name legacy bridges in initBusHandlers routing through
  // UpdateElementParameterCommand → wallStore (hosted openings).
  'door.setFireRating',
  'door.setAccessibility',
  // §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — batch retype ('all' or explicit ids),
  // one undo entry, bridged to the L-620-proven UpdateDoorSystemTypeCommand.
  'door.updateSystemTypeBatch',
] as const;

export type DoorHandlerType = (typeof DOOR_HANDLER_TYPES)[number];

/** Build the door plugin's handler set. The cast to
 *  `CommandHandler<unknown>` matches the convention used by
 *  `plugins/wall/src/handlers/index.ts` — the elements of the array
 *  have heterogeneous payload types, but the bus only needs to know
 *  the common surface. */
export function buildDoorHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateDoorHandler() as unknown as CommandHandler<unknown>,
    new CreateDoorBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteDoorHandler() as unknown as CommandHandler<unknown>,
    new MoveDoorHandler() as unknown as CommandHandler<unknown>,
    new SetDoorTypeHandler() as unknown as CommandHandler<unknown>,
    new SetDoorSwingHandler() as unknown as CommandHandler<unknown>,
    // §FIX-DIMS-REACH-RECORD — SetDoorWidthHandler / SetDoorHeightHandler
    // retired (see DOOR_HANDLER_TYPES note); initBusHandlers bridges own the verbs.
    new SetDoorFireRatingHandler() as unknown as CommandHandler<unknown>,
    new SetDoorAccessibilityHandler() as unknown as CommandHandler<unknown>,
    UpdateDoorsSystemTypeBatchHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerDoorHandlers(bus: CommandBus): readonly string[] {
  const set = buildDoorHandlerSet();
  for (const h of set) bus.register(h);
  return set.map((h) => h.type);
}

export { CreateDoorHandler, type CreateDoorPayload } from './CreateDoor.js';
export { CreateDoorBatchHandler, type CreateDoorBatchPayload } from './CreateDoorBatch.js';
export { DeleteDoorHandler, type DeleteDoorPayload } from './DeleteDoor.js';
export { MoveDoorHandler, type MoveDoorPayload } from './MoveDoor.js';
export { SetDoorTypeHandler, type SetDoorTypePayload } from './SetDoorType.js';
export { SetDoorSwingHandler, type SetDoorSwingPayload } from './SetDoorSwing.js';
export { SetDoorWidthHandler, type SetDoorWidthPayload } from './SetDoorWidth.js';
export { SetDoorHeightHandler, type SetDoorHeightPayload } from './SetDoorHeight.js';
export { SetDoorFireRatingHandler, type SetDoorFireRatingPayload } from './SetDoorFireRating.js';
export { SetDoorAccessibilityHandler, type SetDoorAccessibilityPayload } from './SetDoorAccessibility.js';
export {
  UpdateDoorsSystemTypeBatchHandler,
  DOOR_TYPE_BATCH_REPORT_EVENT,
  type UpdateDoorsSystemTypeBatchPayload,
  type DoorTypeBatchReport,
} from './UpdateDoorsSystemTypeBatch.js';
