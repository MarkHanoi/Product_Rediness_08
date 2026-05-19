// Roof handler registration helper (S11-T3, extended W-1C-5).
//
// 8 handlers shipped at S11.  W-1C-5 adds AddSkylight, RemoveSkylight,
// and JoinRoofs now that the Roof schema carries the corresponding fields.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { UpdateRoofHandler } from './UpdateRoof.js';
import { CreateRoofHandler } from './CreateRoof.js';
import { DeleteRoofHandler } from './DeleteRoof.js';
import { SetRoofShapeHandler } from './SetRoofShape.js';
import { SetRoofPitchHandler } from './SetRoofPitch.js';
import { SetRoofThicknessHandler } from './SetRoofThickness.js';
import { SetRoofOverhangHandler } from './SetRoofOverhang.js';
import { MoveRoofHandler } from './MoveRoof.js';
import { ChangeRoofLevelHandler } from './ChangeRoofLevel.js';
import { AddSkylightHandler } from './AddSkylight.js';
import { RemoveSkylightHandler } from './RemoveSkylight.js';
import { JoinRoofsHandler } from './JoinRoofs.js';

export const ROOF_HANDLER_TYPES = [
  'roof.create',
  'roof.delete',
  'roof.setShape',
  'roof.setPitch',
  'roof.setThickness',
  'roof.setOverhang',
  'roof.move',
  'roof.changeLevel',
  'roof.addSkylight',
  'roof.removeSkylight',
  'roof.joinRoofs',
  'roof.update',
] as const;

export type RoofHandlerType = (typeof ROOF_HANDLER_TYPES)[number];

/** Build the roof plugin's full handler set (W-1C-5: 8 originals +
 *  AddSkylight / RemoveSkylight / JoinRoofs + F-1.3 UpdateRoof bridge).
 *  Same casting pattern as `plugins/wall/src/handlers/index.ts`. */
export function buildRoofHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateRoofHandler() as unknown as CommandHandler<unknown>,
    new DeleteRoofHandler() as unknown as CommandHandler<unknown>,
    new SetRoofShapeHandler() as unknown as CommandHandler<unknown>,
    new SetRoofPitchHandler() as unknown as CommandHandler<unknown>,
    new SetRoofThicknessHandler() as unknown as CommandHandler<unknown>,
    new SetRoofOverhangHandler() as unknown as CommandHandler<unknown>,
    new MoveRoofHandler() as unknown as CommandHandler<unknown>,
    new ChangeRoofLevelHandler() as unknown as CommandHandler<unknown>,
    new AddSkylightHandler() as unknown as CommandHandler<unknown>,
    new RemoveSkylightHandler() as unknown as CommandHandler<unknown>,
    new JoinRoofsHandler() as unknown as CommandHandler<unknown>,
    UpdateRoofHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerRoofHandlers(bus: CommandBus): readonly string[] {
  const set = buildRoofHandlerSet();
  for (const h of set) bus.register(h);
  return set.map((h) => h.type);
}

export { CreateRoofHandler, type CreateRoofPayload } from './CreateRoof.js';
export { DeleteRoofHandler, type DeleteRoofPayload } from './DeleteRoof.js';
export { SetRoofShapeHandler, type SetRoofShapePayload } from './SetRoofShape.js';
export { SetRoofPitchHandler, type SetRoofPitchPayload } from './SetRoofPitch.js';
export { SetRoofThicknessHandler, type SetRoofThicknessPayload } from './SetRoofThickness.js';
export { SetRoofOverhangHandler, type SetRoofOverhangPayload } from './SetRoofOverhang.js';
export { MoveRoofHandler, type MoveRoofPayload } from './MoveRoof.js';
export { ChangeRoofLevelHandler, type ChangeRoofLevelPayload } from './ChangeRoofLevel.js';
export { AddSkylightHandler, type AddSkylightPayload } from './AddSkylight.js';
export { RemoveSkylightHandler, type RemoveSkylightPayload } from './RemoveSkylight.js';
export { JoinRoofsHandler, type JoinRoofsPayload } from './JoinRoofs.js';
export { UpdateRoofHandler, type UpdateRoofPayload } from './UpdateRoof.js';
