// A.30.a (Phase A · Sprint 2) — DSARRequest schema (C22 §2.4).
//
// Data-Subject Access Request per GDPR Art. 15 (export), Art. 16
// (rectify), Art. 17 (delete). Per [C22 §1.5] every DSAR MUST resolve
// within 30 calendar days of acknowledgement — the schema captures
// the `dueAt` deadline + the verification + completion state.
//
// L0-pure: Zod only.

import { z } from 'zod';

/**
 * DSAR type per [C22 §2.4]:
 *
 *   - 'export'  — GDPR Art. 15 right of access; user gets a copy of
 *                 every PII + PROJECT row tied to their id, signed +
 *                 packaged.
 *   - 'delete'  — GDPR Art. 17 right of erasure; PII purged + every
 *                 PROJECT row scrubbed of user-identifying fields.
 *   - 'rectify' — GDPR Art. 16 right of rectification; user submits
 *                 a patch + the privacy team reviews + applies.
 */
export const DsarTypeSchema = z.enum(['export', 'delete', 'rectify']);
export type DsarType = z.infer<typeof DsarTypeSchema>;

/**
 * DSAR status per [C22 §2.4]:
 *
 *   - 'pending'       — freshly submitted; identity not yet verified
 *   - 'in-progress'   — verified + a worker has picked it up
 *   - 'completed'     — bundle delivered (export) or purge done (delete)
 *                       or patch applied (rectify)
 *   - 'manual'        — escalated to the privacy team (edge case
 *                       requiring human review)
 *   - 'rejected'      — identity not verified (the user could not prove
 *                       ownership of the email)
 */
export const DsarStatusSchema = z.enum([
    'pending',
    'in-progress',
    'completed',
    'manual',
    'rejected',
]);
export type DsarStatus = z.infer<typeof DsarStatusSchema>;

const DSAR_ID = /^dsar_[0-9a-f-]{36}$/;

/**
 * The audit row per [C22 §2.4].
 *
 * `dueAt` MUST be ≥ `submittedAt` (the 30-day clock under §1.5) — the
 * superRefine below enforces this + the type-specific shape:
 *
 *   - type='rectify' → `rectifyPatch` MUST be non-null
 *   - type='export'  → `exportBundleUrl` MAY be set (after completion)
 *   - type='delete'  → both nullable
 *
 * `verifiedAt` MUST be set when status transitions out of 'pending'
 * (except 'rejected', which is the "verification failed" terminal).
 */
export const DsarRequestSchema = z.object({
    id: z.string().regex(DSAR_ID, 'DSAR id must match `dsar_<uuid>`'),
    userId: z.string().min(1),
    type: DsarTypeSchema,
    status: DsarStatusSchema,
    submittedAt: z.string().datetime({ offset: false }),
    acknowledgedAt: z.string().datetime({ offset: false }).nullable(),
    /** submittedAt + 30 days — the GDPR Art. 12(3) hard ceiling. */
    dueAt: z.string().datetime({ offset: false }),
    completedAt: z.string().datetime({ offset: false }).nullable(),
    /** Identity-verification token (proves the user owns the email). */
    verificationToken: z.string().min(1),
    verifiedAt: z.string().datetime({ offset: false }).nullable(),
    /** Worker that picked this up — null while pending. */
    workerId: z.string().nullable(),
    /** Retry count — escalates to 'manual' after a hard cap (policy at L3). */
    attempts: z.number().int().nonnegative(),
    /** Where the export bundle landed — PII bucket, expires 30 d post-completion. */
    exportBundleUrl: z.string().url().nullable(),
    /** For rectify: the patch the user wants applied. Null for export + delete. */
    rectifyPatch: z.record(z.string(), z.unknown()).nullable(),
})
    .superRefine((d, ctx) => {
        if (d.submittedAt > d.dueAt) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['dueAt'],
                message: `dueAt (${d.dueAt}) must be ≥ submittedAt (${d.submittedAt})`,
            });
        }
        if (d.type === 'rectify' && d.rectifyPatch === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['rectifyPatch'],
                message: `rectifyPatch is required when type === 'rectify'`,
            });
        }
        if (d.type !== 'rectify' && d.rectifyPatch !== null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['rectifyPatch'],
                message: `rectifyPatch must be null for type='${d.type}'`,
            });
        }
        if (d.status === 'completed' && d.completedAt === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['completedAt'],
                message: `completedAt is required when status === 'completed'`,
            });
        }
        if (
            (d.status === 'in-progress' ||
                d.status === 'completed' ||
                d.status === 'manual') &&
            d.verifiedAt === null
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['verifiedAt'],
                message: `verifiedAt is required for status='${d.status}'`,
            });
        }
    });

export type DsarRequest = z.infer<typeof DsarRequestSchema>;
