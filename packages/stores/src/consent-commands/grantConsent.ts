// A.30.d.1 — `consent.grant` command handler.
//
// Pure `(payload, store) → ConsentCommandResult<ConsentGrantedEvent>`.
// Idempotent on identical rows + auto-supersedes prior active versions
// of the same purpose. The event carries the superseded rows so the L3
// RetentionScheduler can fire the §1.6 'consent-revoke' purge.

import type { ConsentStore } from '../ConsentStore.js';
import {
    GrantConsentPayloadSchema,
    type GrantConsentPayload,
    type ConsentCommandResult,
    type ConsentGrantedEvent,
} from './types.js';

export function grantConsent(
    payload: GrantConsentPayload,
    store: ConsentStore,
): ConsentCommandResult<ConsentGrantedEvent> {
    const parsed = GrantConsentPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `consent.grant: invalid payload — ${parsed.error.message}`,
        );
    }
    const consent = parsed.data;
    const superseded = store.grant(consent);
    return {
        ok: true,
        event: {
            type: 'consent.granted',
            consent,
            supersededRows: superseded,
        },
    };
}
