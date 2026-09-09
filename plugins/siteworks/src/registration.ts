// The plugin descriptor — §PLUGIN-DESCRIPTOR-AT-L5 (L-9921/9922, ADR-0367).
// C116 §4 · ADR-0384.
//
// ⭐ `satisfies`, NOT a type annotation. An annotation widens the literal and
// reintroduces the covariance failure `PluginRegistry.ts` documents; `satisfies`
// checks the shape while keeping the literal types.
//
// ⛔ THE `storeKey` IS THE LOAD-BEARING FIELD, and it MUST equal the string the store
// constructor passes to `super()`. A handler registered WITHOUT a matching store
// descriptor makes `CommandBus.buildContext` throw
//   "siteworks.batch.create: required store 'siteworks' is missing from
//    HandlerContext.stores"
// BEFORE anything mutates — registered and undispatchable. That trap has bitten pool
// (L-5200), lift (L-5700), lighting, section (L-9922) and bathroomPod (§BATH102), and
// it is why the reachability proof reads the store off the REAL composed runtime
// rather than off a hand-built one ([[committed-is-not-reachable]]).

import type { CommandHandler, PluginRegistration, Store } from '@pryzm/plugin-sdk';
import { SiteworksStore } from './store.js';
import { buildSiteworksHandlerSet } from './handlers/index.js';

export const siteworksPluginRegistration = {
    id: 'siteworks',
    storeKey: 'siteworks',
    buildStore: (): Store<object> => new SiteworksStore() as unknown as Store<object>,
    buildHandlers: (): readonly CommandHandler<unknown>[] => buildSiteworksHandlerSet(),
} satisfies PluginRegistration;
