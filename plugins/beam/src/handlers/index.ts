// Beam handler registration (S12-T3).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateBeamHandler } from './CreateBeam.js';
import { CreateBeamBatchHandler } from './CreateBeamBatch.js';
import { DeleteBeamHandler } from './DeleteBeam.js';
import { MoveBeamHandler } from './MoveBeam.js';
import { SetBeamTypeHandler } from './SetBeamType.js';
import { SetBeamSectionHandler } from './SetBeamSection.js';

export const BEAM_HANDLER_TYPES = [
  'beam.create',
  'beam.batch.create',
  'beam.delete',
  'beam.move',
  'beam.setType',
  'beam.setSection',
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
