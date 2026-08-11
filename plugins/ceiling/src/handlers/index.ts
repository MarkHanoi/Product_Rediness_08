// Ceiling handler registration helper (S14-T8).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateCeilingHandler } from './CreateCeiling.js';
import { CreateCeilingBatchHandler } from './CreateCeilingBatch.js';
import { DeleteCeilingHandler } from './DeleteCeiling.js';
import { SetCeilingBoundaryHandler } from './SetCeilingBoundary.js';
import { SetCeilingHeightHandler } from './SetCeilingHeight.js';
// §FIX-CEILING-UPDATE-REACH-RECORD — UpdateCeilingHandler import removed with its
// registration; see the CEILING_HANDLER_TYPES note below.
import { UpdateCeilingLayersHandler } from './UpdateCeilingLayers.js';
import { SetCeilingMaterialHandler } from './SetCeilingMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
import { UpdateCeilingsSystemTypeBatchHandler } from './UpdateCeilingsSystemTypeBatch.js';

export const CEILING_HANDLER_TYPES = [
  'ceiling.create',
  'ceiling.batch.create',
  'ceiling.delete',
  'ceiling.setBoundary',
  'ceiling.setHeight',
  // §FIX-CEILING-UPDATE-REACH-RECORD (the ceiling twin of §FIX-ROOF-UPDATE-REACH-RECORD
  // / L-839, itself the twin of §FIX-DIMS-REACH-RECORD / ADR-0315 U1, L-815):
  // 'ceiling.update' LEFT this set. `UpdateCeilingHandler` `produceCommand`s against the
  // plugin DTO store — a fresh store built by PluginRegistry that no renderer, no plan
  // projector, no IFC exporter and no persistence path reads. Because plugin handlers
  // register inside `composeRuntime` (BEFORE `initBusHandlers`) and the bus is
  // first-registration-wins, it SHADOWED the same-verb legacy bridge at
  // `initBusHandlers.ts:631-636` — which runs `UpdateCeilingCommand` against the geometry
  // `ceilingStore` (`engineLauncher.ts:307`). Every ceiling move (3-D gizmo, plan Move
  // tool, Align tool), material pick and property edit reported success and reached
  // nothing. The verb is now owned by that bridge, whose `UpdateCeilingCommand` also
  // carries a real `undo()` (snapshot + `restoreSnapshot`, §R-6) and re-seats
  // ceiling-hung fixtures when the soffit moves (§FIX-SEATING-DYNAMIC-REDATUM) —
  // neither of which the DTO handler did.
  'ceiling.updateLayers',
  'ceiling.setMaterial',
  // §FEAT-CEILING-TYPE-BATCH (RAC U7.2) — batch retype ('all' or explicit ids),
  // one undo entry, bridged to the live UpdateCeilingLayersCommand route.
  'ceiling.updateSystemTypeBatch',
] as const;

export type CeilingHandlerType = (typeof CEILING_HANDLER_TYPES)[number];

export function buildCeilingHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateCeilingHandler() as unknown as CommandHandler<unknown>,
    new CreateCeilingBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteCeilingHandler() as unknown as CommandHandler<unknown>,
    new SetCeilingBoundaryHandler() as unknown as CommandHandler<unknown>,
    new SetCeilingHeightHandler() as unknown as CommandHandler<unknown>,
    // §FIX-CEILING-UPDATE-REACH-RECORD — UpdateCeilingHandler retired (see the
    // CEILING_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    UpdateCeilingLayersHandler as unknown as CommandHandler<unknown>,
    new SetCeilingMaterialHandler() as unknown as CommandHandler<unknown>,
    UpdateCeilingsSystemTypeBatchHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerCeilingHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildCeilingHandlerSet()) bus.register(h);
  return CEILING_HANDLER_TYPES;
}

export { CreateCeilingHandler, type CreateCeilingPayload } from './CreateCeiling.js';
export { CreateCeilingBatchHandler, type CreateCeilingBatchPayload } from './CreateCeilingBatch.js';
export { DeleteCeilingHandler, type DeleteCeilingPayload } from './DeleteCeiling.js';
export { SetCeilingBoundaryHandler, type SetCeilingBoundaryPayload } from './SetCeilingBoundary.js';
export { SetCeilingHeightHandler, type SetCeilingHeightPayload } from './SetCeilingHeight.js';
// §FIX-CEILING-UPDATE-REACH-RECORD — `UpdateCeiling.ts` DELETED, not merely
// unregistered, exactly as `UpdateRoof.ts` was at 2c8b4904. Nothing outside this barrel
// imported `UpdateCeilingHandler`, and `tools/ga-gate/check-verb-register.ts` classifies
// SHADOWED from DECLARING FILES rather than from registration — so its own baseline note
// records that a verb leaves the SHADOWED list ONLY by deleting one of its two
// declarations. Leaving the class exported would also leave a test bus able to register
// it manually and write the detached store again (the residue L-815 logged as NOT
// COVERED).
export { UpdateCeilingLayersHandler, type UpdateCeilingLayersPayload } from './UpdateCeilingLayers.js';
export { SetCeilingMaterialHandler, type SetCeilingMaterialPayload } from './SetCeilingMaterial.js';
