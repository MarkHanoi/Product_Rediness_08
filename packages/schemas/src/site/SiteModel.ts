// A.7.a (Phase A · Sprint 1) — The canonical SiteModel root schema (C19 §2.1).
//
// One per Project (per C19 §1.1). Owns the parcel + footprint + context
// buildings + climate-ref + building-ref. Cross-schema validations
// (containment, FAR, edge-classification length) are enforced by the
// L3 SiteModelStore — kept out of the L0 schema so it stays composable.

import { z } from 'zod';
import {
    SiteIdSchema,
    ProjectIdSchema,
    ClimateRefIdSchema,
    BuildingIdSchema,
} from './types.js';
import { SiteLocationSchema } from './SiteLocation.js';
import { ParcelSchema } from './Parcel.js';
import { BuildingFootprintSchema } from './BuildingFootprint.js';
import { ContextBuildingSchema } from './ContextBuilding.js';
import { ProvenanceRecordSchema } from './ProvenanceRecord.js';

/**
 * The canonical SiteModel. Per [C19 §2.1] fields:
 *
 *   - id              SiteId (deterministic per project — see C19 §2.1)
 *   - projectId       ProjectId (back-reference for isolation per C13)
 *   - name            human label; default 'Site'
 *   - location        SiteLocation (lat/lon/elev/true-north/CRS/address)
 *   - parcel          Parcel (boundary polygon + setbacks + zoning)
 *   - footprint       BuildingFootprint | null (the project's own outline)
 *   - contextBuildings  ContextBuilding[] (reference-only neighbours)
 *   - climateRef      ClimateRefId | null (C21 reference)
 *   - buildingRef     BuildingId | null (C20 reference)
 *   - provenance      ProvenanceRecord
 *   - schemaVersion   number (1 today; bumped on breaking change per C47)
 */
export const SiteModelSchema = z.object({
    id: SiteIdSchema,
    projectId: ProjectIdSchema,
    name: z.string().min(1).default('Site'),
    location: SiteLocationSchema,
    parcel: ParcelSchema,
    footprint: BuildingFootprintSchema.nullable().default(null),
    contextBuildings: z.array(ContextBuildingSchema).default([]),
    climateRef: ClimateRefIdSchema.nullable().default(null),
    buildingRef: BuildingIdSchema.nullable().default(null),
    provenance: ProvenanceRecordSchema,
    schemaVersion: z.number().int().positive().default(1),
});
export type SiteModel = z.infer<typeof SiteModelSchema>;
