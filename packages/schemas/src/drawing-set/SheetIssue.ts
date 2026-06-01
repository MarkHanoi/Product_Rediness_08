// C30 DSM-α-1 (Drawing Set Management) — L0 SheetIssue substrate.
//
// Records the act of issuing a single Sheet at a specific revision to
// one or more recipients.  Each row is an append-only audit entry; the
// `acknowledgedBy` array grows as recipients confirm receipt.
//
// The IssueRegister (C30 §1.4 + §2 row 3) is just the collection of
// SheetIssue rows for a project.  The L3 store owning that collection
// is a later slice.
//
// L0-pure: Zod only.
//
// References:
//   - C30-DRAWING-SET-MANAGEMENT.md §1.4 (transmittal package, single
//     PDF/A-3) + §2 (IssueRegister row table)

import { z } from 'zod';

/**
 * A single acknowledgement entry — captured when a recipient confirms
 * receipt of an issued sheet.
 */
export const SheetIssueAcknowledgementSchema = z.object({
    recipient: z.string().min(1),
    date: z
        .string()
        .refine((s) => !isNaN(Date.parse(s)), 'date must be parsable as ISO 8601'),
});
export type SheetIssueAcknowledgement = z.infer<
    typeof SheetIssueAcknowledgementSchema
>;

/**
 * A SheetIssue row.
 *
 *   - `drawingSetId`     foreign key to the parent DrawingSet.
 *   - `sheetId`          foreign key to the issued Sheet.
 *   - `revision`         the revision letter at which the sheet was issued.
 *   - `issueDate`        ISO 8601 date string.
 *   - `recipients`       emails or distribution-list ids.  At least one
 *                        recipient is required for a meaningful issue.
 *   - `transmittalRef`   optional free-text transmittal reference.
 *   - `acknowledgedBy`   optional acknowledgement rows.
 */
export const SheetIssueSchema = z.object({
    drawingSetId: z.string().min(1),
    sheetId: z.string().min(1),
    revision: z.string().min(1),
    issueDate: z
        .string()
        .refine((s) => !isNaN(Date.parse(s)), 'issueDate must be parsable as ISO 8601'),
    recipients: z.array(z.string().min(1)).min(1),
    transmittalRef: z.string().optional(),
    acknowledgedBy: z.array(SheetIssueAcknowledgementSchema).optional(),
});
export type SheetIssue = z.infer<typeof SheetIssueSchema>;
