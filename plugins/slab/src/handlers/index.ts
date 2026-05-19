// Slab handler registration helper (S12-T2).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateSlabHandler } from './CreateSlab.js';
import { CreateSlabBatchHandler } from './CreateSlabBatch.js';
import { DeleteSlabHandler } from './DeleteSlab.js';
import { MoveSlabHandler } from './MoveSlab.js';
import { SetSlabTypeHandler } from './SetSlabType.js';
import { AddSlabHoleHandler } from './AddSlabHole.js';
import { RemoveSlabHoleHandler } from './RemoveSlabHole.js';
import { SetSlabThicknessHandler } from './SetSlabThickness.js';
import { SetSlabBaseOffsetHandler } from './SetSlabBaseOffset.js';
import { UpdateSlabHandler } from './UpdateSlab.js';
import { UpdateSlabPolygonHandler } from './UpdateSlabPolygon.js';
import { UpdateSlabLayersHandler } from './UpdateSlabLayers.js';
import { CreateSlabsOnAllFloorsHandler } from './CreateSlabsOnAllFloors.js';

export const SLAB_HANDLER_TYPES = [
  'slab.create',
  'slab.batch.create',
  'slab.delete',
  'slab.move',
  'slab.setType',
  'slab.addHole',
  'slab.removeHole',
  'slab.setThickness',
  'slab.setBaseOffset',
  'slab.update',
  'slab.updatePolygon',
  'slab.updateLayers',
  'slab.create-on-all-floors',
] as const;

export type SlabHandlerType = (typeof SLAB_HANDLER_TYPES)[number];

export function buildSlabHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateSlabHandler() as unknown as CommandHandler<unknown>,
    new CreateSlabBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteSlabHandler() as unknown as CommandHandler<unknown>,
    new MoveSlabHandler() as unknown as CommandHandler<unknown>,
    new SetSlabTypeHandler() as unknown as CommandHandler<unknown>,
    new AddSlabHoleHandler() as unknown as CommandHandler<unknown>,
    new RemoveSlabHoleHandler() as unknown as CommandHandler<unknown>,
    new SetSlabThicknessHandler() as unknown as CommandHandler<unknown>,
    new SetSlabBaseOffsetHandler() as unknown as CommandHandler<unknown>,
    UpdateSlabHandler as unknown as CommandHandler<unknown>,
    UpdateSlabPolygonHandler as unknown as CommandHandler<unknown>,
    UpdateSlabLayersHandler as unknown as CommandHandler<unknown>,
    new CreateSlabsOnAllFloorsHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerSlabHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildSlabHandlerSet()) bus.register(h);
  return SLAB_HANDLER_TYPES;
}

export { CreateSlabHandler, type CreateSlabPayload } from './CreateSlab.js';
export { CreateSlabBatchHandler, type CreateSlabBatchPayload } from './CreateSlabBatch.js';
export { DeleteSlabHandler, type DeleteSlabPayload } from './DeleteSlab.js';
export { MoveSlabHandler, type MoveSlabPayload } from './MoveSlab.js';
export { SetSlabTypeHandler, type SetSlabTypePayload } from './SetSlabType.js';
export { AddSlabHoleHandler, type AddSlabHolePayload } from './AddSlabHole.js';
export { RemoveSlabHoleHandler, type RemoveSlabHolePayload } from './RemoveSlabHole.js';
export { SetSlabThicknessHandler, type SetSlabThicknessPayload } from './SetSlabThickness.js';
export { SetSlabBaseOffsetHandler, type SetSlabBaseOffsetPayload } from './SetSlabBaseOffset.js';
export { UpdateSlabHandler, type UpdateSlabPayload } from './UpdateSlab.js';
export { UpdateSlabPolygonHandler, type UpdateSlabPolygonPayload } from './UpdateSlabPolygon.js';
export { UpdateSlabLayersHandler, type UpdateSlabLayersPayload } from './UpdateSlabLayers.js';
export { CreateSlabsOnAllFloorsHandler, type CreateSlabsOnAllFloorsPayload } from './CreateSlabsOnAllFloors.js';
