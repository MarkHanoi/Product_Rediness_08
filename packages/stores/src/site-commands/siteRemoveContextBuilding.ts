// A.7.c.3 (Phase A · Sprint 2) — `site.removeContextBuilding` command handler.
//
// Per [C19 §4.1] + §1.5: removes one ContextBuilding by id. Rejects
// when the id is unknown (`context-building-not-found`) — explicit
// over silent no-op so the UI knows the click hit nothing.
//
// L3-layer: pure. No I/O.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteRemoveContextBuildingPayloadSchema,
    type SiteCommandResult,
    type SiteContextBuildingRemovedEvent,
} from './types.js';

export function siteRemoveContextBuilding(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteContextBuildingRemovedEvent> {
    let payload;
    try {
        payload = SiteRemoveContextBuildingPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.removeContextBuilding payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.removeContextBuilding: no Site with id '${payload.siteId}' is set`,
        };
    }

    const idx = current.contextBuildings.findIndex(
        (cb) => cb.id === payload.contextBuildingId,
    );
    if (idx === -1) {
        return {
            ok: false,
            reason: 'context-building-not-found',
            message:
                `site.removeContextBuilding: no ContextBuilding with id ` +
                `'${payload.contextBuildingId}' on site '${payload.siteId}'`,
        };
    }

    const nextArr = current.contextBuildings.filter((_, i) => i !== idx);
    const next = { ...current, contextBuildings: nextArr };
    store.set(next);

    const event: SiteContextBuildingRemovedEvent = {
        type: 'site.context-building-removed',
        siteId: current.id,
        contextBuildingId: payload.contextBuildingId,
    };
    return { ok: true, event, site: next };
}
