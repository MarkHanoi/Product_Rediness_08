// C30 DSM-α-1 (Drawing Set Management) — L0 SheetReference substrate.
//
// A SheetReference is the DrawingSet's pointer to a Sheet (owned by C24
// SheetStore via `packages/drawing-primitives/`).  The DrawingSet does
// NOT own the Sheet — it owns the membership row, plus per-discipline
// ordering.  Discipline is one of the 8 AIA-style single-letter
// disciplines (A/S/M/E/P/L/C/G).
//
// L0-pure: Zod only.  `sheetId` is `z.string()` here rather than a
// branded `SheetId` because branded ids are not currently published as
// Zod schemas in `@pryzm/schemas` — the engine re-brands at the
// consumer boundary.
//
// References:
//   - C30-DRAWING-SET-MANAGEMENT.md §1.1 (SheetSet aggregates Sheets) +
//     §1.3 (numbering / discipline)

import { z } from 'zod';

/**
 * Discipline single-letter enum.  Maps to the conventional
 * architectural-/-engineering deliverable disciplines:
 *
 *   - `A`  architectural
 *   - `S`  structural
 *   - `M`  mechanical
 *   - `E`  electrical
 *   - `P`  plumbing
 *   - `L`  landscape
 *   - `C`  civil
 *   - `G`  general (cover sheets, drawing index, etc.)
 */
export const DisciplineSchema = z.enum(['A', 'S', 'M', 'E', 'P', 'L', 'C', 'G']);
export type Discipline = z.infer<typeof DisciplineSchema>;

/**
 * A DrawingSet's reference to one Sheet.
 *
 *   - `sheetId`      foreign key to a Sheet (owned by C24).
 *   - `sheetNumber`  e.g. `"A-101"`.
 *   - `sheetName`    e.g. `"GROUND FLOOR PLAN"`.
 *   - `discipline`   single-letter discipline code.
 *   - `order`        sort key within the discipline.  Negative values
 *                    are accepted (cover sheets sometimes use a
 *                    negative order to sort before `0`).
 */
export const SheetReferenceSchema = z.object({
    sheetId: z.string().min(1),
    sheetNumber: z.string().min(1),
    sheetName: z.string(),
    discipline: DisciplineSchema,
    order: z.number(),
});
export type SheetReference = z.infer<typeof SheetReferenceSchema>;
