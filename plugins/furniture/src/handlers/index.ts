// Furniture handler registration helper (S27 / ADR-0027).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateFurnitureHandler } from './CreateFurniture.js';
import { CreateFurnitureBatchHandler } from './CreateFurnitureBatch.js';
import { DeleteFurnitureHandler } from './DeleteFurniture.js';
import { MoveFurnitureHandler } from './MoveFurniture.js';
import { RotateFurnitureHandler } from './RotateFurniture.js';
import { SetFurnitureScaleHandler } from './SetFurnitureScale.js';
import { SetActiveLodHandler } from './SetActiveLod.js';
import { SetFurnitureRepresentationHandler } from './SetFurnitureRepresentation.js';
import { UpdateFurnitureParametersHandler } from './UpdateFurnitureParameters.js';
import { SetFurnitureMaterialHandler } from './SetFurnitureMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangeFurnitureLevelHandler } from './ChangeFurnitureLevel.js';

export const FURNITURE_HANDLER_TYPES = [
  'furniture.create',
  'furniture.batch.create',
  'furniture.delete',
  'furniture.move',
  'furniture.rotate',
  'furniture.setScale',
  'furniture.setActiveLod',
  'furniture.setRepresentation',
  'furniture.updateParameters',
  'furniture.setMaterial',
  // §L-1032 — move a furniture item between storeys (founder-requested). The
  // legacy `FurnitureStore.changeLevel` MUST exist before this verb does:
  // without it Ctrl+Z falls through to the whole-record-REPLACE `update()` and
  // destroys the record.
  'furniture.changeLevel',
] as const;

export type FurnitureHandlerType = (typeof FURNITURE_HANDLER_TYPES)[number];

export function buildFurnitureHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateFurnitureHandler() as unknown as CommandHandler<unknown>,
    new CreateFurnitureBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteFurnitureHandler() as unknown as CommandHandler<unknown>,
    new MoveFurnitureHandler() as unknown as CommandHandler<unknown>,
    new RotateFurnitureHandler() as unknown as CommandHandler<unknown>,
    new SetFurnitureScaleHandler() as unknown as CommandHandler<unknown>,
    new SetActiveLodHandler() as unknown as CommandHandler<unknown>,
    new SetFurnitureRepresentationHandler() as unknown as CommandHandler<unknown>,
    UpdateFurnitureParametersHandler as unknown as CommandHandler<unknown>,
    new SetFurnitureMaterialHandler() as unknown as CommandHandler<unknown>,
    new ChangeFurnitureLevelHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerFurnitureHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildFurnitureHandlerSet()) bus.register(h);
  return FURNITURE_HANDLER_TYPES;
}

export { CreateFurnitureHandler, type CreateFurniturePayload } from './CreateFurniture.js';
export {
  CreateFurnitureBatchHandler,
  type CreateFurnitureBatchPayload,
  type CreateFurnitureBatchEntry,
} from './CreateFurnitureBatch.js';
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
export { SetFurnitureMaterialHandler, type SetFurnitureMaterialPayload } from './SetFurnitureMaterial.js';
export { ChangeFurnitureLevelHandler, type ChangeFurnitureLevelPayload } from './ChangeFurnitureLevel.js';
