// A.30.d.1 (Phase A · Sprint 2) — consent.* command payloads + shared
// result types. Pattern parallels provenance-commands / aggregate-
// commands / climate-commands.
//
// Strategic context:
//   - docs/02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md §4
//   - docs/03-execution/plans/master-execution-tracker.md A.30.d

import { z } from 'zod';
import {
    ConsentSchema,
    ConsentPurposeSchema,
    type Consent,
} from '@pryzm/schemas/privacy';

/**
 * Soft rejection reasons. Programmer errors (Zod failures) throw.
 */
export type ConsentCommandRejection =
    | 'no-active-consent'    // revoke called when no active grant exists
    | 'invalid-payload';

export type ConsentCommandResult<TEvent extends { type: string }> =
    | { readonly ok: true; readonly event: TEvent }
    | {
          readonly ok: false;
          readonly reason: ConsentCommandRejection;
          readonly message: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// consent.grant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `consent.grant` payload — the full Consent row. Handler is idempotent
 * on identical rows + auto-supersedes prior active versions of the same
 * purpose.
 */
export const GrantConsentPayloadSchema = ConsentSchema;
export type GrantConsentPayload = z.infer<typeof GrantConsentPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// consent.revoke
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `consent.revoke` payload — revoke the active consent for a (user,
 * purpose) pair. Per [C22 §1.5] revocation triggers the retention
 * sweeper's 'consent-revoke' early-purge path on the affected data —
 * downstream of this command, the L3 RetentionScheduler subscribes to
 * the emitted event.
 */
export const RevokeConsentPayloadSchema = z.object({
    userId: z.string().min(1),
    purpose: ConsentPurposeSchema,
    revokedAt: z.string().datetime({ offset: false }),
});
export type RevokeConsentPayload = z.infer<typeof RevokeConsentPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// consent.purgeUser (GDPR Art. 17)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `consent.purgeUser` payload — hard-delete every consent row for a
 * user. The GDPR Art. 17 "right to erasure" path. Only dispatched by
 * the DSAR worker after the user's identity is verified.
 */
export const PurgeUserConsentPayloadSchema = z.object({
    userId: z.string().min(1),
});
export type PurgeUserConsentPayload = z.infer<
    typeof PurgeUserConsentPayloadSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Domain events
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsentGrantedEvent {
    readonly type: 'consent.granted';
    readonly consent: Consent;
    /** Prior active rows that were auto-revoked by this grant
     *  (cross-version supersede). The retention scheduler reads this to
     *  fire 'consent-revoke' purges. */
    readonly supersededRows: readonly Consent[];
}

export interface ConsentRevokedEvent {
    readonly type: 'consent.revoked';
    readonly consent: Consent;
}

export interface ConsentUserPurgedEvent {
    readonly type: 'consent.user-purged';
    readonly userId: string;
    readonly rowCount: number;
}
