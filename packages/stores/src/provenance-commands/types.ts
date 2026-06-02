// A.31.d (Phase A · Sprint 2) — provenance.* command payloads + shared
// result types. Pattern parallels the aggregate-commands / climate-
// commands surfaces.
//
// Strategic context:
//   - docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §4
//   - docs/03-execution/plans/master-execution-tracker.md A.31.d

import { z } from 'zod';
import {
    AIArtefactSchema,
    ApprovalStatusSchema,
    type AIArtefact,
} from '@pryzm/schemas/provenance';

/**
 * Soft rejection reasons. Programmer errors (Zod failures) throw.
 */
export type ProvenanceCommandRejection =
    | 'duplicate-artefact-id'         // §1.9 append-only
    | 'duplicate-idempotency-key'     // §1.11 idempotency
    | 'unknown-artefact'              // links / updates targeting missing rows
    | 'invalid-payload';               // generic Zod fail

export type ProvenanceCommandResult<TEvent extends { type: string }> =
    | { readonly ok: true; readonly event: TEvent }
    | {
          readonly ok: false;
          readonly reason: ProvenanceCommandRejection;
          readonly message: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// ai.recordArtefact (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ai.recordArtefact` payload — per [C23 §4.1].
 *
 * The full AIArtefact row. Handler is idempotent on `idempotencyKey`
 * per [C23 §1.11]: re-dispatching with the same idempotency key
 * returns the existing artefact id without rewriting.
 */
export const RecordArtefactPayloadSchema = AIArtefactSchema;
export type RecordArtefactPayload = z.infer<typeof RecordArtefactPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// provenance.linkElement (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

const AIA_ID = /^aia_[0-9a-f-]{36}$/;

/**
 * `provenance.linkElement` payload — per [C23 §4.2].
 *
 * Appends one or more element ids to the artefact's `producedElementIds`
 * (the §4.4 mutation carve-out). Idempotent: links that already exist
 * are no-ops.
 */
export const LinkElementPayloadSchema = z.object({
    artefactId: z.string().regex(AIA_ID, 'artefactId must match `aia_<uuid>`'),
    elementIds: z.array(z.string().min(1)).min(1, 'at least one element id required'),
});
export type LinkElementPayload = z.infer<typeof LinkElementPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// provenance.updateApprovalStatus (§1.7 carve-out)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `provenance.updateApprovalStatus` payload — per [C23 §1.7].
 *
 * The other §1.9 carve-out: artefacts are append-only EXCEPT for this
 * one field. Legal transitions per §1.7:
 *
 *   'pending'      → 'user-approved' | 'user-rejected' | 'never-applied'
 *   'auto-applied' → terminal (no transition)
 *
 * The handler enforces these — illegal transitions return
 * 'invalid-payload' with a message naming the disallowed move.
 */
export const UpdateApprovalStatusPayloadSchema = z.object({
    artefactId: z.string().regex(AIA_ID, 'artefactId must match `aia_<uuid>`'),
    status: ApprovalStatusSchema,
});
export type UpdateApprovalStatusPayload = z.infer<
    typeof UpdateApprovalStatusPayloadSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// provenance.queryByProject (§4.3) — read-only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `provenance.queryByProject` payload — per [C23 §4.3].
 *
 * Read-only query — returns artefacts scoped to the project, optionally
 * filtered by timestamp window + workflow kind.
 */
export const QueryByProjectPayloadSchema = z.object({
    projectId: z.string().min(1),
    /** Optional lower bound (inclusive). ISO-8601 UTC. */
    from: z.string().datetime({ offset: false }).optional(),
    /** Optional upper bound (inclusive). */
    to: z.string().datetime({ offset: false }).optional(),
    /** Optional filter by workflow kind. */
    workflowKinds: z.array(z.string().min(1)).optional(),
});
export type QueryByProjectPayload = z.infer<typeof QueryByProjectPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Domain events
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtefactRecordedEvent {
    readonly type: 'ai.artefact-recorded';
    readonly artefact: AIArtefact;
    /** True when the artefact already existed (idempotency hit). */
    readonly deduplicated: boolean;
}

export interface ElementLinkedEvent {
    readonly type: 'provenance.element-linked';
    readonly artefactId: string;
    /** Element ids that were APPENDED (already-linked ids omitted). */
    readonly addedElementIds: readonly string[];
}

export interface ApprovalStatusUpdatedEvent {
    readonly type: 'provenance.approval-status-updated';
    readonly artefactId: string;
    readonly priorStatus: AIArtefact['approvalStatus'];
    readonly newStatus: AIArtefact['approvalStatus'];
}

export interface QueryByProjectResultEvent {
    readonly type: 'provenance.query-result';
    readonly projectId: string;
    readonly rowCount: number;
    readonly artefacts: readonly AIArtefact[];
}
