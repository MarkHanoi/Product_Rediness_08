// Door handler registration helper (S11-T1 + F-1.1).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateDoorHandler } from './CreateDoor.js';
import { CreateDoorBatchHandler } from './CreateDoorBatch.js';
import { DeleteDoorHandler } from './DeleteDoor.js';
import { MoveDoorHandler } from './MoveDoor.js';
import { SetDoorTypeHandler } from './SetDoorType.js';
import { SetDoorSwingHandler } from './SetDoorSwing.js';
import { SetDoorWidthHandler } from './SetDoorWidth.js';
import { SetDoorHeightHandler } from './SetDoorHeight.js';
import { SetDoorFireRatingHandler } from './SetDoorFireRating.js';
import { SetDoorAccessibilityHandler } from './SetDoorAccessibility.js';

export const DOOR_HANDLER_TYPES = [
  'door.create',
  'door.batch.create',
  'door.delete',
  'door.move',
  'door.setType',
  'door.setSwing',
  'door.setWidth',
  'door.setHeight',
  'door.setFireRating',
  'door.setAccessibility',
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
    new SetDoorWidthHandler() as unknown as CommandHandler<unknown>,
    new SetDoorHeightHandler() as unknown as CommandHandler<unknown>,
    new SetDoorFireRatingHandler() as unknown as CommandHandler<unknown>,
    new SetDoorAccessibilityHandler() as unknown as CommandHandler<unknown>,
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
