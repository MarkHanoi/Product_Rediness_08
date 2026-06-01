// C27 INS-α-2 (BIM 3.0 Inspect Model) — L0 isolation substrate.
//
// Per-element visibility tier + spatial-relationship enum used to drive the
// tier-tier mapping per C27 §5.1.  This slice only defines the substrate;
// the visibility-engine wiring lands in a later slice.
//
// L0-pure: Zod only.  No I/O, no THREE, no DOM, no `@pryzm/*` imports.
// References:
//   - C27-BIM3-INSPECT-MODEL.md §5.1 (isolation tier model)
//   - master plan Part V §11.2

import { z } from 'zod';

/**
 * Per-element visibility tier driven by isolation mode.
 *
 *   - `FULL`    rendered at full opacity, normal interaction
 *   - `DIMMED`  rendered at reduced opacity (see `IsolationOverride.opacity`)
 *   - `HIDDEN`  not rendered, not pickable
 *
 * Exhaustive — adding a tier here is a contract change.
 */
export const IsolationTierSchema = z.enum(['FULL', 'DIMMED', 'HIDDEN']);
export type IsolationTier = z.infer<typeof IsolationTierSchema>;

/**
 * Per-element override.  Applied on top of the relationship-driven default
 * tier from C27 §5.1.  `opacity` is only meaningful when `tier === 'DIMMED'`;
 * the visibility engine ignores it for `'FULL'` / `'HIDDEN'`.
 */
export const IsolationOverrideSchema = z.object({
    elementId: z.string().min(1),
    tier: IsolationTierSchema,
    /** 0..1 — only consulted when `tier === 'DIMMED'`. */
    opacity: z.number().min(0).max(1).optional(),
});
export type IsolationOverride = z.infer<typeof IsolationOverrideSchema>;

/**
 * Spatial relationship of an element to the currently-inspected node.
 * Drives the relationship → tier mapping per C27 §5.1 (e.g. SELECTED → FULL,
 * SIBLING → DIMMED, UNRELATED → HIDDEN).  Exhaustive.
 */
export const SpatialRelationshipSchema = z.enum([
    'SELECTED',
    'PARENT',
    'SIBLING',
    'CHILD',
    'UNRELATED',
]);
export type SpatialRelationship = z.infer<typeof SpatialRelationshipSchema>;
