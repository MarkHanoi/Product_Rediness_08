// §SITE-SCOPE (L-645, C12 §13 / ADR-0382) — `site.setScope` command handler.
//
// Per [C19 §4.1] + [C12 §13]: sets — or clears with `null` — the persisted 3D-Site scope on the
// SiteModel. This is THE ONLY mutation path for `SiteModel.scope` (P6: commands are the only
// mutation path); the slider on the 3D-Site pane dispatches it on RELEASE, never per pointer move
// (the live drag drives a preview ring, not the store — C12 §13.4).
//
// The polygon, location, footprint and every other field are preserved verbatim: a scope change
// is a view-extent fact, not a site-geometry fact.
//
// L3-layer: pure. No I/O. Imports ONLY `@pryzm/schemas` + this directory.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteSetScopePayloadSchema,
    type SiteCommandResult,
    type SiteScopeChangedEvent,
} from './types.js';

/**
 * Execute `site.setScope`.
 *
 *   - Validates payload (Zod — the L0 `SiteScopeSchema` sanity bounds apply; `null` clears).
 *   - Rejects when no Site exists / siteId mismatch (`no-site`).
 *   - Writes `scope` and nothing else.
 *   - Returns the `site.scope-changed` event carrying the post-write scope (or `null`).
 *
 * Setting the value that is already stored is a no-op write (`SiteModelStore.set` compares by
 * reference, so a fresh object still notifies) — callers that want to avoid a redundant reload
 * compare before dispatching; the handler stays total and simple.
 */
export function siteSetScope(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteScopeChangedEvent> {
    let payload;
    try {
        payload = SiteSetScopePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.setScope payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.setScope: no Site with id '${payload.siteId}' is set`,
        };
    }

    const next = { ...current, scope: payload.scope };
    store.set(next);

    const event: SiteScopeChangedEvent = {
        type: 'site.scope-changed',
        siteId: current.id,
        scope: payload.scope,
    };
    return { ok: true, event, site: next };
}
