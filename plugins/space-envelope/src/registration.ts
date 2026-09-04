// The plugin descriptor — §PLUGIN-DESCRIPTOR-AT-L5 (L-9921/9922, ADR-0367).
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §4.
//
// ⭐ `satisfies`, NOT a type annotation. An annotation widens the literal and
// reintroduces the covariance failure `PluginRegistry.ts` documents; `satisfies`
// checks the shape while keeping the literal types.
//
// ⛔ THE `storeKey` IS THE LOAD-BEARING FIELD. A handler registered WITHOUT a store
// descriptor makes `CommandBus.buildContext` throw
//   "spaceEnvelope.batch.create: required store 'spaceEnvelope' is missing from
//    HandlerContext.stores"
// BEFORE anything mutates — registered and undispatchable. That trap has bitten pool
// (L-5200), lift (L-5700), lighting, section (L-9922) and bathroomPod (§BATH102), and
// it is why the reachability proof must read the store off the REAL composed runtime
// rather than off a hand-built one.

import type { CommandHandler, PluginRegistration, Store } from '@pryzm/plugin-sdk';
import { SpaceEnvelopeStore } from './store.js';
import { buildSpaceEnvelopeHandlerSet } from './handlers/index.js';

export const spaceEnvelopePluginRegistration = {
    id: 'space-envelope',
    storeKey: 'spaceEnvelope',
    buildStore: (): Store<object> => new SpaceEnvelopeStore() as unknown as Store<object>,
    buildHandlers: (): readonly CommandHandler<unknown>[] => buildSpaceEnvelopeHandlerSet(),
} satisfies PluginRegistration;
