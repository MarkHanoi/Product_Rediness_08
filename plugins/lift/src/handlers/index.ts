// Lift handler registration — §FEAT-LIFT-COMPOUND-SYSTEM (L-5700).
//
// Mirrors `plugins/pool/src/handlers/index.ts`. Contributed to the composed runtime
// by the `lift` descriptor in `apps/editor/src/PluginRegistry.ts` — which is the
// ONLY thing that makes these dispatchable (axis 2 of the four-axis reachability
// check; see the descriptor's comment for what happens without it).

// P8 / C10 §2 — `withHandlerSpan` from `@pryzm/plugin-sdk`, the SAME wrapper the
// 275 Zone-A handler files use. ADR-002 §2 forbids a direct `@opentelemetry/api`
// import at L7, and C84 EI-9 forbids a second wrapper.
//
// The span sits on REGISTRATION because that is axis 2 of the four-axis
// reachability check the header names: without it these handlers exist and are
// undispatchable, and nothing in a trace would say so.
import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { CreateLiftHandler } from './CreateLift.js';
import { DeleteLiftHandler } from './DeleteLift.js';

export const LIFT_HANDLER_TYPES = [
    'lift.create',
    'lift.delete',
] as const;

export type LiftHandlerType = (typeof LIFT_HANDLER_TYPES)[number];

export function buildLiftHandlerSet(): readonly CommandHandler<unknown>[] {
    return [
        new CreateLiftHandler() as unknown as CommandHandler<unknown>,
        new DeleteLiftHandler() as unknown as CommandHandler<unknown>,
    ];
}

export function registerLiftHandlers(bus: CommandBus): readonly string[] {
    return withHandlerSpan('pryzm.lift.registerHandlers', {
        'pryzm.plugin': 'lift',
    }, (span) => {
        const set = buildLiftHandlerSet();
        for (const h of set) bus.register(h);
        span.setAttribute('pryzm.plugin.handlers', set.length);
        span.setAttribute('pryzm.plugin.verbs', LIFT_HANDLER_TYPES.length);
        return LIFT_HANDLER_TYPES;
    });
}

export { CreateLiftHandler, DEFAULT_LIFT_TYPE_ID, type CreateLiftPayload } from './CreateLift.js';
export { DeleteLiftHandler, type DeleteLiftPayload } from './DeleteLift.js';
