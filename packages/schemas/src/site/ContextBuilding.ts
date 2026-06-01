// A.7.a (Phase A · Sprint 1) — ContextBuilding schema (C19 §2.5).
//
// Surrounding neighbour-building shapes for shadow / view / privacy /
// urban-canyon analysis. ALWAYS `editable: false` per C19 §1.5 — these
// are environment, not BIM elements.

import { z } from 'zod';
import { ContextBuildingIdSchema, PtSchema } from './types.js';
import { ProvenanceRecordSchema } from './ProvenanceRecord.js';

export const RoofShapeSchema = z.enum(['flat', 'gable', 'hip', 'opaque']);
export type RoofShape = z.infer<typeof RoofShapeSchema>;

/**
 * Per C19 §2.5 fields. `editable: false` is a const literal — per §1.5
 * NO `site.*` command edits a ContextBuilding except `addContextBuilding`
 * and `removeContextBuilding`.
 *
 * `polygonCount` is derived; the L3 store fills it. Warn-soft (per
 * NFT §7.2) if > 100.
 */
export const ContextBuildingSchema = z.object({
    id: ContextBuildingIdSchema,
    /** Closed-loop polygon in scene-XZ metres. */
    footprint: z.array(PtSchema).default([]),
    /** Metres above ground. */
    height: z.number().min(0).default(10),
    /** Metres above SiteLocation.elevationAsl. */
    groundElevation: z.number().default(0),
    roofShape: RoofShapeSchema.default('opaque'),
    /** ALWAYS false per §1.5. */
    editable: z.literal(false).default(false),
    provenance: ProvenanceRecordSchema,
    /** Derived; warn-soft above 100 per NFT §7.2. */
    polygonCount: z.number().int().min(0).default(0),
});
export type ContextBuilding = z.infer<typeof ContextBuildingSchema>;
