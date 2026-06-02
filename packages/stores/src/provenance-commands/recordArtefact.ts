// A.31.d — `ai.recordArtefact` command handler per [C23 §4.1].
//
// Pure `(payload, store) → ProvenanceCommandResult<ArtefactRecordedEvent>`.
// Idempotent on `idempotencyKey` per [C23 §1.11].
//
// Strategic context: docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §4.1.

import type { ProvenanceStore } from '../ProvenanceStore.js';
import {
    RecordArtefactPayloadSchema,
    type RecordArtefactPayload,
    type ProvenanceCommandResult,
    type ArtefactRecordedEvent,
} from './types.js';

/**
 * Append an AIArtefact to the ProvenanceStore.
 *
 *   - On idempotency-key collision with an existing row: return the
 *     existing artefact with `deduplicated: true` (no rewrite per
 *     [C23 §1.11]).
 *   - On id collision (same id, different idempotencyKey): reject with
 *     `duplicate-artefact-id` per [C23 §1.9].
 *   - On Zod failure: throw (programmer error).
 */
export function recordArtefact(
    payload: RecordArtefactPayload,
    store: ProvenanceStore,
): ProvenanceCommandResult<ArtefactRecordedEvent> {
    const parsed = RecordArtefactPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `ai.recordArtefact: invalid payload — ${parsed.error.message}`,
        );
    }
    const artefact = parsed.data;

    const existingById = store.getArtefact(artefact.id);
    if (existingById) {
        // Same id — check the idempotency key.
        if (existingById.idempotencyKey === artefact.idempotencyKey) {
            return {
                ok: true,
                event: {
                    type: 'ai.artefact-recorded',
                    artefact: existingById,
                    deduplicated: true,
                },
            };
        }
        return {
            ok: false,
            reason: 'duplicate-artefact-id',
            message: `ai.recordArtefact: artefact '${artefact.id}' already exists with a different idempotencyKey`,
        };
    }

    // Scan for idempotency-key dedup — O(n) over the project's artefacts.
    // (The store doesn't index idempotencyKey; callers using this surface
    // at high volume should add a hash-set check upstream.)
    for (const a of store.listArtefactsForProject(artefact.projectId)) {
        if (a.idempotencyKey === artefact.idempotencyKey) {
            return {
                ok: true,
                event: {
                    type: 'ai.artefact-recorded',
                    artefact: a,
                    deduplicated: true,
                },
            };
        }
    }

    store.addArtefact(artefact);
    return {
        ok: true,
        event: {
            type: 'ai.artefact-recorded',
            artefact,
            deduplicated: false,
        },
    };
}
