// A.30.d.1 — `consent.revoke` command handler.
//
// Pure `(payload, store) → ConsentCommandResult<ConsentRevokedEvent>`.
// Rejects when no active consent exists for the (user, purpose) pair —
// callers should check `activeFor()` if revoke-without-grant is OK in
// their flow (we make this an explicit failure to surface accidental
// double-revokes).

import type { ConsentStore } from '../ConsentStore.js';
import {
    RevokeConsentPayloadSchema,
    type RevokeConsentPayload,
    type ConsentCommandResult,
    type ConsentRevokedEvent,
} from './types.js';

export function revokeConsent(
    payload: RevokeConsentPayload,
    store: ConsentStore,
): ConsentCommandResult<ConsentRevokedEvent> {
    const parsed = RevokeConsentPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `consent.revoke: invalid payload — ${parsed.error.message}`,
        );
    }
    const { userId, purpose, revokedAt } = parsed.data;
    const revoked = store.revoke(userId, purpose, revokedAt);
    if (!revoked) {
        return {
            ok: false,
            reason: 'no-active-consent',
            message: `consent.revoke: no active '${purpose}' consent for user '${userId}'`,
        };
    }
    return {
        ok: true,
        event: {
            type: 'consent.revoked',
            consent: revoked,
        },
    };
}
