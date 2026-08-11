// Roof handler registration helper (S11-T3, extended W-1C-5).
//
// 8 handlers shipped at S11.  W-1C-5 adds AddSkylight, RemoveSkylight,
// and JoinRoofs now that the Roof schema carries the corresponding fields.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
// §FIX-ROOF-UPDATE-REACH-RECORD — UpdateRoofHandler import removed with its
// registration; the class is still re-exported below for barrel compatibility.
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
import { SetRoofMaterialHandler } from './SetRoofMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND

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
  // §FIX-ROOF-UPDATE-REACH-RECORD (L-839, the roof twin of §FIX-DIMS-REACH-RECORD /
  // ADR-0315 U1, L-815): 'roof.update' LEFT this set. `UpdateRoofHandler`
  // `produceCommand`s against the plugin DTO store — a fresh `new RoofStore()` built
  // by PluginRegistry that no renderer, no plan projector, no IFC exporter and no
  // persistence path reads. Because plugin handlers register inside `composeRuntime`
  // (BEFORE `initBusHandlers`) and the bus is first-registration-wins, it SHADOWED the
  // same-verb legacy bridge at `initBusHandlers.ts:597-602` — which runs
  // `UpdateRoofCommand` against the geometry `roofStore`. Every roof property change
  // (property sheet, inspector, 3-D move gizmo) reported success and reached nothing.
  // The verb is now owned by that bridge. It also validates: `thickness <= 0` /
  // `slope <= 0` / immutable `levelId` now REFUSE instead of succeeding into the void.
  'roof.setMaterial',
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
    // §FIX-ROOF-UPDATE-REACH-RECORD — UpdateRoofHandler retired (see the
    // ROOF_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    new SetRoofMaterialHandler() as unknown as CommandHandler<unknown>,
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
// §FIX-ROOF-UPDATE-REACH-RECORD (L-839) — `UpdateRoof.ts` DELETED, not merely
// unregistered. L-815 retired six sibling verbs but kept their classes exported for
// barrel compatibility, and logged the residue as "NOT covered: a test bus that
// registers them manually would still write the detached store". `roof.update` had a
// second reason to go all the way: `tools/ga-gate/check-verb-register.ts` classifies
// SHADOWED from DECLARING FILES, not from registration, so its own baseline note says
// "a verb leaves this list only by deleting one of its two declarations". Nothing
// outside this barrel imported `UpdateRoofHandler`.
export { SetRoofMaterialHandler, type SetRoofMaterialPayload } from './SetRoofMaterial.js';
