// Boundary-line handler registration — §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7910).
//
// ⛔ THERE IS DELIBERATELY NO `boundaryLine.move` HANDLER HERE, AND ITS ABSENCE IS A
// DESIGN STATEMENT — the same kind `water` and `liftPart` make by contributing a store
// and no verb.
//
// Moving the line is a HOST MOVE: the line's own geometry changes AND every attached
// wall, slab and column is carried or refused by name, as ONE undo unit (C81, C106
// §3). The dependents live in the AUTHORITATIVE geometry stores — the ones the
// fragment builders, the 2-D plan projector, the IFC exporter and persistence read —
// and a plugin handler cannot reach them. `plugins/wall/src/handlers/MoveWall.ts` is
// the measured proof: it REFUSES `wall.move` in its own words because *"it writes the
// detached plugin wall store that nothing renders, exports or persists"*.
//
// So the move is `MoveBoundaryLineCommand` (`packages/command-registry`), reached
// through the bus verb `boundaryLine.move` registered in `initBusHandlers.ts` — the
// L-220 distinct-verb bridge pattern `slab.movePolygon` and `handrail.moveBaseLine`
// already use. Adding a rival handler here would shadow that verb and quietly move
// the line while stranding everything on it.

// P8 / C10 §2 — `withHandlerSpan` from `@pryzm/plugin-sdk`, the SAME wrapper the
// 275 Zone-A handler files use. ADR-002 §2 forbids a direct `@opentelemetry/api`
// import at L7, and C84 EI-9 forbids a second wrapper.
//
// The span sits on REGISTRATION, and it earns its place here more than in most
// barrels: this file's header explains at length that `boundaryLine.move` is
// DELIBERATELY ABSENT from the set below and lives on the bus verb instead. The
// registered-verb list is therefore a fact somebody will eventually want to read
// back from a trace rather than infer from a comment.
import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { CreateBoundaryLineHandler } from './CreateBoundaryLine.js';
import {
    AttachToBoundaryLineHandler,
    DetachFromBoundaryLineHandler,
} from './AttachToBoundaryLine.js';
import { UpdateBoundaryLineHandler, DeleteBoundaryLineHandler } from './UpdateBoundaryLine.js';

export const BOUNDARY_LINE_HANDLER_TYPES = [
    'boundaryLine.create',
    'boundaryLine.attach',
    'boundaryLine.detach',
    'boundaryLine.update',
    'boundaryLine.delete',
] as const;

export type BoundaryLineHandlerType = (typeof BOUNDARY_LINE_HANDLER_TYPES)[number];

export function buildBoundaryLineHandlerSet(): readonly CommandHandler<unknown>[] {
    return [
        new CreateBoundaryLineHandler() as unknown as CommandHandler<unknown>,
        new AttachToBoundaryLineHandler() as unknown as CommandHandler<unknown>,
        new DetachFromBoundaryLineHandler() as unknown as CommandHandler<unknown>,
        new UpdateBoundaryLineHandler() as unknown as CommandHandler<unknown>,
        new DeleteBoundaryLineHandler() as unknown as CommandHandler<unknown>,
    ];
}

export function registerBoundaryLineHandlers(bus: CommandBus): readonly string[] {
    return withHandlerSpan('pryzm.boundaryLine.registerHandlers', {
        'pryzm.plugin': 'boundary-line',
    }, (span) => {
        const set = buildBoundaryLineHandlerSet();
        for (const h of set) bus.register(h);
        span.setAttribute('pryzm.plugin.handlers', set.length);
        span.setAttribute('pryzm.plugin.verbs', BOUNDARY_LINE_HANDLER_TYPES.length);
        return BOUNDARY_LINE_HANDLER_TYPES;
    });
}

export { CreateBoundaryLineHandler, type CreateBoundaryLinePayload } from './CreateBoundaryLine.js';
export {
    AttachToBoundaryLineHandler,
    type AttachToBoundaryLinePayload,
    DetachFromBoundaryLineHandler,
    type DetachFromBoundaryLinePayload,
} from './AttachToBoundaryLine.js';
export {
    UpdateBoundaryLineHandler,
    type UpdateBoundaryLinePayload,
    DeleteBoundaryLineHandler,
    type DeleteBoundaryLinePayload,
} from './UpdateBoundaryLine.js';
