// C27 INS-α-2 (BIM 3.0 Inspect Model) — L0 InspectSelection substrate.
//
// The single source of truth for "what node in the master tree is currently
// being inspected".  Drives the L3 `InspectSelectionStore` (this slice) and,
// in later slices, the visibility-isolation engine + the master-tree UI.
//
// The model tree is the 6-level (7-kind incl. root) hierarchy from
// C27 §2:
//
//     Level 0  project          (Site root)
//     Level 1  building
//     Level 2  level            (Floor / Storey)
//     Level 3  apartment        (Unit)
//     Level 4  room             (Space)
//     Level 5  elementType      (e.g. all walls)
//     Level 6  elementInstance  (a single element)
//
// L0-pure: Zod only.  No I/O, no THREE, no DOM, no `@pryzm/*` imports.
// References:
//   - C27-BIM3-INSPECT-MODEL.md §3 (master tree) + §4 (selection contract)
//   - master plan Part V §11.2 (INS-α-2 substrate slice)

import { z } from 'zod';

/**
 * The kind of node currently inspected.  Matches C27 §2 master tree (7 kinds
 * spanning the 6 logical levels: project is the level-0 root, the remaining
 * six are 1..6).  Exhaustive — adding a kind here is a contract change.
 */
export const InspectNodeKindSchema = z.enum([
    'project',         // Level 0 — Site root
    'building',        // Level 1
    'level',           // Level 2 — Floor / Storey
    'apartment',       // Level 3 — Unit
    'room',            // Level 4 — Space
    'elementType',     // Level 5 — Type (e.g. all walls)
    'elementInstance', // Level 6 — Single element
]);
export type InspectNodeKind = z.infer<typeof InspectNodeKindSchema>;

/**
 * The full selection record.
 *
 *   - `kind`        which level of the tree we are inspecting
 *   - `id`          the id of the inspected node.  For `'project'` it is the
 *                   projectId; for `'elementInstance'` it is the element id;
 *                   for `'elementType'` it is the type name (e.g. `"wall"`).
 *   - `level`       depth in the tree (0..6).  Redundant with `kind` but
 *                   convenient for UI rendering (indent levels, breadcrumbs).
 *                   The store does NOT enforce kind ↔ level consistency at
 *                   the schema level; callers are expected to mint the pair
 *                   together from the master-tree projection.
 *   - `breadcrumb`  optional path from the root toward (but NOT including)
 *                   this node, used by the tree UI to auto-expand.  Each
 *                   entry is a `(kind, id)` pair.  Defaults to `[]`.
 */
export const InspectSelectionSchema = z.object({
    kind: InspectNodeKindSchema,
    id: z.string().min(1),
    level: z.number().int().min(0).max(6),
    breadcrumb: z.array(z.object({
        kind: InspectNodeKindSchema,
        id: z.string().min(1),
    })).default([]),
});
export type InspectSelection = z.infer<typeof InspectSelectionSchema>;
