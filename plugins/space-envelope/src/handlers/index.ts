// Space-envelope handler registration.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §4 / §6 · C67 / C68.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { CreateSpaceEnvelopeBatchHandler } from './CreateSpaceEnvelopeBatch.js';
import {
    DeleteSpaceEnvelopeHandler,
    MoveSpaceEnvelopeHandler,
    MoveSpaceEnvelopeFaceHandler,
    SetSpaceEnvelopeFootprintHandler,
    SetSpaceEnvelopeParameterHandler,
    SetSpaceEnvelopeWithinHandler,
} from './MutateSpaceEnvelope.js';

/**
 * The verb roster, exactly as C114 §6 declares it.
 *
 * ⭐ THERE IS NO `spaceEnvelope.create`. The batch verb is the create path even for
 * ONE envelope (C114 §6a), so no caller can reach for the wrong one and ship N undo
 * entries for one gesture.
 *
 * ⛔ `spaceEnvelope.changeLevel` and `spaceEnvelope.promoteToRoom` are NOT here.
 * `promoteToRoom` is DEFERRED to Stage H by C114 §6 — it is C80's "may this pass
 * replace this?" question and needs that ruling first. `changeLevel` is declared in
 * §6 and simply not yet built; it is listed in the lane report as owed rather than
 * quietly dropped.
 */
export const SPACE_ENVELOPE_HANDLER_TYPES = [
    'spaceEnvelope.batch.create',
    'spaceEnvelope.delete',
    'spaceEnvelope.move',
    'spaceEnvelope.moveFace',
    'spaceEnvelope.setFootprint',
    'spaceEnvelope.setParameter',
    'spaceEnvelope.setWithin',
] as const;

export type SpaceEnvelopeHandlerType = (typeof SPACE_ENVELOPE_HANDLER_TYPES)[number];

/** The set the composition root consumes. This is the authoritative path. */
export function buildSpaceEnvelopeHandlerSet(): readonly CommandHandler<unknown>[] {
    return [
        new CreateSpaceEnvelopeBatchHandler() as unknown as CommandHandler<unknown>,
        new DeleteSpaceEnvelopeHandler() as unknown as CommandHandler<unknown>,
        new MoveSpaceEnvelopeHandler() as unknown as CommandHandler<unknown>,
        new MoveSpaceEnvelopeFaceHandler() as unknown as CommandHandler<unknown>,
        new SetSpaceEnvelopeFootprintHandler() as unknown as CommandHandler<unknown>,
        new SetSpaceEnvelopeParameterHandler() as unknown as CommandHandler<unknown>,
        new SetSpaceEnvelopeWithinHandler() as unknown as CommandHandler<unknown>,
    ];
}

/** The imperative legacy door. Idempotent against the §OI-053 skip-if-present proxy. */
export function registerSpaceEnvelopeHandlers(bus: CommandBus): readonly string[] {
    return withHandlerSpan('pryzm.spaceEnvelope.registerHandlers', {
        'pryzm.plugin': 'space-envelope',
    }, (span) => {
        const set = buildSpaceEnvelopeHandlerSet();
        for (const h of set) bus.register(h);
        span.setAttribute('pryzm.plugin.handlers', set.length);
        span.setAttribute('pryzm.plugin.verbs', SPACE_ENVELOPE_HANDLER_TYPES.length);
        return SPACE_ENVELOPE_HANDLER_TYPES;
    });
}

export { CreateSpaceEnvelopeBatchHandler } from './CreateSpaceEnvelopeBatch.js';
export type {
    CreateSpaceEnvelopeBatchPayload,
    CreateSpaceEnvelopeSpec,
} from './CreateSpaceEnvelopeBatch.js';
export {
    DeleteSpaceEnvelopeHandler,
    MoveSpaceEnvelopeHandler,
    MoveSpaceEnvelopeFaceHandler,
    SetSpaceEnvelopeFootprintHandler,
    SetSpaceEnvelopeParameterHandler,
    SetSpaceEnvelopeWithinHandler,
} from './MutateSpaceEnvelope.js';
export type {
    DeleteSpaceEnvelopePayload,
    MoveSpaceEnvelopePayload,
    MoveSpaceEnvelopeFacePayload,
    SetSpaceEnvelopeFootprintPayload,
    SetSpaceEnvelopeParameterPayload,
    SetSpaceEnvelopeWithinPayload,
} from './MutateSpaceEnvelope.js';
