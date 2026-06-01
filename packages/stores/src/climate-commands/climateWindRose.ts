// A.10.e (Phase A · Sprint 2) — `climate.windRose` command handler.
//
// Per [C21 §4.1]: read-only lookup. Returns the active ClimateDataset's
// windRose aggregate, or null when no dataset is ingested for the site.

import type { ClimateStore } from '../ClimateStore.js';
import {
    ClimateWindRosePayloadSchema,
    type ClimateCommandResult,
    type ClimateWindRoseEvent,
} from './types.js';

export function climateWindRose(
    rawPayload: unknown,
    store: ClimateStore,
): ClimateCommandResult<ClimateWindRoseEvent> {
    let payload;
    try {
        payload = ClimateWindRosePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.windRose payload invalid: ${(err as Error).message}`,
        };
    }
    const dataset = store.resolveSite(payload.siteId);
    return {
        ok: true,
        event: {
            type: 'climate.wind-rose',
            siteId: payload.siteId,
            windRose: dataset?.windRose ?? null,
        },
    };
}
