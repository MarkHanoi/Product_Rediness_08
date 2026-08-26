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
// §BATH102 — the C109 compound. ⛔ ITS OWN HANDLER SET, ITS OWN STORE KEY, AND
// DELIBERATELY NOT IN `PLUMBING_HANDLER_TYPES`: `buildPlumbingHandlerSet()` is what
// `PluginRegistry`'s `plumbing` descriptor registers, and that descriptor contributes
// the `plumbing` store ONLY. A `bathroomPod.*` handler registered there would declare
// `affectedStores: ['bathroomPod']` against a context that has no such key, and
// `CommandBus.buildContext` would throw *"required store 'bathroomPod' is missing
// from HandlerContext.stores"* BEFORE anything mutated — the pool/lift/lighting axis-2
// defect, committed on purpose. The pod gets its OWN descriptor; see
// `buildBathroomPodHandlerSet` below.
import { CreateBathroomPodHandler } from './CreateBathroomPod.js';
import { DeleteBathroomPodHandler } from './DeleteBathroomPod.js';

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

// ── §BATH102 — the C109 bathroom-pod compound ────────────────────────────────
//
// ⭐ A SEPARATE HANDLER SET, PAIRED WITH A SEPARATE `PluginRegistry` DESCRIPTOR, so
// the `bathroomPod` store the two handlers declare is contributed by the SAME
// descriptor that registers them. Splitting a handler from the descriptor that
// contributes its store is precisely how `lighting`, `pool` and `lift` each shipped
// registered-and-undispatchable.
//
// ⛔ THERE IS NO `bathroomPodMember.*` VERB AND NONE MAY BE MINTED (C109 R-1). A
// member is a `plumbing` fixture and is edited by the `plumbing.*` verbs that already
// exist; a second write path to a member would be a way to produce half a pod.
export const BATHROOM_POD_HANDLER_TYPES = [
  'bathroomPod.create',
  'bathroomPod.delete',
] as const;

export type BathroomPodHandlerType = (typeof BATHROOM_POD_HANDLER_TYPES)[number];

export function buildBathroomPodHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateBathroomPodHandler() as unknown as CommandHandler<unknown>,
    new DeleteBathroomPodHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerBathroomPodHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildBathroomPodHandlerSet()) bus.register(h);
  return BATHROOM_POD_HANDLER_TYPES;
}

export { CreateBathroomPodHandler, type CreateBathroomPodPayload } from './CreateBathroomPod.js';
export { DeleteBathroomPodHandler, type DeleteBathroomPodPayload } from './DeleteBathroomPod.js';

export { CreatePlumbingHandler, type CreatePlumbingPayload } from './CreatePlumbing.js';
export { DeletePlumbingHandler, type DeletePlumbingPayload } from './DeletePlumbing.js';
export { MovePlumbingHandler, type MovePlumbingPayload } from './MovePlumbing.js';
export { SetPlumbingSystemHandler, type SetPlumbingSystemPayload } from './SetPlumbingSystem.js';
export { CreatePlumbingFixtureHandler, type CreatePlumbingFixturePayload } from './CreatePlumbingFixture.js';
export { SetPlumbingMaterialHandler, type SetPlumbingMaterialPayload } from './SetPlumbingMaterial.js';
export { ChangePlumbingLevelHandler, type ChangePlumbingLevelPayload } from './ChangePlumbingLevel.js';
