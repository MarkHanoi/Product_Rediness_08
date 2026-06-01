// C28 DAT-α-1 (Data Panel & Automation) — L0 DataSort substrate.
//
// Multi-column sort spec for the Data grid.  Order matters: the first
// entry is the primary sort key, the second is the tie-breaker, etc.
//
// L0-pure: Zod only.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §2 (schema table)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';

/**
 * Ordered list of (column, direction) pairs.  An empty array means "no
 * sort" (the grid renders in insertion order).
 */
export const DataSortSchema = z.array(z.object({
    column: z.string().min(1),
    direction: z.enum(['asc', 'desc']),
}));
export type DataSort = z.infer<typeof DataSortSchema>;
