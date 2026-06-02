// A.31.b (Phase A · Sprint 2) — ProvenanceExport schema (C23 §2.5).
//
// The customer-facing audit bundle. Per [C23 §1.8] a customer can
// export an Ed25519-signed dump of every artefact + edge + snapshot +
// redaction record scoped to a project + time window. An external
// auditor / regulator can verify the dump's signature against PRYZM's
// published verification key without trusting the customer.
//
// L0-pure: Zod only. The signing itself is a server-side L5 operation
// (uses the same Ed25519 key-management as the C07 plugin marketplace);
// the schema captures the SHAPE the signer produces + the verifier
// consumes.

import { z } from 'zod';
import { AIArtefactSchema } from './AIArtefact.js';
import { ProvenanceEdgeSchema } from './ProvenanceEdge.js';
import { ContextSnapshotSchema } from './ContextSnapshot.js';
import { RedactionRecordSchema } from './RedactionRecord.js';

const AIA_ID = /^aia_[0-9a-f-]{36}$/;

/**
 * Export format per [C23 §2.5]:
 *
 *   - 'json' — machine-readable; full bundle as JSON
 *   - 'pdf'  — human-readable; PDF/A-3 with the same JSON embedded
 *              as a sidecar attachment for downstream tooling
 */
export const ProvenanceExportFormatSchema = z.enum(['pdf', 'json']);
export type ProvenanceExportFormat = z.infer<typeof ProvenanceExportFormatSchema>;

/**
 * The Ed25519-signed audit bundle. Per [C23 §2.5]:
 *
 *   - `exportArtefactId` — the AIArtefact recording THIS export op
 *     itself (the export is auditable like any other call)
 *   - `pryzmSignatureEd25519` — base64-encoded signature over the
 *     canonical-form JSON of (everything except the signature itself)
 *   - `pryzmSigningKeyId` — the key id; an external verifier loads the
 *     matching public key from PRYZM's published verification surface
 *
 * Per [C23 §1.8] artefacts in the bundle MUST belong to `projectId`;
 * the L5 export builder filters by row-level security before signing.
 */
export const ProvenanceExportSchema = z.object({
    /** The artefact that records this export operation itself. */
    exportArtefactId: z.string().regex(AIA_ID, 'exportArtefactId must match `aia_<uuid>`'),
    projectId: z.string().min(1),
    requestedByUserId: z.string().min(1),
    requestedAt: z.string().datetime({ offset: false }),
    format: ProvenanceExportFormatSchema,

    artefacts: z.array(AIArtefactSchema),
    edges: z.array(ProvenanceEdgeSchema),
    contextSnapshots: z.array(ContextSnapshotSchema),
    redactionRecords: z.array(RedactionRecordSchema),

    // ── Coverage metadata ───────────────────────────────────────────────
    /** Lower bound of the artefact-timestamp window included. */
    artefactsFrom: z.string().datetime({ offset: false }),
    /** Upper bound — inclusive. */
    artefactsTo: z.string().datetime({ offset: false }),
    /** Total count of artefacts in this bundle. MUST equal artefacts.length. */
    totalArtefacts: z.number().int().nonnegative(),
    /** Total count of edges in this bundle. MUST equal edges.length. */
    totalEdges: z.number().int().nonnegative(),

    // ── Signature ───────────────────────────────────────────────────────
    /** Ed25519 signature, base64-encoded (no padding stripping). Signed
     *  over the canonical-form JSON of every other field in this object
     *  (sort keys, no whitespace), so an external verifier can recompute
     *  the canonical form + check the signature. */
    pryzmSignatureEd25519: z.string().min(1),
    /** Verification key id — letter+digit+dash chars only (matches the
     *  marketplace key-id pattern per C07 §5). */
    pryzmSigningKeyId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, 'pryzmSigningKeyId must match `[A-Za-z0-9-]{1,64}`'),
})
    .superRefine((e, ctx) => {
        // Count consistency — the count fields MUST match the array lengths.
        if (e.totalArtefacts !== e.artefacts.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['totalArtefacts'],
                message: `totalArtefacts (${e.totalArtefacts}) must equal artefacts.length (${e.artefacts.length})`,
            });
        }
        if (e.totalEdges !== e.edges.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['totalEdges'],
                message: `totalEdges (${e.totalEdges}) must equal edges.length (${e.edges.length})`,
            });
        }
        // Time-window sanity.
        if (e.artefactsFrom > e.artefactsTo) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['artefactsFrom'],
                message: `artefactsFrom (${e.artefactsFrom}) must be ≤ artefactsTo (${e.artefactsTo})`,
            });
        }
        // Every artefact MUST belong to the export's projectId per §1.8 RLS.
        for (const a of e.artefacts) {
            if (a.projectId !== e.projectId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['artefacts'],
                    message: `artefact ${a.id} belongs to project ${a.projectId}, not export's projectId ${e.projectId} (C23 §1.8 RLS)`,
                });
                break; // one is enough
            }
        }
        // Every edge MUST belong to the same project.
        for (const ed of e.edges) {
            if (ed.projectId !== e.projectId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['edges'],
                    message: `edge ${ed.id} belongs to project ${ed.projectId}, not export's projectId ${e.projectId} (C23 §1.8 RLS)`,
                });
                break;
            }
        }
    });

export type ProvenanceExport = z.infer<typeof ProvenanceExportSchema>;
