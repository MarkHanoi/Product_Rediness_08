// C30 DSM-α-1 (Drawing Set Management) — L0 DrawingSet substrate.
//
// A DrawingSet is the named, revision-controlled collection of Sheets
// that defines a deliverable (e.g. "DD Issue 2026-06-15", "Tender
// Issue", "GA Floor Plans").  Per C30 §1.1 a project MAY have multiple
// DrawingSets; per §1.5 only one per discipline may be in `issued`
// status at a time (that invariant is a runtime / store check, not a
// schema check — kept out of L0).
//
// Schema-level cross-references enforced here:
//   - `currentRevision` MUST match one of `revisions[].letter`.
//   - `sheets[].order` MUST be unique within a discipline.  Same-order
//     values are allowed ACROSS different disciplines (e.g. `A-001` at
//     order 0 and `S-001` at order 0 are both fine).
//
// L0-pure: Zod only.
//
// References:
//   - C30-DRAWING-SET-MANAGEMENT.md §1 (invariants) + §2 (schema table)

import { z } from 'zod';
import { RevisionSchema } from './Revision.js';
import { SheetReferenceSchema } from './SheetReference.js';

/**
 * DrawingSet lifecycle status.
 *
 *   - `draft`       work-in-progress; not yet issued to anyone.
 *   - `issued`      issued to recipients; per §1.5 only one set per
 *                   discipline may be in this state.
 *   - `superseded`  was issued but a newer set replaced it.
 *   - `archived`    retained for audit but not active.
 */
export const DrawingSetStatusSchema = z.enum([
    'draft',
    'issued',
    'superseded',
    'archived',
]);
export type DrawingSetStatus = z.infer<typeof DrawingSetStatusSchema>;

/**
 * The named, revision-controlled collection of Sheets that defines a
 * deliverable.
 */
export const DrawingSetSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        projectId: z.string().min(1),
        sheets: z.array(SheetReferenceSchema),
        currentRevision: z.string().min(1),
        revisions: z.array(RevisionSchema),
        status: DrawingSetStatusSchema,
        issueDate: z.string().optional(),
        client: z.string().optional(),
        notes: z.string().optional(),
    })
    .refine(
        (ds) => ds.revisions.some((r) => r.letter === ds.currentRevision),
        {
            message: 'currentRevision must match one of revisions[].letter',
            path: ['currentRevision'],
        },
    )
    .refine(
        (ds) => {
            // Per-discipline order uniqueness.  Same order ACROSS
            // disciplines is fine.
            const seen = new Map<string, Set<number>>();
            for (const s of ds.sheets) {
                const bucket = seen.get(s.discipline) ?? new Set<number>();
                if (bucket.has(s.order)) return false;
                bucket.add(s.order);
                seen.set(s.discipline, bucket);
            }
            return true;
        },
        {
            message: 'sheets[].order must be unique within a discipline',
            path: ['sheets'],
        },
    );
export type DrawingSet = z.infer<typeof DrawingSetSchema>;
