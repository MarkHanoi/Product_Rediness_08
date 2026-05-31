// P0.5 Stage-3 (Family Platform) — L0 Footprint sub-schema for the
// GeneratedGeometry substrate (Stage-3 geometry synthesis OUTPUT).
//
// The placement-footprint metadata consumed today by the D-FLE furniture
// engine (apartment auto-furnishing pipeline).  Pre-Family-Platform, D-FLE
// reads a STATIC footprint table keyed by furniture type; once a family is
// registered, the same data lives in its `GeneratedGeometry.footprint` and
// D-FLE reads it from there.  The substrate is therefore the contract that
// lets a USER-DEFINED family slot into the auto-furnishing pipeline.
//
// Cross-imports: none outside `@pryzm/schemas` itself.
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 3 (Geometry Synthesis — outputs GeneratedGeometry, including
//     a footprint table for the apartment auto-furnishing pipeline)

import { z } from 'zod';

/**
 * Placement-footprint metadata.  Canonical units: metres.
 *
 *   - `lengthM`            length along the family's PRIMARY axis (front-
 *                          to-back for a desk; head-to-foot for a bed)
 *   - `depthM`             depth perpendicular to the primary axis
 *   - `clearFrontM`        required free space FORWARD of the family
 *                          (e.g. bed clearance for getting in / out;
 *                          desk knee-clearance)
 *   - `clearSideM`         required free space to EACH side
 *   - `clearBackM`         required free space BEHIND
 *   - `clearAboveM`        required free space ABOVE (wall-mounted items
 *                          such as cabinets or sconces)
 *   - `excludeDoorSwing`   whether this family BLOCKS door swing arcs in
 *                          its footprint — used by the apartment-layout
 *                          and D-FLE engines to reject placements that
 *                          would collide with a hosted door's swing
 *
 * `lengthM` + `depthM` are positive (zero would degenerate the
 * footprint); the clearance fields are non-negative (zero clearance is
 * legitimate — e.g. a wardrobe pressed against a wall has clearBackM=0).
 * The clearance fields and `excludeDoorSwing` default sensibly when
 * omitted so a minimal family declaration is just `{ lengthM, depthM }`.
 */
export const FootprintSchema = z.object({
    lengthM:          z.number().positive(),
    depthM:           z.number().positive(),
    clearFrontM:      z.number().nonnegative().default(0),
    clearSideM:       z.number().nonnegative().default(0),
    clearBackM:       z.number().nonnegative().default(0),
    clearAboveM:      z.number().nonnegative().default(0),
    excludeDoorSwing: z.boolean().default(false),
});
export type Footprint = z.infer<typeof FootprintSchema>;
