// A.30.a (Phase A · Sprint 2) — RetentionPolicy schema (C22 §2.3).
//
// Per-tier retention configuration. Per [C22 §1.6] the retention
// sweeper consults a policy per tier; rows older than `maxDays` are
// forcibly purged; backups respect `maxBackupDays` (PII ≤ 90).
//
// L0-pure: Zod only.

import { z } from 'zod';
import { DataTierSchema } from './DataTier.js';

/**
 * Trigger that fires an EARLY purge before maxDays per [C22 §2.3]:
 *
 *   - 'account-delete'   — user closes their account
 *   - 'project-delete'   — single project removed
 *   - 'consent-revoke'   — user revokes the consent that justified retention
 *   - 'dsar-delete'      — Art. 17 erasure request completed
 *   - 'parent-delete'    — the parent record (e.g. Building) was removed
 */
export const RetentionTriggerSchema = z.enum([
    'account-delete',
    'project-delete',
    'consent-revoke',
    'dsar-delete',
    'parent-delete',
]);
export type RetentionTrigger = z.infer<typeof RetentionTriggerSchema>;

/**
 * One row of the retention table. Per [C22 §2.3]:
 *
 *   - `maxBackupDays` MUST be ≤ 90 when `tier === 'pii'` per §1.6
 *     (the GDPR / industry-standard ceiling). The superRefine below
 *     enforces this.
 *   - `sweepIntervalMinutes` must be positive; the L3 scheduler runs
 *     a purge sweep at this cadence.
 */
export const RetentionPolicySchema = z.object({
    tier: DataTierSchema,
    /** Forced-purge ceiling. */
    maxDays: z.number().int().positive(),
    /** Backup-purge ceiling. */
    maxBackupDays: z.number().int().positive(),
    /** Triggers that fire an early purge. */
    earlyPurgeTriggers: z.array(RetentionTriggerSchema),
    /** Sweep cadence in minutes (positive integer). */
    sweepIntervalMinutes: z.number().int().positive(),
})
    .superRefine((p, ctx) => {
        if (p.tier === 'pii' && p.maxBackupDays > 90) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxBackupDays'],
                message: `maxBackupDays (${p.maxBackupDays}) must be ≤ 90 for tier='pii' per C22 §1.6`,
            });
        }
        if (p.maxBackupDays > p.maxDays) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxBackupDays'],
                message: `maxBackupDays (${p.maxBackupDays}) must be ≤ maxDays (${p.maxDays})`,
            });
        }
    });

export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
