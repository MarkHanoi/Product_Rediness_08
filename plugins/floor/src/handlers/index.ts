// Floor handler registration (§P3.2-FL).
//
// Only CreateFloorHandler ships at §P3.2-FL.  Update/delete handlers
// follow in later F.x sub-phases when the Immer floor store is the
// primary authority (after FloorFragmentBuilder is migrated).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateFloorHandler } from './CreateFloor.js';
import { UpdateFloorLayersHandler } from './UpdateFloorLayers.js';

export const FLOOR_HANDLER_TYPES = [
  'floor.create',
  'floor.updateLayers',
] as const;

export type FloorHandlerType = (typeof FLOOR_HANDLER_TYPES)[number];

export function buildFloorHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateFloorHandler() as unknown as CommandHandler<unknown>,
    UpdateFloorLayersHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerFloorHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildFloorHandlerSet()) bus.register(h);
  return FLOOR_HANDLER_TYPES;
}

export { CreateFloorHandler, type CreateFloorPayload } from './CreateFloor.js';
export { UpdateFloorLayersHandler, type UpdateFloorLayersPayload } from './UpdateFloorLayers.js';
