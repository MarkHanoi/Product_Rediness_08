// A.7.c (Phase A · Sprint 2) — `site.updateLocation` command handler.
//
// Per [C19 §4.1]: replaces `SiteModel.location` and (per §1.3) the
// command-bus adapter MUST call `LTPENURebase.setOrigin(lat, lon, elev)`
// synchronously before emitting `site.location-changed`. This pure
// handler does NOT call setOrigin — that's the adapter's job; the
// handler just produces the validated event.
//
// L3-layer: pure. No I/O.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteUpdateLocationPayloadSchema,
    type SiteCommandResult,
    type SiteLocationChangedEvent,
} from './types.js';

/**
 * Execute `site.updateLocation`. Per [C19 §1.3] the LTP-ENU rebase MUST
 * happen synchronously before the event emits — that's the adapter's
 * responsibility (not this handler).
 *
 *   - Validates payload (Zod).
 *   - Rejects if no Site exists (returns `no-site`).
 *   - Replaces `SiteModel.location` on the store.
 *   - Returns the `site.location-changed` event.
 */
export function siteUpdateLocation(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteLocationChangedEvent> {
    let payload;
    try {
        payload = SiteUpdateLocationPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.updateLocation payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.updateLocation: no Site with id '${payload.siteId}' is set`,
        };
    }

    const next = { ...current, location: payload.location };
    store.set(next);

    const event: SiteLocationChangedEvent = {
        type: 'site.location-changed',
        siteId: current.id,
        location: payload.location,
    };
    return { ok: true, event, site: next };
}
