// A.30.b (Phase A · Sprint 2) — BreachIncident schema (C22 §2.5).
//
// Per [C22 §1.9] every confirmed data breach involving PII MUST be
// reported to the lead supervisory authority within 72 hours of
// confirmation, and to affected data subjects when Article 34 high-risk
// applies. The schema captures the timeline so the SLA clock can be
// audited from the row itself.
//
// L0-pure: Zod only.

import { z } from 'zod';
import { DataTierSchema } from './DataTier.js';

/**
 * Breach severity per [C22 §2.5]. Low = encrypted exposure of
 * unreadable bytes; Critical = clear-text PII exposed to a known
 * malicious actor.
 */
export const BreachSeveritySchema = z.enum([
    'low',
    'medium',
    'high',
    'critical',
]);
export type BreachSeverity = z.infer<typeof BreachSeveritySchema>;

/**
 * Breach lifecycle status per [C22 §2.5]:
 *
 *   - 'suspected'           — anomaly detected, not yet confirmed
 *   - 'confirmed'           — breach confirmed; the 72-h GDPR clock starts
 *   - 'notified-authority'  — Art. 33 notification sent to the lead
 *                             supervisory authority
 *   - 'notified-subjects'   — Art. 34 high-risk notification sent to
 *                             affected data subjects
 *   - 'closed'              — incident resolved; post-mortem published
 */
export const BreachStatusSchema = z.enum([
    'suspected',
    'confirmed',
    'notified-authority',
    'notified-subjects',
    'closed',
]);
export type BreachStatus = z.infer<typeof BreachStatusSchema>;

/**
 * Affected region — narrower than the 4-region `RegionSchema` because
 * 'self-hosted' breaches are the customer's incident, not PRYZM's.
 */
export const BreachRegionSchema = z.enum(['eu', 'us', 'ap']);
export type BreachRegion = z.infer<typeof BreachRegionSchema>;

const BREACH_ID = /^breach_[0-9a-f-]{36}$/;

/**
 * Authority notification sub-shape — minimal info to prove the
 * Art. 33 notification was sent.
 */
export const AuthorityNotificationSchema = z.object({
    /** e.g. 'ICO' for UK, 'CNIL' for FR, 'BfDI' for DE, 'EDPB' for
     *  the EU-level coordinating body. */
    authority: z.string().min(1),
    sentAt: z.string().datetime({ offset: false }),
    /** The reference number the authority assigned. Null when the
     *  authority hasn't responded with one yet. */
    referenceNumber: z.string().nullable(),
});
export type AuthorityNotification = z.infer<typeof AuthorityNotificationSchema>;

/**
 * Subject notification sub-shape — captures Art. 34 high-risk
 * notification details (when, how, with what template).
 */
export const SubjectNotificationSchema = z.object({
    sentAt: z.string().datetime({ offset: false }),
    method: z.enum(['email', 'in-app', 'postal']),
    /** Template id (the same content was sent to every affected user). */
    template: z.string().min(1),
});
export type SubjectNotification = z.infer<typeof SubjectNotificationSchema>;

/**
 * One breach-incident row. Per [C22 §1.9] the 72-h authority clock
 * starts at `confirmedAt`; the schema enforces:
 *
 *   - `detectedAt` ≤ `confirmedAt` (when both set)
 *   - status `'confirmed'` or later → `confirmedAt` non-null
 *   - status `'notified-authority'` or later → `authorityNotification` non-null
 *   - status `'notified-subjects'` or later → both notifications non-null
 *   - status `'closed'` → `closedAt` non-null
 */
export const BreachIncidentSchema = z.object({
    id: z.string().regex(BREACH_ID, 'BreachIncident id must match `breach_<uuid>`'),
    detectedAt: z.string().datetime({ offset: false }),
    /** When the suspected breach was confirmed. Starts the 72-h clock. */
    confirmedAt: z.string().datetime({ offset: false }).nullable(),
    status: BreachStatusSchema,
    severity: BreachSeveritySchema,
    /** Tiers affected per [C22 §2.5]. */
    tiersAffected: z.array(DataTierSchema),
    /** Approximate number of records exposed. */
    recordsAffected: z.number().int().nonnegative(),
    /** Approximate number of unique data subjects exposed (rows can
     *  involve the same subject multiple times — subjects is the
     *  GDPR-relevant count). */
    subjectsAffected: z.number().int().nonnegative(),
    regionsAffected: z.array(BreachRegionSchema),
    /** Free-text narrative. Stripped of PII before persisting. */
    description: z.string().min(1),
    /** Authority notification — null until the Art. 33 process fires. */
    authorityNotification: AuthorityNotificationSchema.nullable(),
    /** Subject notification — null until Art. 34 high-risk fires. */
    subjectNotification: SubjectNotificationSchema.nullable(),
    closedAt: z.string().datetime({ offset: false }).nullable(),
})
    .superRefine((b, ctx) => {
        if (b.confirmedAt !== null && b.confirmedAt < b.detectedAt) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['confirmedAt'],
                message: `confirmedAt (${b.confirmedAt}) must be ≥ detectedAt (${b.detectedAt})`,
            });
        }
        // status-driven required fields:
        if (
            (b.status === 'confirmed' ||
                b.status === 'notified-authority' ||
                b.status === 'notified-subjects' ||
                b.status === 'closed') &&
            b.confirmedAt === null
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['confirmedAt'],
                message: `confirmedAt is required for status='${b.status}'`,
            });
        }
        if (
            (b.status === 'notified-authority' ||
                b.status === 'notified-subjects' ||
                b.status === 'closed') &&
            b.authorityNotification === null
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['authorityNotification'],
                message: `authorityNotification is required for status='${b.status}'`,
            });
        }
        if (
            (b.status === 'notified-subjects' || b.status === 'closed') &&
            b.subjectNotification === null
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['subjectNotification'],
                message: `subjectNotification is required for status='${b.status}' (Art. 34 high-risk)`,
            });
        }
        if (b.status === 'closed' && b.closedAt === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['closedAt'],
                message: `closedAt is required for status='closed'`,
            });
        }
        // recordsAffected ≥ subjectsAffected (a subject can have multiple records).
        if (b.recordsAffected < b.subjectsAffected) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['recordsAffected'],
                message: `recordsAffected (${b.recordsAffected}) must be ≥ subjectsAffected (${b.subjectsAffected})`,
            });
        }
    });

export type BreachIncident = z.infer<typeof BreachIncidentSchema>;
