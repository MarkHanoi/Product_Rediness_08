// A.31.a (Phase A · Sprint 2) — ContextSnapshot schema (C23 §2.3).
//
// The serialised context attached to a model call. Lets a future auditor
// reproduce a deterministic-flagged call by combining
// `(contextHash, projectStateSha, seed, workflowVersion)`.
//
// L0-pure: Zod only.

import { z } from 'zod';

const CS_ID = /^cs_[0-9a-f-]{36}$/;

export const ActiveViewKindSchema = z.enum([
    'plan',
    '3d',
    'elevation',
    'section',
    'sheet',
]);
export type ActiveViewKind = z.infer<typeof ActiveViewKindSchema>;

/**
 * What the model saw when the call was made. Per [C23 §2.3] this is the
 * BRIDGE to [C05 Persistence]: combined with the project's CRDT log, an
 * auditor can wind the project back to its exact state at the call moment.
 *
 * Snapshots are de-duplicated by `contextHash` at write time — two calls
 * with identical context share one ContextSnapshot row.
 */
export const ContextSnapshotSchema = z.object({
    id: z.string().regex(CS_ID, 'ContextSnapshot id must match `cs_<uuid>`'),
    /** SHA-256 of the canonical-form snapshot payload (this row minus id
     *  + takenAt). Identical context across two calls → identical hash. */
    contextHash: z.string().length(64),
    projectId: z.string().min(1),
    takenAt: z.string().datetime({ offset: false }),

    /** e.g. 'apartment-layout-system-v3.2'. Pins the system prompt that
     *  framed the call — bumps independently of the workflow version. */
    systemPromptVersion: z.string().min(1),
    /** Element ids the user had selected. Empty for full-project calls. */
    selectedElementIds: z.array(z.string()),
    activeLevelId: z.string().nullable(),
    activeViewKind: ActiveViewKindSchema.nullable(),

    /** SHA-256 of the canonical-form file-format payload (per C05) at the
     *  moment of the call. With the project's CRDT log this is enough to
     *  reload "what the model saw" without storing a full per-call dump. */
    projectStateSha: z.string().length(64),

    /** Function-calling surface available to the model at call time. */
    toolsAvailable: z.array(z.string()),

    /** Plan tier at call time — caches that depend on tier-gated features
     *  must invalidate when a tier change shifts what was visible. */
    planTier: z.string().min(1),
    /** Feature flags active at call time. Recorded so future audits can
     *  explain why one call returned X and a later one returned Y. */
    featureFlags: z.record(z.string(), z.boolean()).optional(),
});

export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;
