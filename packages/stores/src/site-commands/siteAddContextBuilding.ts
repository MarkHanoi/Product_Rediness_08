// A.7.c.3 (Phase A · Sprint 2) — `site.addContextBuilding` command handler.
//
// Per [C19 §4.1] + §1.5: appends a single ContextBuilding to
// `SiteModel.contextBuildings[]`. Per §1.5 the appended entry MUST
// carry `editable: false` — the L0 ContextBuildingSchema enforces this
// via `z.literal(false)`, so we get the guarantee for free.
//
// L3-layer: pure. No I/O.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteAddContextBuildingPayloadSchema,
    type SiteCommandResult,
    type SiteContextBuildingAddedEvent,
} from './types.js';

/**
 * Execute `site.addContextBuilding`. Appends to `contextBuildings[]`.
 *
 *   - Validates payload (Zod).
 *   - Rejects when no Site exists / siteId mismatch (`no-site`).
 *   - Rejects when the new entry's id collides with an existing one
 *     (`context-building-duplicate-id`) — the registry semantics
 *     mirror §1.1 ("re-issue replaces" → for context buildings we
 *     prefer EXPLICIT replace via `site.replaceContextBuilding`).
 *   - Commits the append and returns the `site.context-building-added`
 *     event.
 */
export function siteAddContextBuilding(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteContextBuildingAddedEvent> {
    let payload;
    try {
        payload = SiteAddContextBuildingPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.addContextBuilding payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.addContextBuilding: no Site with id '${payload.siteId}' is set`,
        };
    }

    const newId = payload.contextBuilding.id;
    const exists = current.contextBuildings.some((cb) => cb.id === newId);
    if (exists) {
        return {
            ok: false,
            reason: 'context-building-duplicate-id',
            message:
                `site.addContextBuilding: id '${newId}' already exists — ` +
                `use site.replaceContextBuilding to swap`,
        };
    }

    const next = {
        ...current,
        contextBuildings: [...current.contextBuildings, payload.contextBuilding],
    };
    store.set(next);

    const event: SiteContextBuildingAddedEvent = {
        type: 'site.context-building-added',
        siteId: current.id,
        contextBuildingId: newId,
    };
    return { ok: true, event, site: next };
}
