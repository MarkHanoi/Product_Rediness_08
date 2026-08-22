// Lift handler registration — §FEAT-LIFT-COMPOUND-SYSTEM (L-5700).
//
// Mirrors `plugins/pool/src/handlers/index.ts`. Contributed to the composed runtime
// by the `lift` descriptor in `apps/editor/src/PluginRegistry.ts` — which is the
// ONLY thing that makes these dispatchable (axis 2 of the four-axis reachability
// check; see the descriptor's comment for what happens without it).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
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
    for (const h of buildLiftHandlerSet()) bus.register(h);
    return LIFT_HANDLER_TYPES;
}

export { CreateLiftHandler, DEFAULT_LIFT_TYPE_ID, type CreateLiftPayload } from './CreateLift.js';
export { DeleteLiftHandler, type DeleteLiftPayload } from './DeleteLift.js';
