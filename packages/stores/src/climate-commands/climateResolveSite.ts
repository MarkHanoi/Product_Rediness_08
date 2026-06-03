// A.10.e (Phase A · Sprint 2) — `climate.resolveSite` command handler.
//
// Per [C21 §4.1]: read-only lookup. Returns the active ClimateDataset
// for a Site, or null when no dataset has been ingested.

import type { ClimateStore } from '../ClimateStore.js';
import type { SiteId } from '@pryzm/schemas';
import {
    ClimateResolveSitePayloadSchema,
    type ClimateCommandResult,
    type ClimateResolvedEvent,
} from './types.js';

export function climateResolveSite(
    rawPayload: unknown,
    store: ClimateStore,
): ClimateCommandResult<ClimateResolvedEvent> {
    let payload;
    try {
        payload = ClimateResolveSitePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.resolveSite payload invalid: ${(err as Error).message}`,
        };
    }
    const dataset = store.resolveSite(payload.siteId as SiteId);
    return {
        ok: true,
        event: {
            type: 'climate.resolved',
            siteId: payload.siteId,
            dataset,
        },
    };
}
