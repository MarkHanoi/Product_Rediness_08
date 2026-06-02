// A.31.d — `provenance.linkElement` command handler per [C23 §4.2].
//
// Pure `(payload, store) → ProvenanceCommandResult<ElementLinkedEvent>`.
// Idempotent per element id: ids already linked are returned as a
// no-op (omitted from `addedElementIds`).
//
// Strategic context: docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md §4.2.

import type { ProvenanceStore } from '../ProvenanceStore.js';
import {
    LinkElementPayloadSchema,
    type LinkElementPayload,
    type ProvenanceCommandResult,
    type ElementLinkedEvent,
} from './types.js';

/**
 * Link one or more element ids to an artefact's `producedElementIds`.
 *
 *   - On unknown artefact id: reject with `unknown-artefact`.
 *   - For each element id NOT already linked, append. Idempotent: ids
 *     already in the array are silently skipped + omitted from the
 *     event's `addedElementIds`.
 *   - On Zod failure: throw (programmer error).
 */
export function linkElement(
    payload: LinkElementPayload,
    store: ProvenanceStore,
): ProvenanceCommandResult<ElementLinkedEvent> {
    const parsed = LinkElementPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `provenance.linkElement: invalid payload — ${parsed.error.message}`,
        );
    }
    const { artefactId, elementIds } = parsed.data;

    const artefact = store.getArtefact(artefactId);
    if (!artefact) {
        return {
            ok: false,
            reason: 'unknown-artefact',
            message: `provenance.linkElement: artefact '${artefactId}' not found`,
        };
    }

    const existing = new Set(artefact.producedElementIds);
    const added: string[] = [];
    for (const elementId of elementIds) {
        if (existing.has(elementId)) continue;
        store.linkElement(artefactId, elementId);
        existing.add(elementId);
        added.push(elementId);
    }

    return {
        ok: true,
        event: {
            type: 'provenance.element-linked',
            artefactId,
            addedElementIds: added,
        },
    };
}
