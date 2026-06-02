// A.7.c.5 (Phase A · Sprint 2) — `site.delete` command handler.
//
// Per [C19 §4.1] + §1.1: FORBIDDEN in normal flow. The only legitimate
// caller is the project-delete cascade. The payload requires an
// explicit `cascadeFromProjectDelete: true` flag — without it the
// command is rejected with `delete-not-cascaded`. This pattern lets
// the command-bus enforce the cascade-only invariant without
// inspecting the call stack.
//
// Per [C19 §4.4]: single undo entry snapshots the prior SiteModel.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteDeletePayloadSchema,
    type SiteCommandResult,
    type SiteDeletedEvent,
} from './types.js';

export function siteDelete(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteDeletedEvent> {
    // Zod validates `cascadeFromProjectDelete: z.literal(true)` — if
    // the caller omits or passes `false`, Zod refuses at the boundary.
    // We catch + translate into the more-specific 'delete-not-cascaded'
    // reason so the UI surface knows exactly why.
    let payload;
    try {
        payload = SiteDeletePayloadSchema.parse(rawPayload);
    } catch (err) {
        // Detect the cascade-flag-missing case explicitly.
        const errMsg = (err as Error).message ?? '';
        if (/cascadeFromProjectDelete/.test(errMsg)) {
            return {
                ok: false,
                reason: 'delete-not-cascaded',
                message:
                    `site.delete: FORBIDDEN in normal flow per C19 §1.1 — ` +
                    `only the project-delete cascade may call this command. ` +
                    `Pass cascadeFromProjectDelete: true to confirm.`,
            };
        }
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.delete payload invalid: ${errMsg}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.delete: no Site with id '${payload.siteId}' is set`,
        };
    }

    const priorSnapshot = current;
    store.set(null);

    return {
        ok: true,
        event: {
            type: 'site.deleted',
            siteId: current.id,
            priorSnapshot,
        },
        // The site is now null; for consistency with the union we
        // return the prior model as `site` — the L5 caller knows the
        // store is empty post-delete.
        site: priorSnapshot,
    };
}
