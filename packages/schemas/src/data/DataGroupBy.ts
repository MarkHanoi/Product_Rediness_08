// C28 DAT-α-1 (Data Panel & Automation) — L0 DataGroupBy substrate.
//
// Group-by selector for the Data grid.  Exhaustive: adding a value here
// is a contract change.
//
// L0-pure: Zod only.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §2 (schema table)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';

export const DataGroupBySchema = z.enum([
    'type',
    'level',
    'apartment',
    'room',
    'custom-field',
]);
export type DataGroupBy = z.infer<typeof DataGroupBySchema>;
