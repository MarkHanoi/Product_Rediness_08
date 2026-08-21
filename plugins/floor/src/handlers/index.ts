// Floor handler registration (§P3.2-FL).
//
// Only CreateFloorHandler ships at §P3.2-FL.  Update/delete handlers
// follow in later F.x sub-phases when the Immer floor store is the
// primary authority (after FloorFragmentBuilder is migrated).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateFloorHandler } from './CreateFloor.js';
import { UpdateFloorLayersHandler } from './UpdateFloorLayers.js';
import { SetFloorMaterialHandler } from './SetFloorMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangeFloorLevelHandler } from './ChangeFloorLevel.js';
// §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the LIVE floor-finish route. A NEW verb
// beside the dead `floor.setMaterial`, never an overload of it: that one refuses
// by declaration (§FIX-DEAD-VERB-REFUSE) and the chat's refusal copy cites it.
import { SetFloorFinishBatchHandler } from './SetFloorFinishBatch.js';

export const FLOOR_HANDLER_TYPES = [
  'floor.create',
  'floor.updateLayers',
  'floor.setMaterial',
  // §L-1032 — move a floor finish between storeys (founder-requested). The legacy
  // `FloorStore.changeLevel` MUST exist before this verb does: `FloorStore.update`
  // warns and DELETES a `levelId` key (`FloorStore.ts:141-144`), so without the
  // dedicated method both the forward mirror and the §L-946 undo arm would report
  // success over a floor that never moved.
  'floor.changeLevel',
  // §FEAT-FLOOR-SURFACE-FINISH (L-1881) — bridges to SetFloorFinishBatchCommand,
  // which drives the GEOMETRY FloorStore the builders read (never the detached
  // plugin DTO store `floor.setMaterial` writes).
  'floor.setFinishBatch',
] as const;

export type FloorHandlerType = (typeof FLOOR_HANDLER_TYPES)[number];

export function buildFloorHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateFloorHandler() as unknown as CommandHandler<unknown>,
    UpdateFloorLayersHandler as unknown as CommandHandler<unknown>,
    SetFloorMaterialHandler as unknown as CommandHandler<unknown>,
    new ChangeFloorLevelHandler() as unknown as CommandHandler<unknown>,
    SetFloorFinishBatchHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerFloorHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildFloorHandlerSet()) bus.register(h);
  return FLOOR_HANDLER_TYPES;
}

export { CreateFloorHandler, type CreateFloorPayload } from './CreateFloor.js';
export { UpdateFloorLayersHandler, type UpdateFloorLayersPayload } from './UpdateFloorLayers.js';
export { SetFloorMaterialHandler, type SetFloorMaterialPayload } from './SetFloorMaterial.js';
export { ChangeFloorLevelHandler, type ChangeFloorLevelPayload } from './ChangeFloorLevel.js';
export {
  SetFloorFinishBatchHandler,
  FLOOR_FINISH_BATCH_REPORT_EVENT,
  type SetFloorFinishBatchPayload,
  type FloorFinishBatchReport,
} from './SetFloorFinishBatch.js';
