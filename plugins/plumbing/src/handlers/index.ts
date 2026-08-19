// Plumbing handler registration (S26 / ADR-0026).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreatePlumbingHandler } from './CreatePlumbing.js';
import { DeletePlumbingHandler } from './DeletePlumbing.js';
import { MovePlumbingHandler } from './MovePlumbing.js';
import { SetPlumbingSystemHandler } from './SetPlumbingSystem.js';
import { CreatePlumbingFixtureHandler } from './CreatePlumbingFixture.js';
import { SetPlumbingMaterialHandler } from './SetPlumbingMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangePlumbingLevelHandler } from './ChangePlumbingLevel.js';

export const PLUMBING_HANDLER_TYPES = [
  'plumbing.create',
  'plumbing.delete',
  'plumbing.move',
  'plumbing.setSystem',
  'plumbing.createFixture',
  'plumbing.setMaterial',
  // §L-1032 — move a plumbing fixture between storeys (founder-requested). The
  // legacy `PlumbingStore.changeLevel` MUST exist before this verb does: without
  // it Ctrl+Z falls through to `update()`, a whole-record REPLACE with NO
  // existence check, which both destroys the record and can mint a phantom one.
  'plumbing.changeLevel',
] as const;

export type PlumbingHandlerType = (typeof PLUMBING_HANDLER_TYPES)[number];

export function buildPlumbingHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreatePlumbingHandler() as unknown as CommandHandler<unknown>,
    new DeletePlumbingHandler() as unknown as CommandHandler<unknown>,
    new MovePlumbingHandler() as unknown as CommandHandler<unknown>,
    new SetPlumbingSystemHandler() as unknown as CommandHandler<unknown>,
    CreatePlumbingFixtureHandler as unknown as CommandHandler<unknown>,
    new SetPlumbingMaterialHandler() as unknown as CommandHandler<unknown>,
    new ChangePlumbingLevelHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerPlumbingHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildPlumbingHandlerSet()) bus.register(h);
  return PLUMBING_HANDLER_TYPES;
}

export { CreatePlumbingHandler, type CreatePlumbingPayload } from './CreatePlumbing.js';
export { DeletePlumbingHandler, type DeletePlumbingPayload } from './DeletePlumbing.js';
export { MovePlumbingHandler, type MovePlumbingPayload } from './MovePlumbing.js';
export { SetPlumbingSystemHandler, type SetPlumbingSystemPayload } from './SetPlumbingSystem.js';
export { CreatePlumbingFixtureHandler, type CreatePlumbingFixturePayload } from './CreatePlumbingFixture.js';
export { SetPlumbingMaterialHandler, type SetPlumbingMaterialPayload } from './SetPlumbingMaterial.js';
export { ChangePlumbingLevelHandler, type ChangePlumbingLevelPayload } from './ChangePlumbingLevel.js';
