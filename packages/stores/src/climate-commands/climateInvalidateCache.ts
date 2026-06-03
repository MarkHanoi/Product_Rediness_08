// A.10.e (Phase A · Sprint 2) — `climate.invalidateCache` command handler.
//
// Per [C21 §4.1] + §1.5: marks the active entry stale; the archive
// retains it for audit + reproducibility. NEVER deletes.

import type { ClimateStore } from '../ClimateStore.js';
import type { SiteId } from '@pryzm/schemas';
import {
    ClimateInvalidateCachePayloadSchema,
    type ClimateCommandResult,
    type ClimateCacheInvalidatedEvent,
} from './types.js';

export function climateInvalidateCache(
    rawPayload: unknown,
    store: ClimateStore,
): ClimateCommandResult<ClimateCacheInvalidatedEvent> {
    let payload;
    try {
        payload = ClimateInvalidateCachePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.invalidateCache payload invalid: ${(err as Error).message}`,
        };
    }

    const before = store.resolveSite(payload.siteId as SiteId);
    if (!before) {
        return {
            ok: false,
            reason: 'no-climate-data',
            message: `climate.invalidateCache: no climate data for site '${payload.siteId}'`,
        };
    }

    store.invalidateCache(payload.siteId as SiteId);

    return {
        ok: true,
        event: {
            type: 'climate.cache-invalidated',
            siteId: payload.siteId,
        },
    };
}
