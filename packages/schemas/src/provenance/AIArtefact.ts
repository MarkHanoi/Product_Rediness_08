// A.31.a (Phase A · Sprint 2) — AIArtefact schema (C23 §2.1).
//
// The append-only audit row for every AI call. Per [C23 §1.1] every code
// path that hits a model — relay-based or offline-deterministic — writes
// one of these BEFORE the call's promise resolves to the caller.
//
// L0-pure: Zod only. No I/O, no THREE, no DOM.
//
// Strategic context:
//   - docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §2.1
//   - docs/03-execution/plans/master-execution-tracker.md A.31

import { z } from 'zod';

/**
 * Approval status per [C23 §1.7].
 *
 *   - 'auto-applied'    — the call's output was applied without user gate
 *   - 'user-approved'   — user clicked Approve in the modal
 *   - 'user-rejected'   — user clicked Reject
 *   - 'pending'         — the modal is open + the user hasn't decided
 *   - 'never-applied'   — terminal: the call ran but the output was never
 *                         dispatched (e.g. the user navigated away)
 *
 * This is the ONE field mutable post-write — explicit exception per
 * §1.9 "append-only with single carve-out".
 */
export const ApprovalStatusSchema = z.enum([
    'auto-applied',
    'user-approved',
    'user-rejected',
    'pending',
    'never-applied',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * Reproducibility binary discriminator per [C23 §1.4].
 *
 *   - 'deterministic'      — offline engines (D-TGL / D-FLE / D-CE / D-LE)
 *                            re-run with (contextHash, seed, workflowVersion)
 *                            yield byte-identical output. `seed` MUST be
 *                            non-null.
 *   - 'non-deterministic'  — every relay-based path (Anthropic / OpenAI /
 *                            CloudFlare worker). `seed` MUST be null.
 */
export const ReproducibilitySchema = z.enum([
    'deterministic',
    'non-deterministic',
]);
export type Reproducibility = z.infer<typeof ReproducibilitySchema>;

/**
 * Cache-status discriminator per [C23 §1.2].
 *
 *   - 'miss'   — the call ran against the upstream model
 *   - 'hit'    — the cache had a fresh entry; no upstream call
 *   - 'bypass' — the caller explicitly skipped the cache (e.g. for an
 *                A/B test or a re-run from the inspector)
 */
export const CacheStatusSchema = z.enum(['miss', 'hit', 'bypass']);
export type CacheStatus = z.infer<typeof CacheStatusSchema>;

// Id-shape regexes. Brand prefixes:
//   aia_  — AI Artefact
//   cs_   — Context Snapshot
//   rr_   — Redaction Record
//   oc_   — Output Cluster
const AIA_ID_PATTERN = /^aia_[0-9a-f-]{36}$/;
const CS_ID_PATTERN = /^cs_[0-9a-f-]{36}$/;
const RR_ID_PATTERN = /^rr_[0-9a-f-]{36}$/;
const OC_ID_PATTERN = /^oc_[0-9a-f-]{36}$/;

/**
 * The canonical audit row. Append-only per [C23 §1.9] except for
 * `approvalStatus` (§1.7 carve-out).
 *
 * Field reference — see [C23 §1.2] for the must-have audit-tuple.
 */
export const AIArtefactSchema = z.object({
    // ── Identity (immutable after write) ────────────────────────────────
    id: z.string().regex(AIA_ID_PATTERN, 'AIArtefact id must match `aia_<uuid>`'),
    /** SHA-256 of (sessionId · workflowKind · contextHash · timestamp) —
     *  the dedup key for retried calls. */
    idempotencyKey: z.string().length(64, 'idempotencyKey MUST be 64-char SHA-256 hex'),
    /** UTC ISO-8601 with millisecond precision. NO timezone offset; the
     *  contract is universal-time-only. */
    timestamp: z.string().datetime({ offset: false }),
    sessionId: z.string().uuid(),
    userId: z.string().min(1),
    projectId: z.string().min(1),

    // ── Model + workflow ────────────────────────────────────────────────
    /** Exact upstream model id (`claude-haiku-4-5-20251014`, …) — not the
     *  alias. Captures the model version at call time. */
    model: z.string().min(1),
    /** One of the workflows from [C09 §3]. */
    workflowKind: z.string().min(1),
    /** Semver of the workflow definition; bumps on prompt / validator /
     *  scorer changes. Pattern: `<workflow-name>-v<major>.<minor>[.<patch>]`. */
    workflowVersion: z
        .string()
        .regex(/^[a-z0-9-]+-v\d+\.\d+(\.\d+)?$/, 'workflowVersion must match `<name>-v<M>.<m>[.<p>]`'),

    // ── Prompt + context ────────────────────────────────────────────────
    promptSha: z.string().length(64),
    promptPreviewRedacted: z.string().max(1024),
    contextHash: z.string().length(64),
    contextSnapshotId: z.string().regex(CS_ID_PATTERN, 'contextSnapshotId must match `cs_<uuid>`'),
    /** Foreign key into RedactionRecord, or null if redaction was a no-op. */
    redactionRecordId: z
        .string()
        .regex(RR_ID_PATTERN, 'redactionRecordId must match `rr_<uuid>`')
        .nullable(),

    // ── Cost + perf ─────────────────────────────────────────────────────
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    /** Wall-clock from call-start to artefact-write. */
    durationMs: z.number().int().nonnegative(),
    cacheStatus: CacheStatusSchema,

    // ── Reproducibility ─────────────────────────────────────────────────
    reproducibility: ReproducibilitySchema,
    /** Required when `reproducibility === 'deterministic'`; null otherwise. */
    seed: z.number().int().nullable(),

    // ── Approval (mutable post-write per §1.9) ──────────────────────────
    approvalStatus: ApprovalStatusSchema,

    // ── Lineage ─────────────────────────────────────────────────────────
    /** Parent artefacts that fed into this one's prompt (per §1.3). */
    parentArtefactIds: z.array(z.string().regex(AIA_ID_PATTERN)),
    /** Element ids this call's downstream commands created — populated
     *  by `provenance.linkElement` (§4.4). Mutable post-write. */
    producedElementIds: z.array(z.string()),

    // ── Optional semantic fingerprint (§1.13) ───────────────────────────
    /** SHA-256 of the canonical-form output. null when no fingerprint is
     *  meaningful (e.g. text-only critique). */
    outputSemanticFingerprint: z.string().length(64).nullable(),
    outputClusterId: z
        .string()
        .regex(OC_ID_PATTERN, 'outputClusterId must match `oc_<uuid>`')
        .nullable(),

    // ── Optional surface metadata (informational only) ──────────────────
    /** Which surface initiated the call: 'plan-view', 'cli',
     *  '/v1/ai/query', etc. Optional. */
    surface: z.string().optional(),
})
    .superRefine((a, ctx) => {
        // §1.4 — seed MUST be non-null when reproducibility is deterministic
        // and MUST be null when non-deterministic.
        if (a.reproducibility === 'deterministic' && a.seed === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['seed'],
                message:
                    'reproducibility="deterministic" requires a non-null seed (C23 §1.4)',
            });
        }
        if (a.reproducibility === 'non-deterministic' && a.seed !== null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['seed'],
                message:
                    'reproducibility="non-deterministic" requires seed === null (C23 §1.4)',
            });
        }
    });

export type AIArtefact = z.infer<typeof AIArtefactSchema>;
