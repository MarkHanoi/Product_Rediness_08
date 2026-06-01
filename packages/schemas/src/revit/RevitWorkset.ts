// C26 REV-α-1 (Revit Round-Trip) — L0 RevitWorkset substrate.
//
// Carries the minimum set of fields the Revit-API-aware adapter needs to
// re-create a Workset on the Revit side after a round-trip.  Worksets
// have no native IFC equivalent, so they ride as a sidecar.
//
// Per C26 §2 the workset mapping schema is the contract; downstream
// permission-scope mapping is the variant exporter's concern, not this
// L0 row.
//
// L0-pure: Zod only.
//
// References:
//   - C26-REVIT-ROUND-TRIP.md §2 (RevitWorksetMapping in the schema
//     table) + §6 (adapter scope).

import { z } from 'zod';

/**
 * One Revit Workset row.
 *
 *   - `id`          stable identifier the adapter uses to correlate
 *                   worksets across round-trips.
 *   - `name`        human-readable workset name.
 *   - `isOpen`      whether the workset is currently checked-out / open.
 *   - `isEditable`  whether the workset is editable (vs view-only).
 *   - `owner`       optional owner username / initials.
 */
export const RevitWorksetSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    isOpen: z.boolean(),
    isEditable: z.boolean(),
    owner: z.string().optional(),
});
export type RevitWorkset = z.infer<typeof RevitWorksetSchema>;
