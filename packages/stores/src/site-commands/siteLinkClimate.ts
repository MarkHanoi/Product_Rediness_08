// A.7.c.5 (Phase A · Sprint 2) — `site.linkClimate` command handler.
//
// Per [C19 §4.1]: sets `SiteModel.climateRef` so workflows resolve
// climate data through the C21 ClimateStore (the inverse pointer —
// ClimateDataset.siteRef points the other way per [C21 §1.1]). `null`
// clears the link.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteLinkClimatePayloadSchema,
    type SiteCommandResult,
    type SiteClimateLinkedEvent,
} from './types.js';

export function siteLinkClimate(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteClimateLinkedEvent> {
    let payload;
    try {
        payload = SiteLinkClimatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.linkClimate payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.linkClimate: no Site with id '${payload.siteId}' is set`,
        };
    }

    const next = { ...current, climateRef: payload.climateRef };
    store.set(next);

    return {
        ok: true,
        event: {
            type: 'site.climate-linked',
            siteId: current.id,
            climateRef: payload.climateRef,
        },
        site: next,
    };
}
