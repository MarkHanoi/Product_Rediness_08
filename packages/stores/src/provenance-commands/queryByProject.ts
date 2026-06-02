// A.31.d — `provenance.queryByProject` command handler per [C23 §4.3].
//
// Read-only — returns artefacts scoped to the project, optionally
// filtered by timestamp window + workflow kind.
//
// Strategic context: docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §4.3.

import type { ProvenanceStore } from '../ProvenanceStore.js';
import {
    QueryByProjectPayloadSchema,
    type QueryByProjectPayload,
    type ProvenanceCommandResult,
    type QueryByProjectResultEvent,
} from './types.js';
import type { AIArtefact } from '@pryzm/schemas/provenance';

/**
 * Filter the store's artefacts by `(projectId [+ from] [+ to] [+ workflowKinds])`.
 *
 *   - `from` + `to` are inclusive ISO-8601 timestamps; either may be
 *     omitted for an open-ended bound.
 *   - `workflowKinds` filters by exact workflowKind match; omitted /
 *     empty array → no filter.
 *
 * Returns artefacts ordered by timestamp ascending (per the store's
 * natural list order). The event carries `rowCount` so the OTel span
 * can record `pryzm.provenance.row_count` per [C23 §3] without re-
 * counting at the caller.
 */
export function queryByProject(
    payload: QueryByProjectPayload,
    store: ProvenanceStore,
): ProvenanceCommandResult<QueryByProjectResultEvent> {
    const parsed = QueryByProjectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `provenance.queryByProject: invalid payload — ${parsed.error.message}`,
        );
    }
    const { projectId, from, to, workflowKinds } = parsed.data;

    const projectArtefacts = store.listArtefactsForProject(projectId);
    const workflowFilter =
        workflowKinds && workflowKinds.length > 0
            ? new Set(workflowKinds)
            : null;

    const filtered: AIArtefact[] = [];
    for (const a of projectArtefacts) {
        if (from && a.timestamp < from) continue;
        if (to && a.timestamp > to) continue;
        if (workflowFilter && !workflowFilter.has(a.workflowKind)) continue;
        filtered.push(a);
    }

    return {
        ok: true,
        event: {
            type: 'provenance.query-result',
            projectId,
            rowCount: filtered.length,
            artefacts: filtered,
        },
    };
}
