// A.31.a (Phase A · Sprint 2) — RedactionRecord schema (C23 §2.4).
//
// Per [C23 §1.6] every AI call MUST be routed through the PII redactor
// before the prompt is sent upstream. This row is the audit trail of THAT
// redaction event — NEVER the redacted content (the §1.6 invariant).
//
// L0-pure: Zod only.

import { z } from 'zod';

const RR_ID = /^rr_[0-9a-f-]{36}$/;
const AIA_ID = /^aia_[0-9a-f-]{36}$/;

/**
 * PII category per [C23 §2.4]. Append-only — a new category appears here
 * BEFORE the redactor learns to detect it, so audit rows from older
 * redactor versions don't get a category that didn't exist then.
 */
export const PiiCategorySchema = z.enum([
    'personal-name',
    'email',
    'phone',
    'street-address',
    'government-id',
    'customer-id',
    'free-text-unclassified',
]);
export type PiiCategory = z.infer<typeof PiiCategorySchema>;

/**
 * Redactor confidence per [C23 §1.6]:
 *   - 'high'   — regex/named-entity match was unambiguous
 *   - 'medium' — model-assisted classification crossed a threshold
 *   - 'low'    — pattern was weakly suggestive (still redacted, per
 *                fail-closed §1.6)
 */
export const RedactorConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type RedactorConfidence = z.infer<typeof RedactorConfidenceSchema>;

/**
 * The audit row. Stores COUNTS only — never content. Per [C23 §1.6] the
 * `redactionFailed: true` signal blocks the upstream call (fail-closed).
 */
export const RedactionRecordSchema = z.object({
    id: z.string().regex(RR_ID, 'RedactionRecord id must match `rr_<uuid>`'),
    artefactId: z.string().regex(AIA_ID, 'artefactId must match `aia_<uuid>`'),
    /** Semver of `packages/pii-redactor`. Pins which rule set was active. */
    redactorVersion: z.string().min(1),
    redactedAt: z.string().datetime({ offset: false }),

    /** Per-category redaction counts. Never the strings themselves. Partial
     *  record — categories with zero redactions MAY be omitted; the keys
     *  present MUST be valid `PiiCategory` values. */
    redactionsByCategory: z
        .record(z.string(), z.number().int().nonnegative())
        .refine(
            (rec) => {
                const valid = new Set<string>(PiiCategorySchema.options);
                return Object.keys(rec).every((k) => valid.has(k));
            },
            { message: 'redactionsByCategory keys must be valid PiiCategory values' },
        ),
    /** Total tokens replaced with `<REDACTED>`. */
    totalTokensRedacted: z.number().int().nonnegative(),

    confidence: RedactorConfidenceSchema,
    /** Fail-closed signal per [C23 §1.6] — when true, the upstream call
     *  did NOT proceed. */
    redactionFailed: z.boolean(),
})
    .superRefine((r, ctx) => {
        // Sanity: per-category counts MUST sum to ≤ totalTokensRedacted.
        // (Each category counts each redacted token once; the total is
        // bounded by the sum.)
        const sum = Object.values(r.redactionsByCategory ?? {}).reduce(
            (acc, n) => acc + n,
            0,
        );
        if (sum > r.totalTokensRedacted) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['totalTokensRedacted'],
                message: `totalTokensRedacted (${r.totalTokensRedacted}) must be ≥ sum of per-category counts (${sum})`,
            });
        }
    });

export type RedactionRecord = z.infer<typeof RedactionRecordSchema>;
