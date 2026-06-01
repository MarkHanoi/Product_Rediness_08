// A.7.c.3 (Phase A · Sprint 2) — `site.replaceContextBuilding` command handler.
//
// Per [C19 §4.1] + §1.5: atomic remove + add preserving order. Used
// when a single context-building is re-authored (eg user lifted the
// height from 12m to 15m). The semantic difference vs add-then-remove
// is provenance: the consumer knows the volume changed because the
// user reauthored it, not because some hidden mutation occurred.
//
// L3-layer: pure. No I/O.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteReplaceContextBuildingPayloadSchema,
    type SiteCommandResult,
    type SiteContextBuildingReplacedEvent,
} from './types.js';

export function siteReplaceContextBuilding(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteContextBuildingReplacedEvent> {
    let payload;
    try {
        payload = SiteReplaceContextBuildingPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.replaceContextBuilding payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.replaceContextBuilding: no Site with id '${payload.siteId}' is set`,
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
                `site.replaceContextBuilding: no ContextBuilding with id ` +
                `'${payload.contextBuildingId}' on site '${payload.siteId}'`,
        };
    }

    // If the replacement's id DIFFERS from the target AND the
    // replacement's id collides with a DIFFERENT existing entry, we
    // refuse (would shadow another row).
    const replacementId = payload.replacement.id;
    if (replacementId !== payload.contextBuildingId) {
        const collision = current.contextBuildings.some(
            (cb, i) => i !== idx && cb.id === replacementId,
        );
        if (collision) {
            return {
                ok: false,
                reason: 'context-building-duplicate-id',
                message:
                    `site.replaceContextBuilding: replacement id ` +
                    `'${replacementId}' collides with an unrelated existing entry`,
            };
        }
    }

    const nextArr = current.contextBuildings.map((cb, i) =>
        i === idx ? payload.replacement : cb,
    );
    const next = { ...current, contextBuildings: nextArr };
    store.set(next);

    const event: SiteContextBuildingReplacedEvent = {
        type: 'site.context-building-replaced',
        siteId: current.id,
        contextBuildingId: payload.contextBuildingId,
        replacementId,
    };
    return { ok: true, event, site: next };
}
