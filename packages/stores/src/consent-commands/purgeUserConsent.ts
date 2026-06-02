// A.30.d.1 — `consent.purgeUser` command handler.
//
// Pure `(payload, store) → ConsentCommandResult<ConsentUserPurgedEvent>`.
// GDPR Art. 17 erasure path. Idempotent — purging a user with no rows
// returns rowCount: 0 (still ok: true; the caller's contract is "this
// user has no surviving rows").

import type { ConsentStore } from '../ConsentStore.js';
import {
    PurgeUserConsentPayloadSchema,
    type PurgeUserConsentPayload,
    type ConsentCommandResult,
    type ConsentUserPurgedEvent,
} from './types.js';

export function purgeUserConsent(
    payload: PurgeUserConsentPayload,
    store: ConsentStore,
): ConsentCommandResult<ConsentUserPurgedEvent> {
    const parsed = PurgeUserConsentPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `consent.purgeUser: invalid payload — ${parsed.error.message}`,
        );
    }
    const { userId } = parsed.data;
    const rowCount = store.purgeUser(userId);
    return {
        ok: true,
        event: {
            type: 'consent.user-purged',
            userId,
            rowCount,
        },
    };
}
