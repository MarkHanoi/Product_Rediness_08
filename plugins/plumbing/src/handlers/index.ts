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
// §BATH102 — the C109 compound's two verbs. See `BATHROOM_POD_HANDLER_TYPES` below
// for why they are declared as their OWN named set and then SPREAD into the plumbing
// set rather than being listed twice.
import { CreateBathroomPodHandler } from './CreateBathroomPod.js';
import { DeleteBathroomPodHandler } from './DeleteBathroomPod.js';

// ── §BATH102 — the C109 bathroom-pod compound ────────────────────────────────
//
// ⛔ THERE IS NO `bathroomPodMember.*` VERB AND NONE MAY BE MINTED (C109 R-1). A
// member is a `plumbing` fixture and is edited by the `plumbing.*` verbs that already
// exist; a second write path to a member would be a way to produce half a pod.
//
// ⭐ WHY THESE TWO ARE REGISTERED BY THE **PLUMBING** DESCRIPTOR WHILE THEIR STORE IS
// CONTRIBUTED BY A **SEPARATE** ONE, AND WHY THAT IS NOT A SPLIT-BRAIN.
// A `PluginDescriptor` carries exactly ONE `storeKey` (`bootstrap.everything.ts`:
// `stores[plugin.storeKey] = store`), so the `bathroomPod` store needs a descriptor of
// its own. Handlers, by contrast, are pooled: `storesAsRecordView(stores)` is built
// from EVERY descriptor's store, which is how `CreateLiftHandler` — registered by the
// `lift` descriptor — resolves `wall`, `curtainwall`, `door` and `slab` from four
// other descriptors. So a `bathroomPod.*` handler registered here resolves
// `ctx.stores.bathroomPod` perfectly well, and the alternative (a second descriptor
// carrying the handlers) would need a `plugins/bathroom-pod/` DIRECTORY that does not
// exist — arm D of `check-plugin-census-equivalence.ts` is hard-0 on
// *"REGISTRY \ DISK — booted with no directory"*, and C109 §0 governs the store and
// its handlers as living in `plugins/plumbing/`.
export const BATHROOM_POD_HANDLER_TYPES = [
  'bathroomPod.create',
  'bathroomPod.delete',
] as const;

export type BathroomPodHandlerType = (typeof BATHROOM_POD_HANDLER_TYPES)[number];

/** The pod's own two handlers, as a named set — spread into the plumbing set below. */
export function buildBathroomPodHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateBathroomPodHandler() as unknown as CommandHandler<unknown>,
    new DeleteBathroomPodHandler() as unknown as CommandHandler<unknown>,
  ];
}

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
  // §BATH102 — SPREAD, never re-typed. `registerPlumbingHandlers` returns this list
  // as its statement of what it registered; a hand-copied pair here could go stale
  // against `buildBathroomPodHandlerSet()` and the caller would be told a verb was
  // registered that was not (or the reverse).
  ...BATHROOM_POD_HANDLER_TYPES,
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
    // §BATH102 — the pod's two verbs, from the ONE set that declares them.
    ...buildBathroomPodHandlerSet(),
  ];
}

export function registerPlumbingHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildPlumbingHandlerSet()) bus.register(h);
  return PLUMBING_HANDLER_TYPES;
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
