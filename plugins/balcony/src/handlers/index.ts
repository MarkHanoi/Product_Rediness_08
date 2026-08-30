// Balcony handler registration — §FEAT-BALCONY-COMPOUND (L-5600).
//
// Mirrors `plugins/pool/src/handlers/index.ts`. Registered through the
// `apps/editor/src/PluginRegistry.ts` descriptor — which is the file whose ABSENCE
// made the pool undispatchable for weeks (§FIX-POOL-UNREACHABLE, L-5200). A handler
// set that nothing registers is a handler set that does not exist.

// P8 / C10 §2 — `withHandlerSpan` from `@pryzm/plugin-sdk`, the SAME wrapper the
// 275 Zone-A handler files use. ADR-002 §2 forbids a direct `@opentelemetry/api`
// import at L7, and C84 EI-9 forbids a second wrapper, so this is the only
// spelling available here and it is the right one.
//
// The span sits on REGISTRATION because registration is where this plugin's
// verbs become dispatchable at all — the axis the header names: a handler set
// that nothing registers is a handler set that does not exist (§FIX-POOL-
// UNREACHABLE, L-5200). The trace answers "were balcony's verbs registered, and
// how many?" without anyone having to read the descriptor table.
import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { CreateBalconyHandler } from './CreateBalcony.js';
import { DeleteBalconyHandler } from './DeleteBalcony.js';
import { UpdateBalconyProfileHandler } from './UpdateBalconyProfile.js';

export const BALCONY_HANDLER_TYPES = [
  'balcony.create',
  'balcony.updateProfile',
  'balcony.delete',
] as const;

export type BalconyHandlerType = (typeof BALCONY_HANDLER_TYPES)[number];

export function buildBalconyHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateBalconyHandler() as unknown as CommandHandler<unknown>,
    new UpdateBalconyProfileHandler() as unknown as CommandHandler<unknown>,
    new DeleteBalconyHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerBalconyHandlers(bus: CommandBus): readonly string[] {
  return withHandlerSpan('pryzm.balcony.registerHandlers', {
    'pryzm.plugin': 'balcony',
  }, (span) => {
    const set = buildBalconyHandlerSet();
    for (const h of set) bus.register(h);
    // Both numbers, deliberately. `handlers` is what was registered and
    // `verbs` is what this barrel CLAIMS is now dispatchable; when they
    // disagree the claim is the thing that is wrong, and a trace carrying
    // only one of them cannot say so.
    span.setAttribute('pryzm.plugin.handlers', set.length);
    span.setAttribute('pryzm.plugin.verbs', BALCONY_HANDLER_TYPES.length);
    return BALCONY_HANDLER_TYPES;
  });
}

export { CreateBalconyHandler, type CreateBalconyPayload } from './CreateBalcony.js';
export { DeleteBalconyHandler, type DeleteBalconyPayload } from './DeleteBalcony.js';
export {
  UpdateBalconyProfileHandler,
  type UpdateBalconyProfilePayload,
} from './UpdateBalconyProfile.js';
