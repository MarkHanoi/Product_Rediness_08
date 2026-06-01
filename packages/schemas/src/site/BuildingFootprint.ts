// A.7.a (Phase A · Sprint 1) — BuildingFootprint schema (C19 §2.4).
//
// The project's OWN building outline on the parcel — distinct from the
// reference-only `ContextBuilding` neighbour shapes. Containment + setback
// + height + FAR compliance per C19 §1.6.

import { z } from 'zod';
import { PtSchema } from './types.js';

/**
 * The Building's footprint polygon on the parcel. Per C19 §2.4 fields.
 *
 * Cross-validation (handled by the L3 SiteModelStore + a refine block
 * on SiteModel — NOT here so the schema stays simple):
 *   - polygon vertices lie inside parcel.boundary.polygon minus setbacks
 *   - polygon is closed and non-self-intersecting (geometry-runtime check)
 */
export const BuildingFootprintSchema = z.object({
    /** Closed-loop polygon in scene-XZ metres. */
    polygon: z.array(PtSchema).default([]),
    /** Hint for C20 Building creation; null = use Parcel.maxHeight. */
    maxHeightHint: z.number().min(0).nullable().default(null),
    /** Metres above SiteLocation.elevationAsl — for stepped sites. */
    groundElevation: z.number().default(0),
    /** Primary entry anchor for AI access-aware workflows; null until authored. */
    entryAnchor: PtSchema.nullable().default(null),
});
export type BuildingFootprint = z.infer<typeof BuildingFootprintSchema>;
