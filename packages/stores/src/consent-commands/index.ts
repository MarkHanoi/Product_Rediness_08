// A.30.d.1 (Phase A · Sprint 2) — consent.* command handler barrel.
//
// 3 pure handlers per [C22 §4]:
//   - consent.grant       — idempotent + auto-supersedes prior versions
//   - consent.revoke      — rejects on no-active-consent
//   - consent.purgeUser   — GDPR Art. 17 erasure
//
// Strategic context: docs/02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md §4.

export {
    GrantConsentPayloadSchema,
    RevokeConsentPayloadSchema,
    PurgeUserConsentPayloadSchema,
    type GrantConsentPayload,
    type RevokeConsentPayload,
    type PurgeUserConsentPayload,
    type ConsentCommandResult,
    type ConsentCommandRejection,
    type ConsentGrantedEvent,
    type ConsentRevokedEvent,
    type ConsentUserPurgedEvent,
} from './types.js';

export { grantConsent } from './grantConsent.js';
export { revokeConsent } from './revokeConsent.js';
export { purgeUserConsent } from './purgeUserConsent.js';
