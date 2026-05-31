// P0.4 slice A (Family Platform) — L0 geometry sub-schema for a FamilyRequest.
//
// The user's geometric INTENT for the family — dimensions (canonical metres),
// parametric ranges, and any hosted-relationship hints (door / window in
// wall, light in ceiling, etc.).  Downstream Stage-2 parametric decomposition
// + Stage-3 geometry synthesis consume these to produce the actual `Geometry*`
// payload in the eventual RegisteredFamily.
//
// L0-pure: Zod-only.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §3
//     (FamilyRequest data shape — `geometry` block)
//   - §4 Stage 2 (Parametric Decomposition — consumes parametricRanges)
//   - §4 Stage 3 (Geometry Synthesis — consumes dimensions + hosted relation)

import { z } from 'zod';

/**
 * A named parametric range with units + default.  Stage-2 decomposition
 * uses these to seed a family's editable parameters (drawer count, leaf
 * height, etc.).
 *
 *   - `name`         parameter name (e.g. `leafHeight`, `drawerCount`)
 *   - `unit`         canonical unit; engines convert internally to metres
 *   - `min`/`max`    inclusive bounds (the schema does NOT enforce min ≤ max
 *                    — that's a Stage-1 ingestion-time validation; we keep
 *                    the substrate cheap and parsing-pure)
 *   - `defaultValue` initial value when an instance is created
 */
export const ParametricRangeSchema = z.object({
    name:         z.string().min(1),
    unit:         z.enum(['m', 'mm', 'cm', 'in', 'ft', 'deg', 'rad', 'unitless']),
    min:          z.number().finite(),
    max:          z.number().finite(),
    defaultValue: z.number().finite(),
});
export type ParametricRange = z.infer<typeof ParametricRangeSchema>;

/**
 * The user's stated bounding dimensions for the family, in canonical metres.
 *
 *   - `widthM`   along the family's local X axis (front-face width)
 *   - `depthM`   along the family's local Y axis (depth from front face)
 *   - `heightM`  along the family's local Z axis (floor-to-top)
 */
export const FamilyDimensionsSchema = z.object({
    widthM:  z.number().positive(),
    depthM:  z.number().positive(),
    heightM: z.number().positive(),
});
export type FamilyDimensions = z.infer<typeof FamilyDimensionsSchema>;

/**
 * Hosted-relationship hint.  Drives Stage-3 geometry synthesis (a wall-hosted
 * family needs an opening + a swing-direction; a floor-mounted family doesn't).
 *
 *   - `hostKind`         which host element type (or `none` for free-standing)
 *   - `embedDepthM`      for wall-hosted families: how deep into the wall the
 *                        opening cuts (door frame depth, window jamb depth)
 *   - `swingDirection`   for hinged hosted families (doors, casement windows)
 *
 * The schema permits `embedDepthM` / `swingDirection` REGARDLESS of `hostKind`
 * — extra metadata on a `none`-hosted family doesn't break ingestion; Stage-1
 * is the authoritative validator and will flag illogical combinations.
 */
export const HostedRelationshipSchema = z.object({
    hostKind:       z.enum(['wall', 'floor', 'ceiling', 'roof', 'curtain-wall', 'none']),
    embedDepthM:    z.number().nonnegative().optional(),
    swingDirection: z.enum(['inward', 'outward', 'sliding', 'none']).optional(),
});
export type HostedRelationship = z.infer<typeof HostedRelationshipSchema>;

/**
 * Top-level geometry block in a FamilyRequest.  `parametricRanges` defaults
 * to `[]` (most furniture has no parameters); `hostedRelationship` defaults
 * to `{ hostKind: 'none' }` (most families stand free on the floor).
 */
export const FamilyGeometrySchema = z.object({
    dimensions:         FamilyDimensionsSchema,
    parametricRanges:   z.array(ParametricRangeSchema).default([]),
    hostedRelationship: HostedRelationshipSchema.default({ hostKind: 'none' }),
});
export type FamilyGeometry = z.infer<typeof FamilyGeometrySchema>;
