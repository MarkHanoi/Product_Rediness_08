// Dimension handler registration (S29 / ADR-0028).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateDimensionHandler } from './CreateDimension.js';
import { DeleteDimensionHandler } from './DeleteDimension.js';
import { MoveDimensionHandler } from './MoveDimension.js';
import { SetDimensionPrecisionHandler } from './SetDimensionPrecision.js';
import { SetDimensionUnitHandler } from './SetDimensionUnit.js';
import { SetDimensionTextHandler } from './SetDimensionText.js';

export const DIMENSION_HANDLER_TYPES = [
  'dimension.create',
  'dimension.delete',
  'dimension.move',
  'dimension.setPrecision',
  'dimension.setUnit',
  'dimension.setText',
] as const;

export type DimensionHandlerType = (typeof DIMENSION_HANDLER_TYPES)[number];

export function buildDimensionHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateDimensionHandler() as unknown as CommandHandler<unknown>,
    new DeleteDimensionHandler() as unknown as CommandHandler<unknown>,
    new MoveDimensionHandler() as unknown as CommandHandler<unknown>,
    new SetDimensionPrecisionHandler() as unknown as CommandHandler<unknown>,
    new SetDimensionUnitHandler() as unknown as CommandHandler<unknown>,
    new SetDimensionTextHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerDimensionHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildDimensionHandlerSet()) bus.register(h);
  return DIMENSION_HANDLER_TYPES;
}

export { CreateDimensionHandler, type CreateDimensionPayload } from './CreateDimension.js';
export { DeleteDimensionHandler, type DeleteDimensionPayload } from './DeleteDimension.js';
export { MoveDimensionHandler, type MoveDimensionPayload } from './MoveDimension.js';
export { SetDimensionPrecisionHandler, type SetDimensionPrecisionPayload } from './SetDimensionPrecision.js';
export { SetDimensionUnitHandler, type SetDimensionUnitPayload } from './SetDimensionUnit.js';
export { SetDimensionTextHandler, type SetDimensionTextPayload } from './SetDimensionText.js';
