// Beam handler registration (S12-T3).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateBeamHandler } from './CreateBeam.js';
import { CreateBeamBatchHandler } from './CreateBeamBatch.js';
import { DeleteBeamHandler } from './DeleteBeam.js';
import { MoveBeamHandler } from './MoveBeam.js';
import { SetBeamTypeHandler } from './SetBeamType.js';
import { SetBeamSectionHandler } from './SetBeamSection.js';
import { SetBeamMaterialHandler } from './SetBeamMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangeBeamLevelHandler } from './ChangeBeamLevel.js';

export const BEAM_HANDLER_TYPES = [
  'beam.create',
  'beam.batch.create',
  'beam.delete',
  'beam.move',
  'beam.setType',
  'beam.setSection',
  'beam.setMaterial',
  // §L-1032 — move a beam between storeys (founder-requested). The legacy
  // `BeamStore.changeLevel` MUST exist before this verb does: without it the
  // §L-946 arm in `elementUndoStoreAdapter` cannot route the inverse patch and
  // Ctrl+Z reverts `levelId` while leaving `parentId` on the storey the beam left.
  'beam.changeLevel',
] as const;

export type BeamHandlerType = (typeof BEAM_HANDLER_TYPES)[number];

export function buildBeamHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateBeamHandler() as unknown as CommandHandler<unknown>,
    new CreateBeamBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteBeamHandler() as unknown as CommandHandler<unknown>,
    new MoveBeamHandler() as unknown as CommandHandler<unknown>,
    new SetBeamTypeHandler() as unknown as CommandHandler<unknown>,
    new SetBeamSectionHandler() as unknown as CommandHandler<unknown>,
    new SetBeamMaterialHandler() as unknown as CommandHandler<unknown>,
    new ChangeBeamLevelHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerBeamHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildBeamHandlerSet()) bus.register(h);
  return BEAM_HANDLER_TYPES;
}

export { CreateBeamHandler, type CreateBeamPayload } from './CreateBeam.js';
export { CreateBeamBatchHandler, type CreateBeamBatchPayload } from './CreateBeamBatch.js';
export { DeleteBeamHandler, type DeleteBeamPayload } from './DeleteBeam.js';
export { MoveBeamHandler, type MoveBeamPayload } from './MoveBeam.js';
export { SetBeamTypeHandler, type SetBeamTypePayload } from './SetBeamType.js';
export { SetBeamSectionHandler, type SetBeamSectionPayload } from './SetBeamSection.js';
export { SetBeamMaterialHandler, type SetBeamMaterialPayload } from './SetBeamMaterial.js';
export { ChangeBeamLevelHandler, type ChangeBeamLevelPayload } from './ChangeBeamLevel.js';
