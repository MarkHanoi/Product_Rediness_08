// @pryzm/plugin-section-view — THE PLUGIN DESCRIBES ITSELF.
//
// §PLUGIN-DESCRIPTOR-AT-L5 (L-9921/L-9922, lane PLUGIN2 · ADR-0367 · C11 §6.3)
//
// ⭐ THIS FILE IS THE WHOLE POINT OF THE TYPE MOVE, IN TWELVE LINES OF CODE.
// It could not have been written before it. `PluginRegistration` used to be
// `PluginDescriptor` in `apps/editor/src/PluginRegistry.ts` — **L7** — and
// `PluginRegistry.ts:13-17` recorded per-plugin descriptor files as
// "considered and rejected" for exactly that reason. The import below is
// `plugins/section-view` (L6) → `@pryzm/plugin-sdk` (L5): **downward, through
// the facade**, so it is legal under `check-layer-boundaries.ts` and it does
// not touch the SDK-bypass ratchet.
//
// ─── The defect this registration closes (measured, not assumed) ─────────────
//
// `apps/editor/src/engine/engineLauncher.ts:711` has been calling
// `registerSectionHandlers(_bus)` on the REAL runtime bus, so all six
// `section.*` verbs were registered. No descriptor existed anywhere, so
// `ALL_PLUGINS` contributed no `section` store key, so
// `storesAsRecordView(stores)` had none — and every one of the six handlers
// declares `affectedStores = ['section']` and reads `ctx.stores.section`.
// `CommandBus.buildContext` therefore threw
//
//     section.create: required store 'section' is missing from HandlerContext.stores
//
// BEFORE any mutation. Registered and undispatchable — the tenth instance of
// the pool (L-5200) / lift (L-5700) / lighting (§LIGHTING-STORE-FIX) shape, and
// the first one found by a gate (`check-plugin-census-equivalence.ts` arm A)
// rather than by a person trying to use the feature.
//
// ⚠ `plugins/section-view/__tests__` COULD NOT HAVE CAUGHT IT and still cannot:
// a plugin's own suite supplies its own stores object to the bus, and the
// stores object is the thing that was missing. The proof lives at the
// composition root — `apps/editor/__tests__/sectionViewReachableThroughComposedRuntime.test.ts`
// reads `rt.stores.section` off the REAL `bootstrapWithEverything()` and never
// builds a store, a stores bag or a bus of its own.
//
// ─── Three invariants that must hold together, or this is decoration ─────────
//
//  1. `id` is the DIRECTORY NAME (`section-view`) — the census gate compares
//     this set against `ls plugins/`.
//  2. `storeKey` is the HANDLERS' key (`section`) — NOT the id. These differ
//     here, which is precisely the mistake §FIX-DIMENSION-STOREKEY-SINGULAR
//     (L-138) made in the other direction.
//  3. `section-view` is named in `ELEMENT_PLUGIN_IDS`, or the bootstrap suite's
//     per-plugin storeKey assertion never iterates it (census arm F).

import type { CommandHandler, PluginRegistration, Store } from '@pryzm/plugin-sdk';
import { buildSectionHandlerSet } from './handlers/index.js';
import { SectionStore } from './store.js';

/**
 * The section-view plugin's runtime registration, authored HERE rather than in
 * the L7 registry. `apps/editor/src/PluginRegistry.ts` imports this identifier
 * and places it in `ALL_PLUGINS` as a bare reference; deleting it from this
 * file fails the editor's build, not merely a lint rule.
 *
 * ⚠ `satisfies`, NOT a `: PluginRegistration` annotation — and the difference is
 * load-bearing, not stylistic. An annotation would give this constant the
 * DECLARED type, whose optional `contributions` is `readonly
 * PluginContributionLike[]`; readonly arrays are covariant, so that is not
 * assignable to the host's narrower `readonly PluginContribution[]` and the
 * whole `ALL_PLUGINS` literal would fail to compile even though this value has
 * no contributions at all. `satisfies` checks the shape and keeps the INFERRED
 * type, which simply has no such member. See `PluginRegistration`'s own
 * doc-comment: the contribution-authoring half is an ADR-0367 §6 backlog item,
 * stated as a limit rather than quietly half-done.
 */
export const sectionViewPluginRegistration = {
  id: 'section-view',
  storeKey: 'section',
  buildStore: (): Store<object> => new SectionStore() as unknown as Store<object>,
  buildHandlers: (): readonly CommandHandler<unknown>[] => buildSectionHandlerSet(),
} satisfies PluginRegistration;
