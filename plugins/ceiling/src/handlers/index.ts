// Ceiling handler registration helper (S14-T8).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateCeilingHandler } from './CreateCeiling.js';
import { CreateCeilingBatchHandler } from './CreateCeilingBatch.js';
import { DeleteCeilingHandler } from './DeleteCeiling.js';
import { SetCeilingBoundaryHandler } from './SetCeilingBoundary.js';
import { SetCeilingHeightHandler } from './SetCeilingHeight.js';
import { UpdateCeilingHandler } from './UpdateCeiling.js';
import { UpdateCeilingLayersHandler } from './UpdateCeilingLayers.js';

export const CEILING_HANDLER_TYPES = [
  'ceiling.create',
  'ceiling.batch.create',
  'ceiling.delete',
  'ceiling.setBoundary',
  'ceiling.setHeight',
  'ceiling.update',
  'ceiling.updateLayers',
] as const;

export type CeilingHandlerType = (typeof CEILING_HANDLER_TYPES)[number];

export function buildCeilingHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateCeilingHandler() as unknown as CommandHandler<unknown>,
    new CreateCeilingBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteCeilingHandler() as unknown as CommandHandler<unknown>,
    new SetCeilingBoundaryHandler() as unknown as CommandHandler<unknown>,
    new SetCeilingHeightHandler() as unknown as CommandHandler<unknown>,
    UpdateCeilingHandler as unknown as CommandHandler<unknown>,
    UpdateCeilingLayersHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerCeilingHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildCeilingHandlerSet()) bus.register(h);
  return CEILING_HANDLER_TYPES;
}

export { CreateCeilingHandler, type CreateCeilingPayload } from './CreateCeiling.js';
export { CreateCeilingBatchHandler, type CreateCeilingBatchPayload } from './CreateCeilingBatch.js';
export { DeleteCeilingHandler, type DeleteCeilingPayload } from './DeleteCeiling.js';
export { SetCeilingBoundaryHandler, type SetCeilingBoundaryPayload } from './SetCeilingBoundary.js';
export { SetCeilingHeightHandler, type SetCeilingHeightPayload } from './SetCeilingHeight.js';
export { UpdateCeilingHandler, type UpdateCeilingPayload } from './UpdateCeiling.js';
export { UpdateCeilingLayersHandler, type UpdateCeilingLayersPayload } from './UpdateCeilingLayers.js';
