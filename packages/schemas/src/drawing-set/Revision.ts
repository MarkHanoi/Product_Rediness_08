// C30 DSM-α-1 (Drawing Set Management) — L0 Revision substrate.
//
// A single revision row on a DrawingSet.  Revisions are first-class
// (per C30 §1.2): they carry letter, date, description, optional author
// and optional supersededBy back-reference.
//
// Status transitions (`draft → issued → superseded`) live on the parent
// DrawingSet in this v1 slice — the per-row `supersededBy` letter is the
// audit trail for "this revision was replaced by revision X".
//
// L0-pure: Zod only.  No I/O, no THREE, no DOM, no `@pryzm/*` non-schema
// imports.
//
// References:
//   - C30-DRAWING-SET-MANAGEMENT.md §1.2 + §2 (Revision row schema)
//   - master plan §8.3 (SCE-γ-3 substrate slice)

import { z } from 'zod';

/**
 * A revision row.
 *
 *   - `letter`        the revision identifier — drafting convention uses
 *                     either alphabetic (`A`, `B`, `C`, …) or numeric
 *                     (`0`, `1`, `2`, …) sequences.  Regex enforces 1-3
 *                     uppercase-alphanumeric characters.
 *   - `date`          ISO 8601 date string.  Validated via
 *                     `Date.parse` rather than a strict regex so both
 *                     `2026-06-01` and `2026-06-01T09:00:00Z` are
 *                     acceptable.
 *   - `description`   short description, e.g. `"First issue"` or
 *                     `"Coordination markup"`.
 *   - `author`        optional person / initials.
 *   - `supersededBy`  optional letter of the revision that replaced this
 *                     one.  When `undefined`, this row is current.
 */
export const RevisionSchema = z.object({
    letter: z
        .string()
        .regex(/^[A-Z0-9]{1,3}$/, 'letter must be 1-3 uppercase-alphanumeric chars'),
    date: z
        .string()
        .refine((s) => !isNaN(Date.parse(s)), 'date must be parsable as ISO 8601'),
    description: z.string(),
    author: z.string().optional(),
    supersededBy: z.string().optional(),
});
export type Revision = z.infer<typeof RevisionSchema>;
