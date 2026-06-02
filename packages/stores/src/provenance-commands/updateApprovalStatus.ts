// A.31.d — `provenance.updateApprovalStatus` command handler per
// [C23 §1.7] + §1.9 carve-out.
//
// Pure `(payload, store) → ProvenanceCommandResult<ApprovalStatusUpdatedEvent>`.
// Enforces the legal status-transition graph; illegal moves return
// `invalid-payload` with a transition-naming message.
//
// Strategic context: docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §1.7.

import type { ProvenanceStore } from '../ProvenanceStore.js';
import {
    UpdateApprovalStatusPayloadSchema,
    type UpdateApprovalStatusPayload,
    type ProvenanceCommandResult,
    type ApprovalStatusUpdatedEvent,
} from './types.js';
import type { ApprovalStatus } from '@pryzm/schemas/provenance';

/**
 * Legal transitions per [C23 §1.7]:
 *
 *   pending → user-approved | user-rejected | never-applied
 *   any → same (no-op)
 *
 * Every other transition (auto-applied → anything · user-approved →
 * anything · user-rejected → anything · never-applied → anything · etc)
 * is REJECTED. The §1.7 wording: "auto-applied is terminal"; we extend
 * this to "every non-pending status is terminal" to match the audit-
 * trail invariant that approval is a one-shot decision.
 */
const LEGAL_TRANSITIONS: Readonly<Record<ApprovalStatus, ReadonlySet<ApprovalStatus>>> = {
    pending: new Set<ApprovalStatus>([
        'pending',
        'user-approved',
        'user-rejected',
        'never-applied',
    ]),
    'auto-applied': new Set<ApprovalStatus>(['auto-applied']),
    'user-approved': new Set<ApprovalStatus>(['user-approved']),
    'user-rejected': new Set<ApprovalStatus>(['user-rejected']),
    'never-applied': new Set<ApprovalStatus>(['never-applied']),
};

export function updateApprovalStatus(
    payload: UpdateApprovalStatusPayload,
    store: ProvenanceStore,
): ProvenanceCommandResult<ApprovalStatusUpdatedEvent> {
    const parsed = UpdateApprovalStatusPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `provenance.updateApprovalStatus: invalid payload — ${parsed.error.message}`,
        );
    }
    const { artefactId, status } = parsed.data;

    const artefact = store.getArtefact(artefactId);
    if (!artefact) {
        return {
            ok: false,
            reason: 'unknown-artefact',
            message: `provenance.updateApprovalStatus: artefact '${artefactId}' not found`,
        };
    }

    const priorStatus = artefact.approvalStatus;
    const allowed = LEGAL_TRANSITIONS[priorStatus];
    if (!allowed.has(status)) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `provenance.updateApprovalStatus: illegal transition '${priorStatus}' → '${status}' (C23 §1.7)`,
        };
    }

    if (priorStatus === status) {
        // No-op — return the existing state.
        return {
            ok: true,
            event: {
                type: 'provenance.approval-status-updated',
                artefactId,
                priorStatus,
                newStatus: status,
            },
        };
    }

    store.updateApprovalStatus(artefactId, status);
    return {
        ok: true,
        event: {
            type: 'provenance.approval-status-updated',
            artefactId,
            priorStatus,
            newStatus: status,
        },
    };
}
