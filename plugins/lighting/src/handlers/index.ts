// Lighting handler registration (S26 / ADR-0023).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateLightingHandler } from './CreateLighting.js';
import { DeleteLightingHandler } from './DeleteLighting.js';
import { MoveLightingHandler } from './MoveLighting.js';
import { SetLightingIntensityHandler } from './SetLightingIntensity.js';
import { SetLightingEmergencyHandler } from './SetLightingEmergency.js';
import { SetLightingMaterialHandler } from './SetLightingMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangeLightingLevelHandler } from './ChangeLightingLevel.js';

export const LIGHTING_HANDLER_TYPES = [
  'lighting.create',
  'lighting.delete',
  'lighting.move',
  'lighting.setIntensity',
  'lighting.setEmergency',
  'lighting.setMaterial',
  // §L-1032 — move a lighting fixture between storeys (founder-requested). The
  // legacy `LightingStore.changeLevel` MUST exist before this verb does: without
  // it Ctrl+Z falls through to the generic `update()`, which for this store
  // reaches only the legacy DOM bus and never dirties either storey's plan view.
  // That store method also owns the HOSTED-fixture refusal — see its doc comment.
  'lighting.changeLevel',
] as const;

export type LightingHandlerType = (typeof LIGHTING_HANDLER_TYPES)[number];

export function buildLightingHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateLightingHandler() as unknown as CommandHandler<unknown>,
    new DeleteLightingHandler() as unknown as CommandHandler<unknown>,
    new MoveLightingHandler() as unknown as CommandHandler<unknown>,
    new SetLightingIntensityHandler() as unknown as CommandHandler<unknown>,
    new SetLightingEmergencyHandler() as unknown as CommandHandler<unknown>,
    new SetLightingMaterialHandler() as unknown as CommandHandler<unknown>,
    new ChangeLightingLevelHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerLightingHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildLightingHandlerSet()) bus.register(h);
  return LIGHTING_HANDLER_TYPES;
}

export { CreateLightingHandler, type CreateLightingPayload } from './CreateLighting.js';
export { DeleteLightingHandler, type DeleteLightingPayload } from './DeleteLighting.js';
export { MoveLightingHandler, type MoveLightingPayload } from './MoveLighting.js';
export { SetLightingIntensityHandler, type SetLightingIntensityPayload } from './SetLightingIntensity.js';
export { SetLightingEmergencyHandler, type SetLightingEmergencyPayload } from './SetLightingEmergency.js';
export { SetLightingMaterialHandler, type SetLightingMaterialPayload } from './SetLightingMaterial.js';
export { ChangeLightingLevelHandler, type ChangeLightingLevelPayload } from './ChangeLightingLevel.js';
