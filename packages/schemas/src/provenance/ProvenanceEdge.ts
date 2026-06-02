// A.31.a (Phase A · Sprint 2) — ProvenanceEdge schema (C23 §2.2).
//
// One directed edge in the lineage DAG. Per [C23 §1.3] every produced
// element id MUST be linked to the originating AIArtefact via one of
// these edges, written inside the SAME `batchCoordinator.runBatch`
// envelope that creates the elements (atomic with the model mutation).
//
// L0-pure: Zod only.

import { z } from 'zod';

/**
 * Edge kind per [C23 §2.2]:
 *
 *   - 'artefact-to-element'  — the AI call produced an element. `toElementId`
 *                              is non-null; `toArtefactId` is null.
 *   - 'artefact-to-artefact' — the AI call's output fed another AI call
 *                              (chain-of-thought / multi-agent). `toArtefactId`
 *                              is non-null; `toElementId` is null.
 *   - 'cache-derived-from'   — a cache hit derives from the original artefact.
 *                              `fromArtefactId` is the cache-recall, `toArtefactId`
 *                              is the original.
 *   - 'fallback-from'        — a deterministic offline-engine fallback was
 *                              triggered after a relay call failed.
 *                              `fromArtefactId` is the offline run; `toArtefactId`
 *                              is the failed relay attempt.
 */
export const EdgeKindSchema = z.enum([
    'artefact-to-element',
    'artefact-to-artefact',
    'cache-derived-from',
    'fallback-from',
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

const AIA_ID = /^aia_[0-9a-f-]{36}$/;
const PE_ID = /^pe_[0-9a-f-]{36}$/;

/**
 * A directed edge.
 *
 * Per [C23 §2.2] EXACTLY ONE of `toArtefactId` / `toElementId` MUST be
 * non-null — validated by the cross-field refinement below. The store
 * also rejects cyclic edges at write time per §1.3 (cycle detection lives
 * at the L3 store, not at the schema level).
 */
export const ProvenanceEdgeSchema = z.object({
    id: z.string().regex(PE_ID, 'ProvenanceEdge id must match `pe_<uuid>`'),
    fromArtefactId: z.string().regex(AIA_ID, 'fromArtefactId must match `aia_<uuid>`'),
    toArtefactId: z.string().regex(AIA_ID).nullable(),
    toElementId: z.string().min(1).nullable(),
    edgeKind: EdgeKindSchema,
    createdAt: z.string().datetime({ offset: false }),
    /** Denormalised for RLS per [C23 §1.10] — joins use the artefact's
     *  projectId, but the edge carries its own copy for fast row-level
     *  security filtering. */
    projectId: z.string().min(1),
})
    .superRefine((e, ctx) => {
        const hasArtefact = e.toArtefactId !== null;
        const hasElement = e.toElementId !== null;
        if (hasArtefact === hasElement) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['toArtefactId'],
                message:
                    'exactly one of toArtefactId / toElementId must be non-null (C23 §2.2)',
            });
        }
        // 'artefact-to-element' implies toElementId set.
        if (e.edgeKind === 'artefact-to-element' && !hasElement) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['edgeKind'],
                message:
                    'edgeKind="artefact-to-element" requires toElementId to be non-null',
            });
        }
        // 'artefact-to-artefact', 'cache-derived-from', 'fallback-from' imply toArtefactId set.
        if (
            (e.edgeKind === 'artefact-to-artefact' ||
                e.edgeKind === 'cache-derived-from' ||
                e.edgeKind === 'fallback-from') &&
            !hasArtefact
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['edgeKind'],
                message: `edgeKind="${e.edgeKind}" requires toArtefactId to be non-null`,
            });
        }
    });

export type ProvenanceEdge = z.infer<typeof ProvenanceEdgeSchema>;
