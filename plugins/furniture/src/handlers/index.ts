// Furniture handler registration helper (S27 / ADR-0027).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateFurnitureHandler } from './CreateFurniture.js';
import { DeleteFurnitureHandler } from './DeleteFurniture.js';
import { MoveFurnitureHandler } from './MoveFurniture.js';
import { RotateFurnitureHandler } from './RotateFurniture.js';
import { SetFurnitureScaleHandler } from './SetFurnitureScale.js';
import { SetActiveLodHandler } from './SetActiveLod.js';
import { SetFurnitureRepresentationHandler } from './SetFurnitureRepresentation.js';
import { UpdateFurnitureParametersHandler } from './UpdateFurnitureParameters.js';

export const FURNITURE_HANDLER_TYPES = [
  'furniture.create',
  'furniture.delete',
  'furniture.move',
  'furniture.rotate',
  'furniture.setScale',
  'furniture.setActiveLod',
  'furniture.setRepresentation',
  'furniture.updateParameters',
] as const;

export type FurnitureHandlerType = (typeof FURNITURE_HANDLER_TYPES)[number];

export function buildFurnitureHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateFurnitureHandler() as unknown as CommandHandler<unknown>,
    new DeleteFurnitureHandler() as unknown as CommandHandler<unknown>,
    new MoveFurnitureHandler() as unknown as CommandHandler<unknown>,
    new RotateFurnitureHandler() as unknown as CommandHandler<unknown>,
    new SetFurnitureScaleHandler() as unknown as CommandHandler<unknown>,
    new SetActiveLodHandler() as unknown as CommandHandler<unknown>,
    new SetFurnitureRepresentationHandler() as unknown as CommandHandler<unknown>,
    UpdateFurnitureParametersHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerFurnitureHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildFurnitureHandlerSet()) bus.register(h);
  return FURNITURE_HANDLER_TYPES;
}

export { CreateFurnitureHandler, type CreateFurniturePayload } from './CreateFurniture.js';
export { DeleteFurnitureHandler, type DeleteFurniturePayload } from './DeleteFurniture.js';
export { MoveFurnitureHandler, type MoveFurniturePayload } from './MoveFurniture.js';
export { RotateFurnitureHandler, type RotateFurniturePayload } from './RotateFurniture.js';
export { SetFurnitureScaleHandler, type SetFurnitureScalePayload } from './SetFurnitureScale.js';
export { SetActiveLodHandler, type SetActiveLodPayload } from './SetActiveLod.js';
export {
  SetFurnitureRepresentationHandler,
  type SetFurnitureRepresentationPayload,
} from './SetFurnitureRepresentation.js';
export { UpdateFurnitureParametersHandler, type UpdateFurnitureParametersPayload } from './UpdateFurnitureParameters.js';
