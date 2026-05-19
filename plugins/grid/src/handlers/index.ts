// Grid handler registration (S12-T4).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateGridHandler } from './CreateGrid.js';
import { DeleteGridHandler } from './DeleteGrid.js';
import { SetGridSpacingHandler } from './SetGridSpacing.js';
import { SetGridExtentHandler } from './SetGridExtent.js';

export const GRID_HANDLER_TYPES = [
  'grid.create',
  'grid.delete',
  'grid.setSpacing',
  'grid.setExtent',
] as const;

export type GridHandlerType = (typeof GRID_HANDLER_TYPES)[number];

export function buildGridHandlerSet() {
  return [
    new CreateGridHandler() as unknown as CommandHandler<unknown>,
    new DeleteGridHandler() as unknown as CommandHandler<unknown>,
    new SetGridSpacingHandler() as unknown as CommandHandler<unknown>,
    new SetGridExtentHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerGridHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildGridHandlerSet()) bus.register(h);
  return GRID_HANDLER_TYPES;
}

export { CreateGridHandler, type CreateGridPayload } from './CreateGrid.js';
export { DeleteGridHandler, type DeleteGridPayload } from './DeleteGrid.js';
export { SetGridSpacingHandler, type SetGridSpacingPayload } from './SetGridSpacing.js';
export { SetGridExtentHandler, type SetGridExtentPayload } from './SetGridExtent.js';
