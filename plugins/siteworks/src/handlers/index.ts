// Siteworks handler registration. C116 §4 / §6 · ADR-0384 §4 · C67 / C68.
//
// ⛔ `registerSiteworksHandlers` IS ITSELF WRAPPED IN `withHandlerSpan`, AND THAT IS
// NOT DECORATION. `tools/ga-gate/check-otel-spans.ts` ZONE B counts uninstrumented
// files against a baseline that is a NAMED LIST OF PATHS, and its scope explicitly
// includes *"plugin `src/handlers/index.ts` registration barrels"*. Measured before
// this lane: Zone B stood at **52 of 89 against a baseline of 52 — ZERO HEADROOM**.
// An uninstrumented barrel here would read 53/52 = exit 3, and a ratchet breach is
// never absorbable via `gate-debt.json` (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836).
// `plugins/space-envelope/src/handlers/index.ts` is the precedent, copied on purpose.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { CreateSiteworksBatchHandler } from './CreateSiteworksBatch.js';
import {
    SetSiteworksWidthHandler,
    SetSiteworksThicknessHandler,
    SetSiteworksRoleHandler,
    DeleteSiteworksHandler,
} from './MutateSiteworks.js';

/**
 * The verb roster, exactly as C116 §6 declares it.
 *
 * ⭐ THERE IS NO `siteworks.create`. The batch verb is the create path even for ONE
 * surface (C116 §6a), so no caller can reach for the wrong one and spend forty undos
 * on one gesture.
 *
 * ⛔ `siteworks.move`, `.rotate`, `.setMaterial` and `.changeLevel` are NOT here, and
 * C116 §6 names them as NOT IMPLEMENTED rather than omitting the row — an omitted row
 * reads as "fine". They are owed, not dropped.
 */
export const SITEWORKS_HANDLER_TYPES = [
    'siteworks.batch.create',
    'siteworks.setWidth',
    'siteworks.setThickness',
    'siteworks.setRole',
    'siteworks.delete',
] as const;

export type SiteworksHandlerType = (typeof SITEWORKS_HANDLER_TYPES)[number];

/** The set the composition root consumes. This is the authoritative path. */
export function buildSiteworksHandlerSet(): readonly CommandHandler<unknown>[] {
    return [
        new CreateSiteworksBatchHandler() as unknown as CommandHandler<unknown>,
        new SetSiteworksWidthHandler() as unknown as CommandHandler<unknown>,
        new SetSiteworksThicknessHandler() as unknown as CommandHandler<unknown>,
        new SetSiteworksRoleHandler() as unknown as CommandHandler<unknown>,
        new DeleteSiteworksHandler() as unknown as CommandHandler<unknown>,
    ];
}

/** The imperative legacy door. Idempotent against the §OI-053 skip-if-present proxy. */
export function registerSiteworksHandlers(bus: CommandBus): readonly string[] {
    return withHandlerSpan('pryzm.siteworks.registerHandlers', {
        'pryzm.plugin': 'siteworks',
    }, (span) => {
        const set = buildSiteworksHandlerSet();
        for (const h of set) bus.register(h);
        span.setAttribute('pryzm.plugin.handlers', set.length);
        span.setAttribute('pryzm.plugin.verbs', SITEWORKS_HANDLER_TYPES.length);
        return SITEWORKS_HANDLER_TYPES;
    });
}

export { CreateSiteworksBatchHandler } from './CreateSiteworksBatch.js';
export type {
    CreateSiteworksBatchPayload,
    SiteworksCreateSpec,
    SiteworksPoint,
} from './CreateSiteworksBatch.js';
export {
    SetSiteworksWidthHandler,
    SetSiteworksThicknessHandler,
    SetSiteworksRoleHandler,
    DeleteSiteworksHandler,
} from './MutateSiteworks.js';
export type {
    SetSiteworksWidthPayload,
    SetSiteworksThicknessPayload,
    SetSiteworksRolePayload,
    DeleteSiteworksPayload,
} from './MutateSiteworks.js';
