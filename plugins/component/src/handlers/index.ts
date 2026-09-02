// Placed-component handler registration — §COMPONENT-PLACE (audit §12 Phase 4C).
//
// Mirrors `plugins/balcony/src/handlers/index.ts`, which mirrors the pool's. The
// sentence that file opens with is the reason this one exists in the same shape:
// **a handler set that nothing registers is a handler set that does not exist**
// (§FIX-POOL-UNREACHABLE, L-5200 — `pool.create` was registered and undispatchable
// for weeks because the `apps/editor/src/PluginRegistry.ts` descriptor was missing).
//
// ⭐ AND THAT FAILURE MODE IS THE PROGRAMME'S OWN HEADLINE GAP ONE LEVEL DOWN. The
// audit's R14 — *"trusting a test's name"* — records `tests/family-load-into-project/`
// touching no project, no store, no element and no bus, and C107 §0.1 records
// fifteen built-but-unreachable surfaces found in ONE session. A component family
// that registered three verbs nothing could dispatch would be the sixteenth.
// `apps/editor/__tests__/componentJoinThroughComposedRuntime.test.ts` is the arm
// that makes that unrepeatable: it boots the REAL composition root and never
// constructs a store, so deleting the descriptor fails it.
//
// P8 / C10 §2 — `withHandlerSpan` from `@pryzm/plugin-sdk`, the same wrapper the
// Zone-A handler files use; ADR-002 §2 forbids a direct `@opentelemetry/api` import
// at L7 and C84 EI-9 forbids a second wrapper.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { PlaceComponentHandler } from './PlaceComponent.js';
import { SwapComponentTypeHandler } from './SwapComponentType.js';
import { SetComponentInstanceParameterHandler } from './SetComponentInstanceParameter.js';

/**
 * ⚠ THE WIRE IDENTIFIERS, AND THEY ARE PERMANENT (C69 §1.1). A verb is written into
 * `project_command_log`, appears in replayed collaboration history and is the key a
 * remote dispatcher resolves — renaming one is a persistence-breaking change
 * governed by C47, not by ordinary refactoring.
 *
 * ⭐ THE NAMESPACE IS `component.*`, NEVER `family.*` — C84 §6.2e, which inherits
 * C69 §3.6, and ADR-0376 **D5**: `Component` is the one canonical vocabulary and no
 * NEW symbol may use `Family`. The `.pryzm-family` extension and the `@pryzm/
 * family-*` package names are FROZEN legacy spellings; a new verb is neither.
 */
export const COMPONENT_HANDLER_TYPES = [
  'component.place',
  'component.swapType',
  'component.setInstanceParameter',
] as const;

export type ComponentHandlerType = (typeof COMPONENT_HANDLER_TYPES)[number];

export function buildComponentHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new PlaceComponentHandler() as unknown as CommandHandler<unknown>,
    new SwapComponentTypeHandler() as unknown as CommandHandler<unknown>,
    new SetComponentInstanceParameterHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerComponentHandlers(bus: CommandBus): readonly string[] {
  return withHandlerSpan('pryzm.component.registerHandlers', {
    'pryzm.plugin': 'component',
  }, (span) => {
    const set = buildComponentHandlerSet();
    for (const h of set) bus.register(h);
    // Both numbers, deliberately — the balcony barrel's reasoning, kept: `handlers`
    // is what was registered and `verbs` is what this barrel CLAIMS is dispatchable.
    // When they disagree the CLAIM is the thing that is wrong, and a trace carrying
    // only one of them cannot say so.
    span.setAttribute('pryzm.plugin.handlers', set.length);
    span.setAttribute('pryzm.plugin.verbs', COMPONENT_HANDLER_TYPES.length);
    return COMPONENT_HANDLER_TYPES;
  });
}

export { PlaceComponentHandler, type PlaceComponentPayload } from './PlaceComponent.js';
export { SwapComponentTypeHandler, type SwapComponentTypePayload } from './SwapComponentType.js';
export {
  SetComponentInstanceParameterHandler,
  type SetComponentInstanceParameterPayload,
} from './SetComponentInstanceParameter.js';
