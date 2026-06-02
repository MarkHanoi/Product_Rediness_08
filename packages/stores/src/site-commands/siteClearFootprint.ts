// A.7.c.2 (Phase A · Sprint 2) — `site.clearFootprint` command handler.
//
// Per [C19 §4.1]: removes the BuildingFootprint (sets to `null`).
// Used when the user wants to redraw the footprint.
//
// L3-layer: pure. No I/O.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteClearFootprintPayloadSchema,
    type SiteCommandResult,
    type SiteFootprintClearedEvent,
} from './types.js';

/**
 * Execute `site.clearFootprint`. Sets `footprint` to `null`.
 *
 *   - Validates payload (Zod).
 *   - Rejects when no Site exists / siteId mismatch (`no-site`).
 *   - Commits `footprint: null` to the store.
 *   - Returns the `site.footprint-cleared` event.
 *
 * Idempotent on an already-null footprint — still emits the event so
 * subscribers can observe the explicit "user cleared it" action.
 */
export function siteClearFootprint(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteFootprintClearedEvent> {
    let payload;
    try {
        payload = SiteClearFootprintPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.clearFootprint payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.clearFootprint: no Site with id '${payload.siteId}' is set`,
        };
    }

    const next = { ...current, footprint: null };
    store.set(next);

    const event: SiteFootprintClearedEvent = {
        type: 'site.footprint-cleared',
        siteId: current.id,
    };
    return { ok: true, event, site: next };
}
