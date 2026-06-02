// A.30.a (Phase A · Sprint 2) — Consent schema (C22 §2.6).
//
// Per-purpose consent record. Per [C22 §1.5] withdrawal of consent
// MUST trigger the early-purge path for the affected data within the
// retention sweep cadence; the schema captures the click-time +
// withdrawal-time + version of the consent text agreed to.
//
// L0-pure: Zod only.

import { z } from 'zod';

/**
 * Consent purpose per [C22 §2.6]:
 *
 *   - 'analytics'                — anonymised usage analytics
 *   - 'marketing-email'          — promotional emails (separate from
 *                                  transactional / billing emails)
 *   - 'ai-training'              — opt-in to letting PRYZM use the
 *                                  customer's anonymised PROJECT data
 *                                  to improve models
 *   - 'third-party-sharing'      — share data with vetted integration
 *                                  partners (e.g. for plugin handshakes)
 *   - 'product-research-interview' — opt-in to being contacted for
 *                                    user-research sessions
 *
 * Each purpose is granted independently; revoking one does not affect
 * the others.
 */
export const ConsentPurposeSchema = z.enum([
    'analytics',
    'marketing-email',
    'ai-training',
    'third-party-sharing',
    'product-research-interview',
]);
export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

/**
 * Where the consent click happened per [C22 §2.6]:
 *
 *   - 'signup'    — the consent panel on the signup form
 *   - 'settings'  — the account-settings privacy panel
 *   - 'modal'     — an in-app modal (e.g. AI-training consent that
 *                   appears the first time a model call is made)
 *   - 'api'       — programmatic via the public API
 */
export const ConsentSourceSchema = z.enum([
    'signup',
    'settings',
    'modal',
    'api',
]);
export type ConsentSource = z.infer<typeof ConsentSourceSchema>;

/**
 * One consent record. A user has at most one ACTIVE consent per
 * (purpose, version) pair — granting a fresh consent at a new version
 * supersedes prior versions (but does NOT delete them; the audit row
 * stays for the consent-history table).
 */
export const ConsentSchema = z.object({
    userId: z.string().min(1),
    purpose: ConsentPurposeSchema,
    /** The version of the consent text the user agreed to (semver or date). */
    version: z.string().min(1),
    grantedAt: z.string().datetime({ offset: false }),
    /** When the user revoked. Null while active. */
    revokedAt: z.string().datetime({ offset: false }).nullable(),
    source: ConsentSourceSchema,
})
    .superRefine((c, ctx) => {
        if (c.revokedAt !== null && c.revokedAt < c.grantedAt) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['revokedAt'],
                message: `revokedAt (${c.revokedAt}) must be ≥ grantedAt (${c.grantedAt})`,
            });
        }
    });

export type Consent = z.infer<typeof ConsentSchema>;
