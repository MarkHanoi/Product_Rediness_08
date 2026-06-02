// A.31.d (Phase A · Sprint 2) — provenance.* command handler barrel.
//
// 4 pure command handlers per [C23 §4]:
//   - ai.recordArtefact            §4.1 (idempotent on idempotencyKey)
//   - provenance.linkElement        §4.2 (idempotent on element id)
//   - provenance.updateApprovalStatus §1.7 carve-out (illegal-transition guard)
//   - provenance.queryByProject     §4.3 (read-only, optional window + workflow filter)
//
// Strategic context: docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §4.

export {
    RecordArtefactPayloadSchema,
    LinkElementPayloadSchema,
    UpdateApprovalStatusPayloadSchema,
    QueryByProjectPayloadSchema,
    type RecordArtefactPayload,
    type LinkElementPayload,
    type UpdateApprovalStatusPayload,
    type QueryByProjectPayload,
    type ProvenanceCommandResult,
    type ProvenanceCommandRejection,
    type ArtefactRecordedEvent,
    type ElementLinkedEvent,
    type ApprovalStatusUpdatedEvent,
    type QueryByProjectResultEvent,
} from './types.js';

export { recordArtefact } from './recordArtefact.js';
export { linkElement } from './linkElement.js';
export { updateApprovalStatus } from './updateApprovalStatus.js';
export { queryByProject } from './queryByProject.js';
