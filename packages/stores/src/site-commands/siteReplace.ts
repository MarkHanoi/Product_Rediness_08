// A.7.c.5 (Phase A · Sprint 2) — `site.replace` command handler.
//
// Per [C19 §4.1] + §1.4: whole-Site replacement — the only legitimate
// path to change the parcel polygon. The replacement MUST keep the
// same `id` (deterministic per §2.1) and `projectId` (per §1.1 one
// Site per Project).
//
// Per [C19 §4.4]: single undo entry snapshots the prior SiteModel —
// the event includes `priorSnapshot` so the undo stack has the rollback
// shape directly. The actor flag is preserved by the L5 dispatch
// adapter per [C23 §4] audit trail.

import { SiteModelSchema, type SiteModel } from '@pryzm/schemas';
import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteReplacePayloadSchema,
    type SiteCommandResult,
    type SiteReplacedEvent,
} from './types.js';

export function siteReplace(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteReplacedEvent> {
    let payload;
    try {
        payload = SiteReplacePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.replace payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.replace: no Site with id '${payload.siteId}' is set`,
        };
    }

    // §1.4 — replacement id MUST equal current id (the SiteId is
    // deterministic per §2.1; user-facing "redraw parcel" replaces
    // content but keeps the same row in the persistence layer).
    if (payload.replacement.id !== current.id) {
        return {
            ok: false,
            reason: 'id-mismatch',
            message:
                `site.replace: replacement.id ('${payload.replacement.id}') ` +
                `MUST equal current.id ('${current.id}') per C19 §1.4 / §2.1`,
        };
    }

    // §1.1 — projectId MUST match (one Site per Project; you cannot
    // replace project A's Site with one belonging to project B).
    if (payload.replacement.projectId !== current.projectId) {
        return {
            ok: false,
            reason: 'project-mismatch',
            message:
                `site.replace: replacement.projectId ('${payload.replacement.projectId}') ` +
                `MUST equal current.projectId ('${current.projectId}') per C19 §1.1`,
        };
    }

    // Run the full SiteModelSchema validation on the replacement —
    // the payload schema was permissive on nested fields (parcel /
    // footprint / contextBuildings) so callers don't have to redo every
    // wrap. The L0 schema is the canonical validator.
    let parsed: SiteModel;
    try {
        parsed = SiteModelSchema.parse(payload.replacement);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `site.replace: replacement does not pass SiteModelSchema: ` +
                `${(err as Error).message}`,
        };
    }

    // Snapshot the prior model BEFORE the swap so the undo stack
    // captures it (per §4.4).
    const priorSnapshot = current;
    store.set(parsed);

    return {
        ok: true,
        event: {
            type: 'site.replaced',
            siteId: current.id,
            priorSnapshot,
        },
        site: parsed,
    };
}
