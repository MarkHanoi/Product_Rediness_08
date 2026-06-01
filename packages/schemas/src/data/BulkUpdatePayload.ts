// C28 DAT-α-1 (Data Panel & Automation) — L0 BulkUpdatePayload substrate.
//
// Single-undo bulk-edit payload — the input to the `data.bulkUpdate`
// command (C28 §1.2 + §5).  Per P6, ALL bulk writes route through this
// one command, which produces ONE undo step covering every matched
// element.
//
// L0-pure: Zod only.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §1.2 (P6 — single command),
//                                     §2  (schema table),
//                                     §5  (commands)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';
import { DataFilterSchema } from './DataFilter.js';

/**
 * The set of `newValue` shapes the engine can apply to a parameter.
 * `null` is permitted to support "clear this parameter" semantics.
 *
 * NOTE: object / array values are intentionally NOT permitted at this
 * substrate layer — bulk edits target scalar-typed BIM parameters
 * (lengths, finishes, booleans).  Structured-value edits flow through
 * dedicated per-element commands (P6).
 */
export const BulkUpdateValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
]);
export type BulkUpdateValue = z.infer<typeof BulkUpdateValueSchema>;

export const BulkUpdatePayloadSchema = z.object({
    filter: DataFilterSchema,
    paramName: z.string().min(1),
    newValue: BulkUpdateValueSchema,
});
export type BulkUpdatePayload = z.infer<typeof BulkUpdatePayloadSchema>;
