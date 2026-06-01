// A.7.c.5 (Phase A · Sprint 2) — `site.linkBuilding` command handler.
//
// Per [C19 §4.1]: sets `SiteModel.buildingRef`. Called once at C20
// Building.create time. `null` clears the link (used when the linked
// Building is deleted).

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteLinkBuildingPayloadSchema,
    type SiteCommandResult,
    type SiteBuildingLinkedEvent,
} from './types.js';

export function siteLinkBuilding(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteBuildingLinkedEvent> {
    let payload;
    try {
        payload = SiteLinkBuildingPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.linkBuilding payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.linkBuilding: no Site with id '${payload.siteId}' is set`,
        };
    }

    const next = { ...current, buildingRef: payload.buildingRef };
    store.set(next);

    return {
        ok: true,
        event: {
            type: 'site.building-linked',
            siteId: current.id,
            buildingRef: payload.buildingRef,
        },
        site: next,
    };
}
